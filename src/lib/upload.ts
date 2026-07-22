import { loadBunnySettings } from './settings';
import { PROXY_URL, UPLOAD_SECRET } from './proxy-config';

export interface UploadResult {
  /** Shareable player page (adaptive bitrate via Bunny Stream). */
  url: string;
  /** Embed URL for <iframe> use. */
  embedUrl?: string;
  /** Bunny Stream video GUID. */
  guid?: string;
}

export type UploadProgress = (loaded: number, total: number, pct: number) => void;

/**
 * WebM recordings at/above this size should not go through in-browser
 * ffmpeg.wasm conversion (slow, 2 GB hard limit). With Bunny Stream this
 * only gates the OFFLINE convert path — Stream transcodes uploads itself.
 */
export const SERVER_CONVERT_THRESHOLD_BYTES = 150 * 1024 * 1024;

export function isWebmMime(mimeType: string): boolean {
  return /webm/i.test(mimeType);
}

export interface UploadOptions {
  /** Max retries on transient failure (default 2 → up to 3 attempts total). */
  maxRetries?: number;
  /** Called once after each failed attempt before retry. */
  onRetry?: (attempt: number, reason: string) => void;
}

class UploadError extends Error {
  constructor(message: string, public transient: boolean) {
    super(message);
  }
}

/**
 * Uploads a recording to the user's Bunny Stream library via the team
 * proxy. Stream transcodes to adaptive-bitrate HLS itself, so WebM and
 * MP4 are both uploaded as-is (no conversion step anywhere).
 */
function singleUploadAttempt(
  blob: Blob,
  filename: string,
  onProgress?: UploadProgress
): Promise<UploadResult> {
  const s = loadBunnySettings();
  if (!s.enabled) {
    return Promise.reject(new UploadError('Bunny upload je vypnutý v Nastavení.', false));
  }
  if (!/^\d+$/.test(s.libraryId.trim())) {
    return Promise.reject(new UploadError('Chybí platné Library ID (číslo).', false));
  }
  if (!s.apiKey.trim()) {
    return Promise.reject(new UploadError('Chybí Stream API klíč.', false));
  }

  const base = PROXY_URL.replace(/\/+$/, '');
  const url =
    `${base}/upload-stream?name=${encodeURIComponent(filename)}` +
    (s.collectionId.trim()
      ? `&collection=${encodeURIComponent(s.collectionId.trim())}`
      : '');

  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('x-upload-secret', UPLOAD_SECRET);
    xhr.setRequestHeader('x-stream-library', s.libraryId.trim());
    xhr.setRequestHeader('x-stream-key', s.apiKey.trim());
    xhr.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(e.loaded, e.total, (e.loaded / e.total) * 100);
        }
      };
    }

    xhr.onload = () => {
      let data: any = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && data?.ok) {
        resolve({ url: data.url, embedUrl: data.embedUrl, guid: data.guid });
      } else {
        const transient = xhr.status === 0 || xhr.status >= 500;
        reject(
          new UploadError(
            data?.error ||
              `Upload selhal (${xhr.status}). ${data?.details?.slice(0, 200) ?? ''}`,
            transient
          )
        );
      }
    };
    xhr.onerror = () =>
      reject(new UploadError('Síťová chyba. Zkontroluj připojení.', true));
    xhr.ontimeout = () => reject(new UploadError('Upload timeout.', true));
    xhr.send(blob);
  });
}

/** Upload with automatic retry on transient failures (5xx, network errors). */
export async function uploadToBunny(
  blob: Blob,
  filename: string,
  onProgress?: UploadProgress,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const maxRetries = options.maxRetries ?? 2;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await singleUploadAttempt(blob, filename, onProgress);
    } catch (err) {
      const e = err as UploadError;
      const isTransient = e instanceof UploadError ? e.transient : false;
      if (!isTransient || attempt >= maxRetries) {
        throw new Error(e.message);
      }
      attempt += 1;
      const backoffMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s
      options.onRetry?.(attempt, e.message);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
}
