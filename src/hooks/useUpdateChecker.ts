import { useEffect, useState } from 'react';
import { BUILD_SHA } from '../lib/version';

interface State {
  latestSha: string | null;
  hasUpdate: boolean;
  lastCheck: number;
}

const INITIAL: State = { latestSha: null, hasUpdate: false, lastCheck: 0 };

async function fetchLatestSha(): Promise<string | null> {
  try {
    const res = await fetch(`./?v=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/<meta\s+name="build-sha"\s+content="([^"]+)"/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Periodically polls the deployed index.html for a different build SHA than
 * the one bundled into the running JS. When detected, returns hasUpdate=true
 * so the UI can offer a refresh.
 */
export function useUpdateChecker(pollIntervalMs: number = 60_000): State {
  const [state, setState] = useState<State>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const check = async () => {
      const latest = await fetchLatestSha();
      if (cancelled) return;
      setState({
        latestSha: latest,
        hasUpdate: !!latest && latest !== BUILD_SHA && BUILD_SHA !== 'dev',
        lastCheck: Date.now(),
      });
    };

    // Initial check after a short delay so we don't race with the app load
    timer = window.setTimeout(check, 5000);

    const intervalId = window.setInterval(check, pollIntervalMs);

    // Re-check on focus (user came back to the tab)
    const onFocus = () => {
      check();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, [pollIntervalMs]);

  return state;
}
