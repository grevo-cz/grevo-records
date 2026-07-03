import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useToasts, dismiss, type Toast } from '../lib/toast';

const ICONS: Record<Toast['kind'], React.ReactNode> = {
  success: <CheckCircle2 className="w-5 h-5 text-success" />,
  error: <AlertCircle className="w-5 h-5 text-danger" />,
  warning: <AlertTriangle className="w-5 h-5 text-accent" />,
  info: <Info className="w-5 h-5 text-accent" />,
};

const RING: Record<Toast['kind'], string> = {
  success: 'border-success/40',
  error: 'border-danger/40',
  warning: 'border-accent/40',
  info: 'border-accent/40',
};

export function Toaster() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto card border ${RING[t.kind]} bg-bg-card/95 backdrop-blur-xl px-4 py-3 shadow-2xl animate-fade-in flex items-start gap-3`}
        >
          <div className="shrink-0 mt-0.5">{ICONS[t.kind]}</div>
          <div className="flex-1 min-w-0">
            {t.title && (
              <div className="font-medium text-sm mb-0.5">{t.title}</div>
            )}
            <div className="text-sm text-text-secondary break-words">
              {t.message}
            </div>
          </div>
          <button
            onClick={() => dismiss(t.id)}
            className="shrink-0 text-text-muted hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
