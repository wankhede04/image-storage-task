import { Worker, Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import heicConvert from 'heic-convert';
import { ProcessImageJob, redisConnection } from '../services/queue';
import { storageService } from '../services/storage';
import { broadcast } from '../services/sse';
import { validateImage } from '../validation';
import { enqueueConversion } from '../services/pipelineQueues';


const MAX_ATTEMPTS = 3;

export const imageWorker = new Worker<ProcessImageJob>(
  'image-processing',
  async (job: Job<ProcessImageJob>) => {
    const { imageId, s3KeyOriginal, originalFormat } = job.data;

    try {
      const originalBuffer = await storageService.getObject(s3KeyOriginal);

      let workingBuffer = originalBuffer;
      let s3KeyConverted: string | null = null;
      const isHeic = originalFormat === 'heic';

      if (isHeic) {
        const jpegBuffer = Buffer.from(
          await heicConvert({ buffer: originalBuffer, format: 'JPEG', quality: 0.95 }),
        );
        s3KeyConverted = `images/${imageId}/converted.jpg`;
        await storageService.putObject(s3KeyConverted, jpegBuffer, 'image/jpeg');
        await prisma.image.update({
          where: { id: imageId },
          data: { s3KeyConverted },
        });
        workingBuffer = jpegBuffer;
      }

      // Use the original uploaded file size, not the converted buffer size
      const result = await validateImage(workingBuffer, originalBuffer.length, imageId);

      const updatedImage = await prisma.image.update({
        where: { id: imageId },
        data: {
          status: result.passed ? 'ACCEPTED' : 'REJECTED',
          rejectionReasons: result.reasons,
          phash: result.phash ?? null,
          width: result.width ?? null,
          height: result.height ?? null,
          format: isHeic ? 'jpeg' : originalFormat,
          ...(result.passed && { pipelineStatus: 'QUEUED' }),
        },
      });

      broadcast({
        type: 'IMAGE_PROCESSED',
        id: imageId,
        status: updatedImage.status,
        rejectionReasons: updatedImage.rejectionReasons,
        width: updatedImage.width,
        height: updatedImage.height,
      });

      if (result.passed) {
        try {
          await enqueueConversion(imageId);
        } catch (enqueueErr) {
          const message = enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr);
          console.error(`[Worker] Failed to enqueue conversion for image ${imageId}:`, enqueueErr);
          await prisma.image.update({
            where: { id: imageId },
            data: { pipelineStatus: 'FAILED', pipelineError: `CONVERSION_FAILED: enqueue error: ${message}` },
          });
          broadcast({
            type: 'PIPELINE_UPDATE',
            id: imageId,
            pipelineStatus: 'FAILED',
            pipelineError: `CONVERSION_FAILED: enqueue error: ${message}`,
          });
        }
      }
    } catch (err) {
      console.error(`[Worker] Failed to process image ${imageId} (attempt ${job.attemptsMade}):`, err);

      // Only write REJECTED on the final attempt — re-throws let BullMQ retry.
      // Writing REJECTED on earlier attempts then succeeding on retry would send
      // a contradictory REJECTED → ACCEPTED SSE pair to the client.
      // attemptsMade is 0-indexed and tops out at (attempts - 1), so use MAX_ATTEMPTS - 1.
      const isFinalAttempt = job.attemptsMade >= MAX_ATTEMPTS - 1;
      if (isFinalAttempt) {
        await prisma.image.update({
          where: { id: imageId },
          data: { status: 'REJECTED', rejectionReasons: ['PROCESSING_FAILED'] },
        });
        broadcast({
          type: 'IMAGE_PROCESSED',
          id: imageId,
          status: 'REJECTED',
          rejectionReasons: ['PROCESSING_FAILED'],
        });
      }

      throw err;
    }
  },
  { connection: { ...redisConnection }, concurrency: 2 },
);

imageWorker.on('failed', async (job, err) => {
  console.error(`[Worker] Job ${job?.id} permanently failed:`, err.message);
  if (!job) return;
  const { imageId } = job.data;
  try {
    const image = await prisma.image.findUnique({ where: { id: imageId }, select: { status: true } });
    if (image?.status === 'PENDING') {
      await prisma.image.update({
        where: { id: imageId },
        data: { status: 'REJECTED', rejectionReasons: ['PROCESSING_FAILED'] },
      });
      broadcast({ type: 'IMAGE_PROCESSED', id: imageId, status: 'REJECTED', rejectionReasons: ['PROCESSING_FAILED'] });
    }
  } catch (updateErr) {
    console.error(`[Worker] Failed to mark image ${imageId} as REJECTED:`, updateErr);
  }
});
