import { useEffect, useState } from 'react';
import { Trash2, Video, Search, Download, Cloud } from 'lucide-react';
import type { StoredRecording } from '../types';
import { formatBytes, formatDate, formatDuration } from '../lib/format';
import { listRecordings, deleteRecording, estimateStorage } from '../lib/storage';
import { downloadBlob } from '../lib/download';
import { UploadButton } from './UploadButton';

interface Props {
  onOpen: (rec: StoredRecording) => void;
}

export function Library({ onOpen }: Props) {
  const [recordings, setRecordings] = useState<StoredRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);

  const load = async () => {
    setLoading(true);
    const [list, est] = await Promise.all([listRecordings(), estimateStorage()]);
    setRecordings(list);
    setUsage(est);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = recordings.filter((r) =>
    r.name.toLowerCase().includes(query.toLowerCase())
  );

  const handleDelete = async (rec: StoredRecording, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Smazat ${rec.name}?`)) return;
    await deleteRecording(rec.id);
    load();
  };

  const handleDownload = (rec: StoredRecording, e: React.MouseEvent) => {
    e.stopPropagation();
    downloadBlob(rec.blob, rec.name);
  };

  return (
    <div className="min-h-full p-10 max-w-6xl mx-auto animate-fade-in">
      <header className="flex items-end justify-between gap-4 mb-8 pt-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Knihovna</h1>
          <p className="text-text-secondary mt-2 text-sm">
            Nahrávky uložené v prohlížeči{' '}
            {usage && (
              <span className="text-text-muted">
                · využito {formatBytes(usage.usage)} z {formatBytes(usage.quota)}
              </span>
            )}
          </p>
        </div>
      </header>

      <div className="relative mb-6">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hledat nahrávku…"
          className="input w-full pl-9"
        />
      </div>

      {loading ? (
        <div className="text-text-secondary py-20 text-center">Načítám…</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center">
          <Video className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary">
            {recordings.length === 0
              ? 'Zatím tu nic není. Pojď něco nahrát!'
              : 'Žádné shody.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((rec) => (
            <RecordingCard
              key={rec.id}
              rec={rec}
              onOpen={() => onOpen(rec)}
              onDelete={(e) => handleDelete(rec, e)}
              onDownload={(e) => handleDownload(rec, e)}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RecordingCard({
  rec,
  onOpen,
  onDelete,
  onDownload,
  onChanged,
}: {
  rec: StoredRecording;
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onDownload: (e: React.MouseEvent) => void;
  onChanged: () => void;
}) {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    const u = URL.createObjectURL(rec.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [rec.blob]);

  return (
    <button
      onClick={onOpen}
      className="card text-left overflow-hidden group hover:border-accent transition-all"
    >
      <div className="aspect-video bg-black relative">
        {url && (
          <video
            src={url}
            preload="metadata"
            className="w-full h-full object-cover"
            muted
          />
        )}
        {rec.uploadedUrl && (
          <span
            className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-accent/90 text-white text-[10px] font-medium inline-flex items-center gap-1"
            title="Nahráno na Bunny CDN"
          >
            <Cloud className="w-3 h-3" /> Bunny
          </span>
        )}
        {rec.durationMs > 0 && (
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/70 text-xs font-mono">
            {formatDuration(rec.durationMs / 1000)}
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="font-medium text-sm truncate" title={rec.name}>
          {rec.name}
        </div>
        <div className="text-xs text-text-muted mt-1 flex items-center justify-between">
          <span>{formatDate(rec.createdAt)}</span>
          <span>{formatBytes(rec.size)}</span>
        </div>
        <div className="flex items-center justify-end gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <UploadButton recording={rec} variant="icon" onUploaded={onChanged} />
          <span
            onClick={onDownload}
            className="btn-ghost p-1.5 cursor-pointer"
            title="Stáhnout"
          >
            <Download className="w-4 h-4" />
          </span>
          <span
            onClick={onDelete}
            className="btn-ghost p-1.5 cursor-pointer hover:text-danger"
            title="Smazat"
          >
            <Trash2 className="w-4 h-4" />
          </span>
        </div>
      </div>
    </button>
  );
}
