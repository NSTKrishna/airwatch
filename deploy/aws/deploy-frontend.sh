#!/usr/bin/env bash
# Build the React client against the deployed API and publish it on Amplify Hosting.
#
#   deploy/aws/deploy-frontend.sh
#
# The build is uploaded directly, so Amplify needs no access to the repository.
set -euo pipefail
# shellcheck source=deploy/aws/lib.sh
source "$(dirname "$0")/lib.sh"
need aws node npm curl zip
cd "$REPO"
whoami_aws >/dev/null
app=$(out AmplifyAppId)
api="https://$(out ApiDomain)"
site=$(out FrontendUrl)

say "Building the client for $api"
npm --prefix client ci --no-audit --no-fund
VITE_API_BASE_URL=$api npm --prefix client run build

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
(cd client/dist && zip -qr "$work/site.zip" .)

say "Uploading to Amplify app $app"
read -r job upload < <(aws amplify create-deployment --app-id "$app" --branch-name main --query '[jobId, zipUploadUrl]' --output text)
curl -fsS -H 'Content-Type: application/zip' --upload-file "$work/site.zip" "$upload"
aws amplify start-deployment --app-id "$app" --branch-name main --job-id "$job" >/dev/null
for attempt in $(seq 1 60); do
  status=$(aws amplify get-job --app-id "$app" --branch-name main --job-id "$job" --query 'job.summary.status' --output text)
  case "$status" in
    SUCCEED) break ;;
    FAILED|CANCELLED) die "Amplify deployment $job ended as $status. See the Amplify console for the log." ;;
  esac
  [ "$attempt" -lt 60 ] || die "Amplify deployment $job is still $status after five minutes"
  sleep 5
done
echo "Deployment $job succeeded."

say "Smoke test"
node deploy/scripts/smoke.mjs --api "$api" --web "$site"
echo
echo "Frontend is live at $site"
