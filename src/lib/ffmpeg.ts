// In-browser WebM → MP4 conversion, ported from the user's vidslim project.
//
// Two cores, picked at runtime:
// - /ffmpeg    → multithreaded (needs SharedArrayBuffer via COOP/COEP headers,
//                i.e. crossOriginIsolated). ~4x faster.
// - /ffmpeg-st → single-threaded fallback when isolation is unavailable.
//
// Critical encode flags (learned the hard way):
// - `-vf fps=30`     — MediaRecorder WebM reports a bogus 1000 fps nominal
//   rate; default CFR duplicated frames (20 s clip → 10+ min encode) and
//   plain VFR passthrough stuttered in QuickTime/Safari. The fps filter
//   resamples by real PTS to smooth CFR 30.
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
      // MediaRecorder WebM reports a bogus 1000 fps nominal rate; the fps
      // filter ignores it and resamples by real PTS to smooth CFR 30 —
      // VFR passthrough made QuickTime/Safari playback stutter.
      '-vf', 'fps=30',
      // MediaRecorder audio can drift on long recordings; resample keeps sync.
      '-af', 'aresample=async=1',
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

export interface TrimSegment {
  start: number;
  end: number;
}

/**
 * Cuts a recording to the given kept segments (joined seamlessly) and
 * optionally changes playback speed — output is always MP4.
 *
 * Replaces the old canvas-replay exporter: MediaRecorder WebM has no seek
 * cues, so seeking a hidden <video> hung forever. ffmpeg's select filter
 * works on cue-less input and runs near-realtime with the MT core.
 */
export async function trimToMp4(
  source: Blob,
  segments: TrimSegment[],
  playbackRate: number,
  onProgress?: ConvertProgress
): Promise<Blob> {
  if (segments.length === 0) throw new Error('Nezbyly žádné úseky k uložení.');
  const rate = Math.max(0.5, Math.min(2, playbackRate || 1));

  const ffmpeg = await getFFmpeg(onProgress);
  const handleProgress = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(99, Math.max(0, progress * 100)), 'converting');
  };
  ffmpeg.on('progress', handleProgress);

  const inputName = 'trim-in';
  const outputName = 'trim-out.mp4';

  // Per-segment trim + concat preserves the real frame timestamps inside
  // each kept segment. The old select+setpts=N/FRAME_RATE/TB re-stamped
  // frames at the bogus nominal 1000 fps — the whole video track collapsed
  // to milliseconds while audio kept its length (frozen, stuttering output).
  // Final fps=30 resamples to CFR for reliable playback everywhere.
  const seg = (i: number, s: TrimSegment, kind: 'v' | 'a') =>
    kind === 'v'
      ? `[0:v]trim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`
      : `[0:a]atrim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`;
  const vPost = `${rate === 1 ? '' : `setpts=PTS/${rate},`}fps=30`;

  const graphAV = [
    ...segments.map((s, i) => seg(i, s, 'v')),
    ...segments.map((s, i) => seg(i, s, 'a')),
    `${segments.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${segments.length}:v=1:a=1[vc][ac]`,
    `[vc]${vPost}[v]`,
    `[ac]${rate === 1 ? 'anull' : `atempo=${rate}`}[a]`,
  ].join(';');

  const graphV = [
    ...segments.map((s, i) => seg(i, s, 'v')),
    `${segments.map((_, i) => `[v${i}]`).join('')}concat=n=${segments.length}:v=1:a=0[vc]`,
    `[vc]${vPost}[v]`,
  ].join(';');

  const commonOut = [
    '-threads', loadedMt ? '4' : '1',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
  ];

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(source));

    // First try with audio; recordings without an audio track make the
    // audio filter fail — retry video-only.
    let ret = await ffmpeg.exec([
      '-i', inputName,
      '-filter_complex', graphAV,
      '-map', '[v]', '-map', '[a]',
      ...commonOut,
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      outputName,
    ]);
    if (ret !== 0) {
      console.warn('[trim] audio path failed, retrying video-only');
      ret = await ffmpeg.exec([
        '-i', inputName,
        '-filter_complex', graphV,
        '-map', '[v]', '-an',
        ...commonOut,
        '-movflags', '+faststart',
        outputName,
      ]);
    }
    if (ret !== 0) throw new Error(`ffmpeg exited with code ${ret}`);

    const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
    const bytes = new Uint8Array(data.byteLength);
    bytes.set(data);
    onProgress?.(100, 'converting');
    return new Blob([bytes], { type: 'video/mp4' });
  } catch (err) {
    throw new Error(
      'Střih selhal: ' +
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
