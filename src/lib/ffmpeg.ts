// Lazy-loaded ffmpeg.wasm for in-browser WebM → MP4 conversion.
// We try self-hosted files in /ffmpeg/ first, fall back to unpkg.
// Both paths go through toBlobURL so the internal worker can importScripts().

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const CORE_VERSION = '0.12.6';
const UNPKG_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

export type ConvertProgress = (
  pct: number,
  stage: 'loading' | 'converting'
) => void;

async function getFFmpeg(onProgress?: ConvertProgress): Promise<FFmpeg> {
  if (instance) return instance;
  if (loading) return loading;

  loading = (async () => {
    onProgress?.(0, 'loading');
    const ffmpeg = new FFmpeg();
    ffmpeg.on('log', () => {});

    const sources: { label: string; core: string; wasm: string }[] = [
      {
        label: 'local',
        core: new URL('/ffmpeg/ffmpeg-core.js', window.location.href).toString(),
        wasm: new URL('/ffmpeg/ffmpeg-core.wasm', window.location.href).toString(),
      },
      {
        label: 'unpkg',
        core: `${UNPKG_BASE}/ffmpeg-core.js`,
        wasm: `${UNPKG_BASE}/ffmpeg-core.wasm`,
      },
    ];

    let lastErr: unknown = null;
    for (const src of sources) {
      try {
        onProgress?.(10, 'loading');
        const coreURL = await toBlobURL(src.core, 'text/javascript');
        onProgress?.(50, 'loading');
        const wasmURL = await toBlobURL(src.wasm, 'application/wasm');
        onProgress?.(90, 'loading');
        await ffmpeg.load({ coreURL, wasmURL });
        onProgress?.(100, 'loading');
        instance = ffmpeg;
        return ffmpeg;
      } catch (err) {
        lastErr = err;
        console.warn(`[ffmpeg] load from ${src.label} failed, trying next:`, err);
      }
    }

    loading = null;
    throw new Error(
      'ffmpeg.wasm se nepodařilo načíst (lokálně i z unpkg): ' +
        (lastErr instanceof Error ? lastErr.message : String(lastErr) || 'unknown')
    );
  })();
  return loading;
}

export function isFFmpegReady(): boolean {
  return instance !== null;
}

/**
 * Converts a WebM blob to MP4 (H.264 + AAC) entirely in the browser.
 * Approx. 0.5–3x video length on Apple Silicon.
 */
export async function convertToMp4(
  source: Blob,
  onProgress?: ConvertProgress
): Promise<Blob> {
  const ffmpeg = await getFFmpeg(onProgress);

  const handleProgress = (event: { progress: number }) => {
    if (onProgress) {
      onProgress(
        Math.min(99, Math.max(0, event.progress * 100)),
        'converting'
      );
    }
  };
  ffmpeg.on('progress', handleProgress);

  const inputName = 'in.webm';
  const outputName = 'out.mp4';

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(source));
    const ret = await ffmpeg.exec([
      '-i',
      inputName,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outputName,
    ]);
    if (ret !== 0) throw new Error(`ffmpeg exec returned ${ret}`);

    const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
    const bytes = new Uint8Array(data.byteLength);
    bytes.set(data);
    onProgress?.(100, 'converting');
    return new Blob([bytes], { type: 'video/mp4' });
  } catch (err) {
    throw new Error(
      'Konverze ffmpeg selhala: ' +
        (err instanceof Error ? err.message : String(err) || 'unknown')
    );
  } finally {
    ffmpeg.off('progress', handleProgress);
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {}
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {}
  }
}
