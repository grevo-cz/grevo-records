// Promise-based confirm dialog — pairs with components/ConfirmRoot.tsx.

import { useEffect, useState } from 'react';

export interface ConfirmRequest {
  id: string;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
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
    queue = [...queue, { id: genId(), resolve, ...options }];
    emit();
  });
}

export function resolveConfirm(id: string, ok: boolean) {
  const item = queue.find((q) => q.id === id);
  if (!item) return;
  item.resolve(ok);
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
