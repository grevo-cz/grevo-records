import { useEffect, useState } from 'react';
import {
  Save,
  Check,
  Cloud,
  Eye,
  EyeOff,
  Server,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  loadBunnySettings,
  saveBunnySettings,
  type BunnySettings,
} from '../lib/settings';

export function Settings() {
  const [bunny, setBunny] = useState<BunnySettings>(loadBunnySettings());
  const [savedFlash, setSavedFlash] = useState(false);
  const [revealSecret, setRevealSecret] = useState(false);
  const [pingState, setPingState] = useState<
    | { kind: 'idle' }
    | { kind: 'pinging' }
    | { kind: 'ok'; data: any }
    | { kind: 'fail'; message: string }
  >({ kind: 'idle' });

  const update = <K extends keyof BunnySettings>(key: K, val: BunnySettings[K]) => {
    setBunny((s) => ({ ...s, [key]: val }));
  };

  useEffect(() => {
    setPingState({ kind: 'idle' });
  }, [bunny.proxyUrl]);

  const handleSave = () => {
    saveBunnySettings(bunny);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const testConnection = async () => {
    if (!bunny.proxyUrl) return;
    setPingState({ kind: 'pinging' });
    try {
      const base = bunny.proxyUrl.replace(/\/+$/, '');
      const res = await fetch(`${base}/`, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPingState({ kind: 'ok', data });
    } catch (e) {
      setPingState({ kind: 'fail', message: (e as Error).message });
    }
  };

  return (
    <div className="min-h-full p-10 max-w-3xl mx-auto animate-fade-in">
      <header className="pt-4 mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Nastavení</h1>
        <p className="text-text-secondary mt-2">
          Konfigurace upload proxy pro Bunny.net (sdílení nahrávek s klienty).
        </p>
      </header>

      <section className="card p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-subtle text-accent flex items-center justify-center shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold">Bunny upload</h2>
              <p className="text-sm text-text-secondary mt-1">
                Odesílání na vlastní proxy (Records By Grevo Upload Proxy), která
                pak streamuje do Bunny Storage. Access Key zůstává schovaný na
                serveru, v prohlížeči je jen sdílený secret.
              </p>
            </div>
          </div>
          <Toggle on={bunny.enabled} onChange={(v) => update('enabled', v)} />
        </div>

        <div
          className={`space-y-4 transition-opacity ${
            bunny.enabled ? '' : 'opacity-50 pointer-events-none'
          }`}
        >
          <Field
            label="Proxy URL"
            hint="Adresa nasazené upload proxy, např. https://upload.grevo.cz nebo https://my-proxy.b-cdn.net"
          >
            <input
              type="text"
              className="input w-full font-mono"
              placeholder="https://upload.grevo.cz"
              value={bunny.proxyUrl}
              onChange={(e) =>
                update('proxyUrl', e.target.value.trim().replace(/\/+$/, ''))
              }
            />
          </Field>

          <Field
            label="Upload Secret"
            hint={
              'Sdílený řetězec mezi proxy (env UPLOAD_SECRET) a aplikací. Doporučení: openssl rand -hex 32'
            }
          >
            <div className="relative">
              <input
                type={revealSecret ? 'text' : 'password'}
                className="input w-full pr-10 font-mono"
                placeholder="••••••••••••••••"
                value={bunny.uploadSecret}
                onChange={(e) => update('uploadSecret', e.target.value.trim())}
              />
              <button
                type="button"
                onClick={() => setRevealSecret((r) => !r)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text-muted hover:text-text-primary"
                title={revealSecret ? 'Skrýt' : 'Zobrazit'}
              >
                {revealSecret ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </Field>

          <Field
            label="Cílová složka"
            hint="Cesta uvnitř Storage Zone. Soubory budou ukládány s názvem nahrávky."
          >
            <input
              type="text"
              className="input w-full font-mono"
              placeholder="recordings/"
              value={bunny.folder}
              onChange={(e) =>
                update(
                  'folder',
                  e.target.value.replace(/^\/+/, '').replace(/\/?$/, '/')
                )
              }
            />
          </Field>

          <div className="flex items-center justify-between bg-bg-elev rounded-xl p-4">
            <div>
              <div className="font-medium text-sm">Auto-upload po nahrávání</div>
              <div className="text-xs text-text-secondary mt-0.5">
                Hned po stopnutí a konverzi do MP4 se video automaticky pošle a
                v Library uvidíš odkaz. Když je vypnuté, nahráváš manuálně
                tlačítkem v Preview / Library.
              </div>
            </div>
            <Toggle
              on={bunny.autoUpload}
              onChange={(v) => update('autoUpload', v)}
            />
          </div>

          {/* Test connection */}
          <div className="bg-bg-elev rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-text-secondary" />
                <span className="text-sm font-medium">Test spojení s proxy</span>
              </div>
              <button
                onClick={testConnection}
                disabled={!bunny.proxyUrl || pingState.kind === 'pinging'}
                className="btn-ghost text-xs"
              >
                {pingState.kind === 'pinging' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Testuji…
                  </>
                ) : (
                  'Otestovat'
                )}
              </button>
            </div>
            {pingState.kind === 'ok' && (
              <div className="mt-3 text-xs text-success flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  Proxy běží. Storage zone:{' '}
                  <code className="text-text-primary">
                    {pingState.data?.storage?.zone}
                  </code>
                  , pull zone:{' '}
                  <code className="text-text-primary">
                    {pingState.data?.pullZone}
                  </code>
                </div>
              </div>
            )}
            {pingState.kind === 'fail' && (
              <div className="mt-3 text-xs text-danger flex items-start gap-2">
                <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  Spojení selhalo: {pingState.message}.
                  <br />
                  Zkontroluj Proxy URL a CORS na serveru (ALLOWED_ORIGINS).
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end mt-6 pt-5 border-t border-bg-border">
          <button onClick={handleSave} className="btn-primary">
            {savedFlash ? (
              <>
                <Check className="w-4 h-4" /> Uloženo
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> Uložit
              </>
            )}
          </button>
        </div>
      </section>

      <section className="card p-5 mt-6 border-amber-500/30 bg-amber-500/5">
        <h3 className="font-medium text-sm">Jak nasadit proxy</h3>
        <ol className="text-sm text-text-secondary mt-2 space-y-2 list-decimal list-inside">
          <li>
            Ve složce <code className="text-text-primary">/server</code>{' '}
            zkopíruj <code className="text-text-primary">.env.example</code> →{' '}
            <code className="text-text-primary">.env</code> a doplň Bunny údaje.
          </li>
          <li>
            Nasaď přes Docker do Bunny Magic Containers:{' '}
            <code className="text-text-primary">cd server &amp;&amp; docker build -t records-proxy .</code>
          </li>
          <li>
            Push do <code className="text-text-primary">containers.bunny.net</code>
            a nadeploy v dashboardu na portu 8080.
          </li>
          <li>
            Sem zadej výslednou URL proxy a Upload Secret. <strong>Otestuj</strong>{' '}
            spojení a začni nahrávat.
          </li>
        </ol>
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-text-muted mt-1.5">{hint}</p>}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
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
