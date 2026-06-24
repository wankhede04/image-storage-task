import { createContext, useContext, useState, useCallback, useRef } from 'react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  leaving?: boolean;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const TYPE_STYLES: Record<ToastType, { bar: string; icon: string; label: string }> = {
  success: { bar: '#16a34a', icon: '✓', label: '#16a34a' },
  error: { bar: '#ef4444', icon: '✕', label: '#ef4444' },
  info: { bar: '#f97316', icon: 'ℹ', label: '#f97316' },
};

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const s = TYPE_STYLES[item.type];

  return (
    <div
      onClick={onDismiss}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        minWidth: 280,
        maxWidth: 360,
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        padding: '12px 14px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        cursor: 'pointer',
        animation: item.leaving ? 'toast-out 0.2s ease forwards' : 'toast-in 0.2s ease',
        borderLeft: `3px solid ${s.bar}`,
      }}
    >
      <span style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: s.bar,
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        marginTop: 1,
      }}>
        {s.icon}
      </span>
      <span style={{ fontSize: 13, fontWeight: 500, color: '#374151', lineHeight: 1.5 }}>
        {item.message}
      </span>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
    const timer = setTimeout(() => dismiss(id), 4500);
    timers.current.set(id, timer);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}>
        {toasts.map((item) => (
          <div key={item.id} style={{ pointerEvents: 'all' }}>
            <Toast item={item} onDismiss={() => dismiss(item.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
