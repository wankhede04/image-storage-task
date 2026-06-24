import { ValidationResult, RejectionReason } from '../types';
import { checkFormat } from './format';
import { checkResolution } from './resolution';
import { checkBlur } from './blur';
import { checkFaces } from './face';
import { checkSimilarity } from './similarity';

/**
 * Runs the full validation pipeline on an already-decoded buffer.
 * HEIC conversion is the caller's responsibility (imageProcessor.ts).
 * All checks run (not fail-fast) so the user sees every rejection reason.
 */
export async function validateImage(
  buffer: Buffer,
  fileSizeBytes: number,
  imageId?: string,
): Promise<ValidationResult> {
  const reasons: RejectionReason[] = [];

  // 1. Format check
  const formatReason = await checkFormat(buffer);
  if (formatReason) reasons.push(formatReason);

  // 2. Resolution + file size
  const { reason: resReason, dimensions } = await checkResolution(buffer, fileSizeBytes);
  if (resReason) reasons.push(resReason);

  const width = dimensions?.width ?? 0;
  const height = dimensions?.height ?? 0;

  // 3. Blur
  const blurReason = await checkBlur(buffer);
  if (blurReason) reasons.push(blurReason);

  // 4. Face detection (handles its own coordinate space internally)
  const faceReasons = await checkFaces(buffer);
  reasons.push(...faceReasons);

  // 5. Similarity vs accepted images (uses shared prisma singleton)
  const { reason: simReason, phash } = await checkSimilarity(buffer, imageId);
  if (simReason) reasons.push(simReason);

  return { passed: reasons.length === 0, reasons, phash, width, height };
}
