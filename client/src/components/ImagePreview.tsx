import { useEffect } from 'react';
import type { Image } from '../types';
import { REJECTION_LABELS } from '../types';

interface Props {
  image: Image;
  onClose: () => void;
}

const STATUS_STYLE = {
  PENDING:  { bg: '#fff7ed', color: '#c2410c', label: 'Processing' },
  ACCEPTED: { bg: '#f0fdf4', color: '#15803d', label: 'Accepted' },
  REJECTED: { bg: '#fef2f2', color: '#b91c1c', label: 'Rejected' },
} as const;

export function ImagePreview({ image, onClose }: Props) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const st = STATUS_STYLE[image.status];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 16,
          overflow: 'hidden',
          maxWidth: 860,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid #e4e4e7',
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              margin: 0, fontSize: 14, fontWeight: 600, color: '#18181b',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {image.originalName}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#a1a1aa' }}>
              {image.width && image.height ? `${image.width}×${image.height} · ` : ''}
              {(image.fileSizeBytes / 1024).toFixed(0)} KB · {image.format.toUpperCase()}
            </p>
          </div>

          <span style={{
            fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
            background: st.bg, color: st.color, letterSpacing: '0.04em', flexShrink: 0,
          }}>
            {st.label.toUpperCase()}
          </span>

          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid #e4e4e7',
              background: '#fafafa', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {/* Image */}
          <div style={{
            flex: 1, background: '#f4f4f5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', minWidth: 0,
          }}>
            {image.signedUrl ? (
              <img
                src={image.signedUrl}
                alt={image.originalName}
                style={{
                  maxWidth: '100%', maxHeight: '70vh',
                  objectFit: 'contain', display: 'block',
                }}
              />
            ) : (
              <div style={{ textAlign: 'center', color: '#a1a1aa', padding: 40 }}>
                {image.status === 'PENDING' ? (
                  <>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round"
                      style={{ animation: 'spin 0.9s linear infinite', margin: '0 auto 12px', display: 'block' }}>
                      <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                    <p style={{ margin: 0, fontSize: 13 }}>Processing…</p>
                  </>
                ) : (
                  <p style={{ margin: 0, fontSize: 13 }}>Preview unavailable</p>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div style={{
            width: 240, borderLeft: '1px solid #e4e4e7',
            padding: '20px 18px', overflowY: 'auto', flexShrink: 0,
          }}>
            <Section title="Details">
              <Row label="Status">
                <span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span>
              </Row>
              {image.width && image.height && (
                <Row label="Dimensions">{image.width}×{image.height}px</Row>
              )}
              <Row label="File size">{(image.fileSizeBytes / 1024).toFixed(1)} KB</Row>
              <Row label="Format">{image.format.toUpperCase()}</Row>
              <Row label="Uploaded">
                {new Date(image.createdAt).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </Row>
            </Section>

            {image.rejectionReasons.length > 0 && (
              <Section title="Rejection Reasons">
                {image.rejectionReasons.map((r) => (
                  <div key={r} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 7,
                    padding: '6px 0',
                    borderBottom: '1px solid #f4f4f5',
                  }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: '#fef2f2', color: '#ef4444',
                      fontSize: 9, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, marginTop: 1,
                    }}>✕</span>
                    <span style={{ fontSize: 12, color: '#3f3f46', lineHeight: 1.5 }}>
                      {REJECTION_LABELS[r] ?? r}
                    </span>
                  </div>
                ))}
              </Section>
            )}

            {image.status === 'ACCEPTED' && (
              <Section title="Validation">
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#16a34a', fontSize: 12 }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: '#f0fdf4', color: '#16a34a',
                    fontSize: 9, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>✓</span>
                  Passed all checks
                </div>
              </Section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{
        margin: '0 0 10px', fontSize: 10, fontWeight: 700,
        color: '#a1a1aa', letterSpacing: '0.07em',
      }}>
        {title.toUpperCase()}
      </p>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '5px 0', borderBottom: '1px solid #f4f4f5', gap: 8,
    }}>
      <span style={{ fontSize: 12, color: '#a1a1aa', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: '#18181b', fontWeight: 500, textAlign: 'right' }}>{children}</span>
    </div>
  );
}
