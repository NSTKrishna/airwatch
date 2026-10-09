import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import complaintRoutes, { attachmentsRouter } from './routes/complaints.js';
import mockSensorRoutes from './routes/mockSensors.js';
import monitoringRoutes from './routes/monitoring.js';
import municipalRoutes from './routes/municipal.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: '100kb' }));
  if (config.env !== 'test') app.use(morgan('tiny'));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRoutes);

  // Everything below requires a signed-in user.
  app.use('/api', requireAuth);
  app.use('/api/municipal', requireRole('MUNICIPAL'), municipalRoutes);
  app.use('/api/mock-sensors', requireRole('MUNICIPAL'), mockSensorRoutes);
  app.use('/api/complaints', complaintRoutes);
  app.use('/api/attachments', attachmentsRouter);
  app.use('/api', monitoringRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
