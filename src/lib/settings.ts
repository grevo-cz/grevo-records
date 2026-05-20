export interface BunnySettings {
  enabled: boolean;
  /** Base URL of the upload proxy, e.g. https://upload.grevo.cz */
  proxyUrl: string;
  /** Shared secret sent in x-upload-secret header. */
  uploadSecret: string;
  /** Folder inside Storage Zone (e.g. recordings/). */
  folder: string;
  /** Automatically upload after recording stops. */
  autoUpload: boolean;
}

export const DEFAULT_BUNNY: BunnySettings = {
  enabled: false,
  proxyUrl: '',
  uploadSecret: '',
  folder: 'recordings/',
  autoUpload: false,
};

const KEY = 'vr-bunny-settings-v2';

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
  return s.enabled && !!s.proxyUrl && !!s.uploadSecret;
}
