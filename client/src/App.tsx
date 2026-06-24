import './index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DropZone } from './components/DropZone';
import { Gallery } from './components/Gallery';
import { useSSE } from './hooks/useSSE';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 1000 * 30 },
  },
});

function AppInner() {
  useSSE();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
            Aragon Image Uploader
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Upload portraits · Accepted &amp; Rejected automatically
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-10">
        <section>
          <DropZone />
        </section>

        <section>
          <Gallery />
        </section>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}
