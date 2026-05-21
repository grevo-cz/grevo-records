import { loadBunnySettings } from './settings';
import { PROXY_URL, UPLOAD_SECRET } from './proxy-config';

export interface UploadResult {
  url: string;
  storagePath: string;
}

export type UploadProgress = (loaded: number, total: number, pct: number) => void;

/**
 * Uploads a recording blob to the team upload proxy.
 * Proxy URL + upload secret come from build-time constants;
 * Bunny credentials are per-user from Settings and sent as headers.
 */
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

function singleUploadAttempt(
  blob: Blob,
  filename: string,
  onProgress?: UploadProgress
): Promise<UploadResult> {
  const s = loadBunnySettings();
  if (!s.enabled) {
    return Promise.reject(new UploadError('Bunny upload je vypnutý v Settings.', false));
  }
  if (!s.storageZone) return Promise.reject(new UploadError('Chybí Storage Zone Name.', false));
  if (!s.accessKey) return Promise.reject(new UploadError('Chybí Bunny Access Key.', false));
  if (!s.pullZoneUrl) return Promise.reject(new UploadError('Chybí Pull Zone URL.', false));

  const base = PROXY_URL.replace(/\/+$/, '');
  const url =
    `${base}/upload?name=${encodeURIComponent(filename)}` +
    `&folder=${encodeURIComponent(s.folder)}`;

  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('x-upload-secret', UPLOAD_SECRET);
    xhr.setRequestHeader('x-bunny-zone', s.storageZone);
    xhr.setRequestHeader('x-bunny-host', s.storageHost || 'storage.bunnycdn.com');
    xhr.setRequestHeader('x-bunny-key', s.accessKey);
    xhr.setRequestHeader('x-pull-zone', s.pullZoneUrl.replace(/\/+$/, ''));
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
        resolve({ url: data.url, storagePath: data.storagePath });
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
      reject(new UploadError('Síťová chyba — zkontroluj Proxy URL a CORS.', true));
    xhr.ontimeout = () => reject(new UploadError('Upload timeout.', true));
    xhr.send(blob);
  });
}

/**
 * Uploads to Bunny via the team proxy with automatic retry on transient
 * failures (5xx, network errors).
 */
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
