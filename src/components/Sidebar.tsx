import { Video, Library as LibraryIcon, Settings as SettingsIcon, LogOut } from 'lucide-react';
import type { View } from '../App';
import type { Session } from '../lib/auth';
import { BUILD_SHA } from '../lib/version';

interface SidebarProps {
  view: View;
  session: Session;
  onNavigate: (v: View) => void;
  onLogout: () => void;
}

interface Item {
  id: View;
  label: string;
  icon: React.ReactNode;
}

const navItems: Item[] = [
  { id: 'home', label: 'Nahrávat', icon: <Video className="w-[18px] h-[18px]" /> },
  { id: 'library', label: 'Knihovna', icon: <LibraryIcon className="w-[18px] h-[18px]" /> },
  { id: 'settings', label: 'Nastavení', icon: <SettingsIcon className="w-[18px] h-[18px]" /> },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Sidebar({ view, session, onNavigate, onLogout }: SidebarProps) {
  return (
    <aside className="hidden md:flex w-52 shrink-0 border-r border-bg-border bg-bg-elev flex-col">
      {/* Wordmark */}
      <div className="px-5 pt-6 pb-5">
        <div className="display text-[19px] font-bold leading-none text-text-primary">
          RECORDS
        </div>
        <div className="mt-1 text-[11px] text-text-muted tracking-wide">
          by Grevo
        </div>
      </div>

      {/* Nav */}
      <nav className="px-3 flex flex-col gap-0.5">
        {navItems.map((item) => {
          const active =
            view === item.id || (view === 'preview' && item.id === 'library');
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left
                ${
                  active
                    ? 'bg-accent-subtle text-accent font-medium'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
                }`}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* User + logout */}
      <div className="px-3 pb-4 flex flex-col gap-1">
        <div className="flex items-center gap-3 px-3 py-2">
          <div
            className="w-7 h-7 rounded-full bg-bg-card border border-bg-border flex items-center justify-center text-[10px] font-semibold text-text-secondary shrink-0"
            title={session.email}
          >
            {initials(session.displayName)}
          </div>
          <div className="min-w-0">
            <div className="text-xs text-text-primary truncate">
              {session.displayName}
            </div>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-danger hover:bg-bg-card transition-colors text-left"
        >
          <LogOut className="w-[18px] h-[18px]" />
          Odhlásit
        </button>
        <div
          className="meter px-3 pt-1 text-[10px] text-text-muted"
          title="Verze nasazené aplikace"
        >
          {BUILD_SHA}
        </div>
      </div>
    </aside>
  );
}
