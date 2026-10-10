// What the system is running on right now: the model, the sensor sources and the simulator.
import { config } from '../config.js';
import { CITY } from '../data/mumbai.js';
import { prisma } from '../db.js';
import { getModelInfo } from './modelClient.js';
import { TRAINED_DOMAIN } from './modelDomain.js';
import { sourcesSummary } from './monitoring.js';

export async function systemStatus() {
  const info = await getModelInfo();
  const deviceCounts = await prisma.device.groupBy({ by: ['provenance'], where: { status: 'ACTIVE', site: { active: true } }, _count: { _all: true } });
  const devices = Object.fromEntries(deviceCounts.map((d) => [d.provenance, d._count._all]));
  return {
    city: CITY.name,
    model: {
      reachable: info.reachable,
      ready: info.ready,
      reason: info.reason,
      version: info.version,
      algorithm: info.algorithm ?? null,
      dataSource: info.dataSource ?? null,
      syntheticOnly: info.syntheticOnly ?? null,
      calibratedMargin: info.calibratedMargin ?? null,
      measurement: info.measurement ?? null,
      // Facts about the deployed artifact that every consumer of a verdict should know.
      scope: 'Estimates the normal current PM10 site-minus-background difference. It does not forecast AQI, assess PM2.5, or detect tampering.',
      limitations: 'Trained on synthetic Delhi data. It has not been validated for Mumbai or against real instruments.',
      trainedDomain: TRAINED_DOMAIN,
    },
    sensors: {
      devices: { simulated: devices.SIMULATED || 0, real: devices.DEVICE || 0 },
      // True while no authenticated physical monitor is registered.
      simulated: !devices.DEVICE,
      ...sourcesSummary(),
    },
    simulator: { enabled: config.simulator.enabled, intervalSeconds: config.simulator.intervalSeconds, batchMinutes: config.simulator.batchMinutes },
    activeAnomalyWindowSeconds: config.activeAnomalyWindowSeconds,
  };
}
