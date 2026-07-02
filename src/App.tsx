import { useEffect, useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Home } from './components/Home';
import { RecordingView } from './components/RecordingView';
import { Preview } from './components/Preview';
import { Library } from './components/Library';
import { Settings } from './components/Settings';
import { Login } from './components/Login';
import { RecoveryBanner } from './components/RecoveryBanner';
import { currentSession, logout as authLogout, type Session } from './lib/auth';
import type { StoredRecording } from './types';

export type View = 'home' | 'recording' | 'preview' | 'library' | 'settings';

export default function App() {
  const [session, setSession] = useState<Session | null>(() => currentSession());
  const [view, setView] = useState<View>('home');
  const [activeRecording, setActiveRecording] = useState<StoredRecording | null>(null);
  const [libraryVersion, setLibraryVersion] = useState(0);

  const goPreview = useCallback((rec: StoredRecording) => {
    setActiveRecording(rec);
    setView('preview');
  }, []);

  const refreshLibrary = useCallback(() => setLibraryVersion((v) => v + 1), []);

  const handleLogout = () => {
    authLogout();
    setSession(null);
    setView('home');
  };

  // Re-check session if tab regained focus (in case of logout in another tab)
  useEffect(() => {
    const onFocus = () => {
      const s = currentSession();
      setSession(s);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  if (!session) {
    return <Login onLogin={setSession} />;
  }

  return (
    <div className="flex h-screen w-screen bg-bg text-text-primary font-sans antialiased">
      {/* Crash recovery: orphaned chunks from a recording that died with the tab */}
      {view !== 'recording' && <RecoveryBanner onRecovered={refreshLibrary} />}
      {view !== 'recording' && (
        <Sidebar
          view={view}
          session={session}
          onNavigate={(v) => setView(v)}
          onLogout={handleLogout}
        />
      )}
      <main className="flex-1 min-w-0 relative overflow-hidden">
        <div className="h-full overflow-auto">
          {view === 'home' && (
            <Home
              onStartRecording={() => setView('recording')}
              onOpenLibrary={() => setView('library')}
              onOpenSettings={() => setView('settings')}
            />
          )}
          {view === 'recording' && (
            <RecordingView
              onFinish={(rec) => {
                refreshLibrary();
                goPreview(rec);
              }}
              onCancel={() => setView('home')}
            />
          )}
          {view === 'preview' && activeRecording && (
            <Preview
              recording={activeRecording}
              onBack={() => setView('library')}
              onNew={() => setView('home')}
              onUpdated={(rec) => {
                setActiveRecording(rec);
                refreshLibrary();
              }}
              onDeleted={() => {
                refreshLibrary();
                setView('library');
              }}
            />
          )}
          {view === 'library' && (
            <Library key={libraryVersion} onOpen={goPreview} />
          )}
          {view === 'settings' && <Settings />}
        </div>
      </main>
    </div>
  );
}
