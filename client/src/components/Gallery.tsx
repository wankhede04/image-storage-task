import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImageCard } from './ImageCard';
import { fetchImages } from '../lib/api';
import type { Image } from '../types';

function AcceptedGrid({ images }: { images: Image[] }) {
  if (images.length === 0) {
    return (
      <div style={{
        padding: '52px 24px',
        textAlign: 'center',
        border: '2px dashed #e4e4e7',
        borderRadius: 10,
        color: '#a1a1aa',
        fontSize: 13,
      }}>
        Accepted photos will appear here
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))',
      gap: 10,
    }}>
      {images.map((img, i) => (
        <ImageCard key={img.id} image={img} variant="accepted" index={i} />
      ))}
    </div>
  );
}

function RejectedSection({ images }: { images: Image[] }) {
  const [open, setOpen] = useState(true);
  if (images.length === 0) return null;

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 12,
      border: '1px solid #e4e4e7',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'none', border: 'none', cursor: 'pointer',
          borderBottom: open ? '1px solid #f4f4f5' : 'none',
        }}
      >
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: '#fef2f2',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>
            Some Photos Didn't Meet Our Guidelines
          </div>
          <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 1 }}>
            {images.length} photo{images.length !== 1 ? 's' : ''} removed · Replacing these is optional
          </div>
        </div>
        <svg
          width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', flexShrink: 0 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{ padding: 16 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))',
            gap: 10,
          }}>
            {images.map((img) => (
              <ImageCard key={img.id} image={img} variant="rejected" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PendingBanner({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 16px',
      background: '#fff7ed',
      border: '1px solid #fed7aa',
      borderRadius: 10,
    }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round"
        style={{ animation: 'spin 0.9s linear infinite', flexShrink: 0 }}>
        <path d="M12 2a10 10 0 0 1 10 10" />
      </svg>
      <span style={{ fontSize: 13, color: '#92400e', fontWeight: 500 }}>
        Validating {count} image{count !== 1 ? 's' : ''}…
      </span>
    </div>
  );
}

const REQUIREMENTS = [
  { icon: '👤', label: 'Exactly one face visible', pass: true },
  { icon: '📐', label: 'Minimum 500×500 resolution', pass: true },
  { icon: '📁', label: 'JPEG, PNG, or HEIC format', pass: true },
  { icon: '🔍', label: 'Clear, in-focus image', pass: true },
  { icon: '💾', label: 'File size at least 50 KB', pass: true },
  { icon: '🚫', label: 'No duplicates or near-identical photos', pass: true },
];

function PhotoRequirements() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 12,
      border: '1px solid #e4e4e7',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'none', border: 'none', cursor: 'pointer',
          borderBottom: open ? '1px solid #f4f4f5' : 'none',
        }}
      >
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: '#f0fdf4',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <span style={{ flex: 1, textAlign: 'left', fontSize: 14, fontWeight: 600, color: '#18181b' }}>
          Photo Requirements
        </span>
        <svg
          width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', flexShrink: 0 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{ padding: '12px 18px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {REQUIREMENTS.map((r) => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 15 }}>{r.icon}</span>
                <span style={{ fontSize: 13, color: '#3f3f46' }}>{r.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Gallery() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['images'],
    queryFn: () => fetchImages(),
    refetchInterval: false,
    staleTime: 1000 * 30,
  });

  const images = data?.data ?? [];
  const pending = images.filter((i) => i.status === 'PENDING');
  const accepted = images.filter((i) => i.status === 'ACCEPTED');
  const rejected = images.filter((i) => i.status === 'REJECTED');
  const done = accepted.length + rejected.length;
  const total = images.length;

  if (isError) {
    return (
      <div style={{
        padding: '40px', textAlign: 'center',
        background: '#fff', borderRadius: 12, border: '1px solid #e4e4e7',
        color: '#ef4444', fontSize: 14,
      }}>
        Failed to load images. Is the server running?
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header bar */}
      <div style={{
        background: '#ffffff', borderRadius: 12,
        border: '1px solid #e4e4e7', padding: '14px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#18181b', letterSpacing: '-0.02em' }}>
          Uploaded Images
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {total > 0 && (
            <span style={{ fontSize: 13, color: '#71717a', fontWeight: 500 }}>
              {done} of {total}
            </span>
          )}
          {isLoading && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round"
              style={{ animation: 'spin 0.9s linear infinite' }}>
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          )}
          {total > 0 && (
            <div style={{ display: 'flex', gap: 10 }}>
              <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                {accepted.length} accepted
              </span>
              {rejected.length > 0 && (
                <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
                  {rejected.length} rejected
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Accepted images */}
      <div style={{
        background: '#ffffff', borderRadius: 12,
        border: '1px solid #e4e4e7', padding: 16,
      }}>
        <AcceptedGrid images={accepted} />
      </div>

      {/* Pending */}
      <PendingBanner count={pending.length} />

      {/* Rejected */}
      <RejectedSection images={rejected} />

      {/* Photo requirements */}
      <PhotoRequirements />
    </div>
  );
}
