import { fromBuffer } from 'file-type';
import { RejectionReason } from '../types';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);

export async function checkFormat(buffer: Buffer): Promise<RejectionReason | null> {
  const detected = await fromBuffer(buffer);
  if (!detected || !ALLOWED.has(detected.mime)) {
    return 'INVALID_FORMAT';
  }
  return null;
}
