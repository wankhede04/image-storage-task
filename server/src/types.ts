export type RejectionReason =
  | 'INVALID_FORMAT'
  | 'TOO_SMALL_RESOLUTION'
  | 'FILE_TOO_SMALL'
  | 'BLURRY'
  | 'NO_FACE'
  | 'MULTIPLE_FACES'
  | 'FACE_TOO_SMALL'
  | 'TOO_SIMILAR';

export interface ValidationResult {
  passed: boolean;
  reasons: RejectionReason[];
  phash?: string;
  width?: number;
  height?: number;
  format?: string;
}
