// Lightweight toast bus — components subscribe via useToasts() hook.
// No external library; we ship our own renderer in components/Toaster.tsx.

import { useEffect, useState } from 'react';

export type ToastKind = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
  id: string;
  kind: ToastKind;
  title?: string;
  message: string;
  /** ms before auto-dismiss; 0 means persistent until dismissed by user. */
  duration: number;
}

type Listener = (toasts: Toast[]) => void;
const listeners = new Set<Listener>();
let toasts: Toast[] = [];

function emit() {
  for (const l of listeners) l(toasts);
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function add(input: Omit<Toast, 'id'>): string {
  const id = genId();
  const toast: Toast = { id, ...input };
  toasts = [...toasts, toast];
  emit();
  if (toast.duration > 0) {
    setTimeout(() => dismiss(id), toast.duration);
  }
  return id;
}

export function dismiss(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  info(message: string, opts: { title?: string; duration?: number } = {}) {
    return add({
      kind: 'info',
      message,
      title: opts.title,
      duration: opts.duration ?? 3500,
    });
  },
  success(message: string, opts: { title?: string; duration?: number } = {}) {
    return add({
      kind: 'success',
      message,
      title: opts.title,
      duration: opts.duration ?? 3500,
    });
  },
  error(message: string, opts: { title?: string; duration?: number } = {}) {
    return add({
      kind: 'error',
      message,
      title: opts.title,
      duration: opts.duration ?? 6000,
    });
  },
  warning(message: string, opts: { title?: string; duration?: number } = {}) {
    return add({
      kind: 'warning',
      message,
      title: opts.title,
      duration: opts.duration ?? 5000,
    });
  },
};

export function useToasts(): Toast[] {
  const [state, setState] = useState<Toast[]>(toasts);
  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}
