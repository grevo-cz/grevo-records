import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X, Loader2, Scissors, Plus, Trash } from 'lucide-react';
import type { StoredRecording } from '../types';
import { formatDuration } from '../lib/format';
import { saveRecording } from '../lib/storage';
import { composeSegments, computeKeptSegments, type Segment } from '../lib/compose';

interface Props {
  recording: StoredRecording;
  videoEl: HTMLVideoElement;
  duration: number;
  onDone: (rec: StoredRecording) => void;
  onCancel: () => void;
}

type DragHandle =
  | { kind: 'trimStart' }
  | { kind: 'trimEnd' }
  | { kind: 'playhead' }
  | { kind: 'delStart'; id: string }
  | { kind: 'delEnd'; id: string }
  | { kind: 'delMove'; id: string; offset: number }
  | null;

interface DeleteRegion {
  id: string;
  start: number;
  end: number;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function TrimEditor({
  recording,
  videoEl,
  duration,
  onDone,
  onCancel,
}: Props) {
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(duration);
  const [deletes, setDeletes] = useState<DeleteRegion[]>([]);
  const [playhead, setPlayhead] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [progressPct, setProgressPct] = useState(0);

  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragHandle>(null);

  const kept = useMemo(
    () => computeKeptSegments(duration, trimStart, trimEnd, deletes),
    [duration, trimStart, trimEnd, deletes]
  );
  const keptDuration = useMemo(
    () => kept.reduce((acc, s) => acc + (s.end - s.start), 0),
    [kept]
  );

  // Track playhead
  useEffect(() => {
    const onTime = () => setPlayhead(videoEl.currentTime);
    videoEl.addEventListener('timeupdate', onTime);
    return () => videoEl.removeEventListener('timeupdate', onTime);
  }, [videoEl]);

  // During edit playback, skip delete regions and loop within trim range
  useEffect(() => {
    const onTime = () => {
      const t = videoEl.currentTime;
      if (t < trimStart - 0.05) {
        videoEl.currentTime = trimStart;
        return;
      }
      if (t > trimEnd) {
        videoEl.currentTime = trimStart;
        return;
      }
      for (const d of deletes) {
        if (t >= d.start - 0.02 && t < d.end) {
          videoEl.currentTime = Math.min(d.end + 0.01, trimEnd);
          return;
        }
      }
    };
    videoEl.addEventListener('timeupdate', onTime);
    return () => videoEl.removeEventListener('timeupdate', onTime);
  }, [videoEl, trimStart, trimEnd, deletes]);

  const pctFromX = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const onTrackDown = (e: React.MouseEvent, h: DragHandle) => {
    e.stopPropagation();
    dragRef.current = h;
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const handle = dragRef.current;
      if (!handle || !trackRef.current) return;
      const t = pctFromX(e.clientX) * duration;

      if (handle.kind === 'trimStart') {
        const next = Math.max(0, Math.min(trimEnd - 0.2, t));
        setTrimStart(next);
        videoEl.currentTime = next;
      } else if (handle.kind === 'trimEnd') {
        const next = Math.max(trimStart + 0.2, Math.min(duration, t));
        setTrimEnd(next);
        videoEl.currentTime = Math.max(trimStart, next - 0.1);
      } else if (handle.kind === 'playhead') {
        let next = Math.max(trimStart, Math.min(trimEnd, t));
        // Snap out of any delete region
        for (const d of deletes) {
          if (next >= d.start && next < d.end) {
            next = d.end;
            break;
          }
        }
        videoEl.currentTime = next;
      } else if (handle.kind === 'delStart') {
        setDeletes((prev) =>
          prev.map((d) => {
            if (d.id !== handle.id) return d;
            return {
              ...d,
              start: Math.max(trimStart, Math.min(d.end - 0.1, t)),
            };
          })
        );
      } else if (handle.kind === 'delEnd') {
        setDeletes((prev) =>
          prev.map((d) => {
            if (d.id !== handle.id) return d;
            return {
              ...d,
              end: Math.max(d.start + 0.1, Math.min(trimEnd, t)),
            };
          })
        );
      } else if (handle.kind === 'delMove') {
        setDeletes((prev) =>
          prev.map((d) => {
            if (d.id !== handle.id) return d;
            const width = d.end - d.start;
            let newStart = t - handle.offset;
            newStart = Math.max(trimStart, Math.min(trimEnd - width, newStart));
            return { ...d, start: newStart, end: newStart + width };
          })
        );
      }
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [duration, trimStart, trimEnd, deletes, videoEl]);

  const addCutAtPlayhead = () => {
    const half = Math.min(1, (trimEnd - trimStart) / 10);
    let start = Math.max(trimStart, playhead - half);
    let end = Math.min(trimEnd, playhead + half);
    if (end - start < 0.2) {
      start = Math.max(trimStart, playhead - 0.5);
      end = Math.min(trimEnd, start + 1);
      start = Math.max(trimStart, end - 1);
    }
    setDeletes((prev) => [...prev, { id: genId(), start, end }]);
  };

  const removeDelete = (id: string) => {
    setDeletes((prev) => prev.filter((d) => d.id !== id));
  };

  const handleConfirm = async () => {
    if (kept.length === 0) {
      alert('Nezbyl žádný úsek k uložení.');
      return;
    }
    setExporting(true);
    setProgressPct(0);
    try {
      const result = await composeSegments(
        recording.blob,
        kept as Segment[],
        (p) => setProgressPct(p)
      );
      const base = recording.name.replace(/\.[^.]+$/, '');
      const ext = result.mimeType.includes('mp4') ? '.mp4' : '.webm';
      const rec = await saveRecording({
        blob: result.blob,
        name: `${base}-trimmed${ext}`,
        durationMs: result.durationMs,
        mimeType: result.mimeType,
      });
      onDone(rec);
    } catch (e) {
      alert('Střih selhal: ' + (e as Error).message);
      setExporting(false);
    }
  };

  // Helpers for rendering
  const trimStartPct = (trimStart / duration) * 100;
  const trimEndPct = (trimEnd / duration) * 100;
  const phPct = (playhead / duration) * 100;
  const removedSeconds = trimEnd - trimStart - keptDuration + trimStart + (duration - trimEnd);
  const totalRemoved = duration - keptDuration;

  return (
    <div className="card p-5 mt-5">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h2 className="font-semibold">Střih</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Tažením krajních úchytů ořízneš začátek/konec. Tlačítkem
            <span className="text-text-secondary"> Vyříznout úsek </span>
            odebereš část uprostřed — zbytek se spojí dohromady.
          </p>
        </div>
        <div className="text-sm text-text-secondary tabular-nums">
          Finální délka:{' '}
          <span className="text-text-primary font-medium">
            {formatDuration(keptDuration)}
          </span>{' '}
          <span className="text-text-muted">
            (odstraněno {formatDuration(totalRemoved)})
          </span>
        </div>
      </div>

      <div
        ref={trackRef}
        className="relative h-16 bg-bg-elev rounded-xl select-none"
        onMouseDown={(e) => {
          const t = pctFromX(e.clientX) * duration;
          if (t >= trimStart && t <= trimEnd) {
            // Skip onto end of delete region if inside one
            let target = t;
            for (const d of deletes) {
              if (target >= d.start && target < d.end) {
                target = d.end;
                break;
              }
            }
            videoEl.currentTime = target;
            dragRef.current = { kind: 'playhead' };
          }
        }}
      >
        {/* Outside trim — dim */}
        <div
          className="absolute top-0 bottom-0 left-0 bg-black/55 rounded-l-xl"
          style={{ width: `${trimStartPct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 right-0 bg-black/55 rounded-r-xl"
          style={{ width: `${100 - trimEndPct}%` }}
        />
        {/* Kept region — soft accent */}
        <div
          className="absolute top-0 bottom-0 border-y-2 border-accent/70 bg-accent/8"
          style={{
            left: `${trimStartPct}%`,
            width: `${trimEndPct - trimStartPct}%`,
          }}
        />

        {/* Delete regions */}
        {deletes.map((d) => {
          const left = (d.start / duration) * 100;
          const width = ((d.end - d.start) / duration) * 100;
          return (
            <div
              key={d.id}
              className="absolute top-0 bottom-0 bg-danger/30 border-y-2 border-danger group"
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              {/* Move-region drag layer (middle) */}
              <div
                onMouseDown={(e) => {
                  const t = pctFromX(e.clientX) * duration;
                  onTrackDown(e, {
                    kind: 'delMove',
                    id: d.id,
                    offset: t - d.start,
                  });
                }}
                className="absolute inset-0 cursor-grab active:cursor-grabbing"
              />
              {/* Start handle */}
              <div
                onMouseDown={(e) => onTrackDown(e, { kind: 'delStart', id: d.id })}
                className="absolute top-0 bottom-0 left-0 w-2 -ml-1 bg-danger rounded-md cursor-ew-resize"
              />
              {/* End handle */}
              <div
                onMouseDown={(e) => onTrackDown(e, { kind: 'delEnd', id: d.id })}
                className="absolute top-0 bottom-0 right-0 w-2 -mr-1 bg-danger rounded-md cursor-ew-resize"
              />
              {/* Remove button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeDelete(d.id);
                }}
                className="absolute -top-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-danger text-white flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
                title="Odstranit výřez"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        {/* Trim start handle */}
        <div
          onMouseDown={(e) => onTrackDown(e, { kind: 'trimStart' })}
          className="absolute top-0 bottom-0 w-3 -ml-1.5 bg-accent rounded-md cursor-ew-resize hover:bg-accent-hover flex items-center justify-center z-10"
          style={{ left: `${trimStartPct}%` }}
        >
          <div className="w-0.5 h-6 bg-white/80 rounded" />
        </div>
        {/* Trim end handle */}
        <div
          onMouseDown={(e) => onTrackDown(e, { kind: 'trimEnd' })}
          className="absolute top-0 bottom-0 w-3 -ml-1.5 bg-accent rounded-md cursor-ew-resize hover:bg-accent-hover flex items-center justify-center z-10"
          style={{ left: `${trimEndPct}%` }}
        >
          <div className="w-0.5 h-6 bg-white/80 rounded" />
        </div>

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none z-20"
          style={{ left: `${phPct}%` }}
        />
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-text-muted tabular-nums">
        <span>0:00</span>
        <span className="font-mono text-text-secondary">
          {formatDuration(playhead)}
        </span>
        <span>{formatDuration(duration)}</span>
      </div>

      <div className="flex items-center justify-between gap-2 mt-5 flex-wrap">
        <button
          onClick={addCutAtPlayhead}
          disabled={exporting}
          className="btn-secondary"
        >
          <Scissors className="w-4 h-4" /> Vyříznout úsek
          {deletes.length > 0 && (
            <span className="ml-1 text-text-muted">({deletes.length})</span>
          )}
        </button>
        {deletes.length > 0 && (
          <button
            onClick={() => setDeletes([])}
            disabled={exporting}
            className="btn-ghost text-xs"
          >
            <Trash className="w-3.5 h-3.5" /> Smazat všechny výřezy
          </button>
        )}
        <div className="flex-1" />
        {exporting && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Exportuji… {Math.round(progressPct)}%</span>
          </div>
        )}
        <button onClick={onCancel} disabled={exporting} className="btn-secondary">
          <X className="w-4 h-4" /> Zrušit
        </button>
        <button
          onClick={handleConfirm}
          disabled={exporting || keptDuration < 0.2}
          className="btn-primary"
        >
          <Check className="w-4 h-4" /> Uložit střih
        </button>
      </div>
    </div>
  );
}
