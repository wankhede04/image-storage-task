import { Worker, Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { redisConnection } from '../services/queue';
import { PipelineJob } from '../services/pipelineQueues';
import { storageService } from '../services/storage';
import { broadcast } from '../services/sse';
import { generateVariants } from '../pipeline/variants';
import { config } from '../config';

const MAX_ATTEMPTS = 3;

export async function processVariantJob(imageId: string): Promise<void> {
  const image = await prisma.image.findUnique({ where: { id: imageId } });
  if (!image) {
    console.warn(`[VariantWorker] Image ${imageId} not found — skipping`);
    return;
  }

  if (image.pipelineStatus === 'COMPLETE') {
    console.log(`[VariantWorker] Image ${imageId} already COMPLETE — skipping`);
    return;
  }

  await prisma.image.update({
    where: { id: imageId },
    data: { pipelineStatus: 'GENERATING_VARIANTS' },
  });
  broadcast({ type: 'PIPELINE_UPDATE', id: imageId, pipelineStatus: 'GENERATING_VARIANTS' });

  if (!image.s3KeyCompressed) {
    throw new Error('s3KeyCompressed missing — compression stage did not complete');
  }

  const inputBuffer = await storageService.getObject(image.s3KeyCompressed);

  const variants = await generateVariants(inputBuffer);

  const keyedVariants = variants.map((variant) => ({
    ...variant,
    key: `images/${imageId}/variants/${variant.type.toLowerCase()}.jpg`,
  }));

  await Promise.all(
    keyedVariants.map((variant) =>
      storageService.putObject(variant.key, variant.buffer, 'image/jpeg'),
    ),
  );

  await prisma.$transaction([
    ...keyedVariants.map((variant) =>
      prisma.imageVariant.upsert({
        where: { imageId_type: { imageId, type: variant.type } },
        create: {
          imageId,
          type: variant.type,
          s3Key: variant.key,
          width: variant.width,
          height: variant.height,
          sizeBytes: variant.sizeBytes,
          format: variant.format,
        },
        update: {
          s3Key: variant.key,
          width: variant.width,
          height: variant.height,
          sizeBytes: variant.sizeBytes,
          format: variant.format,
        },
      }),
    ),
    prisma.image.update({
      where: { id: imageId },
      data: { pipelineStatus: 'COMPLETE' },
    }),
  ]);

  broadcast({ type: 'PIPELINE_UPDATE', id: imageId, pipelineStatus: 'COMPLETE' });
}

export const variantWorker = new Worker<PipelineJob>(
  'variant-generation',
  async (job: Job<PipelineJob>) => {
    try {
      await processVariantJob(job.data.imageId);
    } catch (err) {
      const { imageId } = job.data;
      console.error(`[VariantWorker] Failed to process image ${imageId} (attempt ${job.attemptsMade}):`, err);

      const isFinalAttempt = job.attemptsMade >= MAX_ATTEMPTS - 1;
      if (isFinalAttempt) {
        const message = err instanceof Error ? err.message : String(err);
        await prisma.image.update({
          where: { id: imageId },
          data: { pipelineStatus: 'FAILED', pipelineError: `VARIANT_GENERATION_FAILED: ${message}` },
        });
        broadcast({
          type: 'PIPELINE_UPDATE',
          id: imageId,
          pipelineStatus: 'FAILED',
          pipelineError: `VARIANT_GENERATION_FAILED: ${message}`,
        });
      }

      throw err;
    }
  },
  { connection: redisConnection, concurrency: config.WORKER_CONCURRENCY },
);

variantWorker.on('failed', async (job, err) => {
  console.error(`[VariantWorker] Job ${job?.id} permanently failed:`, err.message);
  if (!job) return;
  const { imageId } = job.data;
  try {
    const image = await prisma.image.findUnique({ where: { id: imageId }, select: { pipelineStatus: true } });
    if (image && image.pipelineStatus !== 'FAILED' && image.pipelineStatus !== 'COMPLETE') {
      await prisma.image.update({
        where: { id: imageId },
        data: { pipelineStatus: 'FAILED', pipelineError: 'VARIANT_GENERATION_FAILED' },
      });
      broadcast({ type: 'PIPELINE_UPDATE', id: imageId, pipelineStatus: 'FAILED', pipelineError: 'VARIANT_GENERATION_FAILED' });
    }
  } catch (updateErr) {
    console.error(`[VariantWorker] Failed to mark image ${imageId} as FAILED:`, updateErr);
  }
});
