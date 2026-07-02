import { useEffect, useState } from 'react';
import { LifeBuoy, Loader2, Trash2 } from 'lucide-react';
import {
  listBufferSessions,
  recoverBufferSession,
  deleteBufferSession,
  type BufferSessionInfo,
} from '../lib/storage';
import { formatBytes } from '../lib/format';
import { toast } from '../lib/toast';

interface Props {
  /** Called after a successful recovery so the library list refreshes. */
  onRecovered?: () => void;
}

// A session is considered orphaned (crashed tab/browser) only when its newest
// chunk is at least this old — a recording live in another tab writes a chunk
// every ~1 s, so this keeps us from stealing its buffer.
const ORPHAN_MIN_AGE_MS = 15_000;

/**
 * Crash recovery: on app start, look for leftover chunks in the
 * 'recording-buffer' IndexedDB store (tab/browser died mid-recording)
 * and offer to reassemble them into a library recording.
 */
export function RecoveryBanner({ onRecovered }: Props) {
  const [sessions, setSessions] = useState<BufferSessionInfo[]>([]);
  const [busy, setBusy] = useState<'recover' | 'discard' | null>(null);

  useEffect(() => {
    let alive = true;
    listBufferSessions()
      .then((all) => {
        if (!alive) return;
        const now = Date.now();
        const orphaned = all.filter(
          (s) => s.totalBytes > 0 && now - s.lastChunkAt > ORPHAN_MIN_AGE_MS
        );
        setSessions(orphaned);
      })
      .catch((err) => console.warn('[recovery] buffer check failed:', err));
    return () => {
      alive = false;
    };
  }, []);

  if (sessions.length === 0) return null;

  const totalBytes = sessions.reduce((sum, s) => sum + s.totalBytes, 0);

  const handleRecover = async () => {
    setBusy('recover');
    let recovered = 0;
    try {
      for (const s of sessions) {
        try {
          const rec = await recoverBufferSession(s.sessionId);
          if (rec) recovered += 1;
        } catch (err) {
          console.error('[recovery] session recover failed:', err);
        }
      }
      if (recovered > 0) {
        toast.success(
          `Obnovil jsem ${recovered === 1 ? 'nedokončenou nahrávku' : `${recovered} nedokončené nahrávky`} — najdeš ji v Knihovně jako „recovered-…". Pokud je to WebM, můžeš ji zkonvertovat na MP4 nebo nahrát na Bunny (server zkonvertuje sám).`,
          { title: 'Nahrávka obnovena', duration: 10000 }
        );
        onRecovered?.();
      } else {
        toast.error('Obnova se nepodařila — buffer je poškozený nebo prázdný.', {
          title: 'Obnova nahrávky',
        });
      }
    } finally {
      setSessions([]);
      setBusy(null);
    }
  };

  const handleDiscard = async () => {
    setBusy('discard');
    try {
      for (const s of sessions) {
        try {
          await deleteBufferSession(s.sessionId);
        } catch (err) {
          console.warn('[recovery] discard failed:', err);
        }
      }
      toast.info('Nedokončená nahrávka byla zahozena.');
    } finally {
      setSessions([]);
      setBusy(null);
    }
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-xl w-[calc(100%-2rem)] animate-fade-in">
      <div className="flex flex-wrap items-center gap-3 bg-bg-card/95 backdrop-blur-xl border border-amber-400/40 rounded-2xl px-4 py-3 shadow-2xl">
        <LifeBuoy className="w-5 h-5 text-amber-400 shrink-0" />
        <div className="flex-1 min-w-[200px]">
          <div className="text-sm font-medium">
            Našel jsem nedokončenou nahrávku ({formatBytes(totalBytes)})
          </div>
          <div className="text-xs text-text-secondary">
            Předchozí nahrávání skončilo pádem prohlížeče nebo zavřením okna.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRecover}
            disabled={busy !== null}
            className="btn-primary px-3 py-1.5 text-sm"
          >
            {busy === 'recover' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Obnovit'
            )}
          </button>
          <button
            onClick={handleDiscard}
            disabled={busy !== null}
            className="btn-ghost px-3 py-1.5 text-sm text-text-secondary"
            title="Smazat nedokončenou nahrávku"
          >
            {busy === 'discard' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Trash2 className="w-4 h-4" /> Zahodit
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
