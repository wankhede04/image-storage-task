import sharp from 'sharp';
import { prisma } from '../lib/prisma';
import { RejectionReason } from '../types';
import { config } from '../config';

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
    if (pixels[i] > mean) hash |= BigInt(1) << BigInt(63 - i);
  }

  return hash.toString(16).padStart(16, '0');
}

function hammingDistance(a: string, b: string): number {
  let xor = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let dist = 0;
  while (xor > BigInt(0)) {
    dist += Number(xor & BigInt(1));
    xor >>= BigInt(1);
  }
  return dist;
}

export async function checkSimilarity(
  buffer: Buffer,
  excludeId?: string,
): Promise<{ reason: RejectionReason | null; phash: string }> {
  const phash = await computeAverageHash(buffer);

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
    if (hammingDistance(phash, img.phash) <= config.SIMILARITY_HAMMING_THRESHOLD) {
      return { reason: 'TOO_SIMILAR', phash };
    }
  }

  return { reason: null, phash };
}
