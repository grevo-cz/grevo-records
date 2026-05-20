// IndexedDB persistent storage for recordings.
// Each recording is one row: id, name, createdAt, size, mimeType, durationMs, blob.
// Recordings are filtered by ownerEmail so each logged-in user sees only their own.

import type { StoredRecording } from '../types';
import { currentSession } from './auth';

const DB_NAME = 'video-recorder';
const DB_VERSION = 1;
const STORE = 'recordings';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode: IDBTransactionMode) {
  return openDb().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

function genId() {
  return (
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
  );
}

export async function saveRecording(input: {
  blob: Blob;
  name: string;
  durationMs: number;
  mimeType: string;
}): Promise<StoredRecording> {
  const session = currentSession();
  const rec: StoredRecording = {
    id: genId(),
    name: input.name,
    createdAt: Date.now(),
    size: input.blob.size,
    mimeType: input.mimeType,
    durationMs: input.durationMs,
    blob: input.blob,
    ownerEmail: session?.email,
  };
  const store = await tx('readwrite');
  await req(store.add(rec));
  return rec;
}

export async function listRecordings(): Promise<StoredRecording[]> {
  const session = currentSession();
  const email = session?.email;
  const store = await tx('readonly');
  const all = await req<StoredRecording[]>(store.getAll());
  return all
    .filter((r) => {
      // Legacy recordings without ownerEmail are visible to everyone (one-time grace).
      if (!r.ownerEmail) return true;
      return r.ownerEmail === email;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getRecording(id: string): Promise<StoredRecording | null> {
  const store = await tx('readonly');
  return (await req<StoredRecording | undefined>(store.get(id))) ?? null;
}

export async function renameRecording(id: string, name: string): Promise<void> {
  const store = await tx('readwrite');
  const rec = await req<StoredRecording | undefined>(store.get(id));
  if (!rec) return;
  rec.name = name;
  await req(store.put(rec));
}

export async function setUploadedUrl(
  id: string,
  uploadedUrl: string
): Promise<StoredRecording | null> {
  const store = await tx('readwrite');
  const rec = await req<StoredRecording | undefined>(store.get(id));
  if (!rec) return null;
  rec.uploadedUrl = uploadedUrl;
  rec.uploadedAt = Date.now();
  await req(store.put(rec));
  return rec;
}

export async function deleteRecording(id: string): Promise<void> {
  const store = await tx('readwrite');
  await req(store.delete(id));
}

function req<T = unknown>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result as T);
    r.onerror = () => reject(r.error);
  });
}

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}
