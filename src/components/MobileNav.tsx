import {
  Video,
  Library as LibraryIcon,
  Settings as SettingsIcon,
  LogOut,
} from 'lucide-react';
import type { View } from '../App';
import type { Session } from '../lib/auth';

interface Props {
  view: View;
  session: Session;
  onNavigate: (v: View) => void;
  onLogout: () => void;
}

const items: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Nahrávat', icon: <Video className="w-5 h-5" /> },
  { id: 'library', label: 'Knihovna', icon: <LibraryIcon className="w-5 h-5" /> },
  { id: 'settings', label: 'Nastavení', icon: <SettingsIcon className="w-5 h-5" /> },
];

/**
 * Mobile navigation (< md): a slim top bar for identity + logout, and a
 * bottom tab bar for the three views. The desktop rail (Sidebar) is hidden
 * at this breakpoint. Both bars respect the iOS safe-area insets.
 */
export function MobileNav({ view, session, onNavigate, onLogout }: Props) {
  return (
    <>
      {/* Top bar */}
      <div
        className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 h-14 bg-bg-elev/95 backdrop-blur-xl border-b border-bg-border"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-danger" aria-hidden />
          <span className="display text-[16px] font-bold leading-none">RECORDS</span>
        </div>
        <button
          onClick={onLogout}
          className="btn-ghost p-2 text-text-secondary"
          title={`Odhlásit (${session.email})`}
        >
          <LogOut className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* Bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 flex bg-bg-elev/95 backdrop-blur-xl border-t border-bg-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {items.map((item) => {
          const active =
            view === item.id || (view === 'preview' && item.id === 'library');
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] transition-colors ${
                active
                  ? 'text-accent'
                  : 'text-text-secondary active:text-text-primary'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}
