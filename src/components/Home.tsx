import { useEffect, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Play,
  Monitor,
  Timer,
  Cloud,
  AlertCircle,
} from 'lucide-react';
import { useDevices } from '../hooks/useDevices';
import { isBunnyConfigured } from '../lib/settings';

interface HomeProps {
  onStartRecording: () => void;
  onOpenLibrary: () => void;
  onOpenSettings?: () => void;
}

const SETTINGS_KEY = 'vr-settings-v3';

interface Persisted {
  cameraDeviceId: string | null;
  micDeviceId: string | null;
  cameraEnabled: boolean;
  micEnabled: boolean;
  micGain: number;
  countdownSeconds: number;
}

function loadSettings(): Persisted {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {} as Persisted;
  }
}

function saveSettings(s: Persisted) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function Home({ onStartRecording, onOpenSettings }: HomeProps) {
  const bunnyOk = isBunnyConfigured();
  const { microphones, cameras } = useDevices();
  const persisted = loadSettings();
  const [micEnabled, setMicEnabled] = useState(persisted.micEnabled ?? true);
  const [cameraEnabled, setCameraEnabled] = useState(persisted.cameraEnabled ?? false);
  const [micDeviceId, setMicDeviceId] = useState<string | null>(persisted.micDeviceId ?? null);
  const [cameraDeviceId, setCameraDeviceId] = useState<string | null>(
    persisted.cameraDeviceId ?? null
  );
  const [micGain, setMicGain] = useState<number>(persisted.micGain ?? 1);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(
    persisted.countdownSeconds ?? 3
  );

  useEffect(() => {
    if (microphones.length && !micDeviceId) setMicDeviceId(microphones[0].deviceId);
  }, [microphones, micDeviceId]);

  useEffect(() => {
    if (cameras.length && !cameraDeviceId) setCameraDeviceId(cameras[0].deviceId);
  }, [cameras, cameraDeviceId]);

  const handleStart = () => {
    saveSettings({
      cameraDeviceId,
      micDeviceId,
      cameraEnabled,
      micEnabled,
      micGain,
      countdownSeconds,
    });
    sessionStorage.setItem(
      'vr-start',
      JSON.stringify({
        micDeviceId: micEnabled ? micDeviceId : null,
        cameraDeviceId: cameraEnabled ? cameraDeviceId : null,
        cameraOverlay: cameraEnabled,
        micGain: micEnabled ? micGain : 1,
        countdownSeconds,
      })
    );
    onStartRecording();
  };

  return (
    <div className="min-h-full p-6 sm:p-10 flex flex-col gap-6 max-w-3xl mx-auto animate-fade-in">
      <header className="pt-4">
        <div className="text-xs uppercase tracking-widest text-accent/80 mb-2">
          Records By Grevo
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Nové nahrávání</h1>
        <p className="text-text-secondary mt-2">
          Nastav vstupy a klikni Spustit. Prohlížeč ti pak ukáže dialog pro
          výběr obrazovky.
        </p>
      </header>

      {!bunnyOk && (
        <div className="card border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3 animate-fade-in">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">
              Bunny upload není nastavený
            </div>
            <p className="text-xs text-text-secondary mt-1">
              Pro sdílení nahrávek s klienty potřebuješ nastavit svoji Bunny
              Storage. Bez toho fungují jen lokální nahrávky a stažení do
              Downloads.
            </p>
          </div>
          {onOpenSettings && (
            <button onClick={onOpenSettings} className="btn-secondary shrink-0">
              <Cloud className="w-4 h-4" /> Nastavit
            </button>
          )}
        </div>
      )}

      <section className="card p-5">
        <div className="flex items-center gap-3 mb-1">
          <Monitor className="w-5 h-5 text-accent" />
          <span className="font-medium">Obrazovka</span>
        </div>
        <p className="text-sm text-text-secondary">
          V dialogu prohlížeče vyber celou obrazovku / okno / záložku. Zaškrtni{' '}
          <span className="text-text-primary font-medium">„Share audio"</span>{' '}
          pokud chceš zvuk z aplikací.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`card p-5 transition-opacity ${micEnabled ? '' : 'opacity-60'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {micEnabled ? (
                <Mic className="w-4 h-4 text-accent" />
              ) : (
                <MicOff className="w-4 h-4 text-text-muted" />
              )}
              <span className="font-medium">Mikrofon</span>
            </div>
            <Toggle on={micEnabled} onChange={setMicEnabled} />
          </div>
          <select
            className="input w-full"
            disabled={!micEnabled}
            value={micDeviceId ?? ''}
            onChange={(e) => setMicDeviceId(e.target.value || null)}
          >
            {microphones.length === 0 && (
              <option value="">Žádný mikrofon</option>
            )}
            {microphones.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label}
              </option>
            ))}
          </select>
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-text-secondary mb-1.5">
              <span>Hlasitost</span>
              <span className="font-mono tabular-nums text-text-primary">
                {Math.round(micGain * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={micGain}
              disabled={!micEnabled}
              onChange={(e) => setMicGain(Number(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="flex items-center justify-between text-[10px] text-text-muted mt-1">
              <span>0%</span>
              <span>100%</span>
              <span>200%</span>
            </div>
          </div>
        </div>

        <div className={`card p-5 transition-opacity ${cameraEnabled ? '' : 'opacity-60'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {cameraEnabled ? (
                <Video className="w-4 h-4 text-accent" />
              ) : (
                <VideoOff className="w-4 h-4 text-text-muted" />
              )}
              <span className="font-medium">Webkamera</span>
              <span className="text-xs text-text-muted">· volitelné</span>
            </div>
            <Toggle on={cameraEnabled} onChange={setCameraEnabled} />
          </div>
          <select
            className="input w-full"
            disabled={!cameraEnabled}
            value={cameraDeviceId ?? ''}
            onChange={(e) => setCameraDeviceId(e.target.value || null)}
          >
            {cameras.length === 0 && <option value="">Žádná kamera</option>}
            {cameras.map((c) => (
              <option key={c.deviceId} value={c.deviceId}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-text-muted mt-3">
            {cameraEnabled
              ? 'Kruh kamery se vypálí do videa v pravém dolním rohu.'
              : 'Bez kamery — nahraje se jen obrazovka a zvuk.'}
          </p>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-accent" />
            <div>
              <div className="font-medium">Odpočet před startem</div>
              <div className="text-xs text-text-muted">
                Stihneš se připravit a přepnout na sdílené okno.
              </div>
            </div>
          </div>
          <div className="inline-flex bg-bg-elev rounded-xl p-1">
            {[0, 3, 5].map((s) => (
              <button
                key={s}
                onClick={() => setCountdownSeconds(s)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  countdownSeconds === s
                    ? 'bg-bg-card text-text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {s === 0 ? 'Vypnuto' : `${s} s`}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="flex items-center justify-center pt-2">
        <button onClick={handleStart} className="btn-primary text-base px-8 py-3">
          <Play className="w-5 h-5 fill-current" />
          Spustit nahrávání
        </button>
      </div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative w-10 h-6 rounded-full transition-colors ${
        on ? 'bg-accent' : 'bg-bg-border'
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
          on ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}
