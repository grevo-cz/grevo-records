import { useState } from 'react';
import { LogIn, Loader2 } from 'lucide-react';
import { login, type Session } from '../lib/auth';

interface Props {
  onLogin: (session: Session) => void;
}

export function Login({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const session = await login(email, password);
      onLogin(session);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm">
        {/* Wordmark — matches the app rail identity */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-danger shadow-rec" aria-hidden />
            <div className="display text-[22px] font-bold leading-none text-text-primary">
              RECORDS
            </div>
          </div>
          <div className="mt-2 text-sm text-text-secondary">
            Interní nahrávání obrazovky pro tým Grevo. Přihlaš se firemním účtem.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4 animate-fade-in">
          <div>
            <label className="block text-sm font-medium mb-1.5">Email</label>
            <input
              type="email"
              autoFocus
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input w-full font-mono"
              placeholder="jmeno@grevo.cz"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Heslo</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full font-mono"
              placeholder="••••••••••"
            />
          </div>
          {error && (
            <div className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !email || !password}
            className="btn-primary w-full py-2.5"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Přihlašuji…
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" /> Přihlásit
              </>
            )}
          </button>
        </form>

        <p className="text-xs text-text-muted text-center mt-6">
          by Grevo
        </p>
      </div>
    </div>
  );
}
