# Deploying AirWatch on AWS

The design, the cost table and the reasoning are in [ARCHITECTURE_AWS.md](ARCHITECTURE_AWS.md).
This page is the procedure.

## Status: what has and has not been run

**Not run: anything against an AWS account.** No stack has been created and no script in
`deploy/aws/` has talked to AWS. Treat the first deployment as a test and read the output.

Run and passing:

- `infra/`: `cdk synth` renders the CloudFormation template and `npm test` checks it (10 tests).
- The production images and `docker-compose.prod.yml`, with TLS at Caddy, an S3 stand-in and the
  built client on its own origin, on a Linux x86-64 host (`deploy/scripts/local-stack.sh up`).
- `deploy/scripts/smoke.mjs --full --require-model` against that stack: 33 checks, including the
  whole citizen workflow and Random Forest assessments of simulated readings.
- The host procedure used on the instance (`ship.sh`, then `host.sh release`, `backup`,
  `rollback`, `restore`) against the same Linux host over SSH.
- `shellcheck` on every script.

Three things can only be confirmed in a real account: the Lightsail plan and image identifiers
that `setup.sh` looks up, certificate issuance for the public host name, and CloudWatch log
delivery from the Docker daemon.

## What you need

- An AWS account and credentials for it on your machine (`aws sts get-caller-identity` works).
  The first run creates IAM resources and bootstraps the CDK, so use an administrator identity.
- AWS CLI v2, Node.js 20 or newer, git, ssh, curl and zip.
- This repository cloned with its submodule: `git clone --recurse-submodules <url>`.
- An email address for alarms and budget alerts.
- The trained model artifact, `adaptive-aqi-model/models/delhi_pm10_calibrated.joblib`. It is not
  in git. Without it, deploy with `MODEL=local-demo` (see [The model artifact](#the-model-artifact)).

## Deploy

Three commands, in order. Each can be run again safely.

```bash
ALERT_EMAIL=you@example.org deploy/aws/setup.sh
```

Creates the stack: instance and static IP, bucket, IAM user, log group, alarms, budget and the
Amplify app. It creates a Lightsail key pair and saves the private key to
`~/.ssh/airwatch-deploy.pem`, allows SSH only from your current address, and prints the static IP,
the API host name and the frontend URL. AWS then emails a subscription confirmation to
`ALERT_EMAIL`: confirm it, or no alarm will reach you.

```bash
deploy/aws/deploy-backend.sh
```

Waits for the instance's first boot (Docker, swap, directories), copies the committed revision,
generates the application secrets on the instance, creates the instance's access key and sends it
there, copies or builds the model artifact, builds the images, migrates and seeds the database,
starts the stack, and runs the smoke test from your machine against the public HTTPS address. Add
`DEMO_DATA=1` to load demo history and demo cases.

```bash
deploy/aws/deploy-frontend.sh
```

Builds the client against the API address, uploads it to Amplify and checks that the site, a deep
link and cross-origin calls work.

Settings for `setup.sh` (all optional except the email):

| Variable | Default | Meaning |
| --- | --- | --- |
| `ALERT_EMAIL` | none | Receives alarms and budget alerts |
| `AWS_REGION` | `ap-south-1` | Region of every resource |
| `SSH_CIDR` | your address `/32` | The only range allowed to reach port 22 |
| `MONTHLY_BUDGET_USD` | `20` | Budget behind the three billing alerts |
| `API_DOMAIN` | `<ip with dashes>.sslip.io` | A host name you own. Point an `A` record at the static IP after `setup.sh`. |
| `BUNDLE_ID` | the 2 GB, 12 USD plan | Lightsail plan, looked up with `aws lightsail get-bundles` |

## Verify

`deploy-backend.sh` and `deploy-frontend.sh` end with the smoke test. To run it by hand:

```bash
node deploy/scripts/smoke.mjs --api https://<api domain> --web https://<frontend url> --require-model
```

It checks readiness, the HTTPS redirect, the public map data, that private routes refuse
signed-out callers, that fresh simulated readings carry a Random Forest assessment, and that the
frontend can call the API. With `--full` and the two demo passwords in the environment it also
files a report and walks it through every step (and hides that case from the public map at the
end). The passwords are on the host:

```bash
ssh -i ~/.ssh/airwatch-deploy.pem ubuntu@<static ip> 'grep ^DEMO_ /opt/airwatch/shared/.env.production'
```

Then, from outside the instance, these must fail to connect: `nc -zv <static ip> 5432`, `8000`
and `4000`.

## Secrets

| Secret | Created by | Stored |
| --- | --- | --- |
| Database password, JWT secret, simulator secret, demo passwords | `init-env.sh`, on the instance | `/opt/airwatch/shared/.env.production`, mode 600 |
| Access key of the instance's IAM user | `deploy-backend.sh` (IAM API), piped over SSH | the same file, and `/root/.aws/credentials` for the Docker daemon |
| SSH private key | `setup.sh` (Lightsail API) | `~/.ssh/airwatch-deploy.pem` on your machine |

None is in the repository, an image or the CloudFormation template. `.env` files, `*.pem` and
`cdk.out/` are ignored by git, and CI fails if an env file or a key is committed.

To rotate the instance's access key: delete it in IAM, remove the two `AWS_` key lines from the
env file with `host.sh set AWS_ACCESS_KEY_ID= AWS_SECRET_ACCESS_KEY=`, and run
`deploy/aws/deploy-backend.sh` again.

## The model artifact

The FastAPI service loads `models/delhi_pm10_calibrated.joblib`, which the model team trained and
which is not in git. `deploy-backend.sh` copies it from your clone to
`/opt/airwatch/shared/models/` when it is there.

If you do not have the file, `MODEL=local-demo deploy/aws/deploy-backend.sh` builds a stand-in on
the instance with the model repository's own generator, training settings and code
(`deploy/model/build_local_artifact.py`). It is a real Random Forest behind the unchanged service,
but it is not the team's artifact: it is fitted to different simulated data, its margin differs,
and the metrics in the model repository's README do not describe it. `/model/info` reports its
data source as `SYNTHETIC_SIMULATION_LOCAL_REBUILD`.

The model container is healthy only once an artifact is loaded, and `/api/health/ready` reports
`modelReady`. The API keeps storing readings while the model is down; they show "No assessment".

## Operating it

Everything on the instance goes through one script. `ssh` in, then:

```bash
H=/opt/airwatch/current/deploy/scripts/host.sh
$H status                 # containers, health, readiness
$H compose logs -f api    # any docker compose command
$H backup                 # dump the database now (also runs nightly at 02:30 IST)
$H demo-data              # load demo history and demo cases
```

Layout on the instance:

```
/opt/airwatch/shared/.env.production   settings and secrets
/opt/airwatch/shared/models/           model artifact
/opt/airwatch/shared/backups/          database dumps (14 kept; copied to S3, 30 days kept)
/opt/airwatch/releases/<git hash>/     one directory per shipped revision (3 kept)
/opt/airwatch/current, previous        the running release and the one before it
```

**Update.** Commit, then run `deploy/aws/deploy-backend.sh` (and `deploy-frontend.sh` if the
client changed). The release script dumps the database, builds the new images next to the old
ones, applies migrations and switches over. If the new release does not become healthy it stops
and says so, and the previous release directory and images are untouched.

**Roll back the backend.**

```bash
$H rollback
```

Starts the previous release from its existing images, without a rebuild. Migrations in this
repository are additive, so the older code runs against the newer schema. To take the data back
as well, restore the dump the release made before migrating:

```bash
ls /opt/airwatch/shared/backups/
$H restore /opt/airwatch/shared/backups/airwatch-<timestamp>.dump
```

**Roll back the frontend.** Check out the previous commit and run `deploy/aws/deploy-frontend.sh`,
or pick the earlier deployment in the Amplify console and choose "Redeploy this version".

**Restore after losing the instance.** Run `setup.sh` and `deploy-backend.sh` again, copy the
newest dump from `s3://<bucket>/backups/` to the instance and run `$H restore <file>`. Photographs
are already in S3. Lightsail also keeps seven daily snapshots of the disk.

**Persistent data** lives in three places: the `airwatch_pgdata` Docker volume (database), the
`airwatch_caddy_data` volume (certificates) and the S3 bucket. Releases never touch the volumes.

## Monitoring and billing alerts

- Logs: CloudWatch log group `/airwatch/prod`, one stream per container, kept 14 days. If the
  Docker daemon cannot write there, the release continues with logs on the instance and prints a
  warning.
- Alarms (email through SNS): five or more API errors in five minutes, and no device upload for
  fifteen minutes.
- Budget: `airwatch-monthly`, emails at 50 % and 80 % of actual spend and when the forecast
  passes 100 %. Credits are excluded, so it reports what the stack would cost without them.

To add a billing alert by hand, or check the one the stack made: Billing and Cost Management
console, Budgets, Create budget, "Use a template", "Monthly cost budget", enter the amount and the
email addresses. A "Zero spend budget" from the same screen is a useful second alert while the
account runs on credits. Recipients must confirm their address before alerts arrive.

## The same stack without AWS

```bash
deploy/scripts/local-stack.sh up      # builds, creates deploy/.env.local, starts everything
deploy/scripts/local-stack.sh smoke   # full smoke test, including the model
deploy/scripts/local-stack.sh down -v
```

This is what CI runs on every pull request (`.github/workflows/ci.yml`, job "Production stack
smoke test"), next to the API tests, the client build, the template tests and the script checks.

## Remove everything

```bash
deploy/aws/teardown.sh
```

Deletes the stack after you type its name. The bucket is kept on purpose; the script prints the
command that deletes it, along with the other leftovers (snapshots, key pair).

## If something goes wrong

| Symptom | Likely cause and fix |
| --- | --- |
| `setup.sh` cannot find the 2 GB plan | Plan identifiers differ by Region. Run `aws lightsail get-bundles --query 'bundles[].[bundleId,ramSizeInGb,price]' --output table` and pass `BUNDLE_ID`. |
| Stack creation fails on the instance | The account may not allow Lightsail yet (new or free-plan accounts). The CloudFormation event shows the reason. |
| `deploy-backend.sh` waits for the first boot and gives up | SSH is allowed from one address. If yours changed, run `setup.sh` again. Otherwise read `/var/log/cloud-init-output.log` on the instance. |
| Smoke test: "the API was not ready" over HTTPS | The certificate is not issued yet. `$H compose logs caddy` shows why: the DNS record is missing, or the certificate authority is rate-limiting the shared `sslip.io` name. A domain of your own avoids the second. |
| `modelReady` is false | The artifact is missing or was built with other library versions. `$H compose logs model`. |
| Photographs fail to upload | `attachmentStorageReady` is false in `/api/health/ready`: the access key is missing or wrong. Run `deploy-backend.sh` again. |
| No logs in CloudWatch | `/root/.aws/credentials` is missing. `$H docker-credentials`, then `$H release <current id>`. |
