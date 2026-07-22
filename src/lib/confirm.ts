// Promise-based confirm / prompt dialogs — pair with components/ConfirmRoot.tsx.

import { useEffect, useState } from 'react';

export interface ConfirmRequest {
  id: string;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When present, the dialog shows a text field and resolves its value. */
  input?: { placeholder?: string; defaultValue?: string; label?: string };
  /** boolean for confirm dialogs; string|null for prompt dialogs. */
  resolve: (result: boolean | string | null) => void;
}

type Listener = (queue: ConfirmRequest[]) => void;
const listeners = new Set<Listener>();
let queue: ConfirmRequest[] = [];

function emit() {
  for (const l of listeners) l(queue);
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function confirmDialog(options: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [
      ...queue,
      { id: genId(), resolve: (r) => resolve(r === true), ...options },
    ];
    emit();
  });
}

/** Text-input dialog. Resolves the trimmed value, or null if cancelled. */
export function promptDialog(options: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
  defaultValue?: string;
  label?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    queue = [
      ...queue,
      {
        id: genId(),
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel,
        input: {
          placeholder: options.placeholder,
          defaultValue: options.defaultValue,
          label: options.label,
        },
        resolve: (r) => resolve(typeof r === 'string' ? r : null),
      },
    ];
    emit();
  });
}

export function resolveConfirm(id: string, result: boolean | string | null) {
  const item = queue.find((q) => q.id === id);
  if (!item) return;
  item.resolve(result);
  queue = queue.filter((q) => q.id !== id);
  emit();
}

export function useConfirmQueue(): ConfirmRequest[] {
  const [state, setState] = useState<ConfirmRequest[]>(queue);
  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}
