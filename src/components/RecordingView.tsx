import { useEffect, useState } from 'react';
import { Pause, Play, Square, X, Loader2 } from 'lucide-react';
import { useRecorder } from '../hooks/useRecorder';
import { LivePreview } from './LivePreview';
import { formatDuration } from '../lib/format';
import { saveRecording, setUploadedUrl } from '../lib/storage';
import { convertToMp4 } from '../lib/ffmpeg';
import { loadBunnySettings, isBunnyConfigured } from '../lib/settings';
import { uploadToBunny } from '../lib/upload';
import { toast } from '../lib/toast';
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
    recorder.start(cfg).catch((err) => {
      const name = err?.name as string | undefined;
      const message = err?.message as string | undefined;
      // User explicitly dismissed the picker — silent return
      if (name === 'NotAllowedError' || name === 'AbortError') {
        onCancel();
        return;
      }
      if (name === 'NotFoundError') {
        toast.error('Nepodařilo se najít zdroj obrazu/zvuku.', { title: 'Nahrávání' });
      } else if (name === 'NotReadableError') {
        toast.error('Zařízení používá jiná aplikace. Zavři ji a zkus znovu.', {
          title: 'Nahrávání',
        });
      } else if (name === 'OverconstrainedError') {
        toast.error('Vybrané zařízení nepodporuje požadované nastavení.', {
          title: 'Nahrávání',
        });
      } else if (message) {
        toast.error(message, { title: 'Chyba nahrávání' });
      }
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
          toast.warning(
            'Auto-upload na Bunny selhal — záznam je uložen lokálně. ' +
              (uploadErr as Error).message,
            { title: 'Upload', duration: 8000 }
          );
        }
      }

      onFinish(rec);
    } catch (e) {
      console.error('Conversion failed, saving original:', e);
      const reason =
        e instanceof Error && e.message
          ? e.message
          : typeof e === 'string'
          ? e
          : 'neznámá chyba (zkus refresh)';
      try {
        const ext = result.mimeType.includes('mp4') ? 'mp4' : 'webm';
        const rec = await saveRecording({
          blob: result.blob,
          name: `${defaultName()}.${ext}`,
          durationMs: result.durationMs,
          mimeType: result.mimeType,
        });
        toast.warning(
          `Konverze do MP4 selhala — uložil jsem ${ext.toUpperCase()}. ` + reason,
          { title: 'MP4 konverze', duration: 9000 }
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
      {/* Full-bleed live preview behind everything */}
      {recorder.displayStream && !isSaving && (
        <LivePreview
          stream={recorder.displayStream}
          cameraStream={recorder.cameraStream}
        />
      )}

      {/* Top overlay: status pill */}
      {isLive && !isSaving && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 animate-fade-in">
          <div className="flex items-center gap-3 bg-bg-card/85 backdrop-blur-xl border border-bg-border rounded-full px-5 py-2 shadow-2xl">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                recorder.state === 'recording'
                  ? 'bg-danger animate-pulse-soft'
                  : 'bg-amber-400'
              }`}
            />
            <span className="text-text-secondary uppercase text-[10px] tracking-widest font-medium">
              {recorder.state === 'paused' ? 'Pauza' : 'Nahrává se'}
            </span>
            <div className="w-px h-4 bg-bg-border" />
            <span className="font-mono text-base tabular-nums tracking-tight">
              {formatDuration(seconds)}
            </span>
          </div>
        </div>
      )}

      {/* Centered messages for prep / countdown / saving */}
      {!isLive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 pointer-events-none z-20">
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
                className="text-[10rem] font-semibold text-accent leading-none animate-fade-in tabular-nums drop-shadow-2xl"
              >
                {recorder.countdownRemaining}
              </div>
              <p className="text-text-secondary text-sm mt-6 max-w-md mx-auto">
                Připrav se. Můžeš se přepnout na sdílené okno.
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
                  ? 'Načítám ffmpeg.wasm (~30 MB). Po prvním načtení cachuje prohlížeč.'
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
      )}

      {/* Floating control bar */}
      {!isSaving && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 animate-fade-in">
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
