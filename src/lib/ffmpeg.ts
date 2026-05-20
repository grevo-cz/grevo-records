// Lazy-loaded ffmpeg.wasm for in-browser WebM → MP4 conversion.
// Uses single-thread variant (no SharedArrayBuffer, no COOP/COEP headers).
// Core files are fetched from unpkg the first time and cached by the browser.

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

const CORE_VERSION = '0.12.6';
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

export type ConvertProgress = (pct: number, stage: 'loading' | 'converting') => void;

async function getFFmpeg(onProgress?: ConvertProgress): Promise<FFmpeg> {
  if (instance) return instance;
  if (loading) return loading;

  loading = (async () => {
    onProgress?.(0, 'loading');
    const ffmpeg = new FFmpeg();
    ffmpeg.on('log', () => {
      /* swallow ffmpeg logs */
    });
    const coreURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript');
    onProgress?.(50, 'loading');
    const wasmURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm');
    onProgress?.(90, 'loading');
    await ffmpeg.load({ coreURL, wasmURL });
    onProgress?.(100, 'loading');
    instance = ffmpeg;
    return ffmpeg;
  })();
  return loading;
}

export function isFFmpegReady(): boolean {
  return instance !== null;
}

/**
 * Converts a WebM blob to MP4 (H.264 + AAC) entirely in the browser.
 * Approx. 0.5–3x video length on Apple Silicon (slower on older CPUs).
 */
export async function convertToMp4(
  source: Blob,
  onProgress?: ConvertProgress
): Promise<Blob> {
  const ffmpeg = await getFFmpeg(onProgress);

  const handleProgress = (event: { progress: number }) => {
    if (onProgress) onProgress(Math.min(99, Math.max(0, event.progress * 100)), 'converting');
  };
  ffmpeg.on('progress', handleProgress);

  const inputName = 'in.webm';
  const outputName = 'out.mp4';

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(source));
    await ffmpeg.exec([
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
    const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
    // Copy into a fresh ArrayBuffer to avoid SharedArrayBuffer type mismatches.
    const bytes = new Uint8Array(data.byteLength);
    bytes.set(data);
    onProgress?.(100, 'converting');
    return new Blob([bytes], { type: 'video/mp4' });
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
