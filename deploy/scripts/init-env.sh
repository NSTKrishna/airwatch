#!/usr/bin/env bash
# Create an env file from a template and generate a random value for every secret left empty.
# Run it where the stack runs, so the secrets never exist anywhere else.
#
#   deploy/scripts/init-env.sh deploy/.env.production.example /opt/airwatch/shared/.env.production
#   deploy/scripts/init-env.sh --local deploy/.env.local.example deploy/.env.local
#
# --local also fills in the placeholder object-store key of the local stack. An existing
# target is never overwritten.
set -euo pipefail

local_stack=false
if [ "${1:-}" = "--local" ]; then local_stack=true; shift; fi
template=${1:?usage: init-env.sh [--local] <template> <target>}
target=${2:?usage: init-env.sh [--local] <template> <target>}

if [ -e "$target" ]; then
  echo "$target already exists; left untouched."
  exit 0
fi

umask 077
mkdir -p "$(dirname "$target")"
tmp=$(mktemp "$(dirname "$target")/.env.XXXXXX")
trap 'rm -f "$tmp"' EXIT
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    POSTGRES_PASSWORD=) echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" ;;
    JWT_SECRET=) echo "JWT_SECRET=$(openssl rand -hex 48)" ;;
    SIMULATOR_TOKEN_SECRET=) echo "SIMULATOR_TOKEN_SECRET=$(openssl rand -hex 32)" ;;
    DEMO_CITIZEN_PASSWORD=) echo "DEMO_CITIZEN_PASSWORD=$(openssl rand -hex 9)" ;;
    DEMO_OFFICER_PASSWORD=) echo "DEMO_OFFICER_PASSWORD=$(openssl rand -hex 9)" ;;
    AWS_ACCESS_KEY_ID=) if $local_stack; then echo "AWS_ACCESS_KEY_ID=local$(openssl rand -hex 6)"; else echo "$line"; fi ;;
    AWS_SECRET_ACCESS_KEY=) if $local_stack; then echo "AWS_SECRET_ACCESS_KEY=$(openssl rand -hex 20)"; else echo "$line"; fi ;;
    *) echo "$line" ;;
  esac
done < "$template" > "$tmp"
mv "$tmp" "$target"
trap - EXIT
echo "Wrote $target (mode 600) with freshly generated secrets."
