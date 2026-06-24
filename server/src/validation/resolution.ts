import sharp from 'sharp';
import { RejectionReason } from '../types';
import { config } from '../config';

export interface ImageDimensions {
  width: number;
  height: number;
}

export async function checkResolution(
  buffer: Buffer,
  fileSizeBytes: number,
): Promise<{ reason: RejectionReason | null; dimensions: ImageDimensions | null }> {
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  if (fileSizeBytes < config.MIN_FILE_SIZE_BYTES) {
    return { reason: 'FILE_TOO_SMALL', dimensions: { width, height } };
  }

  if (width < config.MIN_IMAGE_WIDTH || height < config.MIN_IMAGE_HEIGHT) {
    return { reason: 'TOO_SMALL_RESOLUTION', dimensions: { width, height } };
  }

  return { reason: null, dimensions: { width, height } };
}
