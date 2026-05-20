import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Scissors,
  Plus,
  Download,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import type { StoredRecording } from '../types';
import { formatBytes, formatDate, formatDuration } from '../lib/format';
import { TrimEditor } from './TrimEditor';
import { deleteRecording, renameRecording } from '../lib/storage';
import { downloadBlob } from '../lib/download';
import { UploadButton } from './UploadButton';

interface Props {
  recording: StoredRecording;
  onBack: () => void;
  onNew: () => void;
  onUpdated: (rec: StoredRecording) => void;
  onDeleted: () => void;
}

export function Preview({ recording, onBack, onNew, onUpdated, onDeleted }: Props) {
  const [url, setUrl] = useState<string>('');
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(recording.name);
  const [duration, setDuration] = useState(recording.durationMs / 1000 || 0);
  const [trimming, setTrimming] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const u = URL.createObjectURL(recording.blob);
    setUrl(u);
    setName(recording.name);
    setDuration(recording.durationMs / 1000 || 0);
    setPlaybackError(null);
    return () => URL.revokeObjectURL(u);
  }, [recording.blob, recording.name, recording.durationMs]);

  const handleRename = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === recording.name) {
      setRenaming(false);
      setName(recording.name);
      return;
    }
    await renameRecording(recording.id, trimmed);
    onUpdated({ ...recording, name: trimmed });
    setRenaming(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Smazat ${recording.name}?`)) return;
    await deleteRecording(recording.id);
    onDeleted();
  };

  const handleDownload = () => {
    downloadBlob(recording.blob, recording.name);
  };

  return (
    <div className="min-h-full p-10 max-w-6xl mx-auto animate-fade-in">
      <header className="flex items-center justify-between gap-4 mb-6 pt-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button onClick={onBack} className="btn-ghost p-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            {renaming ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename();
                    if (e.key === 'Escape') {
                      setName(recording.name);
                      setRenaming(false);
                    }
                  }}
                  className="input flex-1 text-lg"
                />
                <button onClick={handleRename} className="btn-ghost p-2 text-success">
                  <Check className="w-5 h-5" />
                </button>
                <button
                  onClick={() => {
                    setName(recording.name);
                    setRenaming(false);
                  }}
                  className="btn-ghost p-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <h1
                onClick={() => setRenaming(true)}
                className="text-xl font-semibold tracking-tight truncate cursor-text hover:text-accent transition-colors"
                title="Klikni pro přejmenování"
              >
                {recording.name}
              </h1>
            )}
            <div className="text-xs text-text-muted mt-1">
              {formatDate(recording.createdAt)} · {formatBytes(recording.size)}
              {duration > 0 && ` · ${formatDuration(duration)}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onNew} className="btn-secondary">
            <Plus className="w-4 h-4" /> Nové
          </button>
        </div>
      </header>

      <div className="card overflow-hidden bg-black relative">
        {url && (
          <video
            ref={videoRef}
            src={url}
            controls
            className="w-full aspect-video bg-black"
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (isFinite(d) && d > 0) setDuration(d);
              setPlaybackError(null);
            }}
            onError={() => {
              setPlaybackError(
                `Nahrávku se nepodařilo přehrát (formát: ${recording.mimeType || 'neznámý'}). Zkus ji stáhnout a otevřít externě.`
              );
            }}
          />
        )}
        {playbackError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85 backdrop-blur-sm p-6">
            <div className="text-center max-w-md">
              <div className="text-danger font-medium mb-2">Chyba přehrávání</div>
              <p className="text-sm text-text-secondary mb-4">{playbackError}</p>
              <button onClick={handleDownload} className="btn-primary">
                <Download className="w-4 h-4" /> Stáhnout soubor
              </button>
            </div>
          </div>
        )}
      </div>

      {trimming && duration > 0 && videoRef.current ? (
        <TrimEditor
          recording={recording}
          videoEl={videoRef.current}
          duration={duration}
          onDone={(rec) => {
            onUpdated(rec);
            setTrimming(false);
          }}
          onCancel={() => setTrimming(false)}
        />
      ) : (
        <div className="flex flex-col gap-3 mt-5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setTrimming(true)}
              disabled={!duration}
              className="btn-primary"
            >
              <Scissors className="w-4 h-4" /> Střih
            </button>
            <UploadButton
              recording={recording}
              variant="secondary"
              onUploaded={onUpdated}
            />
            <button onClick={handleDownload} className="btn-secondary">
              <Download className="w-4 h-4" /> Stáhnout soubor
            </button>
            <div className="flex-1" />
            <button onClick={handleDelete} className="btn-danger">
              <Trash2 className="w-4 h-4" /> Smazat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
