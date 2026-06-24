import { useState } from 'react';
import { Trash2, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteImage } from '../lib/api';
import type { Image } from '../types';
import { REJECTION_LABELS } from '../types';

interface Props {
  image: Image;
}

export function ImageCard({ image }: Props) {
  const queryClient = useQueryClient();
  const [imgError, setImgError] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => deleteImage(image.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] });
    },
  });

  const statusIcon = {
    PENDING: <Loader2 className="w-4 h-4 animate-spin text-amber-500" />,
    ACCEPTED: <CheckCircle className="w-4 h-4 text-emerald-500" />,
    REJECTED: <XCircle className="w-4 h-4 text-red-500" />,
  }[image.status];

  const statusLabel = {
    PENDING: 'Processing',
    ACCEPTED: 'Accepted',
    REJECTED: 'Rejected',
  }[image.status];

  const statusBg = {
    PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
    ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    REJECTED: 'bg-red-50 text-red-700 border-red-200',
  }[image.status];

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
      {/* Thumbnail */}
      <div className="relative aspect-square bg-slate-100 overflow-hidden">
        {image.signedUrl && !imgError ? (
          <img
            src={image.signedUrl}
            alt={image.originalName}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-300">
            <span className="text-3xl">🖼</span>
          </div>
        )}

        {/* Delete button */}
        <button
          onClick={() => deleteMutation.mutate()}
          disabled={deleteMutation.isPending}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-lg p-1.5 shadow-sm"
          title="Delete image"
        >
          {deleteMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-slate-700 text-sm font-medium truncate" title={image.originalName}>
          {image.originalName}
        </p>

        <div className={`mt-2 inline-flex items-center gap-1.5 text-xs font-medium border rounded-full px-2 py-0.5 ${statusBg}`}>
          {statusIcon}
          {statusLabel}
        </div>

        {image.width && image.height && (
          <p className="mt-1 text-xs text-slate-400">
            {image.width}×{image.height} · {(image.fileSizeBytes / 1024).toFixed(0)}KB
          </p>
        )}

        {/* Rejection reasons */}
        {image.rejectionReasons.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {image.rejectionReasons.map((r) => (
              <li key={r} className="text-xs text-red-600 flex items-start gap-1">
                <span className="mt-0.5">•</span>
                <span>{REJECTION_LABELS[r] ?? r}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
