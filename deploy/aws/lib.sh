# shellcheck shell=bash
# Shared by the scripts in deploy/aws. Source it; do not run it.
#
#   AWS_REGION   Region of the stack                 (default ap-south-1)
#   STACK_NAME   CloudFormation stack                (default AirWatch)
#   SSH_KEY      private key for the instance        (default ~/.ssh/airwatch-deploy.pem)
set -euo pipefail

export AWS_REGION=${AWS_REGION:-ap-south-1}
export AWS_DEFAULT_REGION=$AWS_REGION
STACK_NAME=${STACK_NAME:-AirWatch}
SSH_KEY=${SSH_KEY:-$HOME/.ssh/airwatch-deploy.pem}
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
export REPO

say() { printf '\n== %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
need() { local tool; for tool in "$@"; do command -v "$tool" >/dev/null || die "$tool is required but not installed"; done; }

# One output of the stack, e.g. `out StaticIp`.
out() {
  local value
  value=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text)
  if [ -z "$value" ] || [ "$value" = "None" ]; then die "stack $STACK_NAME has no output $1. Has deploy/aws/setup.sh finished?"; fi
  printf '%s' "$value"
}

host_target() { printf 'ubuntu@%s' "$(out StaticIp)"; }
host_ssh() { ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$(host_target)" "$@"; }

whoami_aws() {
  aws sts get-caller-identity --query '[Account, Arn]' --output text || die "no AWS credentials. Run 'aws configure sso' or 'aws configure' first."
}
