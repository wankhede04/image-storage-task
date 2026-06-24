import './index.css';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { DropZone } from './components/DropZone';
import { Gallery } from './components/Gallery';
import { ToastProvider } from './components/Toast';
import { useSSE } from './hooks/useSSE';
import { fetchImages } from './lib/api';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 * 30 } },
});

// Aragon.ai logo reproduced as SVG
function AragonLogo() {
  return (
    <svg width="110" height="24" viewBox="0 0 110 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Flame / leaf mark */}
      <path
        d="M11 2C8 5.5 6 8.5 6 11.5C6 15.09 8.24 18 11 18C13.76 18 16 15.09 16 11.5C16 8.5 14 5.5 11 2Z"
        fill="#F97316"
      />
      <path
        d="M11 8C9.5 10 9 11.5 9 12.5C9 14.43 9.9 16 11 16C12.1 16 13 14.43 13 12.5C13 11.5 12.5 10 11 8Z"
        fill="white"
        fillOpacity="0.7"
      />
      {/* Wordmark */}
      <text
        x="22"
        y="16"
        fontFamily="'Plus Jakarta Sans', sans-serif"
        fontWeight="700"
        fontSize="15"
        fill="#18181b"
        letterSpacing="-0.4"
      >
        Aragon.ai
      </text>
    </svg>
  );
}

function ProgressBar() {
  const { data } = useQuery({
    queryKey: ['images'],
    queryFn: () => fetchImages(),
    staleTime: 1000 * 30,
  });

  const images = data?.data ?? [];
  const total = images.length;
  const done = images.filter((i) => i.status === 'ACCEPTED' || i.status === 'REJECTED').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  if (total === 0) return <div style={{ height: 3, background: '#f4f4f5' }} />;

  return (
    <div style={{ height: 3, background: '#f4f4f5', position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, height: '100%',
        width: `${pct}%`,
        background: 'linear-gradient(90deg, #f97316 0%, #fb923c 100%)',
        transition: 'width 0.5s ease',
      }} />
    </div>
  );
}

function AppInner() {
  useSSE();

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f5' }}>
      {/* Header */}
      <header style={{
        background: '#ffffff',
        borderBottom: '1px solid #e4e4e7',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <div style={{
          maxWidth: 1280, margin: '0 auto',
          padding: '0 24px', height: 54,
          display: 'flex', alignItems: 'center',
        }}>
          <AragonLogo />
        </div>
        <ProgressBar />
      </header>

      {/* Two-column layout */}
      <div style={{
        maxWidth: 1280,
        margin: '0 auto',
        padding: '24px',
        display: 'grid',
        gridTemplateColumns: '268px 1fr',
        gap: 20,
        alignItems: 'start',
      }}>
        {/* Left: upload panel */}
        <div style={{
          position: 'sticky',
          top: 78,
          background: '#ffffff',
          borderRadius: 12,
          border: '1px solid #e4e4e7',
          overflow: 'hidden',
        }}>
          <DropZone />
        </div>

        {/* Right: gallery */}
        <Gallery />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AppInner />
      </ToastProvider>
    </QueryClientProvider>
  );
}
