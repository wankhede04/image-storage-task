import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// In a monorepo the .env lives at the repo root, two levels above server/src/
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  // S3 / MinIO — presence of S3_ENDPOINT means MinIO mode
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  S3_BUCKET: z.string(),
  S3_ENDPOINT: z.string().optional(),
  // Endpoint baked into presigned URLs handed to browsers/host tools — distinct from
  // S3_ENDPOINT when the app runs in a container (S3_ENDPOINT=http://minio:9000 is only
  // reachable inside the compose network). Falls back to S3_ENDPOINT when unset.
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  S3_SSE: z.string().optional(),
  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Validation thresholds
  BLUR_THRESHOLD: z.coerce.number().default(100),
  MIN_IMAGE_WIDTH: z.coerce.number().default(500),
  MIN_IMAGE_HEIGHT: z.coerce.number().default(500),
  MIN_FILE_SIZE_BYTES: z.coerce.number().default(50000),
  SIMILARITY_HAMMING_THRESHOLD: z.coerce.number().default(10),
  FACE_AREA_MIN_RATIO: z.coerce.number().default(0.02),
  // --- Processing pipeline (Part 2) ---
  LOAD_TEST_MODE: z.string().optional().transform((v) => v === 'true'),
  WORKER_CONCURRENCY: z.coerce.number().default(4),
  COMPRESSION_QUALITY: z.coerce.number().default(80),
  THUMBNAIL_SIZE: z.coerce.number().default(256),
  WEB_SIZE: z.coerce.number().default(1280),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
