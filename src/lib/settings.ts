// Per-user Bunny Stream settings. Uploads go to the user's own Stream
// video library (adaptive-bitrate HLS, like YouTube) via the shared proxy.
export interface BunnySettings {
  enabled: boolean;
  /** Bunny Stream Video Library ID (number, e.g. 493169). */
  libraryId: string;
  /** The library's API key (Stream → knihovna → API → API Key). */
  apiKey: string;
  /** Optional collection GUID to file uploads under. Empty = library root. */
  collectionId: string;
  autoUpload: boolean;
}

export const DEFAULT_BUNNY: BunnySettings = {
  enabled: false,
  libraryId: '',
  apiKey: '',
  collectionId: '',
  autoUpload: false,
};

import { userScopeKey } from './auth';

// v5: switched from Storage+CDN (static file) to Stream (adaptive playback).
const BASE_KEY = 'vr-bunny-settings-v5';

function key(): string {
  return userScopeKey(BASE_KEY);
}

export function loadBunnySettings(): BunnySettings {
  try {
    const raw = localStorage.getItem(key());
    if (!raw) return DEFAULT_BUNNY;
    return { ...DEFAULT_BUNNY, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_BUNNY;
  }
}

export function saveBunnySettings(s: BunnySettings) {
  localStorage.setItem(key(), JSON.stringify(s));
}

export function isBunnyConfigured(s: BunnySettings = loadBunnySettings()): boolean {
  return s.enabled && /^\d+$/.test(s.libraryId.trim()) && !!s.apiKey.trim();
}
