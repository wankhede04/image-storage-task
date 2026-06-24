import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { uploadImage } from '../lib/api';
import { useToast } from '../components/Toast';
import type { Image, UploadResponse } from '../types';

type UploadState = 'idle' | 'validating' | 'uploading' | 'processing' | 'done' | 'error';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);
const ALLOWED_EXTENSIONS = /\.(jpg|jpeg|png|heic)$/i;

function validateClientSide(file: File): string | null {
  const typeOk = ALLOWED_TYPES.has(file.type) || ALLOWED_EXTENSIONS.test(file.name);
  if (!typeOk) return 'Only JPEG, PNG, and HEIC images are accepted.';
  return null;
}

export function useUpload() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
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
        toast(clientError, 'error');
        return null;
      }

      try {
        setState('uploading');
        setProgress(0);
        toast(`Uploading ${file.name}…`, 'info');

        const response = await uploadImage(file, (pct) => setProgress(pct));

        // Optimistic PENDING card
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

        toast(`${file.name} queued for validation`, 'info');
        setState('processing');
        return response;
      } catch (err: unknown) {
        const axiosData = (err as any)?.response?.data;
        const msg =
          (typeof axiosData?.error === 'string' ? axiosData.error : null) ??
          (err instanceof Error ? err.message : null) ??
          'Upload failed. Please try again.';
        setError(msg);
        setState('error');
        toast(msg, 'error');
        return null;
      } finally {
        setProgress(0);
      }
    },
    [queryClient, toast],
  );

  const reset = useCallback(() => {
    setState('idle');
    setError(null);
    setProgress(0);
  }, []);

  return { upload, state, progress, error, reset };
}
