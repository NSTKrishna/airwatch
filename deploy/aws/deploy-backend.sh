#!/usr/bin/env bash
# Put the committed revision on the Lightsail instance and start it. The first run also
# configures the host: settings, generated secrets, the instance's AWS key and the model.
#
#   deploy/aws/deploy-backend.sh
#
#   MODEL=team        expect the team's artifact (default). It is copied from
#                     adaptive-aqi-model/models/delhi_pm10_calibrated.joblib on this machine
#                     when that file exists and the host does not have it yet.
#   MODEL=local-demo  build the labelled stand-in on the host instead
#                     (deploy/model/build_local_artifact.py explains what it is).
#   DEMO_DATA=1       load demo history and demo cases after the release
set -euo pipefail
# shellcheck source=deploy/aws/lib.sh
source "$(dirname "$0")/lib.sh"
need aws ssh git node
cd "$REPO"
whoami_aws >/dev/null
root=/opt/airwatch
export SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new"

say "Waiting for the instance to finish its first boot"
for attempt in $(seq 1 40); do
  if host_ssh 'cloud-init status --wait >/dev/null 2>&1; command -v docker >/dev/null && test -d /opt/airwatch/shared'; then break; fi
  [ "$attempt" -lt 40 ] || die "the instance is not ready. Check 'ssh -i $SSH_KEY $(host_target)' and /var/log/cloud-init-output.log on it."
  sleep 15
done

say "Copying the release"
id=$(UNPACK_ONLY=1 deploy/scripts/ship.sh "$(host_target)")
host="$root/releases/$id/deploy/scripts/host.sh"

say "Settings on the host"
host_ssh "$host init-env"
printf '%s\n' \
  "API_DOMAIN=$(out ApiDomain)" "CLIENT_ORIGIN=$(out FrontendUrl),https://airwatch.rajatsrivastav.dev" "AWS_REGION=$AWS_REGION" \
  "ATTACHMENT_STORAGE=s3" "S3_BUCKET=$(out EvidenceBucket)" "CLOUDWATCH_LOG_GROUP=$(out LogGroup)" \
  | host_ssh "$host set -"

if ! host_ssh "grep -q '^AWS_ACCESS_KEY_ID=.' $root/shared/.env.production"; then
  say "Access key for the instance"
  user=$(out InstanceUserName)
  # Created here, sent over SSH, stored only on the host. It is never written to this machine.
  aws iam create-access-key --user-name "$user" --query 'AccessKey.[AccessKeyId, SecretAccessKey]' --output text \
    | awk '{ print "AWS_ACCESS_KEY_ID=" $1; print "AWS_SECRET_ACCESS_KEY=" $2 }' | host_ssh "$host set -"
  echo "Created an access key for $user (bucket and log group only)."
fi
host_ssh "$host docker-credentials"

say "Model artifact"
case "${MODEL:-team}" in
  team)
    artifact=adaptive-aqi-model/models/delhi_pm10_calibrated.joblib
    if host_ssh "test -f $root/shared/models/delhi_pm10_calibrated.joblib"; then
      echo "Already on the host."
    elif [ -f "$artifact" ]; then
      scp -i "$SSH_KEY" "$artifact" "$(host_target):$root/shared/models/"
    else
      die "$artifact is not on this machine and not on the host. Put it there (it is not in git), or run with MODEL=local-demo."
    fi
    printf 'MODEL_CONFIG_PATH=configs/config.yaml\n' | host_ssh "$host set -"
    ;;
  local-demo)
    host_ssh "$host build-demo-model $id"
    printf 'MODEL_CONFIG_PATH=models/local-demo/config.yaml\n' | host_ssh "$host set -"
    ;;
  *) die "MODEL must be 'team' or 'local-demo'" ;;
esac

say "Release"
host_ssh "$host release $id"
if [ "${DEMO_DATA:-0}" = "1" ]; then host_ssh "$root/current/deploy/scripts/host.sh demo-data"; fi

say "Smoke test from this machine"
node deploy/scripts/smoke.mjs --api "https://$(out ApiDomain)" --require-model
echo
echo "Backend is up at https://$(out ApiDomain). Next: deploy/aws/deploy-frontend.sh"
