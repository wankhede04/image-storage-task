import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, ImageIcon, AlertCircle, Loader2 } from 'lucide-react';
import { useUpload } from '../hooks/useUpload';

export function DropZone() {
  const { upload, state, progress, error, reset } = useUpload();
  const [previews, setPreviews] = useState<string[]>([]);

  const onDrop = useCallback(
    async (accepted: File[], rejected: { file: File; errors: { message: string }[] }[]) => {
      if (rejected.length > 0) {
        // react-dropzone already filtered by accept — show first rejection reason
        return;
      }

      for (const file of accepted) {
        const url = URL.createObjectURL(file);
        setPreviews((p) => [...p, url]);
        await upload(file);
      }
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

  const isLoading = state === 'uploading' || state === 'validating';
  const rejectionMsg = fileRejections[0]?.errors[0]?.message;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        {...getRootProps()}
        className={[
          'relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200',
          isDragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50',
          isLoading ? 'pointer-events-none opacity-70' : '',
        ].join(' ')}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center gap-3">
          {isLoading ? (
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          ) : isDragActive ? (
            <ImageIcon className="w-10 h-10 text-blue-500" />
          ) : (
            <Upload className="w-10 h-10 text-slate-400" />
          )}

          <div>
            <p className="text-slate-700 font-medium">
              {isDragActive
                ? 'Drop images here'
                : isLoading
                  ? `Uploading... ${progress}%`
                  : 'Drag & drop images here'}
            </p>
            <p className="text-slate-400 text-sm mt-1">
              or <span className="text-blue-500 font-medium">browse</span> · JPEG, PNG, HEIC
            </p>
          </div>

          {isLoading && (
            <div className="w-full bg-slate-100 rounded-full h-1.5 max-w-xs">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {(error || rejectionMsg) && (
        <div className="mt-3 flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span onClick={reset} className="cursor-pointer">
            {error ?? rejectionMsg} — <span className="underline">dismiss</span>
          </span>
        </div>
      )}
    </div>
  );
}
