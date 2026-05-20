import { useEffect } from 'react';
import { AlertOctagon, HelpCircle } from 'lucide-react';
import { useConfirmQueue, resolveConfirm } from '../lib/confirm';

export function ConfirmRoot() {
  const queue = useConfirmQueue();
  const top = queue[0];

  // Esc to cancel
  useEffect(() => {
    if (!top) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolveConfirm(top.id, false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        resolveConfirm(top.id, true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [top]);

  if (!top) return null;

  const danger = !!top.danger;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-6"
      onClick={() => resolveConfirm(top.id, false)}
    >
      <div
        className="card p-6 max-w-md w-full animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div
            className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
              danger ? 'bg-danger/15 text-danger' : 'bg-accent-subtle text-accent'
            }`}
          >
            {danger ? <AlertOctagon className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold mb-1">{top.title}</h2>
            {top.message && (
              <p className="text-sm text-text-secondary break-words">
                {top.message}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            onClick={() => resolveConfirm(top.id, false)}
            className="btn-secondary"
          >
            {top.cancelLabel || 'Zrušit'}
          </button>
          <button
            onClick={() => resolveConfirm(top.id, true)}
            className={danger ? 'btn-danger' : 'btn-primary'}
            autoFocus
          >
            {top.confirmLabel || (danger ? 'Smazat' : 'OK')}
          </button>
        </div>
      </div>
    </div>
  );
}
