import { Queue } from 'bullmq';
import { redisConnection } from './queue';

export interface PipelineJob {
  imageId: string;
}

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 50,
};

export const conversionQueue = new Queue<PipelineJob, void, string>('conversion', {
  connection: redisConnection,
  defaultJobOptions,
});

export const compressionQueue = new Queue<PipelineJob, void, string>('compression', {
  connection: redisConnection,
  defaultJobOptions,
});

export const variantQueue = new Queue<PipelineJob, void, string>('variant-generation', {
  connection: redisConnection,
  defaultJobOptions,
});

export async function enqueueConversion(imageId: string): Promise<void> {
  await conversionQueue.add('convert', { imageId }, { jobId: imageId });
}

export async function enqueueCompression(imageId: string): Promise<void> {
  await compressionQueue.add('compress', { imageId }, { jobId: imageId });
}

export async function enqueueVariantGeneration(imageId: string): Promise<void> {
  await variantQueue.add('generate-variants', { imageId }, { jobId: imageId });
}
