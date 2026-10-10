#!/usr/bin/env bash
# Ship the committed revision to the host and release it.
#
#   deploy/scripts/ship.sh ubuntu@203.0.113.10
#
# Only what is committed is shipped (git archive of HEAD plus the model submodule), so the
# host never holds a repository, a GitHub credential or a local .env file. The model artifact
# and shared/.env.production stay on the host between releases.
#
#   AIRWATCH_ROOT   root on the host (default /opt/airwatch)
#   SSH_OPTS        extra ssh options, e.g. "-i ~/.ssh/airwatch"
#   SKIP_SMOKE=1    do not run the smoke test from this machine afterwards
#   UNPACK_ONLY=1   put the release on the host and stop (first-time setup configures it next)
set -euo pipefail

target=${1:?usage: ship.sh <user@host>}
root=${AIRWATCH_ROOT:-/opt/airwatch}
repo=$(git rev-parse --show-toplevel)
cd "$repo"
# shellcheck disable=SC2206
ssh_cmd=(ssh ${SSH_OPTS:-} "$target")

if [ -n "$(git status --porcelain --untracked-files=no)" ] && [ "${ALLOW_DIRTY:-0}" != "1" ]; then
  echo "error: uncommitted changes would not be shipped. Commit them, or set ALLOW_DIRTY=1 to ship HEAD anyway." >&2
  exit 1
fi
git -C adaptive-aqi-model rev-parse HEAD >/dev/null 2>&1 || { echo "error: the model submodule is missing. Run: git submodule update --init" >&2; exit 1; }

id=$(git rev-parse --short=12 HEAD)
echo "== Shipping $id to $target:$root/releases/$id" >&2
"${ssh_cmd[@]}" "mkdir -p '$root/releases/$id' '$root/shared/models' '$root/shared/backups'"
git archive --format=tar HEAD | "${ssh_cmd[@]}" "tar -xf - -C '$root/releases/$id'"
git -C adaptive-aqi-model archive --format=tar --prefix=adaptive-aqi-model/ HEAD | "${ssh_cmd[@]}" "tar -xf - -C '$root/releases/$id'"

if [ "${UNPACK_ONLY:-0}" = "1" ]; then
  echo "$id"
  exit 0
fi

"${ssh_cmd[@]}" "AIRWATCH_ROOT='$root' ALLOW_NO_MODEL='${ALLOW_NO_MODEL:-0}' '$root/releases/$id/deploy/scripts/host.sh' release '$id'"

if [ "${SKIP_SMOKE:-0}" != "1" ]; then
  domain=$("${ssh_cmd[@]}" "sed -n 's/^API_DOMAIN=//p' '$root/shared/.env.production' | tail -n 1")
  echo "== Smoke test from this machine against https://$domain"
  read -r -a smoke_args <<< "${SMOKE_ARGS:-}"
  node deploy/scripts/smoke.mjs --api "https://$domain" ${smoke_args[@]+"${smoke_args[@]}"}
fi
