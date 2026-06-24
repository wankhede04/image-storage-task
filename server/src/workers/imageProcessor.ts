import { Worker, Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import sharp from 'sharp';
import { ProcessImageJob, redisConnection } from '../services/queue';
import { storageService } from '../services/storage';
import { broadcast } from '../services/sse';
import { validateImage } from '../validation';


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
        const jpegBuffer = await sharp(originalBuffer).jpeg({ quality: 95 }).toBuffer();
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
    } catch (err) {
      console.error(`[Worker] Failed to process image ${imageId} (attempt ${job.attemptsMade}):`, err);

      // Only write REJECTED on the final attempt — re-throws let BullMQ retry.
      // Writing REJECTED on earlier attempts then succeeding on retry would send
      // a contradictory REJECTED → ACCEPTED SSE pair to the client.
      const isFinalAttempt = job.attemptsMade >= MAX_ATTEMPTS;
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

imageWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} permanently failed:`, err.message);
});
