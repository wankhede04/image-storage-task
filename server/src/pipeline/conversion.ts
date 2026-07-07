import sharp from 'sharp';
import { fromBuffer } from 'file-type';
import heicConvert from 'heic-convert';

export interface NormalizedImage {
  buffer: Buffer;
  format: 'jpeg';
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Normalizes any supported input image into a consistent JPEG.
 *
 * HEIC/HEIF inputs are decoded via heic-convert first (sharp's bundled
 * libheif does not support the HEVC codec used by most HEIC photos).
 * Everything is then re-encoded through sharp with `.rotate()` (which
 * auto-applies EXIF orientation) — sharp strips other metadata by default,
 * which is the desired normalization.
 */
export async function normalizeToJpeg(input: Buffer): Promise<NormalizedImage> {
  const detected = await fromBuffer(input);
  const isHeic = detected?.mime === 'image/heic' || detected?.mime === 'image/heif';

  const decoded = isHeic
    ? Buffer.from(await heicConvert({ buffer: input, format: 'JPEG', quality: 0.95 }))
    : input;

  const out = await sharp(decoded).rotate().jpeg({ quality: 95 }).toBuffer();
  const metadata = await sharp(out).metadata();

  return {
    buffer: out,
    format: 'jpeg',
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    sizeBytes: out.length,
  };
}
