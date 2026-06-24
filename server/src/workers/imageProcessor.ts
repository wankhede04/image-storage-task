import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { ProcessImageJob, redisConnection } from '../services/queue';
import { storageService } from '../services/storage';
import { broadcast } from '../services/sse';
import { validateImage } from '../validation';

const prisma = new PrismaClient();

export const imageWorker = new Worker<ProcessImageJob>(
  'image-processing',
  async (job) => {
    const { imageId, s3KeyOriginal, originalFormat } = job.data;

    try {
      // Download the original from object storage
      const originalBuffer = await storageService.getObject(s3KeyOriginal);

      // Detect if HEIC and convert → store converted.jpg
      let workingBuffer = originalBuffer;
      let s3KeyConverted: string | null = null;
      const isHeic = originalFormat === 'heic';

      if (isHeic) {
        const jpegBuffer = await sharp(originalBuffer).jpeg({ quality: 95 }).toBuffer();
        s3KeyConverted = `images/${imageId}/converted.jpg`;
        await storageService.putObject(s3KeyConverted, jpegBuffer, 'image/jpeg');

        // Persist the converted key immediately so preview endpoint works while validating
        await prisma.image.update({
          where: { id: imageId },
          data: { s3KeyConverted },
        });

        workingBuffer = jpegBuffer;
      }

      // Run the full validation pipeline on the (possibly converted) buffer
      const result = await validateImage(workingBuffer, workingBuffer.length, prisma, imageId);

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
