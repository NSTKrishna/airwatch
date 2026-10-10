// The synthesized template, checked for the properties that matter: nothing public that
// should be private, least privilege, no secret in the template, and no expensive service.
import test from 'node:test';
import assert from 'node:assert/strict';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AirWatchStack } from '../lib/airwatch-stack.mjs';

const stack = new AirWatchStack(new App(), 'AirWatch', {
  env: { account: '111111111111', region: 'ap-south-1' },
  alertEmail: 'ops@example.org', sshCidr: '203.0.113.7/32', keyPairName: 'airwatch-deploy',
  bundleId: 'small_3_0', blueprintId: 'ubuntu_24_04', monthlyBudgetUsd: 20, apiDomain: null,
});
const template = Template.fromStack(stack);
const resources = template.toJSON().Resources;
const typesUsed = [...new Set(Object.values(resources).map((r) => r.Type))].sort();

test('only the services the architecture names are used', () => {
  assert.deepEqual(typesUsed, [
    'AWS::Amplify::App', 'AWS::Amplify::Branch', 'AWS::Budgets::Budget', 'AWS::CloudWatch::Alarm', 'AWS::IAM::Policy', 'AWS::IAM::User',
    'AWS::Lightsail::Instance', 'AWS::Lightsail::StaticIp', 'AWS::Logs::LogGroup', 'AWS::Logs::MetricFilter', 'AWS::S3::Bucket',
    'AWS::S3::BucketPolicy', 'AWS::SNS::Subscription', 'AWS::SNS::Topic',
  ]);
});

test('the evidence bucket is private, encrypted, TLS-only and kept on stack deletion', () => {
  template.hasResource('AWS::S3::Bucket', {
    DeletionPolicy: 'Retain',
    Properties: {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
      BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] },
    },
  });
  template.hasResourceProperties('AWS::S3::BucketPolicy', {
    PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } })]) },
  });
});

test('the instance user can touch two prefixes of one bucket and one log group, nothing else', () => {
  const [policy] = Object.values(resources).filter((r) => r.Type === 'AWS::IAM::Policy');
  const statements = policy.Properties.PolicyDocument.Statement;
  const allowed = new Set(['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket', 'logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogStreams']);
  for (const statement of statements) {
    assert.equal(statement.Effect, 'Allow');
    for (const action of [statement.Action].flat()) assert.ok(allowed.has(action), `unexpected action ${action}`);
    assert.ok(!JSON.stringify(statement.Resource).includes('"*"'), 'no wildcard resource');
  }
  const objects = JSON.stringify(statements.find((s) => [s.Action].flat().includes('s3:PutObject')).Resource);
  assert.ok(objects.includes('/attachments/*') && objects.includes('/backups/*'));
});

test('no access key or other secret is created in the template', () => {
  template.resourceCountIs('AWS::IAM::AccessKey', 0);
  template.resourceCountIs('AWS::SecretsManager::Secret', 0);
  assert.ok(!/AKIA|SecretAccessKey|password/i.test(JSON.stringify(template.toJSON())));
});

test('the firewall opens 80 and 443 to the world, 22 to one address, and no service port', () => {
  const { Networking, UserData, AddOns } = Object.values(resources).find((r) => r.Type === 'AWS::Lightsail::Instance').Properties;
  const ports = Object.fromEntries(Networking.Ports.map((p) => [p.FromPort, p]));
  assert.deepEqual(Object.keys(ports).map(Number).sort((a, b) => a - b), [22, 80, 443]);
  assert.deepEqual(ports[22].Cidrs, ['203.0.113.7/32']);
  assert.deepEqual(ports[22].Ipv6Cidrs, []);
  assert.deepEqual(ports[443].Cidrs, ['0.0.0.0/0']);
  assert.match(UserData, /docker-compose-v2/);
  assert.equal(AddOns[0].AddOnType, 'AutoSnapshot');
});

test('the static IP is attached to the instance', () => {
  template.hasResourceProperties('AWS::Lightsail::StaticIp', { AttachedTo: 'airwatch-app' });
});

test('logs expire and both alarms notify by email', () => {
  template.hasResourceProperties('AWS::Logs::LogGroup', { LogGroupName: '/airwatch/prod', RetentionInDays: 14 });
  template.resourceCountIs('AWS::CloudWatch::Alarm', 2);
  template.allResourcesProperties('AWS::CloudWatch::Alarm', { AlarmActions: Match.anyValue() });
  template.hasResourceProperties('AWS::CloudWatch::Alarm', { MetricName: 'DeviceUploads', TreatMissingData: 'breaching' });
  template.hasResourceProperties('AWS::SNS::Subscription', { Protocol: 'email', Endpoint: 'ops@example.org' });
});

test('a monthly budget alerts before and at the limit, ignoring credits', () => {
  template.hasResourceProperties('AWS::Budgets::Budget', {
    Budget: { BudgetType: 'COST', TimeUnit: 'MONTHLY', BudgetLimit: { Amount: 20, Unit: 'USD' }, CostTypes: { IncludeCredit: false } },
    NotificationsWithSubscribers: Match.arrayWith([
      Match.objectLike({ Notification: Match.objectLike({ NotificationType: 'ACTUAL', Threshold: 50 }) }),
      Match.objectLike({ Notification: Match.objectLike({ NotificationType: 'FORECASTED', Threshold: 100 }) }),
    ]),
  });
});

test('the frontend app rewrites deep links and stores no repository token', () => {
  const app = Object.values(resources).find((r) => r.Type === 'AWS::Amplify::App').Properties;
  assert.equal(app.CustomRules[0].Target, '/index.html');
  assert.equal(app.CustomRules[0].Status, '200');
  for (const key of ['AccessToken', 'OauthToken', 'Repository']) assert.equal(app[key], undefined);
});

test('the outputs carry what the deploy scripts read', () => {
  for (const key of ['InstanceName', 'StaticIp', 'ApiDomain', 'EvidenceBucket', 'LogGroup', 'InstanceUserName', 'AmplifyAppId', 'FrontendUrl']) template.hasOutput(key, {});
});
