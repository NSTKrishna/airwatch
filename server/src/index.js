import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { getModelInfo } from './services/modelClient.js';
import { setIngestBaseUrl, startSimulator } from './services/mockSensorProvider.js';
import { sourcesSummary } from './services/monitoring.js';

const app = createApp();

const server = app.listen(config.port, async () => {
  console.log(`[airwatch] API listening on http://localhost:${config.port}`);
  const sources = sourcesSummary();
  console.log(`[airwatch] background source: ${sources.background.description}; wind source: ${sources.weather.description}`);
  const info = await getModelInfo();
  if (info.ready) console.log(`[airwatch] model ready: ${info.version}`);
  else console.warn(`[airwatch] model NOT ready (${info.reason}). Readings will be stored without a PM10 assessment.`);

  // "Read sensors now" and the embedded simulator post to this API over HTTP.
  if (!config.simulator.ingestUrl) setIngestBaseUrl(`http://127.0.0.1:${config.port}`);
  if (config.simulator.enabled) {
    startSimulator();
    console.log(`[airwatch] embedded device simulator on (every ${config.simulator.intervalSeconds}s, batches of ${config.simulator.batchMinutes} min)`);
  }
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
