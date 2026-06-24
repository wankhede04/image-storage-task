import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useUpload } from '../hooks/useUpload';
import { useQuery } from '@tanstack/react-query';
import { fetchImages } from '../lib/api';

function FileStatusIcon({ status }: { status: 'PENDING' | 'ACCEPTED' | 'REJECTED' }) {
  if (status === 'ACCEPTED') {
    return (
      <span style={{
        width: 18, height: 18, borderRadius: '50%',
        background: '#dcfce7', color: '#16a34a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700, flexShrink: 0,
      }}>✓</span>
    );
  }
  if (status === 'REJECTED') {
    return (
      <span style={{
        width: 18, height: 18, borderRadius: '50%',
        background: '#fee2e2', color: '#ef4444',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700, flexShrink: 0,
      }}>✕</span>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: 'spin 0.9s linear infinite', flexShrink: 0 }}>
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

export function DropZone() {
  const { upload, state, progress, error, reset } = useUpload();
  const { data } = useQuery({ queryKey: ['images'], queryFn: fetchImages, staleTime: 1000 * 30 });

  const recentFiles = (data?.data ?? []).slice(0, 14);

  const onDrop = useCallback(
    async (accepted: File[], rejected: { file: File; errors: { message: string }[] }[]) => {
      if (rejected.length > 0) return;
      for (const file of accepted) await upload(file);
    },
    [upload],
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/heic': ['.heic'],
      'image/heif': ['.heif'],
    },
    multiple: true,
    disabled: state === 'uploading',
  });

  const isUploading = state === 'uploading';
  const rejectionMsg = fileRejections[0]?.errors[0]?.message;

  return (
    <div>
      <div style={{ padding: '20px 16px 16px' }}>
        {/* Instructional copy */}
        <p style={{
          margin: '0 0 14px',
          fontSize: 12,
          color: '#71717a',
          lineHeight: 1.6,
        }}>
          Upload a mix of <strong style={{ color: '#3f3f46', fontWeight: 600 }}>close-ups, selfies and mid-range shots</strong> so the AI can better capture your face and body type.
        </p>

        {/* Drop zone */}
        <div
          {...getRootProps()}
          style={{
            border: `1.5px dashed ${isDragActive ? '#f97316' : '#d4d4d8'}`,
            borderRadius: 10,
            padding: isDragActive ? '20px 14px' : '12px 14px',
            marginBottom: 10,
            cursor: isUploading ? 'not-allowed' : 'pointer',
            background: isDragActive ? '#fff7ed' : '#fafafa',
            transition: 'all 0.15s ease',
            textAlign: 'center',
          }}
        >
          <input {...getInputProps()} />

          {/* Upload button inside zone */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            background: isUploading || isDragActive ? 'transparent' : '#f97316',
            color: isUploading || isDragActive ? '#f97316' : '#fff',
            border: isUploading || isDragActive ? '1.5px solid #f97316' : '1.5px solid transparent',
            borderRadius: 7,
            padding: '7px 14px',
            fontSize: 13,
            fontWeight: 600,
            marginBottom: isDragActive ? 0 : 10,
            transition: 'all 0.15s ease',
          }}>
            {isUploading ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.9s linear infinite' }}>
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            )}
            {isUploading ? `Uploading${progress > 0 ? ` ${progress}%` : '…'}` : isDragActive ? 'Drop to upload' : 'Upload Files'}
          </div>

          {!isDragActive && (
            <p style={{ margin: 0, fontSize: 11, color: '#a1a1aa' }}>
              Click to upload or drag and drop<br />
              <span style={{ color: '#d4d4d8' }}>PNG, JPG, HEIC up to 20MB</span>
            </p>
          )}

          {isUploading && progress > 0 && (
            <div style={{ marginTop: 8, height: 2, background: '#fed7aa', borderRadius: 1, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${progress}%`,
                background: '#f97316', transition: 'width 0.2s ease',
              }} />
            </div>
          )}
        </div>

        <p style={{ margin: '0 0 4px', fontSize: 11, color: '#a1a1aa', textAlign: 'center' }}>
          It can take up to 1 minute to validate
        </p>

        {/* Error */}
        {(error || rejectionMsg) && (
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 8,
            background: '#fef2f2', border: '1px solid #fecaca',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 12, color: '#ef4444', flex: 1 }}>{error ?? rejectionMsg}</span>
            <button onClick={reset} style={{
              background: 'none', border: 'none', color: '#fca5a5',
              cursor: 'pointer', fontSize: 11, padding: 0, fontFamily: 'inherit',
            }}>✕</button>
          </div>
        )}
      </div>

      {/* File list */}
      {recentFiles.length > 0 && (
        <div style={{ borderTop: '1px solid #f4f4f5' }}>
          <div style={{
            padding: '8px 16px 4px',
            fontSize: 10, fontWeight: 700,
            color: '#a1a1aa', letterSpacing: '0.07em',
          }}>
            UPLOADS
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {recentFiles.map((img) => (
              <div
                key={img.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '6px 16px',
                  borderBottom: '1px solid #f4f4f5',
                }}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: 5,
                  background: '#f4f4f5', flexShrink: 0,
                  overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="1.5" strokeLinecap="round">
                    <rect x="4" y="2" width="16" height="20" rx="2" />
                    <path d="M8 10h8M8 14h5" />
                  </svg>
                </div>
                <span style={{
                  flex: 1, fontSize: 12, color: '#3f3f46',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {img.originalName}
                </span>
                <FileStatusIcon status={img.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
