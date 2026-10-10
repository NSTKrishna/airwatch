import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { prisma } from './db.js';
import { storageDriver, storageReady } from './lib/storage.js';
import { getModelInfo } from './services/modelClient.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import complaintRoutes, { attachmentsRouter } from './routes/complaints.js';
import deviceRoutes from './routes/devices.js';
import monitoringRoutes from './routes/monitoring.js';
import municipalRoutes from './routes/municipal.js';
import publicRoutes from './routes/public.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.set('trust proxy', 1); // one reverse proxy (Caddy) in front in production
  app.use(cors({ origin: config.clientOrigins }));
  app.use(express.json({ limit: '256kb' }));
  if (config.env !== 'test') app.use(morgan('tiny'));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  // Readiness: the database must answer. The model is reported but does not fail the check,
  // because the API keeps storing readings while the model is down.
  app.get('/api/health/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      return res.status(503).json({ status: 'unavailable', database: false });
    }
    const [model, storage] = await Promise.all([getModelInfo(), storageReady()]);
    // Uploads fail without the attachment store, so it fails the check; the model does not.
    return res.status(storage ? 200 : 503).json({
      status: storage ? 'ok' : 'unavailable', database: true, modelReady: model.ready,
      attachmentStorage: storageDriver, attachmentStorageReady: storage,
    });
  });
  app.use('/api/auth', authRoutes);

  // The citizen map is readable without an account.
  app.use('/api/public', publicRoutes);

  // Device ingestion authenticates with device tokens, not user sessions.
  app.use('/api/v1/devices', deviceRoutes);

  // Everything below requires a signed-in user.
  app.use('/api', requireAuth);
  app.use('/api/municipal', requireRole('MUNICIPAL'), municipalRoutes);
  app.use('/api/complaints', complaintRoutes);
  app.use('/api/attachments', attachmentsRouter);
  app.use('/api', monitoringRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
