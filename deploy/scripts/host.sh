#!/usr/bin/env bash
# Operate AirWatch on its host. Everything lives under one root (default /opt/airwatch):
#
#   shared/.env.production   settings and secrets, mode 600, created on the host
#   shared/models/           the model artifact, copied here separately
#   shared/backups/          database dumps
#   releases/<id>/           one directory per shipped revision
#   current, previous        symlinks to the running release and the one before it
#
#   host.sh init-env                 create shared/.env.production with generated secrets
#   host.sh set KEY=VALUE [...]      change settings in shared/.env.production
#   host.sh set -                    the same, reading KEY=VALUE lines from standard input
#   host.sh docker-credentials       give the Docker daemon the AWS key, for CloudWatch Logs
#   host.sh build-demo-model <id>    build the labelled stand-in model artifact on the host
#   host.sh release <id>             build and start releases/<id>, then make it current
#   host.sh rollback                 start the previous release again
#   host.sh backup                   dump the database (and copy it to S3 when configured)
#   host.sh restore <dump file>      replace the database contents with a dump
#   host.sh demo-data [args]         load demo history (server/scripts/load-demo-data.js)
#   host.sh status                   containers, health and the running release
#   host.sh compose <args>           docker compose with this stack's files and settings
set -euo pipefail

ROOT=${AIRWATCH_ROOT:-/opt/airwatch}
ENV_FILE=$ROOT/shared/.env.production
BACKUPS=$ROOT/shared/backups
export MODEL_DIR=${MODEL_DIR:-$ROOT/shared/models}
KEEP_RELEASES=3
KEEP_BACKUPS=14

say() { printf '\n== %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
setting() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1; }
release_of() { basename "$(readlink -f "$1")"; }

# docker compose for the release in directory $1, tagged $2, with the remaining arguments.
compose_in() {
  local dir=$1 id=$2
  shift 2
  local files=(-f "$dir/docker-compose.prod.yml")
  if [ "${CLOUDWATCH:-off}" = "on" ]; then files+=(-f "$dir/deploy/docker-compose.cloudwatch.yml"); fi
  RELEASE=$id docker compose --project-directory "$dir" "${files[@]}" --env-file "$ENV_FILE" "$@"
}

# Container logs go to CloudWatch only when the Docker daemon can really write there: a
# container whose log stream cannot be created does not start at all.
decide_cloudwatch() {
  CLOUDWATCH=off
  local group region
  group=$(setting CLOUDWATCH_LOG_GROUP)
  region=$(setting AWS_REGION)
  if [ -z "$(setting AWS_ACCESS_KEY_ID)" ] || [ -z "$group" ] || [ -z "$region" ]; then
    echo "CloudWatch Logs: not configured, logs stay on the host (docker logs)."
  elif docker run --rm --log-driver awslogs --log-opt "awslogs-region=$region" --log-opt "awslogs-group=$group" \
      --log-opt awslogs-stream=preflight caddy:2-alpine caddy version >/dev/null 2>&1; then
    CLOUDWATCH=on
    echo "CloudWatch Logs: shipping to $group in $region."
  else
    echo "WARNING: CloudWatch Logs is configured but the Docker daemon cannot write to $group." >&2
    echo "         Check /root/.aws/credentials. Continuing with logs on the host only." >&2
  fi
  export CLOUDWATCH
}

require_settings() {
  [ -f "$ENV_FILE" ] || die "$ENV_FILE is missing. Run: host.sh init-env"
  local key missing=()
  for key in API_DOMAIN CLIENT_ORIGIN POSTGRES_USER POSTGRES_DB POSTGRES_PASSWORD JWT_SECRET SIMULATOR_TOKEN_SECRET; do
    [ -n "$(setting "$key")" ] || missing+=("$key")
  done
  [ ${#missing[@]} -eq 0 ] || die "empty in $ENV_FILE: ${missing[*]}"
  case "$(setting API_DOMAIN)" in *example.com) die "API_DOMAIN is still the placeholder. Set it: host.sh set API_DOMAIN=<host name>" ;; esac
  if [ "$(setting ATTACHMENT_STORAGE)" = "s3" ]; then
    if [ -z "$(setting S3_BUCKET)" ] || [ -z "$(setting AWS_ACCESS_KEY_ID)" ]; then
      die "ATTACHMENT_STORAGE=s3 needs S3_BUCKET and the AWS access key in $ENV_FILE"
    fi
  fi
}

# The model service starts without its artifact, but then no reading gets an assessment.
check_model() {
  local config artifact
  config=$(setting MODEL_CONFIG_PATH)
  config=${config:-configs/config.yaml}
  case "$config" in
    models/*) artifact=$MODEL_DIR/${config#models/} ;;
    *) artifact=$MODEL_DIR/delhi_pm10_calibrated.joblib ;;
  esac
  if [ -f "$artifact" ]; then
    echo "Model: $artifact is in place."
  elif [ "${ALLOW_NO_MODEL:-0}" = "1" ]; then
    echo "WARNING: $artifact is missing. Readings will be stored without an assessment." >&2
  else
    die "$artifact is missing. Copy the artifact to $MODEL_DIR, or set ALLOW_NO_MODEL=1 to start without assessments."
  fi
}

wait_healthy() {
  local dir=$1 id=$2 container status deadline=$((SECONDS + 300))
  container=$(compose_in "$dir" "$id" ps -q api)
  while [ $SECONDS -lt $deadline ]; do
    status=$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || echo starting)
    [ "$status" = "healthy" ] && return 0
    sleep 5
  done
  return 1
}

cmd_init_env() {
  local here
  here=$(cd "$(dirname "$0")" && pwd)
  "$here/init-env.sh" "$here/../.env.production.example" "$ENV_FILE"
}

cmd_set() {
  [ -f "$ENV_FILE" ] || die "$ENV_FILE is missing. Run: host.sh init-env"
  local pair key tmp pairs=("$@")
  # Secrets arrive on standard input so they never show in a process list.
  if [ "${1:-}" = "-" ]; then mapfile -t pairs; fi
  for pair in "${pairs[@]}"; do
    [ -n "$pair" ] || continue
    key=${pair%%=*}
    case "$key" in ''|*[!A-Z0-9_]*) die "not a setting name: $key" ;; esac
    tmp=$(mktemp "$ROOT/shared/.env.XXXXXX")
    grep -v "^$key=" "$ENV_FILE" > "$tmp" || true
    printf '%s\n' "$pair" >> "$tmp"
    chmod 600 "$tmp"
    mv "$tmp" "$ENV_FILE"
    echo "set $key"
  done
}

# The awslogs driver runs inside the Docker daemon, which reads root's AWS credentials file.
cmd_docker_credentials() {
  local id secret
  id=$(setting AWS_ACCESS_KEY_ID)
  secret=$(setting AWS_SECRET_ACCESS_KEY)
  if [ -z "$id" ] || [ -z "$secret" ]; then die "no AWS access key in $ENV_FILE yet"; fi
  printf '[default]\naws_access_key_id = %s\naws_secret_access_key = %s\n' "$id" "$secret" | sudo sh -c 'umask 077; mkdir -p /root/.aws; cat > /root/.aws/credentials'
  echo "Wrote /root/.aws/credentials (mode 600) for the Docker daemon."
}

# See deploy/model/build_local_artifact.py for what this artifact is and is not.
cmd_build_demo_model() {
  local id=${1:?usage: host.sh build-demo-model <release id>} dir
  dir=$ROOT/releases/$id
  if [ -f "$MODEL_DIR/local-demo/config.yaml" ]; then echo "The stand-in artifact is already in $MODEL_DIR/local-demo."; return 0; fi
  docker build -t "airwatch-model:$id" -f "$dir/deploy/model.Dockerfile" "$dir/adaptive-aqi-model"
  docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e PYTHONPATH=/app -w /app \
    -v "$MODEL_DIR:/app/models" -v "$dir/deploy/model:/tools:ro" "airwatch-model:$id" python /tools/build_local_artifact.py --out models/local-demo
}

cmd_backup() {
  local dir=${1:-$ROOT/current} stamp file bucket
  [ -d "$dir" ] || die "no release to back up from"
  mkdir -p "$BACKUPS"
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  file=$BACKUPS/airwatch-$stamp.dump
  # shellcheck disable=SC2016  # expanded inside the database container, not here
  compose_in "$dir" "$(release_of "$dir")" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$file.part"
  mv "$file.part" "$file"
  echo "Database dump: $file ($(du -h "$file" | cut -f1))"
  bucket=$(setting S3_BUCKET)
  if [ -n "$bucket" ] && [ -n "$(setting AWS_ACCESS_KEY_ID)" ]; then
    if docker run --rm -i -e AWS_ACCESS_KEY_ID="$(setting AWS_ACCESS_KEY_ID)" -e AWS_SECRET_ACCESS_KEY="$(setting AWS_SECRET_ACCESS_KEY)" \
      -e AWS_DEFAULT_REGION="$(setting AWS_REGION)" amazon/aws-cli:2.27.50 s3 cp - "s3://$bucket/backups/airwatch-$stamp.dump" < "$file"; then
      echo "Copied to s3://$bucket/backups/airwatch-$stamp.dump"
    else
      echo "WARNING: the copy to S3 failed; the dump is on the host." >&2
    fi
  fi
  # Keep the newest dumps only. The names are generated above, so ls is safe to parse.
  # shellcheck disable=SC2012
  ls -1t "$BACKUPS"/airwatch-*.dump 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
}

# A failed release must not leave the host on a half-started revision. Start the release
# that `current` points at again; its images are still on the host.
restart_current() {
  local dir id
  dir=$(readlink -f "$ROOT/current")
  id=$(basename "$dir")
  say "Starting release $id again"
  compose_in "$dir" "$id" up -d --remove-orphans && wait_healthy "$dir" "$id"
}

cmd_release() {
  local id=${1:?usage: host.sh release <id>} dir
  dir=$ROOT/releases/$id
  [ -f "$dir/docker-compose.prod.yml" ] || die "$dir is not an unpacked release"
  require_settings
  check_model
  decide_cloudwatch

  if [ -L "$ROOT/current" ] && [ -n "$(compose_in "$ROOT/current" "$(release_of "$ROOT/current")" ps -q db 2>/dev/null)" ]; then
    say "Backing up the database before migrating"
    cmd_backup "$ROOT/current"
  fi

  say "Building and starting release $id"
  if ! compose_in "$dir" "$id" up -d --build --remove-orphans || ! wait_healthy "$dir" "$id"; then
    compose_in "$dir" "$id" ps || true
    compose_in "$dir" "$id" logs --tail 40 migrate api || true
    # `current` still names the last release that worked. Put the host back on it.
    if [ -L "$ROOT/current" ] && [ "$(release_of "$ROOT/current")" != "$id" ]; then
      local good
      good=$(release_of "$ROOT/current")
      if restart_current; then
        die "release $id did not become healthy. The host is running release $good again. If $id applied a migration, the dump taken above undoes it: host.sh restore <dump file>."
      fi
      die "release $id did not become healthy, and release $good did not come back either. Inspect: host.sh compose ps, host.sh compose logs api"
    fi
    die "release $id did not become healthy. Nothing was running before it, so there is nothing to return to."
  fi

  if [ -L "$ROOT/current" ] && [ "$(release_of "$ROOT/current")" != "$id" ]; then
    ln -sfn "$(readlink -f "$ROOT/current")" "$ROOT/previous"
  fi
  ln -sfn "$dir" "$ROOT/current"
  cmd_status

  # Old release directories and their images go. The current and previous releases always
  # stay, however many failed attempts are newer than they are.
  local old current previous=
  current=$(readlink -f "$ROOT/current")
  if [ -L "$ROOT/previous" ]; then previous=$(readlink -f "$ROOT/previous"); fi
  # shellcheck disable=SC2012  # release ids are git hashes
  ls -1dt "$ROOT"/releases/*/ | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
    old=${old%/}
    if [ "$old" = "$current" ] || [ "$old" = "$previous" ]; then continue; fi
    docker image rm "airwatch-api:$(basename "$old")" "airwatch-model:$(basename "$old")" >/dev/null 2>&1 || true
    rm -rf "$old"
  done
  docker image prune -f >/dev/null
}

cmd_rollback() {
  [ -L "$ROOT/previous" ] || die "there is no previous release to return to"
  require_settings
  decide_cloudwatch
  local dir id was
  dir=$(readlink -f "$ROOT/previous")
  id=$(basename "$dir")
  was=$(readlink -f "$ROOT/current")
  say "Returning to release $id"
  # Its images are still on the host, so nothing is rebuilt. Migrations are additive: the
  # older code runs against the newer schema. To undo data as well: host.sh restore <dump>.
  compose_in "$dir" "$id" up -d --remove-orphans
  wait_healthy "$dir" "$id" || die "release $id did not become healthy either. Inspect: host.sh compose logs api"
  ln -sfn "$dir" "$ROOT/current"
  ln -sfn "$was" "$ROOT/previous"
  cmd_status
}

cmd_restore() {
  local file=${1:?usage: host.sh restore <dump file>} dir=$ROOT/current id
  [ -f "$file" ] || die "$file not found"
  id=$(release_of "$dir")
  say "Stopping the API and the worker"
  compose_in "$dir" "$id" stop api worker
  say "Restoring $file"
  # shellcheck disable=SC2016  # expanded inside the database container, not here
  compose_in "$dir" "$id" exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$file"
  compose_in "$dir" "$id" up -d
  wait_healthy "$dir" "$id" || die "the API did not come back after the restore"
  cmd_status
}

cmd_status() {
  local dir=$ROOT/current id
  [ -L "$dir" ] || die "nothing has been released yet"
  id=$(release_of "$dir")
  say "Release $id"
  compose_in "$dir" "$id" ps --format 'table {{.Service}}\t{{.Status}}'
  printf 'readiness: '
  compose_in "$dir" "$id" exec -T api node -e "fetch('http://127.0.0.1:4000/api/health/ready').then(async (r) => console.log(r.status, await r.text())).catch((e) => { console.log('unreachable', e.message); process.exit(1); })"
}

command=${1:-}
[ $# -gt 0 ] && shift
case "$command" in
  init-env) cmd_init_env ;;
  set) cmd_set "$@" ;;
  docker-credentials) cmd_docker_credentials ;;
  build-demo-model) cmd_build_demo_model "$@" ;;
  release) cmd_release "$@" ;;
  rollback) cmd_rollback ;;
  backup) cmd_backup ;;
  restore) cmd_restore "$@" ;;
  demo-data) CLOUDWATCH=off compose_in "$ROOT/current" "$(release_of "$ROOT/current")" exec -T api node scripts/load-demo-data.js "$@" ;;
  status) CLOUDWATCH=off cmd_status ;;
  compose) decide_cloudwatch >/dev/null 2>&1; compose_in "$ROOT/current" "$(release_of "$ROOT/current")" "$@" ;;
  *) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
