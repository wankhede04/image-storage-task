import { Worker, Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { redisConnection } from '../services/queue';
import { PipelineJob, enqueueVariantGeneration } from '../services/pipelineQueues';
import { storageService } from '../services/storage';
import { broadcast } from '../services/sse';
import { compress } from '../pipeline/compression';
import { config } from '../config';

const MAX_ATTEMPTS = 3;

export async function processCompressionJob(imageId: string): Promise<void> {
  const image = await prisma.image.findUnique({ where: { id: imageId } });
  if (!image) {
    console.warn(`[CompressionWorker] Image ${imageId} not found — skipping`);
    return;
  }

  if (image.pipelineStatus === 'COMPLETE') {
    console.log(`[CompressionWorker] Image ${imageId} already COMPLETE — skipping`);
    return;
  }

  await prisma.image.update({
    where: { id: imageId },
    data: { pipelineStatus: 'COMPRESSING' },
  });
  broadcast({ type: 'PIPELINE_UPDATE', id: imageId, pipelineStatus: 'COMPRESSING' });

  if (!image.s3KeyNormalized) {
    throw new Error('s3KeyNormalized missing — conversion stage did not complete');
  }

  const inputBuffer = await storageService.getObject(image.s3KeyNormalized);

  const result = await compress(inputBuffer);

  const key = `images/${imageId}/compressed.jpg`;
  await storageService.putObject(key, result.buffer, 'image/jpeg');

  await prisma.image.update({
    where: { id: imageId },
    data: {
      s3KeyCompressed: key,
      compressedSizeBytes: result.sizeBytes,
      compressionRatio: result.compressionRatio,
    },
  });

  await enqueueVariantGeneration(imageId);
}

export const compressionWorker = new Worker<PipelineJob>(
  'compression',
  async (job: Job<PipelineJob>) => {
    try {
      await processCompressionJob(job.data.imageId);
    } catch (err) {
      const { imageId } = job.data;
      console.error(`[CompressionWorker] Failed to process image ${imageId} (attempt ${job.attemptsMade}):`, err);

      const isFinalAttempt = job.attemptsMade >= MAX_ATTEMPTS - 1;
      if (isFinalAttempt) {
        const message = err instanceof Error ? err.message : String(err);
        await prisma.image.update({
          where: { id: imageId },
          data: { pipelineStatus: 'FAILED', pipelineError: `COMPRESSION_FAILED: ${message}` },
        });
        broadcast({
          type: 'PIPELINE_UPDATE',
          id: imageId,
          pipelineStatus: 'FAILED',
          pipelineError: `COMPRESSION_FAILED: ${message}`,
        });
      }

      throw err;
    }
  },
  { connection: redisConnection, concurrency: config.WORKER_CONCURRENCY },
);

compressionWorker.on('failed', async (job, err) => {
  console.error(`[CompressionWorker] Job ${job?.id} permanently failed:`, err.message);
  if (!job) return;
  const { imageId } = job.data;
  try {
    const image = await prisma.image.findUnique({ where: { id: imageId }, select: { pipelineStatus: true } });
    if (image && image.pipelineStatus !== 'FAILED' && image.pipelineStatus !== 'COMPLETE') {
      await prisma.image.update({
        where: { id: imageId },
        data: { pipelineStatus: 'FAILED', pipelineError: 'COMPRESSION_FAILED' },
      });
      broadcast({ type: 'PIPELINE_UPDATE', id: imageId, pipelineStatus: 'FAILED', pipelineError: 'COMPRESSION_FAILED' });
    }
  } catch (updateErr) {
    console.error(`[CompressionWorker] Failed to mark image ${imageId} as FAILED:`, updateErr);
  }
});
