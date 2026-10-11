#!/usr/bin/env bash
# Create the AWS side of AirWatch: one CloudFormation stack, defined in infra/.
#
#   ALERT_EMAIL=you@example.org deploy/aws/setup.sh
#
#   ALERT_EMAIL         receives alarms and budget alerts                          (required)
#   SSH_CIDR            who may reach port 22           (default: this machine's address /32)
#   MONTHLY_BUDGET_USD  budget behind the billing alerts                         (default 20)
#   API_DOMAIN          a host name you own, pointed at the static IP afterwards
#                       (default: <static ip, dashed>.sslip.io, which needs no DNS setup)
#   BUNDLE_ID           Lightsail plan       (default: the 2 GB, 12 USD plan of the Region)
#   KEY_PAIR_NAME       Lightsail key pair                          (default airwatch-deploy)
#
# It asks before creating anything that widens permissions (CDK's own prompt). Run it again
# after changing a value: only the difference is applied.
set -euo pipefail
# shellcheck source=deploy/aws/lib.sh
source "$(dirname "$0")/lib.sh"
need aws node npm curl
: "${ALERT_EMAIL:?set ALERT_EMAIL to the address that should receive alarms and budget alerts}"
KEY_PAIR_NAME=${KEY_PAIR_NAME:-airwatch-deploy}

say "AWS account"
read -r account arn < <(whoami_aws)
echo "account $account as $arn, Region $AWS_REGION"

SSH_CIDR=${SSH_CIDR:-$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')/32}
echo "SSH will be allowed from $SSH_CIDR only."

say "Lightsail key pair"
if aws lightsail get-key-pair --key-pair-name "$KEY_PAIR_NAME" >/dev/null 2>&1; then
  echo "$KEY_PAIR_NAME exists. Its private key is expected at $SSH_KEY."
  if [ ! -f "$SSH_KEY" ]; then die "$SSH_KEY is missing. Point SSH_KEY at the private key of $KEY_PAIR_NAME, or choose another KEY_PAIR_NAME."; fi
else
  if [ -e "$SSH_KEY" ]; then die "$SSH_KEY already exists but the key pair $KEY_PAIR_NAME does not. Move the file or set SSH_KEY."; fi
  # Lightsail returns the private key once. It goes to ~/.ssh, never into the repository.
  (umask 077; mkdir -p "$(dirname "$SSH_KEY")"; aws lightsail create-key-pair --key-pair-name "$KEY_PAIR_NAME" --query privateKeyBase64 --output text > "$SSH_KEY")
  echo "Created $KEY_PAIR_NAME; private key saved to $SSH_KEY (mode 600)."
fi

say "Lightsail plan"
if [ -z "${BUNDLE_ID:-}" ]; then
  BUNDLE_ID=$(aws lightsail get-bundles --query "bundles[?isActive && ramSizeInGb==\`2.0\` && price==\`12.0\` && contains(supportedPlatforms, 'LINUX_UNIX')] | [0].bundleId" --output text)
  if [ -z "$BUNDLE_ID" ] || [ "$BUNDLE_ID" = "None" ]; then
    die "could not find the 2 GB Linux plan in $AWS_REGION. List them with 'aws lightsail get-bundles' and set BUNDLE_ID."
  fi
fi
aws lightsail get-bundles --query "bundles[?bundleId=='$BUNDLE_ID'].[bundleId, ramSizeInGb, cpuCount, diskSizeInGb, transferPerMonthInGb, price]" --output text \
  | awk '{ printf "%s: %s GB RAM, %s vCPU, %s GB disk, %s GB transfer, %s USD a month\n", $1, $2, $3, $4, $5, $6 }'

say "CloudFormation stack $STACK_NAME"
cd "$REPO/infra"
npm ci --no-audit --no-fund
context=(-c "stackName=$STACK_NAME" -c "alertEmail=$ALERT_EMAIL" -c "sshCidr=$SSH_CIDR" -c "keyPairName=$KEY_PAIR_NAME" -c "bundleId=$BUNDLE_ID" -c "monthlyBudgetUsd=${MONTHLY_BUDGET_USD:-20}")
if [ -n "${API_DOMAIN:-}" ]; then context+=(-c "apiDomain=$API_DOMAIN"); fi
npx cdk bootstrap "${context[@]}" "aws://$account/$AWS_REGION"
CDK_DEFAULT_ACCOUNT=$account CDK_DEFAULT_REGION=$AWS_REGION npx cdk deploy "${context[@]}"

say "Done"
echo "Static IP:  $(out StaticIp)"
echo "API domain: $(out ApiDomain)"
echo "Frontend:   $(out FrontendUrl)"
echo
echo "1. Confirm the subscription email AWS just sent to $ALERT_EMAIL, or no alarm will reach you."
if [ -n "${API_DOMAIN:-}" ]; then echo "2. Create a DNS A record: $API_DOMAIN -> $(out StaticIp)"; fi
echo "Next: deploy/aws/deploy-backend.sh, then deploy/aws/deploy-frontend.sh"
