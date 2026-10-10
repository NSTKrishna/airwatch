#!/usr/bin/env bash
# Run the production stack on this machine, as close to the deployed shape as it gets without
# AWS: the same images and Compose file, TLS at Caddy, S3Mock in place of S3, and the built
# client on its own origin in place of Amplify. See deploy/docker-compose.local.yml.
#
#   deploy/scripts/local-stack.sh up          build and start (creates deploy/.env.local)
#   deploy/scripts/local-stack.sh smoke       full smoke test, including the model
#   deploy/scripts/local-stack.sh demo-data   load demo history and demo cases
#   deploy/scripts/local-stack.sh logs api    any docker compose command works
#   deploy/scripts/local-stack.sh down -v     stop and delete the volumes
set -euo pipefail

cd "$(dirname "$0")/../.."
ENV_FILE=deploy/.env.local
compose() { docker compose -f docker-compose.prod.yml -f deploy/docker-compose.local.yml --env-file "$ENV_FILE" "$@"; }
setting() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1; }

# The stand-in artifact is built once, in the model image, with the model repository's own code.
ensure_model() {
  local config
  config=$(setting MODEL_CONFIG_PATH)
  [ "$config" = "models/local-demo/config.yaml" ] || return 0
  [ -f adaptive-aqi-model/models/local-demo/config.yaml ] && return 0
  echo "== Building the stand-in model artifact (see deploy/model/build_local_artifact.py)"
  compose build model
  docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e PYTHONPATH=/app -w /app \
    -v "$PWD/adaptive-aqi-model/models:/app/models" -v "$PWD/deploy/model:/tools:ro" \
    airwatch-model:local python /tools/build_local_artifact.py --out models/local-demo
}

command=${1:-up}
[ $# -gt 0 ] && shift
case "$command" in
  up)
    deploy/scripts/init-env.sh --local deploy/.env.local.example "$ENV_FILE"
    ensure_model
    compose up -d --build "$@"
    echo "API:      $(setting PUBLIC_API_URL)/api/health/ready (self-signed certificate)"
    echo "Frontend: $(setting CLIENT_ORIGIN)"
    ;;
  smoke)
    DEMO_CITIZEN_PASSWORD=$(setting DEMO_CITIZEN_PASSWORD) DEMO_OFFICER_PASSWORD=$(setting DEMO_OFFICER_PASSWORD) \
      node deploy/scripts/smoke.mjs --api "$(setting PUBLIC_API_URL)" --web "$(setting CLIENT_ORIGIN)" --insecure --full --require-model "$@"
    ;;
  demo-data) compose exec -T api node scripts/load-demo-data.js "$@" ;;
  *) compose "$command" "$@" ;;
esac
