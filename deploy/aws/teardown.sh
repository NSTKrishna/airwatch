#!/usr/bin/env bash
# Remove the AWS resources of AirWatch and stop the charges.
#
#   deploy/aws/teardown.sh
#
# The evidence bucket is kept on purpose (it holds citizens' photographs and database dumps).
# The script prints how to delete it once you are sure.
set -euo pipefail
# shellcheck source=deploy/aws/lib.sh
source "$(dirname "$0")/lib.sh"
need aws node npm
read -r account _ < <(whoami_aws)
bucket=$(out EvidenceBucket)
user=$(out InstanceUserName)

read -r -p "Delete stack $STACK_NAME in account $account ($AWS_REGION)? The instance and its database are destroyed. Type the stack name to confirm: " answer
[ "$answer" = "$STACK_NAME" ] || die "not confirmed"

# CloudFormation cannot delete a user that still has access keys.
for key in $(aws iam list-access-keys --user-name "$user" --query 'AccessKeyMetadata[].AccessKeyId' --output text); do
  aws iam delete-access-key --user-name "$user" --access-key-id "$key"
  echo "Deleted access key $key"
done

cd "$REPO/infra"
npm ci --no-audit --no-fund
CDK_DEFAULT_ACCOUNT=$account CDK_DEFAULT_REGION=$AWS_REGION npx cdk destroy --force \
  -c "stackName=$STACK_NAME" -c alertEmail=unused@example.org -c sshCidr=127.0.0.1/32 -c keyPairName=unused -c bundleId=unused

cat <<NOTE

Left in the account, on purpose:
  - s3://$bucket          delete with: aws s3 rb s3://$bucket --force
  - Lightsail snapshots   list with:   aws lightsail get-instance-snapshots
  - the key pair          delete with: aws lightsail delete-key-pair --key-pair-name airwatch-deploy
  - the CDK bootstrap stack (CDKToolkit), which costs nothing while empty
NOTE
