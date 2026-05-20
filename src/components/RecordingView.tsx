import { useEffect, useState } from 'react';
import { Pause, Play, Square, X, Loader2 } from 'lucide-react';
import { useRecorder } from '../hooks/useRecorder';
import { ScreenPreview } from './ScreenPreview';
import { formatDuration } from '../lib/format';
import { saveRecording, setUploadedUrl } from '../lib/storage';
import { convertToMp4 } from '../lib/ffmpeg';
import { loadBunnySettings, isBunnyConfigured } from '../lib/settings';
import { uploadToBunny } from '../lib/upload';
import type { StoredRecording } from '../types';

interface Props {
  onFinish: (rec: StoredRecording) => void;
  onCancel: () => void;
}

interface StartConfig {
  micDeviceId: string | null;
  cameraDeviceId: string | null;
  cameraOverlay: boolean;
  micGain: number;
  countdownSeconds: number;
}

type SavingStage =
  | { kind: 'idle' }
  | { kind: 'loading-ffmpeg'; pct: number }
  | { kind: 'converting'; pct: number }
  | { kind: 'saving' }
  | { kind: 'uploading'; pct: number };

function defaultName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `recording-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

export function RecordingView({ onFinish, onCancel }: Props) {
  const recorder = useRecorder();
  const [stage, setStage] = useState<SavingStage>({ kind: 'idle' });
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (started) return;
    const raw = sessionStorage.getItem('vr-start');
    if (!raw) {
      onCancel();
      return;
    }
    setStarted(true);
    const cfg = JSON.parse(raw) as StartConfig;
    recorder.start(cfg).catch(() => {
      onCancel();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const handleStop = async () => {
    setStage({ kind: 'loading-ffmpeg', pct: 0 });
    const result = await recorder.stop();
    if (!result) {
      setStage({ kind: 'idle' });
      onCancel();
      return;
    }
    try {
      // Convert WebM → MP4 (browser-side via ffmpeg.wasm)
      const mp4 = await convertToMp4(result.blob, (pct, stageName) => {
        if (stageName === 'loading') {
          setStage({ kind: 'loading-ffmpeg', pct });
        } else {
          setStage({ kind: 'converting', pct });
        }
      });
      setStage({ kind: 'saving' });
      let rec = await saveRecording({
        blob: mp4,
        name: `${defaultName()}.mp4`,
        durationMs: result.durationMs,
        mimeType: 'video/mp4',
      });

      // Auto-upload if configured
      const settings = loadBunnySettings();
      if (settings.autoUpload && isBunnyConfigured(settings)) {
        try {
          setStage({ kind: 'uploading', pct: 0 });
          const up = await uploadToBunny(rec.blob, rec.name, (_l, _t, pct) =>
            setStage({ kind: 'uploading', pct })
          );
          const updated = await setUploadedUrl(rec.id, up.url);
          if (updated) rec = updated;
        } catch (uploadErr) {
          console.warn('Auto-upload failed:', uploadErr);
          alert(
            'Nahrávka uložena lokálně, ale auto-upload na Bunny selhal: ' +
              (uploadErr as Error).message
          );
        }
      }

      onFinish(rec);
    } catch (e) {
      console.error('Conversion failed, saving original:', e);
      try {
        const ext = result.mimeType.includes('mp4') ? 'mp4' : 'webm';
        const rec = await saveRecording({
          blob: result.blob,
          name: `${defaultName()}.${ext}`,
          durationMs: result.durationMs,
          mimeType: result.mimeType,
        });
        alert(
          'Konverze do MP4 selhala, uložil jsem původní záznam. Důvod: ' +
            (e as Error).message
        );
        onFinish(rec);
      } catch (saveErr) {
        console.error(saveErr);
        onCancel();
      }
    } finally {
      setStage({ kind: 'idle' });
    }
  };

  const handleCancel = () => {
    recorder.cancel();
    onCancel();
  };

  const seconds = recorder.elapsedMs / 1000;
  const isLive = recorder.state === 'recording' || recorder.state === 'paused';
  const isSaving = stage.kind !== 'idle';

  return (
    <div className="relative w-full h-full">
      {recorder.displayStream && !isSaving && (
        <ScreenPreview
          stream={recorder.displayStream}
          cameraStream={recorder.cameraStream}
        />
      )}

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 pointer-events-none">
        {recorder.state === 'preparing' && (
          <div className="text-text-secondary animate-fade-in">
            <div className="text-xl font-medium">Vyber co sdílet…</div>
            <div className="text-sm mt-2">
              Prohlížeč ti právě ukazuje dialog pro výběr obrazovky nebo okna.
            </div>
          </div>
        )}
        {recorder.state === 'countdown' && (
          <div className="animate-fade-in">
            <div className="text-text-secondary uppercase text-xs tracking-widest mb-3">
              Začínám za
            </div>
            <div
              key={recorder.countdownRemaining}
              className="text-[10rem] font-semibold text-accent leading-none animate-fade-in tabular-nums"
            >
              {recorder.countdownRemaining}
            </div>
            <p className="text-text-secondary text-sm mt-6 max-w-md mx-auto">
              Připrav se. Můžeš se přepnout na sdílené okno.
            </p>
          </div>
        )}
        {isLive && !isSaving && (
          <div className="animate-fade-in">
            <div className="flex items-center justify-center gap-3 mb-3">
              <span
                className={`w-3 h-3 rounded-full ${
                  recorder.state === 'recording'
                    ? 'bg-danger animate-pulse-soft'
                    : 'bg-amber-400'
                }`}
              />
              <span className="text-text-secondary uppercase text-xs tracking-widest">
                {recorder.state === 'paused' ? 'Pauza' : 'Nahrává se'}
              </span>
            </div>
            <div className="text-6xl font-mono tabular-nums tracking-tight">
              {formatDuration(seconds)}
            </div>
            <p className="text-text-secondary text-sm mt-6 max-w-md mx-auto">
              Nahrávání běží i když se přepneš na jinou aplikaci. Stop dáš
              tlačítkem dole nebo přes „Stop sharing" v liště prohlížeče.
            </p>
          </div>
        )}
        {isSaving && (
          <div className="animate-fade-in max-w-md w-full">
            <Loader2 className="w-10 h-10 text-accent animate-spin mx-auto mb-4" />
            <div className="text-xl font-medium">
              {stage.kind === 'loading-ffmpeg' && 'Připravuji konvertor…'}
              {stage.kind === 'converting' && 'Konvertuji do MP4…'}
              {stage.kind === 'saving' && 'Ukládám…'}
              {stage.kind === 'uploading' && 'Nahrávám na Bunny…'}
            </div>
            {(stage.kind === 'loading-ffmpeg' ||
              stage.kind === 'converting' ||
              stage.kind === 'uploading') && (
              <>
                <div className="mt-4 w-full h-2 bg-bg-elev rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{ width: `${stage.pct}%` }}
                  />
                </div>
                <div className="text-text-secondary text-sm mt-2 tabular-nums">
                  {Math.round(stage.pct)}%
                </div>
              </>
            )}
            <p className="text-text-secondary text-xs mt-4">
              {stage.kind === 'loading-ffmpeg'
                ? 'První spuštění stáhne ~30 MB ffmpeg.wasm. Příště už bude okamžité.'
                : stage.kind === 'converting'
                ? 'Konverze běží lokálně v prohlížeči, nic se neposílá ven.'
                : stage.kind === 'uploading'
                ? 'Streamuji video přes upload proxy do Bunny Storage…'
                : 'Ukládám do knihovny…'}
            </p>
          </div>
        )}
        {recorder.error && (
          <div className="text-danger mt-6 max-w-md">{recorder.error}</div>
        )}
      </div>

      {!isSaving && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="flex items-center gap-2 bg-bg-card/95 backdrop-blur-xl border border-bg-border rounded-2xl px-3 py-2 shadow-2xl">
            <div className="flex items-center gap-2 px-3">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  recorder.state === 'recording'
                    ? 'bg-danger animate-pulse-soft'
                    : recorder.state === 'paused'
                    ? 'bg-amber-400'
                    : recorder.state === 'countdown'
                    ? 'bg-accent animate-pulse-soft'
                    : 'bg-text-muted'
                }`}
              />
              <span className="font-mono text-sm tabular-nums w-16 text-center">
                {recorder.state === 'countdown'
                  ? `-${recorder.countdownRemaining}s`
                  : formatDuration(seconds)}
              </span>
            </div>
            <div className="w-px h-6 bg-bg-border" />
            {recorder.state === 'paused' ? (
              <button
                onClick={recorder.resume}
                className="btn-ghost p-2"
                title="Pokračovat"
              >
                <Play className="w-5 h-5 fill-current" />
              </button>
            ) : (
              <button
                onClick={recorder.pause}
                className="btn-ghost p-2"
                disabled={recorder.state !== 'recording'}
                title="Pauza"
              >
                <Pause className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={handleStop}
              disabled={!isLive}
              className="btn-primary px-4 py-2"
              title="Zastavit a uložit"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Stop</span>
            </button>
            <button onClick={handleCancel} className="btn-ghost p-2" title="Zrušit">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
