// In-browser WebM → MP4 conversion, ported from the user's vidslim project.
//
// Two cores, picked at runtime:
// - /ffmpeg    → multithreaded (needs SharedArrayBuffer via COOP/COEP headers,
//                i.e. crossOriginIsolated). ~4x faster.
// - /ffmpeg-st → single-threaded fallback when isolation is unavailable.
//
// Critical encode flags (learned the hard way):
// - `-fps_mode vfr`  — MediaRecorder WebM reports a bogus 1000 fps nominal
//   rate; without VFR, ffmpeg CFR-duplicates frames and a 20 s clip takes
//   10+ minutes to encode.
// - `-threads 4|1`   — x264 auto-threading exceeds the wasm pthread pool and
//   aborts the core; pin explicitly.

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;
let loadedMt = false;

export type ConvertProgress = (
  pct: number,
  stage: 'loading' | 'converting'
) => void;

/** Multithreaded core needs SharedArrayBuffer (COOP/COEP → crossOriginIsolated). */
export function useMultithreaded(): boolean {
  const forced = new URLSearchParams(location.search).get('core');
  if (forced === 'st') return false;
  if (forced === 'mt') return true;
  return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
}

async function loadCore(
  ffmpeg: FFmpeg,
  mt: boolean,
  onProgress?: ConvertProgress
): Promise<void> {
  const base = new URL(mt ? '/ffmpeg' : '/ffmpeg-st', window.location.href).toString();
  onProgress?.(10, 'loading');
  // Blob URLs: the internal worker dynamic-imports the core — must be
  // importable from the worker context regardless of origin quirks.
  const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript');
  onProgress?.(40, 'loading');
  const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm');
  onProgress?.(85, 'loading');
  const workerURL = mt
    ? await toBlobURL(`${base}/ffmpeg-core.worker.js`, 'text/javascript')
    : undefined;
  // load() hangs forever if the worker is silently blocked (e.g. COEP
  // mismatch on the worker script) — cap it so the failure is visible
  // and the ST fallback can kick in.
  await Promise.race([
    ffmpeg.load({ coreURL, wasmURL, workerURL }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`ffmpeg ${mt ? 'MT' : 'ST'} load timeout (60 s)`)),
        60_000
      )
    ),
  ]);
  onProgress?.(100, 'loading');
}

function getFFmpeg(onProgress?: ConvertProgress): Promise<FFmpeg> {
  if (instance) return Promise.resolve(instance);
  if (loading) return loading;

  loading = (async () => {
    const ffmpeg = new FFmpeg();
    ffmpeg.on('log', () => {});
    const wantMt = useMultithreaded();
    try {
      await loadCore(ffmpeg, wantMt, onProgress);
      loadedMt = wantMt;
    } catch (mtErr) {
      if (!wantMt) {
        loading = null;
        throw new Error(
          'ffmpeg.wasm se nepodařilo načíst: ' +
            (mtErr instanceof Error ? mtErr.message : String(mtErr))
        );
      }
      // MT core failed (isolation edge case) → retry single-threaded.
      console.warn('[ffmpeg] MT core failed, falling back to ST:', mtErr);
      try {
        await loadCore(ffmpeg, false, onProgress);
        loadedMt = false;
      } catch (stErr) {
        loading = null;
        throw new Error(
          'ffmpeg.wasm se nepodařilo načíst (MT i ST): ' +
            (stErr instanceof Error ? stErr.message : String(stErr))
        );
      }
    }
    instance = ffmpeg;
    return ffmpeg;
  })();
  return loading;
}

export function isFFmpegReady(): boolean {
  return instance !== null;
}

/** Warm up the engine (~31 MB wasm) ahead of time, e.g. on app load. */
export function preloadFFmpeg(): void {
  getFFmpeg().catch(() => {});
}

/**
 * Converts a WebM blob to MP4 (H.264 + AAC) entirely in the browser.
 * With the MT core and VFR fix this runs near-realtime for screen content.
 */
export async function convertToMp4(
  source: Blob,
  onProgress?: ConvertProgress
): Promise<Blob> {
  const ffmpeg = await getFFmpeg(onProgress);

  const handleProgress = ({ progress }: { progress: number }) => {
    if (onProgress) {
      onProgress(Math.min(99, Math.max(0, progress * 100)), 'converting');
    }
  };
  ffmpeg.on('progress', handleProgress);

  const inputName = 'in.webm';
  const outputName = 'out.mp4';

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(source));
    const ret = await ffmpeg.exec([
      '-i', inputName,
      // Keep source frame timestamps — MediaRecorder/webm inputs report a
      // bogus 1000 fps nominal rate that would otherwise be CFR-duplicated.
      '-fps_mode', 'vfr',
      // x264 auto-threading exceeds the wasm pthread pool and aborts the core.
      '-threads', loadedMt ? '4' : '1',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputName,
    ]);
    if (ret !== 0) throw new Error(`ffmpeg exited with code ${ret}`);

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

/** Abort a running conversion. The engine reloads on next use. */
export function cancelConversion(): void {
  instance?.terminate();
  instance = null;
  loading = null;
}
