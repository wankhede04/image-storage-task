import { Worker, Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { redisConnection } from '../services/queue';
import { PipelineJob, enqueueCompression } from '../services/pipelineQueues';
import { storageService } from '../services/storage';
import { broadcast } from '../services/sse';
import { normalizeToJpeg } from '../pipeline/conversion';
import { config } from '../config';

const MAX_ATTEMPTS = 3;

export async function processConversionJob(imageId: string): Promise<void> {
  const image = await prisma.image.findUnique({ where: { id: imageId } });
  if (!image) {
    console.warn(`[ConversionWorker] Image ${imageId} not found — skipping`);
    return;
  }

  if (image.pipelineStatus === 'COMPLETE') {
    console.log(`[ConversionWorker] Image ${imageId} already COMPLETE — skipping`);
    return;
  }

  await prisma.image.update({
    where: { id: imageId },
    data: { pipelineStatus: 'CONVERTING' },
  });
  broadcast({ type: 'PIPELINE_UPDATE', id: imageId, pipelineStatus: 'CONVERTING' });

  const inputKey = image.s3KeyConverted ?? image.s3KeyOriginal;
  const inputBuffer = await storageService.getObject(inputKey);

  const result = await normalizeToJpeg(inputBuffer);

  const key = `images/${imageId}/normalized.jpg`;
  await storageService.putObject(key, result.buffer, 'image/jpeg');

  await prisma.image.update({
    where: { id: imageId },
    data: { s3KeyNormalized: key, normalizedSizeBytes: result.sizeBytes },
  });

  await enqueueCompression(imageId);
}

export const conversionWorker = new Worker<PipelineJob>(
  'conversion',
  async (job: Job<PipelineJob>) => {
    try {
      await processConversionJob(job.data.imageId);
    } catch (err) {
      const { imageId } = job.data;
      console.error(`[ConversionWorker] Failed to process image ${imageId} (attempt ${job.attemptsMade}):`, err);

      const isFinalAttempt = job.attemptsMade >= MAX_ATTEMPTS - 1;
      if (isFinalAttempt) {
        const message = err instanceof Error ? err.message : String(err);
        await prisma.image.update({
          where: { id: imageId },
          data: { pipelineStatus: 'FAILED', pipelineError: `CONVERSION_FAILED: ${message}` },
        });
        broadcast({
          type: 'PIPELINE_UPDATE',
          id: imageId,
          pipelineStatus: 'FAILED',
          pipelineError: `CONVERSION_FAILED: ${message}`,
        });
      }

      throw err;
    }
  },
  { connection: redisConnection, concurrency: config.WORKER_CONCURRENCY },
);

conversionWorker.on('failed', async (job, err) => {
  console.error(`[ConversionWorker] Job ${job?.id} permanently failed:`, err.message);
  if (!job) return;
  const { imageId } = job.data;
  try {
    const image = await prisma.image.findUnique({ where: { id: imageId }, select: { pipelineStatus: true } });
    if (image && image.pipelineStatus !== 'FAILED' && image.pipelineStatus !== 'COMPLETE') {
      await prisma.image.update({
        where: { id: imageId },
        data: { pipelineStatus: 'FAILED', pipelineError: 'CONVERSION_FAILED' },
      });
      broadcast({ type: 'PIPELINE_UPDATE', id: imageId, pipelineStatus: 'FAILED', pipelineError: 'CONVERSION_FAILED' });
    }
  } catch (updateErr) {
    console.error(`[ConversionWorker] Failed to mark image ${imageId} as FAILED:`, updateErr);
  }
});
