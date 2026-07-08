import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../components/Toast';
import { REJECTION_LABELS } from '../types';
import type { SSEMessage, Image } from '../types';

export function useSSE() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const source = new EventSource('/api/images/events');

    source.onmessage = (event) => {
      const msg: SSEMessage = JSON.parse(event.data);

      const findImageName = () => {
        const cached = queryClient.getQueriesData<{ data: Image[] }>({ queryKey: ['images'] });
        for (const [, data] of cached) {
          const found = data?.data?.find((i) => i.id === msg.id);
          if (found) return found.originalName;
        }
        return 'Image';
      };

      if (msg.type === 'PIPELINE_UPDATE') {
        const imageName = findImageName();

        // Update in-place in the cache
        queryClient.setQueriesData<{ data: Image[]; total: number; page: number; limit: number }>(
          { queryKey: ['images'] },
          (old) => {
            if (!old) return old;
            return {
              ...old,
              data: old.data.map((img) =>
                img.id === msg.id
                  ? {
                      ...img,
                      pipelineStatus: msg.pipelineStatus,
                      pipelineError: msg.pipelineError ?? null,
                    }
                  : img,
              ),
            };
          },
        );

        // Once the pipeline completes, re-fetch so any open detail view picks up variants
        if (msg.pipelineStatus === 'COMPLETE') {
          queryClient.invalidateQueries({ queryKey: ['images'] });
          toast(`${imageName} ready — variants generated`, 'success');
        } else if (msg.pipelineStatus === 'FAILED') {
          toast(`${imageName} processing failed`, 'error');
        }
      } else if (msg.type === 'IMAGE_PROCESSED') {
        // Find the image name from cache for the toast
        const imageName = findImageName();

        // Update in-place in the cache
        queryClient.setQueriesData<{ data: Image[]; total: number; page: number; limit: number }>(
          { queryKey: ['images'] },
          (old) => {
            if (!old) return old;
            return {
              ...old,
              data: old.data.map((img) =>
                img.id === msg.id
                  ? {
                      ...img,
                      status: msg.status,
                      rejectionReasons: msg.rejectionReasons,
                      width: msg.width ?? img.width,
                      height: msg.height ?? img.height,
                    }
                  : img,
              ),
            };
          },
        );

        // Re-fetch to get signed URLs for newly accepted images
        queryClient.invalidateQueries({ queryKey: ['images'] });

        // Toast notification
        if (msg.status === 'ACCEPTED') {
          toast(`${imageName} accepted ✓`, 'success');
        } else if (msg.status === 'REJECTED') {
          const firstReason = msg.rejectionReasons[0]
            ? REJECTION_LABELS[msg.rejectionReasons[0]] ?? msg.rejectionReasons[0]
            : 'did not meet guidelines';
          toast(`${imageName} rejected — ${firstReason}`, 'error');
        }
      }
    };

    source.onerror = () => {
      // EventSource auto-reconnects; no action needed
    };

    return () => source.close();
  }, [queryClient, toast]);
}
