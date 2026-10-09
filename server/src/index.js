import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { getModelInfo } from './services/modelClient.js';
import { sensorProvider, startMonitoringScheduler } from './services/monitoring.js';

sensorProvider.init(); // fail fast if the configured sensor source cannot start
const app = createApp();

const server = app.listen(config.port, async () => {
  console.log(`[airwatch] API listening on http://localhost:${config.port}`);
  const info = await getModelInfo();
  console.log(`[airwatch] sensor source: ${sensorProvider.name} (${sensorProvider.description})`);
  if (info.ready) console.log(`[airwatch] model ready: ${info.version}`);
  else console.warn(`[airwatch] model NOT ready (${info.reason}). Readings will be stored without an anomaly assessment.`);
  startMonitoringScheduler();
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
