#!/usr/bin/env node
// CDK entry point. Settings come from context (-c key=value); deploy/aws/setup.sh passes them.
//
//   alertEmail        where alarms and budget alerts go                         (required)
//   sshCidr           the only address range allowed to reach port 22           (required)
//   keyPairName       Lightsail key pair for the instance                       (required)
//   bundleId          Lightsail plan, e.g. the 2 GB one for the Region          (required)
//   blueprintId       Lightsail image                                 (default ubuntu_24_04)
//   monthlyBudgetUsd  budget that triggers the alerts                           (default 20)
//   apiDomain         host name of the API       (default <static ip, dashed>.sslip.io)
//   stackName                                                             (default AirWatch)
import { App } from 'aws-cdk-lib';
import { AirWatchStack } from '../lib/airwatch-stack.mjs';

const app = new App();
const context = (key, fallback) => app.node.tryGetContext(key) ?? fallback;
const required = (key) => {
  const value = context(key);
  if (!value) throw new Error(`Missing context value "${key}". Pass it with -c ${key}=..., or run deploy/aws/setup.sh.`);
  return String(value);
};

new AirWatchStack(app, context('stackName', 'AirWatch'), {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'ap-south-1' },
  description: 'AirWatch: Lightsail host, evidence bucket, logs, alarms, budget and frontend hosting',
  alertEmail: required('alertEmail'),
  sshCidr: required('sshCidr'),
  keyPairName: required('keyPairName'),
  bundleId: required('bundleId'),
  blueprintId: context('blueprintId', 'ubuntu_24_04'),
  monthlyBudgetUsd: Number(context('monthlyBudgetUsd', 20)),
  apiDomain: context('apiDomain', null),
});
