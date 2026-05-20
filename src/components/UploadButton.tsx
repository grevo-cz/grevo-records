import { useEffect, useState } from 'react';
import { Cloud, UploadCloud, Loader2, Copy, ExternalLink, Check } from 'lucide-react';
import type { StoredRecording } from '../types';
import { uploadToBunny } from '../lib/upload';
import { setUploadedUrl } from '../lib/storage';
import { isBunnyConfigured } from '../lib/settings';
import { formatBytes } from '../lib/format';
import { toast } from '../lib/toast';

interface Props {
  recording: StoredRecording;
  variant?: 'primary' | 'secondary' | 'icon';
  onUploaded?: (rec: StoredRecording) => void;
}

type State =
  | { kind: 'idle' }
  | { kind: 'uploading'; loaded: number; total: number; pct: number }
  | { kind: 'success'; url: string }
  | { kind: 'error'; message: string };

export function UploadButton({ recording, variant = 'secondary', onUploaded }: Props) {
  const [state, setState] = useState<State>(
    recording.uploadedUrl
      ? { kind: 'success', url: recording.uploadedUrl }
      : { kind: 'idle' }
  );
  const [copied, setCopied] = useState(false);
  const configured = isBunnyConfigured();

  useEffect(() => {
    if (recording.uploadedUrl) {
      setState({ kind: 'success', url: recording.uploadedUrl });
    } else {
      setState({ kind: 'idle' });
    }
  }, [recording.id, recording.uploadedUrl]);

  const handleUpload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!configured) {
      toast.warning('Nastav nejdřív Bunny upload v Settings.', {
        title: 'Není nastaveno',
      });
      return;
    }
    setState({ kind: 'uploading', loaded: 0, total: recording.size, pct: 0 });
    try {
      const result = await uploadToBunny(
        recording.blob,
        recording.name,
        (loaded, total, pct) => setState({ kind: 'uploading', loaded, total, pct })
      );
      const updated = await setUploadedUrl(recording.id, result.url);
      setState({ kind: 'success', url: result.url });
      toast.success('Video je na Bunny CDN.', { title: 'Nahráno' });
      if (updated && onUploaded) onUploaded(updated);
    } catch (err) {
      const message = (err as Error).message;
      setState({ kind: 'error', message });
      toast.error(message, { title: 'Upload selhal' });
    }
  };

  const copyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state.kind !== 'success') return;
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
      toast.success('Link zkopírován do schránky.');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Nepodařilo se zkopírovat. Zkus znovu.');
    }
  };

  // ───── Compact (icon) variant for cards ─────
  if (variant === 'icon') {
    if (state.kind === 'success') {
      return (
        <span
          onClick={copyLink}
          title={copied ? 'Zkopírováno' : `Kopírovat link (${state.url})`}
          className="btn-ghost p-1.5 cursor-pointer text-accent"
        >
          {copied ? <Check className="w-4 h-4" /> : <Cloud className="w-4 h-4" />}
        </span>
      );
    }
    if (state.kind === 'uploading') {
      return (
        <span
          title={`Nahrávám ${Math.round(state.pct)}%`}
          className="btn-ghost p-1.5 cursor-default text-accent"
        >
          <Loader2 className="w-4 h-4 animate-spin" />
        </span>
      );
    }
    return (
      <span
        onClick={handleUpload}
        title={configured ? 'Nahrát na Bunny' : 'Nejdřív nastav v Settings'}
        className={`btn-ghost p-1.5 cursor-pointer ${configured ? '' : 'opacity-40'}`}
      >
        <UploadCloud className="w-4 h-4" />
      </span>
    );
  }

  // ───── Full button variant for Preview ─────
  if (state.kind === 'success') {
    return (
      <div className="flex flex-wrap items-center gap-2 bg-accent-subtle border border-accent/30 rounded-xl px-3 py-2">
        <Cloud className="w-4 h-4 text-accent" />
        <span className="text-sm text-accent">Na Bunny:</span>
        <code className="text-xs text-text-primary bg-bg-elev rounded px-2 py-0.5 max-w-[280px] truncate">
          {state.url}
        </code>
        <button onClick={copyLink} className="btn-ghost p-1.5 text-xs">
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-success" /> Zkopírováno
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" /> Kopírovat
            </>
          )}
        </button>
        <a
          href={state.url}
          target="_blank"
          rel="noreferrer"
          className="btn-ghost p-1.5 text-xs"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Otevřít
        </a>
      </div>
    );
  }

  if (state.kind === 'uploading') {
    return (
      <div className="flex flex-col gap-2 min-w-[240px]">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-accent" />
          <span>
            Nahrávám… {Math.round(state.pct)}% (
            {formatBytes(state.loaded)} / {formatBytes(state.total)})
          </span>
        </div>
        <div className="w-full h-1.5 bg-bg-elev rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${state.pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleUpload}
        disabled={!configured}
        className={variant === 'primary' ? 'btn-primary' : 'btn-secondary'}
        title={configured ? undefined : 'Nejdřív nastav v Settings'}
      >
        <UploadCloud className="w-4 h-4" /> Nahrát na Bunny
      </button>
      {state.kind === 'error' && (
        <span className="text-xs text-danger max-w-[260px]">{state.message}</span>
      )}
    </div>
  );
}
