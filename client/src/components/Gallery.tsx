import { useQuery } from '@tanstack/react-query';
import { ImageCard } from './ImageCard';
import { fetchImages } from '../lib/api';
import type { Image } from '../types';
import { Loader2, ImageOff } from 'lucide-react';

function Section({
  title,
  images,
  accent,
}: {
  title: string;
  images: Image[];
  accent: string;
}) {
  return (
    <div className="w-full">
      <div className={`flex items-center gap-2 mb-4`}>
        <h2 className={`text-lg font-semibold ${accent}`}>{title}</h2>
        <span className="text-sm text-slate-400 font-normal">({images.length})</span>
      </div>

      {images.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-300 border-2 border-dashed border-slate-200 rounded-2xl">
          <ImageOff className="w-8 h-8 mb-2" />
          <p className="text-sm">No images yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {images.map((img) => (
            <ImageCard key={img.id} image={img} />
          ))}
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

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-16 text-red-500">
        Failed to load images. Is the server running?
      </div>
    );
  }

  const images = data?.data ?? [];
  const pending = images.filter((i) => i.status === 'PENDING');
  const accepted = images.filter((i) => i.status === 'ACCEPTED');
  const rejected = images.filter((i) => i.status === 'REJECTED');

  return (
    <div className="w-full space-y-10">
      {pending.length > 0 && (
        <Section title="Processing" images={pending} accent="text-amber-600" />
      )}
      <Section title="Accepted" images={accepted} accent="text-emerald-600" />
      <Section title="Rejected" images={rejected} accent="text-red-600" />
    </div>
  );
}
