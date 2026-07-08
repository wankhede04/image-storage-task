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

export type PipelineStatus =
  | 'NOT_STARTED' | 'QUEUED' | 'CONVERTING' | 'COMPRESSING'
  | 'GENERATING_VARIANTS' | 'COMPLETE' | 'FAILED';

export type VariantType = 'THUMBNAIL' | 'WEB' | 'FULL';

export interface ImageVariant {
  type: VariantType;
  width: number;
  height: number;
  sizeBytes: number;
  format: string;
  signedUrl: string;
}

export const PIPELINE_STATUS_LABELS: Record<PipelineStatus, string> = {
  NOT_STARTED: '',
  QUEUED: 'Queued',
  CONVERTING: 'Converting',
  COMPRESSING: 'Compressing',
  GENERATING_VARIANTS: 'Generating variants',
  COMPLETE: 'Ready',
  FAILED: 'Processing failed',
};

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
  pipelineStatus: PipelineStatus;
  pipelineError: string | null;
  compressionRatio: number | null;
  compressedSizeBytes: number | null;
  /** Only present on detail responses (list rows omit this to avoid N+1). */
  variants?: ImageVariant[];
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

export type SSEMessage =
  | {
      type: 'IMAGE_PROCESSED';
      id: string;
      status: ImageStatus;
      rejectionReasons: RejectionReason[];
      width?: number;
      height?: number;
    }
  | {
      type: 'PIPELINE_UPDATE';
      id: string;
      pipelineStatus: PipelineStatus;
      pipelineError?: string | null;
    };

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
