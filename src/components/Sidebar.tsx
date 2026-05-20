import { Video, Library as LibraryIcon, Settings as SettingsIcon } from 'lucide-react';
import type { View } from '../App';

interface SidebarProps {
  view: View;
  onNavigate: (v: View) => void;
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

export function Sidebar({ view, onNavigate }: SidebarProps) {
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
      <nav className="flex flex-col gap-2">
        {renderBtn({
          id: 'settings',
          label: 'Nastavení',
          icon: <SettingsIcon className="w-5 h-5" />,
        })}
      </nav>
    </aside>
  );
}
