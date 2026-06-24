import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SSEMessage, Image } from '../types';

export function useSSE() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource('/api/images/events');

    source.onmessage = (event) => {
      const msg: SSEMessage = JSON.parse(event.data);

      if (msg.type === 'IMAGE_PROCESSED') {
        // Update the image in all cached list queries
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

        // Invalidate to re-fetch fresh signed URLs for the updated image
        queryClient.invalidateQueries({ queryKey: ['images'] });
      }
    };

    source.onerror = () => {
      // EventSource auto-reconnects; no action needed
    };

    return () => {
      source.close();
    };
  }, [queryClient]);
}
