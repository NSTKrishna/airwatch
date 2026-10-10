// Everything AirWatch needs in an AWS account, and nothing it does not:
//
//   Lightsail instance + static IP   Express, the FastAPI model, the worker and PostgreSQL
//                                    under Docker Compose, behind Caddy for HTTPS
//   S3 bucket (private)              complaint photographs and database dumps
//   IAM user (no key in this stack)  the instance's identity: that bucket and one log group
//   CloudWatch Logs + two alarms     container logs, an error alarm and a heartbeat alarm
//   AWS Budgets                      email before the bill surprises anyone
//   Amplify Hosting                  the React client
//
// No Kubernetes, no managed database, no NAT gateway, no load balancer: each of those costs
// more per month than the whole of this stack.
import { readFileSync } from 'node:fs';
import { CfnOutput, Duration, Fn, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lightsail from 'aws-cdk-lib/aws-lightsail';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';

const bootstrapScript = readFileSync(new URL('../../deploy/scripts/bootstrap-host.sh', import.meta.url), 'utf8');
// Amplify's rule for a single-page app: any path that is not a file is the app itself.
const SPA_SOURCE = '</^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>';

export class AirWatchStack extends Stack {
  /**
   * @param {import('constructs').Construct} scope
   * @param {string} id
   * @param {import('aws-cdk-lib').StackProps & {alertEmail: string, sshCidr: string, keyPairName: string,
   *   bundleId: string, blueprintId: string, monthlyBudgetUsd: number, apiDomain: string|null}} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);
    const name = id.toLowerCase();

    // --- Evidence: a private bucket the API reads and writes on the citizen's behalf ---
    const bucket = new s3.Bucket(this, 'Evidence', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        { id: 'abort-stalled-uploads', abortIncompleteMultipartUploadAfter: Duration.days(7) },
        { id: 'expire-database-dumps', prefix: 'backups/', expiration: Duration.days(30) },
      ],
    });

    // --- Logs ---
    const logGroup = new logs.LogGroup(this, 'Logs', {
      logGroupName: `/${name}/prod`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // --- The instance's identity. A Lightsail instance cannot take an IAM role of your own,
    // so it gets a user that can do exactly two things. Its access key is created outside this
    // stack (deploy/aws/push-credentials.sh) and goes straight to the host: a key created
    // here would sit in the CloudFormation template for anyone who can read the stack.
    const instanceUser = new iam.User(this, 'InstanceUser');
    instanceUser.addToPolicy(new iam.PolicyStatement({
      sid: 'EvidenceObjects',
      actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
      resources: [bucket.arnForObjects('attachments/*'), bucket.arnForObjects('backups/*')],
    }));
    instanceUser.addToPolicy(new iam.PolicyStatement({
      sid: 'EvidenceBucketReachable', actions: ['s3:ListBucket'], resources: [bucket.bucketArn],
    }));
    instanceUser.addToPolicy(new iam.PolicyStatement({
      sid: 'ShipContainerLogs',
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogStreams'],
      resources: [logGroup.logGroupArn, `${logGroup.logGroupArn}:*`],
    }));

    // --- The host ---
    const instanceName = `${name}-app`;
    const instance = new lightsail.CfnInstance(this, 'Instance', {
      instanceName,
      availabilityZone: `${this.region}a`,
      blueprintId: props.blueprintId,
      bundleId: props.bundleId,
      keyPairName: props.keyPairName,
      userData: bootstrapScript,
      networking: {
        ports: [
          { commonName: 'SSH', protocol: 'tcp', fromPort: 22, toPort: 22, cidrs: [props.sshCidr], ipv6Cidrs: [] },
          { commonName: 'HTTP', protocol: 'tcp', fromPort: 80, toPort: 80, cidrs: ['0.0.0.0/0'], ipv6Cidrs: ['::/0'] },
          { commonName: 'HTTPS', protocol: 'tcp', fromPort: 443, toPort: 443, cidrs: ['0.0.0.0/0'], ipv6Cidrs: ['::/0'] },
        ],
      },
      // A daily snapshot of the whole disk, kept for seven days by Lightsail.
      addOns: [{ addOnType: 'AutoSnapshot', status: 'Enabled', autoSnapshotAddOnRequest: { snapshotTimeOfDay: '20:00' } }],
    });
    const staticIp = new lightsail.CfnStaticIp(this, 'Address', { staticIpName: `${name}-ip`, attachedTo: instanceName });
    staticIp.addDependency(instance);
    // Without a domain of your own: 13.201.10.20 is reachable as 13-201-10-20.sslip.io, a name
    // Caddy can get a certificate for.
    const apiDomain = props.apiDomain ?? Fn.join('', [Fn.join('-', Fn.split('.', staticIp.attrIpAddress)), '.sslip.io']);

    // --- Alarms: one for errors, one that fires when the stack goes quiet ---
    const alerts = new sns.Topic(this, 'Alerts', { displayName: 'AirWatch alerts' });
    alerts.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));
    const namespace = 'AirWatch';
    new logs.MetricFilter(this, 'ApiErrorFilter', {
      logGroup, metricNamespace: namespace, metricName: 'ApiErrors', metricValue: '1',
      filterPattern: logs.FilterPattern.literal('"[error]"'),
    });
    new logs.MetricFilter(this, 'IngestFilter', {
      logGroup, metricNamespace: namespace, metricName: 'DeviceUploads', metricValue: '1',
      filterPattern: logs.FilterPattern.literal('"/api/v1/devices/readings"'),
    });
    const errors = new cloudwatch.Alarm(this, 'ApiErrorsAlarm', {
      alarmDescription: 'The API logged five or more server errors in five minutes.',
      metric: new cloudwatch.Metric({ namespace, metricName: 'ApiErrors', statistic: 'Sum', period: Duration.minutes(5) }),
      threshold: 5, evaluationPeriods: 1, comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    // The simulated devices upload every minute. Silence for fifteen means the host, the API,
    // the worker or the log shipping has stopped, whichever it is.
    const quiet = new cloudwatch.Alarm(this, 'HeartbeatAlarm', {
      alarmDescription: 'No device upload has reached the API for fifteen minutes.',
      metric: new cloudwatch.Metric({ namespace, metricName: 'DeviceUploads', statistic: 'Sum', period: Duration.minutes(5) }),
      threshold: 1, evaluationPeriods: 3, comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    for (const alarm of [errors, quiet]) alarm.addAlarmAction(new actions.SnsAction(alerts));

    // --- Billing: email at half, at four fifths, and when the forecast passes the budget.
    // Credits are left out of the sum, so the alert shows what the stack would cost without them.
    const subscribers = [{ subscriptionType: 'EMAIL', address: props.alertEmail }];
    const notify = (notificationType, threshold) => ({
      notification: { notificationType, comparisonOperator: 'GREATER_THAN', threshold, thresholdType: 'PERCENTAGE' }, subscribers,
    });
    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: `${name}-monthly`,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: props.monthlyBudgetUsd, unit: 'USD' },
        costTypes: { includeCredit: false, includeRefund: false },
      },
      notificationsWithSubscribers: [notify('ACTUAL', 50), notify('ACTUAL', 80), notify('FORECASTED', 100)],
    });

    // --- Frontend. No repository is connected: deploy/aws/deploy-frontend.sh uploads a build,
    // so no GitHub token is stored anywhere. A repository can be connected later in the console.
    const app = new amplify.CfnApp(this, 'Frontend', {
      name,
      platform: 'WEB',
      customRules: [{ source: SPA_SOURCE, target: '/index.html', status: '200' }],
      customHeaders: [
        'customHeaders:',
        "  - pattern: '**'",
        '    headers:',
        "      - key: 'Strict-Transport-Security'",
        "        value: 'max-age=31536000'",
        "      - key: 'X-Content-Type-Options'",
        "        value: 'nosniff'",
        "      - key: 'Referrer-Policy'",
        "        value: 'strict-origin-when-cross-origin'",
      ].join('\n'),
    });
    const branch = new amplify.CfnBranch(this, 'FrontendBranch', { appId: app.attrAppId, branchName: 'main', stage: 'PRODUCTION', enableAutoBuild: false });

    const output = (key, value, description) => new CfnOutput(this, key, { value, description });
    output('InstanceName', instanceName, 'Lightsail instance');
    output('StaticIp', staticIp.attrIpAddress, 'Public address of the API host');
    output('ApiDomain', apiDomain, 'Host name Caddy serves and gets a certificate for');
    output('EvidenceBucket', bucket.bucketName, 'Private bucket for photographs and database dumps');
    output('LogGroup', logGroup.logGroupName, 'CloudWatch log group for container logs');
    output('InstanceUserName', instanceUser.userName, 'IAM user whose access key the instance uses');
    output('AmplifyAppId', app.attrAppId, 'Amplify Hosting app');
    output('FrontendUrl', `https://${branch.attrBranchName}.${app.attrDefaultDomain}`, 'Where the React client is served');
  }
}
