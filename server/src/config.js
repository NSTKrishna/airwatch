import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  MODEL_API_URL: z.string().url().default('http://127.0.0.1:8001'),
  MODEL_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  SENSOR_PROVIDER: z.enum(['mock', 'replay']).default('mock'),
  DATASET_CSV_PATH: z.string().default(fileURLToPath(new URL('../data/delhi_four_site_pm10_synthetic.csv', import.meta.url))),
  MONITOR_INTERVAL_SECONDS: z.coerce.number().int().min(0).default(60),
  ACTIVE_ANOMALY_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${problems}`);
}

export const config = Object.freeze({
  env: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  clientOrigin: parsed.data.CLIENT_ORIGIN,
  jwtSecret: parsed.data.JWT_SECRET,
  jwtExpiresIn: parsed.data.JWT_EXPIRES_IN,
  modelApiUrl: parsed.data.MODEL_API_URL.replace(/\/+$/, ''),
  modelTimeoutMs: parsed.data.MODEL_TIMEOUT_MS,
  sensorProvider: parsed.data.SENSOR_PROVIDER,
  datasetCsvPath: parsed.data.DATASET_CSV_PATH,
  monitorIntervalSeconds: parsed.data.MONITOR_INTERVAL_SECONDS,
  activeAnomalyWindowSeconds: parsed.data.ACTIVE_ANOMALY_WINDOW_SECONDS,
});
