import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteImage } from '../lib/api';
import { useToast } from './Toast';
import { ImagePreview } from './ImagePreview';
import type { Image } from '../types';
import { REJECTION_LABELS } from '../types';

interface Props {
  image: Image;
  variant?: 'accepted' | 'rejected' | 'pending';
  index?: number;
}

export function ImageCard({ image, variant = 'accepted', index }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [imgError, setImgError] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => deleteImage(image.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['images'] }),
    onError: () => toast('Failed to delete image. Please try again.', 'error'),
  });

  const isPending = image.status === 'PENDING';

  const imageEl = image.signedUrl && !imgError ? (
    <img
      src={image.signedUrl}
      alt={image.originalName}
      style={{
        width: '100%', height: '100%', objectFit: 'cover', display: 'block',
        filter: variant === 'rejected' ? 'brightness(0.6) saturate(0.7)' : 'none',
      }}
      onError={() => setImgError(true)}
    />
  ) : (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {isPending ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round"
          style={{ animation: 'spin 0.9s linear infinite' }}>
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d4d4d8" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      )}
    </div>
  );

  const thumbnailBox = (
    <div
      onClick={() => setPreviewOpen(true)}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        borderRadius: variant === 'rejected' ? '10px 10px 0 0' : 10,
        overflow: 'hidden',
        background: '#e4e4e7',
        cursor: 'pointer',
      }}
    >
      {imageEl}

      {/* Click-to-preview hint on hover */}
      {hovered && image.signedUrl && !isPending && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            background: 'rgba(255,255,255,0.9)',
            borderRadius: 8, padding: '5px 10px',
            fontSize: 11, fontWeight: 600, color: '#18181b',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            Preview
          </div>
        </div>
      )}

      {/* Position badge */}
      {variant === 'accepted' && typeof index === 'number' && (
        <div style={{
          position: 'absolute', top: 7, left: 7,
          width: 20, height: 20, borderRadius: '50%',
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{index + 1}</span>
        </div>
      )}

      {/* Processing spinner overlay */}
      {isPending && image.signedUrl && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round"
            style={{ animation: 'spin 0.9s linear infinite' }}>
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
        </div>
      )}

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(); }}
        disabled={deleteMutation.isPending}
        title="Remove"
        style={{
          position: 'absolute', top: 7, right: 7,
          width: 24, height: 24, borderRadius: '50%',
          background: 'rgba(255,255,255,0.9)', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          color: '#52525b',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.9)'; e.currentTarget.style.color = '#52525b'; }}
      >
        {deleteMutation.isPending ? (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            style={{ animation: 'spin 0.9s linear infinite' }}>
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
        ) : (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
      </button>

      {/* Dimensions on accepted hover */}
      {variant === 'accepted' && image.width && image.height && hovered && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.55))',
          padding: '20px 8px 8px', pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
            {image.width}×{image.height}
          </span>
        </div>
      )}
    </div>
  );

  if (variant === 'rejected') {
    return (
      <>
        {previewOpen && <ImagePreview image={image} onClose={() => setPreviewOpen(false)} />}
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            borderRadius: 10, overflow: 'hidden',
            border: '1.5px solid #fecaca', background: '#fff',
            boxShadow: hovered ? '0 4px 14px rgba(239,68,68,0.12)' : '0 1px 3px rgba(0,0,0,0.05)',
            transition: 'box-shadow 0.15s ease',
          }}
        >
          {thumbnailBox}
          <div style={{ padding: '8px 10px 10px' }}>
            <p style={{
              margin: '0 0 5px', fontSize: 11, fontWeight: 600, color: '#71717a',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }} title={image.originalName}>
              {image.originalName}
            </p>
            {image.rejectionReasons.map((r) => (
              <div key={r} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 4 }}>
                <span style={{ color: '#ef4444', fontSize: 10, marginTop: 1, flexShrink: 0 }}>✕</span>
                <span style={{ fontSize: 11, color: '#ef4444', lineHeight: 1.4 }}>
                  {REJECTION_LABELS[r] ?? r}
                </span>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {previewOpen && <ImagePreview image={image} onClose={() => setPreviewOpen(false)} />}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          borderRadius: 10, overflow: 'hidden',
          boxShadow: hovered ? '0 6px 20px rgba(0,0,0,0.12)' : '0 1px 4px rgba(0,0,0,0.06)',
          transform: hovered ? 'translateY(-1px)' : 'none',
          transition: 'box-shadow 0.15s ease, transform 0.15s ease',
        }}
      >
        {thumbnailBox}
      </div>
    </>
  );
}
