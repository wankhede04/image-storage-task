import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { ProcessImageJob, redisConnection } from '../services/queue';
import { getFileBuffer } from '../services/storage';
import { broadcast } from '../services/sse';
import { validateImage } from '../validation';

const prisma = new PrismaClient();

export const imageWorker = new Worker<ProcessImageJob>(
  'image-processing',
  async (job) => {
    const { imageId, s3Key, originalFormat } = job.data;

    try {
      const buffer = await getFileBuffer(s3Key);
      const fileSize = buffer.length;

      const result = await validateImage(buffer, fileSize, prisma, imageId);

      const updatedImage = await prisma.image.update({
        where: { id: imageId },
        data: {
          status: result.passed ? 'ACCEPTED' : 'REJECTED',
          rejectionReasons: result.reasons,
          phash: result.phash ?? null,
          width: result.width ?? null,
          height: result.height ?? null,
          format: result.format ?? originalFormat,
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
      console.error(`[Worker] Failed to process image ${imageId}:`, err);

      await prisma.image.update({
        where: { id: imageId },
        data: { status: 'REJECTED', rejectionReasons: ['INVALID_FORMAT'] },
      });

      broadcast({
        type: 'IMAGE_PROCESSED',
        id: imageId,
        status: 'REJECTED',
        rejectionReasons: ['INVALID_FORMAT'],
      });

      throw err;
    }
  },
  { connection: { ...redisConnection }, concurrency: 2 },
);

imageWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});
