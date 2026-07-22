import { useEffect, useState } from 'react';
import { AlertOctagon, HelpCircle, Pencil } from 'lucide-react';
import { useConfirmQueue, resolveConfirm } from '../lib/confirm';

export function ConfirmRoot() {
  const queue = useConfirmQueue();
  const top = queue[0];
  const isPrompt = !!top?.input;
  const [value, setValue] = useState('');

  // Reset the field whenever a new prompt reaches the top of the queue.
  useEffect(() => {
    if (top?.input) setValue(top.input.defaultValue ?? '');
  }, [top?.id]);

  // Esc to cancel, Enter to confirm (prompts submit the current value).
  useEffect(() => {
    if (!top) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolveConfirm(top.id, isPrompt ? null : false);
      } else if (e.key === 'Enter' && !isPrompt) {
        e.preventDefault();
        resolveConfirm(top.id, true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [top, isPrompt]);

  if (!top) return null;

  const danger = !!top.danger;
  const cancelResult = isPrompt ? null : false;
  const submitPrompt = () => {
    const v = value.trim();
    if (!v) return;
    resolveConfirm(top.id, v);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-6"
      onClick={() => resolveConfirm(top.id, cancelResult)}
    >
      <div
        className="card p-6 max-w-md w-full animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div
            className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
              danger
                ? 'bg-danger/15 text-danger'
                : 'bg-accent-subtle text-accent'
            }`}
          >
            {danger ? (
              <AlertOctagon className="w-5 h-5" />
            ) : isPrompt ? (
              <Pencil className="w-5 h-5" />
            ) : (
              <HelpCircle className="w-5 h-5" />
            )}
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

        {isPrompt && (
          <div className="mt-4">
            {top.input?.label && (
              <label className="block text-sm font-medium mb-1.5">
                {top.input.label}
              </label>
            )}
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitPrompt();
                }
              }}
              placeholder={top.input?.placeholder}
              className="input w-full"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            onClick={() => resolveConfirm(top.id, cancelResult)}
            className="btn-secondary"
          >
            {top.cancelLabel || 'Zrušit'}
          </button>
          <button
            onClick={() =>
              isPrompt ? submitPrompt() : resolveConfirm(top.id, true)
            }
            disabled={isPrompt && !value.trim()}
            className={danger ? 'btn-danger' : 'btn-primary'}
            autoFocus={!isPrompt}
          >
            {top.confirmLabel || (danger ? 'Smazat' : 'OK')}
          </button>
        </div>
      </div>
    </div>
  );
}
