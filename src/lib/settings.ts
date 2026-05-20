export interface BunnySettings {
  enabled: boolean;
  /** This user's Bunny Storage Zone Name. */
  storageZone: string;
  /** Storage hostname based on region. */
  storageHost: string;
  /** This user's Storage Access Key (Password). */
  accessKey: string;
  /** This user's Pull Zone URL (CDN base, used to build shareable links). */
  pullZoneUrl: string;
  /** Subfolder inside the Storage Zone. */
  folder: string;
  autoUpload: boolean;
}

export const DEFAULT_BUNNY: BunnySettings = {
  enabled: false,
  storageZone: '',
  storageHost: 'storage.bunnycdn.com',
  accessKey: '',
  pullZoneUrl: '',
  folder: 'recordings/',
  autoUpload: false,
};

const KEY = 'vr-bunny-settings-v4';

export function loadBunnySettings(): BunnySettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_BUNNY;
    return { ...DEFAULT_BUNNY, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_BUNNY;
  }
}

export function saveBunnySettings(s: BunnySettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function isBunnyConfigured(s: BunnySettings = loadBunnySettings()): boolean {
  return s.enabled && !!s.storageZone && !!s.accessKey && !!s.pullZoneUrl;
}
