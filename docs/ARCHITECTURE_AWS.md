# AirWatch on AWS: architecture, cost and reasoning

This is the design behind [DEPLOY_AWS.md](DEPLOY_AWS.md). It keeps the existing stack (React and
Vite, Express, the FastAPI Random Forest service, the simulator worker, PostgreSQL) and adds only
the AWS services that do work the stack would otherwise have to do itself.

![AirWatch on AWS: the browser loads the React client from Amplify Hosting and calls the API over HTTPS on one Lightsail instance, which runs Caddy, Express, PostgreSQL, the FastAPI model and the simulator worker under Docker Compose, stores photographs in a private S3 bucket, ships logs to CloudWatch with two alarms, and is covered by an AWS Budgets alert](images/aws-architecture.svg)

## What runs where

| Part | Service | Why this one |
| --- | --- | --- |
| React client | AWS Amplify Hosting | Static hosting with HTTPS and a CDN, at no cost for this traffic. A build is uploaded by a script, so Amplify holds no GitHub token. |
| Express API, FastAPI model, worker, PostgreSQL, Caddy | One Amazon Lightsail instance (2 GB), Docker Compose | The five containers measured about 320 MiB at rest with 26 simulated devices; 2 GB leaves room for image builds on the instance. One fixed price covers the machine, 60 GB of disk, the static IP and 1.5 TB of transfer. |
| Complaint photographs, database dumps | Amazon S3, private bucket | Evidence lives outside the instance, so a lost or rebuilt instance does not lose it. The API still serves every photograph itself, so the visibility rules stay in one place and the bucket is never public. |
| Container logs, alarms | Amazon CloudWatch Logs, two alarms, SNS email | Logs outlive the instance. One alarm counts API errors. The other fires when no device upload has been logged for fifteen minutes, which catches a dead host, API, worker or log pipeline with one rule. |
| Spend | AWS Budgets | Email at 50 % and 80 % of the monthly budget and when the forecast passes it. |
| All of the above | AWS CDK, `infra/` | One stack, 14 resource types. `npm test` in `infra/` checks the template: private bucket, least-privilege policy, no secret in the template, firewall limited to 22 (one address), 80 and 443. |

Inside the instance, PostgreSQL, the model and the worker sit on a Docker network marked
`internal`: no published port and no route to the internet. Only Caddy publishes ports, and only
the API can reach out (to S3).

## Estimated monthly cost

Prices are for ap-south-1 (Mumbai), read from the AWS Price List on 10 October 2026. Usage figures
are estimates for a pilot with 26 simulated devices and light citizen traffic.

| Item | Basis | USD per month |
| --- | --- | --- |
| Lightsail instance, 2 GB RAM, 2 vCPU, 60 GB SSD, public IPv4 | fixed plan price | 12.00 |
| Lightsail static IP | free while attached | 0.00 |
| Lightsail automatic snapshots | 0.05 per GB-month, about 10 GB kept | 0.50 |
| S3 Standard | 0.025 per GB-month, about 1 GB of photographs and dumps, a few thousand requests | 0.05 |
| CloudWatch Logs | 0.67 per GB ingested, about 0.3 GB | 0.20 |
| CloudWatch custom metrics and alarms | 2 metrics at 0.30, 2 alarms at 0.10 | 0.80 |
| Amplify Hosting | uploads use no build minutes; 5 MB stored; traffic far below 15 GB | 0.00 |
| AWS Budgets, SNS email | free at this volume | 0.00 |
| **Total** | | **about 13.50** |

The CloudWatch and Amplify lines fall to zero on accounts that still have the monthly free
allowances (5 GB of logs, 10 metrics, 10 alarms, 15 GB served). Whether those allowances apply to
accounts opened after 15 July 2025 could not be confirmed from AWS pages, so the table assumes
they do not.

Six months at this rate is about 80 USD. The 200 USD in question is the standard credit for new
AWS accounts (100 USD at sign-up and 20 USD for each of five activities), not a hackathon grant,
and on the free account plan it ends after six months or when it runs out, whichever comes
first. Two things to check in the account before deploying, because AWS documentation does not
settle them: that Lightsail can be used on the free account plan, and that the budget alert
arrives (the stack excludes credits from the budget so the alert reflects real usage).

## Alternatives considered

| Alternative | Monthly cost | Verdict |
| --- | --- | --- |
| EC2 `t4g.small` with a 20 GB gp3 volume and a public IPv4 address | about 13.65 (8.18 + 1.82 + 3.65) | The one alternative with a real advantage: an instance role instead of a stored access key, and its instance hours are free until 31 December 2026 under the `t4g.small` trial. It costs a VPC, a security group, an Elastic IP and ARM image builds to manage. Worth moving to if the stored key becomes a concern. |
| Amazon RDS for PostgreSQL, `db.t4g.micro`, 20 GB | about 18 on top | More than doubles the bill for a database of a few hundred megabytes. Nightly dumps to S3 and a daily disk snapshot cover the pilot. |
| Aurora Serverless v2 | about 66 at the 0.5 ACU floor | It can pause at zero, but the worker holds a connection every minute, so it never would. |
| ECS on Fargate, or App Runner, with a load balancer | 30 and up | Three services and a load balancer for a workload one small machine carries. |
| Kubernetes (EKS) | 73 for the control plane alone | Not considered further. |
| Amazon Bedrock | per request | The model is a Random Forest that already exists. Nothing here needs a foundation model. |

## Where AWS adds value

- **The frontend stops being our problem.** Amplify gives HTTPS, a CDN and atomic deploys for a
  static build. Rolling the client back is redeploying the previous build.
- **Evidence survives the server.** Photographs and database dumps sit in S3 with eleven nines of
  durability. The instance can be destroyed and rebuilt from the stack, the last dump and the
  bucket.
- **Someone is told when it breaks.** Logs leave the instance as they are written, and two alarms
  email the operator. Without this, a demo instance that died overnight is found by a citizen.
- **The bill cannot drift unnoticed.** A budget with three alerts is part of the stack, not a
  console step someone has to remember.
- **The environment is reproducible.** One `cdk deploy` creates it and one `cdk destroy` removes
  it. The template is tested in CI without an AWS account.

## Security decisions

- **The instance's AWS identity.** A Lightsail instance cannot be given an IAM role of your own.
  It gets an IAM user that may read and write two prefixes of one bucket and write to one log
  group. Its access key is created by the deploy script, sent to the host over SSH and stored only
  there (mode 600). It is never in the CloudFormation template, the repository or the operator's
  disk. The key must be passed explicitly: with no key, the AWS SDK on a Lightsail instance finds
  Lightsail's own instance role through the metadata service and gets `AccessDenied`.
- **Application secrets** (database password, JWT secret, simulator secret, demo passwords) are
  generated on the host by `deploy/scripts/init-env.sh`. No person chooses or sees them unless
  they read the file on the host.
- **Network.** The Lightsail firewall opens 80 and 443 to everyone and 22 to one address. No
  database or model port is published by Docker, so opening the firewall by mistake would still
  expose nothing.
- **HTTPS.** Caddy obtains and renews the certificate and redirects HTTP. Without a domain the
  stack uses `<static ip with dashes>.sslip.io`, a public DNS service that resolves such names to
  the address inside them. Bring a domain for anything long-lived: it removes the dependency on
  that service and on any certificate rate limit it shares with that service's other users.
- **Uploads.** Image type is taken from the file's bytes, metadata (EXIF and its GPS position,
  XMP, comments) is stripped before storage, and the bucket blocks all public access and refuses
  plain HTTP.

## What the First Commit winners suggest

Read from the event page, the organiser's recap and the three repositories on 10 October 2026.
First Commit (17 to 20 September 2026) was one all-India event with an optional build day in
Bengaluru, so these are the overall winners.

| Project | Prize | Deployment |
| --- | --- | --- |
| [Suraksha](https://github.com/harshendram/firstcommit-hack) | First, Ship It track | Next.js on Amplify Hosting, Lambda behind API Gateway, DynamoDB, Step Functions, Bedrock, CloudWatch alarms, one CDK stack |
| [Beacon Night Shift](https://github.com/Prashant-thakur77/Beacon) | Second, Build It track | Python Lambdas, Step Functions, Bedrock, CloudFormation, and a `make local` that runs with no AWS account |
| [CampusEvac](https://github.com/AfreenInnovates/campus) | Third, Best UI | Next.js on Amplify Hosting in ap-south-1, AppSync Events, DynamoDB, CDK |

Stated by the organisers:

- "We judge what you built, not what you spent." Cloud usage counted only in the Ship It track,
  "where architecture and cost decisions are part of the work".
- AWS use has to be visible in the three-minute video: "Naming AWS in the writeup alone is not
  enough."
- Lightsail, Amplify Hosting, S3 and CloudWatch are all on the organiser's list of Ship It tools.

Our reading, applied here:

- The deployed winner was credible because its infrastructure was code that deploys, with an
  architecture document, least-privilege IAM, alarms, tests and a stated list of limits. This
  repository now has each of those.
- None of the three ran on a single VM. That is a reason to present the Lightsail choice as a
  cost decision with a table, which this document does, not a reason to add services.
- The UI winner could be used within seconds from one link. The public map needs no account, and
  the redesigned case page puts status, next step, evidence and follow-up on the first screen.

## Limits

- Nothing here has been run against an AWS account. The template synthesizes and its tests pass;
  the same images, Compose file and scripts were run end to end on a Linux host with an S3
  stand-in. See the status section of [DEPLOY_AWS.md](DEPLOY_AWS.md).
- One instance means one point of failure. Recovery is rebuild and restore, measured in tens of
  minutes, which suits a pilot and nothing more.
- Deleting a complaint row does not delete its object in S3. Nothing in the application deletes
  complaints today.
