export type ImageStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export type RejectionReason =
  | 'INVALID_FORMAT'
  | 'TOO_SMALL_RESOLUTION'
  | 'FILE_TOO_SMALL'
  | 'BLURRY'
  | 'NO_FACE'
  | 'MULTIPLE_FACES'
  | 'FACE_TOO_SMALL'
  | 'TOO_SIMILAR'
  | 'UPLOAD_FAILED'
  | 'PROCESSING_FAILED';

export interface Image {
  id: string;
  originalName: string;
  s3KeyOriginal: string;
  s3KeyConverted: string | null;
  /** Short-lived presigned URL, included in list/detail responses (null while PENDING). */
  signedUrl: string | null;
  format: string;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  status: ImageStatus;
  rejectionReasons: RejectionReason[];
  phash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadResponse {
  id: string;
  status: ImageStatus;
  originalName: string;
  createdAt: string;
}

export interface ListResponse {
  data: Image[];
  total: number;
  page: number;
  limit: number;
}

export interface SSEMessage {
  type: 'IMAGE_PROCESSED';
  id: string;
  status: ImageStatus;
  rejectionReasons: RejectionReason[];
  width?: number;
  height?: number;
}

export const REJECTION_LABELS: Record<RejectionReason, string> = {
  INVALID_FORMAT: 'Invalid file format',
  TOO_SMALL_RESOLUTION: 'Resolution too small (min 500×500)',
  FILE_TOO_SMALL: 'File too small (min 50KB)',
  BLURRY: 'Image is too blurry',
  NO_FACE: 'No face detected',
  MULTIPLE_FACES: 'Multiple faces detected',
  FACE_TOO_SMALL: 'Face is too small in frame',
  TOO_SIMILAR: 'Too similar to an existing image',
  UPLOAD_FAILED: 'Storage upload failed',
  PROCESSING_FAILED: 'Processing error — try again',
};
