import './config'; // validates env on startup
import express from 'express';
import { config } from './config';
import { helmetMiddleware, corsMiddleware, apiRateLimit } from './middleware/security';
import imageRoutes from './routes/images';
import { warmFaceDetector } from './validation/face';

// Start the BullMQ worker in the same process for simplicity in dev.
// In production, this would be a separate process/container.
import './workers/imageProcessor';

const app = express();

app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(apiRateLimit);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/images', imageRoutes);

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.stack ?? err.message);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

app.listen(config.PORT, () => {
  console.log(`[Server] Running on http://localhost:${config.PORT}`);
  // Pre-warm the face detector so the first upload isn't slow
  warmFaceDetector().catch((err) => console.warn('[Server] Face detector warm-up failed:', err.message));
});

export default app;
