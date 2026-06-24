import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { uploadImage } from '../lib/api';
import type { Image, UploadResponse } from '../types';

type UploadState = 'idle' | 'validating' | 'uploading' | 'processing' | 'done' | 'error';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);
const ALLOWED_EXTENSIONS = /\.(jpg|jpeg|png|heic)$/i;

function validateClientSide(file: File): string | null {
  const typeOk = ALLOWED_TYPES.has(file.type) || ALLOWED_EXTENSIONS.test(file.name);
  if (!typeOk) {
    return 'Only JPEG, PNG, and HEIC images are accepted.';
  }
  return null;
}

export function useUpload() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<UploadResponse | null> => {
      setError(null);
      setState('validating');

      const clientError = validateClientSide(file);
      if (clientError) {
        setError(clientError);
        setState('error');
        return null;
      }

      try {
        setState('uploading');
        setProgress(0);

        const response = await uploadImage(file, (pct) => setProgress(pct));

        // Optimistically add a PENDING card to the list cache
        queryClient.setQueriesData<{ data: Image[]; total: number; page: number; limit: number }>(
          { queryKey: ['images'] },
          (old) => {
            if (!old) return old;
            const pending: Image = {
              id: response.id,
              originalName: response.originalName,
              s3KeyOriginal: '',
              s3KeyConverted: null,
              signedUrl: null,
              format: file.type.split('/')[1],
              fileSizeBytes: file.size,
              width: null,
              height: null,
              status: 'PENDING',
              rejectionReasons: [],
              phash: null,
              createdAt: response.createdAt,
              updatedAt: response.createdAt,
            };
            return { ...old, data: [pending, ...old.data], total: old.total + 1 };
          },
        );

        setState('processing');
        return response;
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Upload failed. Please try again.';
        setError(msg);
        setState('error');
        return null;
      } finally {
        setProgress(0);
      }
    },
    [queryClient],
  );

  const reset = useCallback(() => {
    setState('idle');
    setError(null);
    setProgress(0);
  }, []);

  return { upload, state, progress, error, reset };
}
