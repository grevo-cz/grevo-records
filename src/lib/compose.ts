// Re-encodes a video blob keeping only the given segments, joining them
// seamlessly. Pure browser (canvas.captureStream + MediaElementSource).

export interface Segment {
  start: number;
  end: number;
}

export interface ComposeResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=h264,aac',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function pickMime(): string {
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

/**
 * Computes the kept segments given a total duration, trim front/back, and
 * delete regions in between. Returns merged, sorted, clamped segments.
 */
export function computeKeptSegments(
  duration: number,
  trimStart: number,
  trimEnd: number,
  deletes: Segment[]
): Segment[] {
  const ts = Math.max(0, Math.min(duration, trimStart));
  const te = Math.max(ts, Math.min(duration, trimEnd));

  // Normalize, clamp, drop zero-width, sort, merge overlaps
  const norm = deletes
    .map((d) => ({
      start: Math.max(ts, Math.min(te, Math.min(d.start, d.end))),
      end: Math.max(ts, Math.min(te, Math.max(d.start, d.end))),
    }))
    .filter((d) => d.end - d.start > 0.01)
    .sort((a, b) => a.start - b.start);

  const merged: Segment[] = [];
  for (const d of norm) {
    const last = merged[merged.length - 1];
    if (last && d.start <= last.end + 0.001) {
      last.end = Math.max(last.end, d.end);
    } else {
      merged.push({ ...d });
    }
  }

  // Subtract merged from [ts, te]
  const kept: Segment[] = [];
  let cursor = ts;
  for (const d of merged) {
    if (d.start > cursor + 0.01) kept.push({ start: cursor, end: d.start });
    cursor = Math.max(cursor, d.end);
  }
  if (te > cursor + 0.01) kept.push({ start: cursor, end: te });
  return kept;
}

export async function composeSegments(
  source: Blob,
  segments: Segment[],
  onProgress?: (pct: number) => void
): Promise<ComposeResult> {
  if (segments.length === 0) throw new Error('Nezbyly žádné úseky k uložení.');

  const totalKept = segments.reduce((acc, s) => acc + (s.end - s.start), 0);
  if (totalKept < 0.1) throw new Error('Výsledný střih je příliš krátký.');

  const url = URL.createObjectURL(source);
  const video = document.createElement('video');
  video.src = url;
  video.playsInline = true;
  video.muted = false;
  video.preload = 'auto';
  // Must be in DOM for captureStream/MediaElementSource on some browsers
  video.style.position = 'fixed';
  video.style.left = '-9999px';
  video.style.top = '0';
  video.style.width = '1px';
  video.style.height = '1px';
  document.body.appendChild(video);

  const cleanup: Array<() => void> = [
    () => {
      try {
        video.pause();
      } catch {}
      video.src = '';
      video.remove();
      URL.revokeObjectURL(url);
    },
  ];

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Nelze načíst zdrojové video.'));
    });

    // Canvas for video output
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context není dostupný.');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // Audio routing
    const audioCtx = new AudioContext();
    cleanup.push(() => audioCtx.close().catch(() => {}));
    const audioDest = audioCtx.createMediaStreamDestination();
    let audioSrc: MediaElementAudioSourceNode | null = null;
    try {
      audioSrc = audioCtx.createMediaElementSource(video);
      audioSrc.connect(audioDest);
      // Intentionally NOT connecting to audioCtx.destination — no playback.
    } catch {
      // No audio in source — that's OK.
    }

    // Combined output stream
    const videoStream = canvas.captureStream(30);
    const tracks: MediaStreamTrack[] = [videoStream.getVideoTracks()[0]];
    const audioTracks = audioDest.stream.getAudioTracks();
    if (audioTracks.length) tracks.push(audioTracks[0]);
    const combined = new MediaStream(tracks);

    const mimeType = pickMime();
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(combined, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: 5_000_000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    // Continuous draw loop — keeps canvas producing frames even while we
    // seek/pause the source between segments. The MediaRecorder gets a
    // continuous video track with no gaps.
    let running = true;
    const draw = () => {
      if (!running) return;
      try {
        ctx.drawImage(video, 0, 0, w, h);
      } catch {
        // Drawing might fail momentarily while seeking — ignore.
      }
      requestAnimationFrame(draw);
    };
    draw();

    recorder.start(250);

    let elapsedKept = 0;
    for (const seg of segments) {
      // Seek to segment start
      await seekTo(video, seg.start);
      // Play through to end
      await video.play().catch(() => {});
      await new Promise<void>((resolve) => {
        const tick = () => {
          if (!running) return resolve();
          const t = video.currentTime;
          const localElapsed = Math.max(0, t - seg.start);
          const localTotal = seg.end - seg.start;
          if (onProgress) {
            const pct = ((elapsedKept + Math.min(localElapsed, localTotal)) / totalKept) * 100;
            onProgress(Math.min(99, pct));
          }
          if (t >= seg.end || video.ended) {
            video.pause();
            resolve();
          } else {
            requestAnimationFrame(tick);
          }
        };
        tick();
      });
      elapsedKept += seg.end - seg.start;
    }

    running = false;
    recorder.stop();
    await stopped;
    if (onProgress) onProgress(100);

    return {
      blob: new Blob(chunks, { type: mimeType || 'video/webm' }),
      mimeType: mimeType || 'video/webm',
      durationMs: totalKept * 1000,
    };
  } finally {
    cleanup.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  }
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 0.05) return resolve();
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = t;
  });
}
