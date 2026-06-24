import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { RejectionReason } from '../types';
import { config } from '../config';

/**
 * Average hash (aHash): resize to 8×8 grayscale, compare each pixel to mean.
 * Returns a 16-char hex string (64 bits).
 */
export async function computeAverageHash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer)
    .resize(8, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data);
  const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;

  let hash = BigInt(0);
  for (let i = 0; i < 64; i++) {
    if (pixels[i] > mean) {
      hash |= BigInt(1) << BigInt(63 - i);
    }
  }

  return hash.toString(16).padStart(16, '0');
}

function hammingDistance(a: string, b: string): number {
  const numA = BigInt(`0x${a}`);
  const numB = BigInt(`0x${b}`);
  let xor = numA ^ numB;
  let dist = 0;
  while (xor > BigInt(0)) {
    dist += Number(xor & BigInt(1));
    xor >>= BigInt(1);
  }
  return dist;
}

export async function checkSimilarity(
  buffer: Buffer,
  prisma: PrismaClient,
  excludeId?: string,
): Promise<{ reason: RejectionReason | null; phash: string }> {
  const phash = await computeAverageHash(buffer);

  // Only compare against already-accepted images to avoid polluting the index
  const accepted = await prisma.image.findMany({
    where: {
      status: 'ACCEPTED',
      phash: { not: null },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { phash: true },
  });

  for (const img of accepted) {
    if (!img.phash) continue;
    const distance = hammingDistance(phash, img.phash);
    if (distance <= config.SIMILARITY_HAMMING_THRESHOLD) {
      return { reason: 'TOO_SIMILAR', phash };
    }
  }

  return { reason: null, phash };
}
