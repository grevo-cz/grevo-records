import { useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Home } from './components/Home';
import { RecordingView } from './components/RecordingView';
import { Preview } from './components/Preview';
import { Library } from './components/Library';
import { Settings } from './components/Settings';
import type { StoredRecording } from './types';

export type View = 'home' | 'recording' | 'preview' | 'library' | 'settings';

export default function App() {
  const [view, setView] = useState<View>('home');
  const [activeRecording, setActiveRecording] = useState<StoredRecording | null>(null);
  const [libraryVersion, setLibraryVersion] = useState(0);

  const goPreview = useCallback((rec: StoredRecording) => {
    setActiveRecording(rec);
    setView('preview');
  }, []);

  const refreshLibrary = useCallback(() => setLibraryVersion((v) => v + 1), []);

  return (
    <div className="flex h-screen w-screen bg-bg text-text-primary font-sans antialiased">
      {view !== 'recording' && (
        <Sidebar view={view} onNavigate={(v) => setView(v)} />
      )}
      <main className="flex-1 min-w-0 relative overflow-hidden">
        <div className="h-full overflow-auto">
          {view === 'home' && (
            <Home
              onStartRecording={() => setView('recording')}
              onOpenLibrary={() => setView('library')}
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
