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

const topItems: Item[] = [
  { id: 'home', label: 'Nahrávat', icon: <Video className="w-5 h-5" /> },
  { id: 'library', label: 'Knihovna', icon: <LibraryIcon className="w-5 h-5" /> },
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
  const renderBtn = (item: Item) => {
    const active =
      view === item.id || (view === 'preview' && item.id === 'library');
    return (
      <button
        key={item.id}
        onClick={() => onNavigate(item.id)}
        title={item.label}
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all
          ${active
            ? 'bg-accent-subtle text-accent'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
          }`}
      >
        {item.icon}
      </button>
    );
  };

  return (
    <aside className="w-16 border-r border-bg-border bg-bg-elev flex flex-col items-center py-4">
      <div
        className="w-9 h-9 rounded-xl bg-accent text-white flex items-center justify-center mb-6 font-bold text-sm tracking-tight shadow-glow"
        title="Records By Grevo"
      >
        Gr
      </div>
      <nav className="flex flex-col gap-2">{topItems.map(renderBtn)}</nav>
      <div className="flex-1" />
      <nav className="flex flex-col gap-2 items-center">
        {renderBtn({
          id: 'settings',
          label: 'Nastavení',
          icon: <SettingsIcon className="w-5 h-5" />,
        })}
        <div
          className="w-9 h-9 rounded-full bg-bg-card border border-bg-border flex items-center justify-center text-xs font-semibold text-text-secondary mt-1"
          title={`${session.displayName} · ${session.email}`}
        >
          {initials(session.displayName)}
        </div>
        <button
          onClick={onLogout}
          title={`Odhlásit ${session.email}`}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-text-secondary hover:text-danger hover:bg-bg-card transition-all"
        >
          <LogOut className="w-5 h-5" />
        </button>
        <div
          className="text-[9px] text-text-muted font-mono mt-1"
          title="Build version — ověř, že vidíš nejnovější deploy"
        >
          {BUILD_SHA}
        </div>
      </nav>
    </aside>
  );
}
