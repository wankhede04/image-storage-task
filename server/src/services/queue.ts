import { Queue } from 'bullmq';
import { config } from '../config';

// Parse redis URL into connection options BullMQ accepts directly
function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    db: parsed.pathname ? parseInt(parsed.pathname.slice(1) || '0', 10) : 0,
  };
}

export const redisConnection = parseRedisUrl(config.REDIS_URL);

export interface ProcessImageJob {
  imageId: string;
  s3Key: string;
  originalFormat: string;
}

export const imageQueue = new Queue<ProcessImageJob, void, string>('image-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export async function enqueueImageProcessing(job: ProcessImageJob): Promise<void> {
  await imageQueue.add('process-image', job);
}
