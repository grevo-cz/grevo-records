import { useState } from 'react';
import { FileVideo, Loader2, CheckCircle2 } from 'lucide-react';
import type { StoredRecording } from '../types';
import { convertToMp4 } from '../lib/ffmpeg';
import { saveRecording } from '../lib/storage';
import { toast } from '../lib/toast';

interface Props {
  recording: StoredRecording;
  onConverted?: (rec: StoredRecording) => void;
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading'; pct: number }
  | { kind: 'converting'; pct: number }
  | { kind: 'done' };

export function ConvertMp4Button({ recording, onConverted }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const isMp4 = recording.mimeType.includes('mp4') || recording.name.endsWith('.mp4');

  if (isMp4) {
    return (
      <span
        className="btn-ghost text-xs inline-flex items-center gap-1.5 cursor-default text-success"
        title="Tato nahrávka je už ve formátu MP4"
      >
        <CheckCircle2 className="w-3.5 h-3.5" /> MP4
      </span>
    );
  }

  const handleConvert = async () => {
    setState({ kind: 'loading', pct: 0 });
    try {
      const mp4 = await convertToMp4(recording.blob, (pct, stage) => {
        if (stage === 'loading') setState({ kind: 'loading', pct });
        else setState({ kind: 'converting', pct });
      });
      const base = recording.name.replace(/\.[^.]+$/, '');
      const rec = await saveRecording({
        blob: mp4,
        name: `${base}.mp4`,
        durationMs: recording.durationMs,
        mimeType: 'video/mp4',
      });
      setState({ kind: 'done' });
      toast.success('Hotovo — uložena nová MP4 verze.');
      onConverted?.(rec);
    } catch (e) {
      setState({ kind: 'idle' });
      toast.error(
        'Konverze do MP4 selhala: ' +
          (e instanceof Error ? e.message : String(e)),
        { title: 'Chyba', duration: 9000 }
      );
    }
  };

  if (state.kind === 'loading' || state.kind === 'converting') {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-text-secondary px-3 py-2 bg-bg-elev rounded-xl">
        <Loader2 className="w-4 h-4 animate-spin text-accent" />
        <span>
          {state.kind === 'loading' ? 'Načítám konvertor' : 'Konvertuji'}…{' '}
          <span className="tabular-nums">{Math.round(state.pct)}%</span>
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={handleConvert}
      className="btn-secondary"
      title="Konvertovat na MP4 (přehraje se v QuickTime, Safari, iMovie)"
    >
      <FileVideo className="w-4 h-4" /> Konvertovat na MP4
    </button>
  );
}
