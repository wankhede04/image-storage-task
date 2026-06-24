import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { ValidationResult, RejectionReason } from '../types';
import { checkFormat } from './format';
import { checkResolution } from './resolution';
import { checkBlur } from './blur';
import { checkFaces } from './face';
import { checkSimilarity } from './similarity';

/**
 * Runs the full validation pipeline. All checks run (not fail-fast) so the
 * user receives a complete list of reasons when an image is rejected.
 */
export async function validateImage(
  buffer: Buffer,
  fileSizeBytes: number,
  prisma: PrismaClient,
  imageId?: string,
): Promise<ValidationResult> {
  const reasons: RejectionReason[] = [];

  // Step 0: Convert HEIC → JPEG before any processing
  let workingBuffer = buffer;
  const detected = await (await import('file-type')).fileTypeFromBuffer(buffer);
  const isHeic = detected?.mime === 'image/heic' || detected?.mime === 'image/heif';
  const format = isHeic ? 'jpeg' : (detected?.ext ?? 'unknown');

  if (isHeic) {
    workingBuffer = await sharp(buffer).jpeg({ quality: 95 }).toBuffer();
  }

  // 1. Format check (already passed middleware gate, but re-verify post-conversion)
  const formatReason = await checkFormat(workingBuffer);
  if (formatReason) reasons.push(formatReason);

  // 2. Resolution + file size check
  const { reason: resReason, dimensions } = await checkResolution(workingBuffer, fileSizeBytes);
  if (resReason) reasons.push(resReason);

  const width = dimensions?.width ?? 0;
  const height = dimensions?.height ?? 0;

  // 3. Blur check
  const blurReason = await checkBlur(workingBuffer);
  if (blurReason) reasons.push(blurReason);

  // 4. Face detection
  const faceReasons = await checkFaces(workingBuffer, width, height);
  reasons.push(...faceReasons);

  // 5. Similarity check
  const { reason: simReason, phash } = await checkSimilarity(workingBuffer, prisma, imageId);
  if (simReason) reasons.push(simReason);

  return {
    passed: reasons.length === 0,
    reasons,
    phash,
    width,
    height,
    format,
  };
}
