import { RejectionReason } from '../types';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);

export async function checkFormat(buffer: Buffer): Promise<RejectionReason | null> {
  const { fileTypeFromBuffer } = await import('file-type');
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED.has(detected.mime)) {
    return 'INVALID_FORMAT';
  }
  return null;
}
