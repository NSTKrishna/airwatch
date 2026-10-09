// Stand-alone device simulator. Runs as its own process/container and uploads
// simulated telemetry to the API over HTTP, exactly as field devices would.
import { config } from './config.js';
import { prisma } from './db.js';
import { startSimulator } from './services/mockSensorProvider.js';

if (!config.simulator.enabled) {
  console.log('[worker] SIMULATOR_ENABLED is false; nothing to do.');
  process.exit(0);
}
if (!config.simulator.ingestUrl) throw new Error('SIMULATOR_INGEST_URL must point at the API for the stand-alone simulator');

const stop = startSimulator();
console.log(`[worker] simulating devices -> ${config.simulator.ingestUrl} every ${config.simulator.intervalSeconds}s (batches of ${config.simulator.batchMinutes} min)`);

async function shutdown() {
  stop();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
