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
export function uploadToBunny(
  blob: Blob,
  filename: string,
  onProgress?: UploadProgress
): Promise<UploadResult> {
  const s = loadBunnySettings();
  if (!s.enabled) {
    return Promise.reject(new Error('Bunny upload je vypnutý v Settings.'));
  }
  if (!s.storageZone) return Promise.reject(new Error('Chybí Storage Zone Name.'));
  if (!s.accessKey) return Promise.reject(new Error('Chybí Bunny Access Key.'));
  if (!s.pullZoneUrl) return Promise.reject(new Error('Chybí Pull Zone URL.'));

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
        reject(
          new Error(
            data?.error ||
              `Upload selhal (${xhr.status}). ${data?.details?.slice(0, 200) ?? ''}`
          )
        );
      }
    };
    xhr.onerror = () =>
      reject(new Error('Síťová chyba — zkontroluj Proxy URL a CORS.'));
    xhr.ontimeout = () => reject(new Error('Upload timeout.'));
    xhr.send(blob);
  });
}
