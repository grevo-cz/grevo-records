// Lazy-loaded ffmpeg.wasm for in-browser WebM → MP4 conversion.
// Core files are bundled in public/ffmpeg/ (self-hosted) — no unpkg/CORS issues.

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

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
    try {
      onProgress?.(0, 'loading');
      const ffmpeg = new FFmpeg();
      // Optional: capture logs for debugging.
      ffmpeg.on('log', () => {});
      onProgress?.(30, 'loading');
      await ffmpeg.load({
        coreURL: new URL('/ffmpeg/ffmpeg-core.js', window.location.href).toString(),
        wasmURL: new URL('/ffmpeg/ffmpeg-core.wasm', window.location.href).toString(),
      });
      onProgress?.(100, 'loading');
      instance = ffmpeg;
      return ffmpeg;
    } catch (err) {
      loading = null; // allow retry on next call
      throw new Error(
        'ffmpeg.wasm se nepodařilo načíst: ' +
          (err instanceof Error ? err.message : String(err) || 'unknown')
      );
    }
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
