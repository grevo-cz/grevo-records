// Simple SHA-256-hashed credential check for a small fixed user set.
// Notes:
// - This gates the UI; for real security the proxy should also validate.
// - Hashes are visible in the bundled JS, but plaintext passwords aren't.
//   For a private team tool this is sufficient.

interface UserRecord {
  email: string;
  displayName: string;
  passwordHash: string; // SHA-256 hex of the password
}

// Pre-computed SHA-256 hashes (both users share the same password "Grevo!32462").
const PASSWORD_HASH =
  '87986f875ea6f0eae85f5343462c21b9d17d25c0e23fa43ec5792d44f31efeac';

const USERS: UserRecord[] = [
  { email: 'vodvarka@grevo.cz', displayName: 'Jan Vodvárka', passwordHash: PASSWORD_HASH },
  { email: 'gregor@grevo.cz', displayName: 'Gregor', passwordHash: PASSWORD_HASH },
];

const SESSION_KEY = 'vr-auth-session-v1';

export interface Session {
  email: string;
  displayName: string;
  loggedInAt: number;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function login(
  email: string,
  password: string
): Promise<Session> {
  const normalized = email.trim().toLowerCase();
  const user = USERS.find((u) => u.email === normalized);
  if (!user) throw new Error('Neznámý email.');
  const hash = await sha256Hex(password);
  if (hash !== user.passwordHash) throw new Error('Špatné heslo.');
  const session: Session = {
    email: user.email,
    displayName: user.displayName,
    loggedInAt: Date.now(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function currentSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function userScopeKey(base: string, email?: string | null): string {
  const e = email ?? currentSession()?.email ?? 'anon';
  return `${base}::${e}`;
}
