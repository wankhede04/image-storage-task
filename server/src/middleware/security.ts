import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from '../config';

export const helmetMiddleware = helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

export const corsMiddleware = cors({
  origin: config.CORS_ORIGIN,
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type'],
});

// LOAD_TEST_MODE relaxes rate limits so the load test can actually submit a large
// batch concurrently and poll statuses without tripping 429s. Never enable in production.
export const uploadRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.LOAD_TEST_MODE ? 10_000 : 20,
  message: { error: 'Too many uploads. Please wait a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: config.LOAD_TEST_MODE ? 100_000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
});
