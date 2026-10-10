import 'dotenv/config';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
// Compose passes unset optional settings as empty strings; read those as "not set".
const optional = (type) => z.preprocess((v) => (v === '' ? undefined : v), type.optional());

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  // Comma-separated list of browser origins allowed to call the API.
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  MODEL_API_URL: z.string().url().default('http://127.0.0.1:8001'),
  MODEL_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  ACTIVE_ANOMALY_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),

  // Context sources for the PM10 model. "none" means the source does not exist:
  // readings are still stored, but no model evaluation is produced.
  BACKGROUND_PROVIDER: z.enum(['simulated', 'none']).default('simulated'),
  WEATHER_PROVIDER: z.enum(['simulated', 'none']).default('simulated'),

  // Ingestion limits.
  INGEST_MAX_AGE_HOURS: z.coerce.number().positive().default(168),
  INGEST_MAX_FUTURE_SECONDS: z.coerce.number().min(0).default(120),
  INGEST_MAX_BATCH: z.coerce.number().int().positive().default(120),

  // Pairing policy.
  // The model contract is "PM10_instantaneous_demo". Readings sampled over at most this many
  // seconds are treated as instantaneous; longer averages are never sent to the model.
  INSTANT_MAX_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  PAIRING_MAX_DISTANCE_M: z.coerce.number().positive().default(2000),
  WEATHER_MAX_SKEW_SECONDS: z.coerce.number().positive().default(600),
  FLATLINE_READINGS: z.coerce.number().int().min(3).default(10),

  // Device simulator. It publishes through the public ingestion API like any other device.
  SIMULATOR_ENABLED: bool.default('false'),
  SIMULATOR_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(60),
  SIMULATOR_BATCH_MINUTES: z.coerce.number().int().min(1).max(60).default(1),
  SIMULATOR_SEED: z.string().default('airwatch-demo'),
  // Simulated devices derive their credentials from this secret; only hashes are stored.
  SIMULATOR_TOKEN_SECRET: z.string().min(32).optional(),
  SIMULATOR_INGEST_URL: z.string().url().optional(),

  // Where uploaded images are kept. "database" needs nothing else; "s3" keeps the bytes in a
  // private bucket and only the object key in PostgreSQL. Credentials come from the standard
  // AWS chain (environment, shared file or instance role), never from this file.
  ATTACHMENT_STORAGE: z.enum(['database', 's3']).default('database'),
  S3_BUCKET: optional(z.string().min(3)),
  S3_REGION: optional(z.string().min(1)),
  S3_KEY_PREFIX: z.string().regex(/^([\w.-]+\/)*$/, 'must be empty or end with "/"').default('attachments/'),
  // Only for S3-compatible stores used in local testing (MinIO and the like).
  S3_ENDPOINT: optional(z.string().url()),
  S3_FORCE_PATH_STYLE: bool.default('false'),
}).superRefine((v, ctx) => {
  if (v.ATTACHMENT_STORAGE === 's3') {
    if (!v.S3_BUCKET) ctx.addIssue({ code: 'custom', path: ['S3_BUCKET'], message: 'required when ATTACHMENT_STORAGE=s3' });
    if (!v.S3_REGION && !process.env.AWS_REGION) ctx.addIssue({ code: 'custom', path: ['S3_REGION'], message: 'required when ATTACHMENT_STORAGE=s3 (or set AWS_REGION)' });
  }
  if (v.SIMULATOR_ENABLED && !v.SIMULATOR_TOKEN_SECRET) {
    ctx.addIssue({ code: 'custom', path: ['SIMULATOR_TOKEN_SECRET'], message: 'required when SIMULATOR_ENABLED=true' });
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${problems}`);
}
const env = parsed.data;

export const config = Object.freeze({
  env: env.NODE_ENV,
  port: env.PORT,
  clientOrigins: env.CLIENT_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  modelApiUrl: env.MODEL_API_URL.replace(/\/+$/, ''),
  modelTimeoutMs: env.MODEL_TIMEOUT_MS,
  activeAnomalyWindowSeconds: env.ACTIVE_ANOMALY_WINDOW_SECONDS,
  backgroundProvider: env.BACKGROUND_PROVIDER,
  weatherProvider: env.WEATHER_PROVIDER,
  ingest: Object.freeze({
    maxAgeMs: env.INGEST_MAX_AGE_HOURS * 3_600_000,
    maxFutureMs: env.INGEST_MAX_FUTURE_SECONDS * 1000,
    maxBatch: env.INGEST_MAX_BATCH,
  }),
  pairing: Object.freeze({
    instantMaxIntervalSeconds: env.INSTANT_MAX_INTERVAL_SECONDS,
    maxDistanceM: env.PAIRING_MAX_DISTANCE_M,
    weatherMaxSkewSeconds: env.WEATHER_MAX_SKEW_SECONDS,
    flatlineReadings: env.FLATLINE_READINGS,
  }),
  simulator: Object.freeze({
    enabled: env.SIMULATOR_ENABLED,
    intervalSeconds: env.SIMULATOR_INTERVAL_SECONDS,
    batchMinutes: env.SIMULATOR_BATCH_MINUTES,
    seed: env.SIMULATOR_SEED,
    tokenSecret: env.SIMULATOR_TOKEN_SECRET ?? null,
    ingestUrl: env.SIMULATOR_INGEST_URL?.replace(/\/+$/, '') ?? null,
  }),
  storage: Object.freeze({
    driver: env.ATTACHMENT_STORAGE,
    bucket: env.S3_BUCKET ?? null,
    region: env.S3_REGION ?? process.env.AWS_REGION ?? null,
    keyPrefix: env.S3_KEY_PREFIX,
    endpoint: env.S3_ENDPOINT ?? null,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  }),
});
