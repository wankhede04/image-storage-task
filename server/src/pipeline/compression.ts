import sharp from 'sharp';
import { config } from '../config';

export interface CompressionResult {
  buffer: Buffer;
  sizeBytes: number;
  inputSizeBytes: number;
  compressionRatio: number;
}

/**
 * Re-encodes a JPEG at the given quality using mozjpeg.
 * compressionRatio = outputSize / inputSizeBytes — a value below 1 means
 * the output shrank relative to the input; above 1 means it grew.
 */
export async function compress(input: Buffer, quality: number = config.COMPRESSION_QUALITY): Promise<CompressionResult> {
  const out = await sharp(input).jpeg({ mozjpeg: true, quality }).toBuffer();
  const inputSizeBytes = input.length;
  const sizeBytes = out.length;

  return {
    buffer: out,
    sizeBytes,
    inputSizeBytes,
    compressionRatio: sizeBytes / inputSizeBytes,
  };
}
