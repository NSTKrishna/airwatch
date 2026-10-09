# Deploying AirWatch on AWS

**Status: these files have not been deployed.** Nothing below has been run against an AWS account, and
the container images have not been built (the compose files pass `docker compose config` only). Treat
the first deployment as a test and follow the verification steps at the end.

## Shape

| Part | Where | Public? |
| --- | --- | --- |
| React client | AWS Amplify Hosting (`amplify.yml`) | Yes, HTTPS |
| Caddy reverse proxy | EC2, Docker Compose | Yes, 80/443, HTTPS with automatic certificates |
| Express API | EC2, Docker Compose | Only through Caddy, `/api/*` |
| Device simulator (worker) | EC2, Docker Compose | No |
| FastAPI model | EC2, Docker Compose | No (internal network, no published port) |
| PostgreSQL | EC2, Docker Compose, named volume on EBS | No (internal network, no published port) |

`docker-compose.prod.yml` puts the API, worker, model and database on a Docker network marked
`internal`, which has no published ports and no route to the internet.

## 1. EC2 host

- Instance: `t3.small` or larger (the model service needs roughly 1 GB), Amazon Linux 2023 or Ubuntu 24.04, 20 GB gp3.
- Security group: inbound 80 and 443 from anywhere; 22 from your IP only. Nothing else.
- Elastic IP, so the address survives restarts.
- Instance role (for CloudWatch logs): `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`.

```bash
# Amazon Linux 2023
sudo dnf install -y docker git && sudo systemctl enable --now docker && sudo usermod -aG docker $USER
sudo mkdir -p /usr/local/lib/docker/cli-plugins && sudo curl -sSL \
  https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose && sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
# log out and back in so the docker group applies
```

## 2. A host name for HTTPS

Caddy needs a name that resolves to the Elastic IP. Either create a DNS `A` record
(`api.yourdomain` → Elastic IP), or for a hackathon use `sslip.io`, which needs no setup:
an Elastic IP of `13.201.10.20` gives the host name `13-201-10-20.sslip.io`.

## 3. Code, model artifact, configuration

```bash
git clone --recurse-submodules <repo url> airwatch && cd airwatch

# The trained artifact is not in git. Copy it from your machine:
#   scp adaptive-aqi-model/models/delhi_pm10_calibrated.joblib ec2-user@<host>:airwatch/adaptive-aqi-model/models/
ls -l adaptive-aqi-model/models/delhi_pm10_calibrated.joblib

cp deploy/.env.production.example deploy/.env.production
chmod 600 deploy/.env.production
# Fill in API_DOMAIN, CLIENT_ORIGIN and every secret (generation commands are in the file).
```

No secret is stored in the repository or in an image. `deploy/.env.production` is gitignored.

## 4. Start

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env.production up -d --build
# With CloudWatch Logs:
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.cloudwatch.yml --env-file deploy/.env.production up -d --build
```

The `migrate` job applies Prisma migrations and the (repeatable) seed, then the API starts. Optional
demo history and sample complaints:

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env.production exec api node scripts/load-demo-data.js
```

## 5. Frontend on Amplify

1. Amplify console → New app → connect the repository and branch. Amplify reads `amplify.yml` (app root `client`).
2. Environment variable: `VITE_API_BASE_URL=https://<API_DOMAIN>` (no trailing slash).
3. Rewrites and redirects → add a single-page-app rule: source
   `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>`, target `/index.html`, type `200 (Rewrite)`.
4. Put the Amplify URL in `CLIENT_ORIGIN` in `deploy/.env.production` and restart the API:
   `docker compose -f docker-compose.prod.yml --env-file deploy/.env.production up -d api`.

## 6. Verify (do this before saying it is deployed)

```bash
curl -s https://$API_DOMAIN/api/health                 # {"status":"ok"}
curl -s https://$API_DOMAIN/api/health/ready           # database true; modelReady true once the artifact is loaded
docker compose -f docker-compose.prod.yml ps           # model must be "healthy"; "unhealthy" means the artifact is missing
curl -s -o /dev/null -w '%{http_code}\n' http://$API_DOMAIN/api/health   # 308 redirect to HTTPS
# From outside the host these must fail to connect:
nc -zv $API_DOMAIN 5432; nc -zv $API_DOMAIN 8000; nc -zv $API_DOMAIN 4000
docker compose -f docker-compose.prod.yml logs worker --tail 5    # the simulator uploading
```

Then sign in on the Amplify URL and confirm readings appear with a PM10 assessment.

## Backups

The database lives in the `airwatch_pgdata` Docker volume on the instance's EBS disk.

```bash
# Logical backup to S3 (instance role needs s3:PutObject on the bucket). Run daily from cron.
docker compose -f docker-compose.prod.yml --env-file deploy/.env.production exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' | aws s3 cp - s3://<bucket>/airwatch/$(date +%F).dump

# Restore into an empty database
aws s3 cp s3://<bucket>/airwatch/<date>.dump - | docker compose -f docker-compose.prod.yml --env-file deploy/.env.production \
  exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists'
```

Also enable scheduled EBS snapshots (Data Lifecycle Manager) for the volume. For anything beyond a
demo, move PostgreSQL to RDS in a private subnet and point `DATABASE_URL` at it.

## Updating

```bash
git pull --recurse-submodules
docker compose -f docker-compose.prod.yml --env-file deploy/.env.production up -d --build
```

Migrations are applied by the `migrate` job on every start. They are additive; nothing is dropped.
