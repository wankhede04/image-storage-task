import sharp from 'sharp';
import { VariantType } from '@prisma/client';
import { config } from '../config';

export interface GeneratedVariant {
  type: VariantType;
  buffer: Buffer;
  width: number;
  height: number;
  sizeBytes: number;
  format: 'jpeg';
}

async function buildVariant(input: Buffer, type: VariantType, boundingSize?: number): Promise<GeneratedVariant> {
  let pipeline = sharp(input);
  if (boundingSize !== undefined) {
    pipeline = pipeline.resize(boundingSize, boundingSize, { fit: 'inside', withoutEnlargement: true });
  }

  const buffer = await pipeline.jpeg({ mozjpeg: true, quality: config.COMPRESSION_QUALITY }).toBuffer();
  const metadata = await sharp(buffer).metadata();

  return {
    type,
    buffer,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    sizeBytes: buffer.length,
    format: 'jpeg',
  };
}

/**
 * Generates the three fixed variants (THUMBNAIL, WEB, FULL) for an image.
 * THUMBNAIL and WEB are bounded resizes that never upscale; FULL is a
 * re-encode at source resolution.
 */
export async function generateVariants(input: Buffer): Promise<GeneratedVariant[]> {
  const [thumbnail, web, full] = await Promise.all([
    buildVariant(input, VariantType.THUMBNAIL, config.THUMBNAIL_SIZE),
    buildVariant(input, VariantType.WEB, config.WEB_SIZE),
    buildVariant(input, VariantType.FULL),
  ]);

  return [thumbnail, web, full];
}
