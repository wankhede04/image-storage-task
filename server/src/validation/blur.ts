import sharp from 'sharp';
import { RejectionReason } from '../types';
import { config } from '../config';

/**
 * Detects blur using Laplacian variance on grayscale pixels.
 * Low variance = uniform pixel values = blurry image.
 * Threshold is configurable via BLUR_THRESHOLD env var.
 */
export async function checkBlur(buffer: Buffer): Promise<RejectionReason | null> {
  const { data, info } = await sharp(buffer)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const pixels = new Uint8Array(data);

  // 3x3 Laplacian kernel
  const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];

  let sumSq = 0;
  let sumVal = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let val = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixel = pixels[(y + ky) * width + (x + kx)];
          val += pixel * kernel[(ky + 1) * 3 + (kx + 1)];
        }
      }
      sumVal += val;
      sumSq += val * val;
      count++;
    }
  }

  const mean = sumVal / count;
  const variance = sumSq / count - mean * mean;

  if (variance < config.BLUR_THRESHOLD) {
    return 'BLURRY';
  }
  return null;
}
