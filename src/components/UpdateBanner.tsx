import { useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { useUpdateChecker } from '../hooks/useUpdateChecker';
import { BUILD_SHA } from '../lib/version';

export function UpdateBanner() {
  const { hasUpdate, latestSha } = useUpdateChecker(60_000);
  const [dismissed, setDismissed] = useState(false);

  if (!hasUpdate || dismissed) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[90] animate-fade-in">
      <div className="flex items-center gap-3 bg-accent text-white rounded-full pl-4 pr-2 py-2 shadow-glow border border-accent-hover">
        <Sparkles className="w-4 h-4" />
        <div className="text-sm">
          Nová verze připravena{' '}
          <span className="font-mono text-xs opacity-70">
            ({BUILD_SHA} → {latestSha})
          </span>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="bg-white/20 hover:bg-white/30 text-white text-xs font-medium px-3 py-1 rounded-full inline-flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-white/70 hover:text-white px-2"
          title="Skrýt"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
