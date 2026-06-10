import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '../lib/toast';

export type RecorderState =
  | 'idle'
  | 'preparing'
  | 'countdown'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'autostopped';

interface StartOptions {
  micDeviceId: string | null;
  cameraDeviceId: string | null;
  /** Burn webcam PiP into final video via canvas compositing. */
  cameraOverlay: boolean;
  /** Linear gain applied to microphone (1 = unity, 0.5 = -6 dB, 2 = +6 dB). */
  micGain: number;
  /** Seconds to count down before MediaRecorder actually starts. */
  countdownSeconds: number;
}

interface StopResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

interface UseRecorderReturn {
  state: RecorderState;
  elapsedMs: number;
  countdownRemaining: number;
  cameraStream: MediaStream | null;
  displayStream: MediaStream | null;
  start: (opts: StartOptions) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<StopResult | null>;
  cancel: () => void;
  /**
   * When recording ended outside our Stop button (e.g. "Stop sharing" in the
   * browser bar), state becomes 'autostopped' and the result waits here.
   * Calling this returns it once and clears it.
   */
  takeAutoResult: () => StopResult | null;
  error: string | null;
}

// Prefer MP4 (H.264 + AAC) when MediaRecorder supports it — Chrome 126+ does.
// MP4 is universally playable (Safari, QuickTime, iMovie, native iOS/macOS).
// Falls back to WebM (VP9/VP8 + Opus) on browsers without MP4 support.
//
// IMPORTANT: candidates must match the actual track layout. Declaring an
// audio codec (mp4a/opus) while the stream has no audio track makes Chrome's
// muxer error out immediately after start — recording "starts then dies".
function mimeCandidates(hasAudio: boolean): string[] {
  return hasAudio
    ? [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=h264,aac',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ]
    : [
        'video/mp4;codecs=avc1.42E01E',
        'video/mp4;codecs=h264',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ];
}

export function detectRecordingFormat(): 'mp4' | 'webm' | 'unknown' {
  for (const m of mimeCandidates(true)) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
      return m.includes('mp4') ? 'mp4' : 'webm';
    }
  }
  return 'unknown';
}

/** Try candidates in order; return the first MediaRecorder that constructs. */
function createRecorder(
  stream: MediaStream,
  candidates: string[]
): { recorder: MediaRecorder; mimeType: string } {
  let lastErr: unknown = null;
  for (const mimeType of candidates) {
    if (!MediaRecorder.isTypeSupported(mimeType)) continue;
    try {
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 5_000_000,
      });
      return { recorder, mimeType };
    } catch (e) {
      lastErr = e;
    }
  }
  // Last resort: let the browser pick
  try {
    return { recorder: new MediaRecorder(stream), mimeType: '' };
  } catch (e) {
    throw lastErr instanceof Error ? lastErr : (e as Error);
  }
}

export function useRecorder(): UseRecorderReturn {
  const [state, setState] = useState<RecorderState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [countdownRemaining, setCountdownRemaining] = useState(0);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [displayStream, setDisplayStream] = useState<MediaStream | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const compositorRef = useRef<{ stop: () => void } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startedAtRef = useRef(0);
  const pausedAccumRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const countdownResolveRef = useRef<(() => void) | null>(null);
  const resolveStopRef = useRef<((v: StopResult | null) => void) | null>(null);
  const cancelledRef = useRef(false);
  const recorderErrorRef = useRef(false);
  const retriedWebmRef = useRef(false);
  const autoResultRef = useRef<StopResult | null>(null);

  const stopAllStreams = useCallback(() => {
    displayStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    canvasStreamRef.current?.getTracks().forEach((t) => t.stop());
    compositorRef.current?.stop();
    audioCtxRef.current?.close().catch(() => {});
    displayStreamRef.current = null;
    micStreamRef.current = null;
    cameraStreamRef.current = null;
    canvasStreamRef.current = null;
    compositorRef.current = null;
    audioCtxRef.current = null;
    setCameraStream(null);
    setDisplayStream(null);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (countdownTimerRef.current !== null) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopTimer();
      stopAllStreams();
    };
  }, [stopAllStreams, stopTimer]);

  const start = useCallback(
    async ({
      micDeviceId,
      cameraDeviceId,
      cameraOverlay,
      micGain,
      countdownSeconds,
    }: StartOptions) => {
      setError(null);
      cancelledRef.current = false;
      recorderErrorRef.current = false;
      retriedWebmRef.current = false;
      autoResultRef.current = null;
      setState('preparing');
      try {
        // 1) Screen — native picker
        const displayMS = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30 } as MediaTrackConstraints,
          audio: true,
        });
        displayStreamRef.current = displayMS;
        setDisplayStream(displayMS);

        if (cancelledRef.current) {
          stopAllStreams();
          return;
        }

        // 2) Mic — a missing/stale device must NOT kill the recording.
        // Saved deviceIds can go stale (Chrome rotates them, device unplugged);
        // fall back to the default mic, then to no mic at all.
        if (micDeviceId) {
          try {
            micStreamRef.current = await navigator.mediaDevices.getUserMedia({
              audio: {
                deviceId: { exact: micDeviceId },
                echoCancellation: true,
                noiseSuppression: true,
              },
            });
          } catch {
            try {
              micStreamRef.current = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
              });
              toast.warning('Vybraný mikrofon není dostupný — používám výchozí.', {
                title: 'Mikrofon',
              });
            } catch {
              toast.warning('Mikrofon se nepodařilo otevřít — nahrávám bez něj.', {
                title: 'Mikrofon',
              });
            }
          }
        }

        // 3) Camera — same policy: degrade gracefully, never abort.
        if (cameraDeviceId) {
          try {
            const camStream = await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: { exact: cameraDeviceId },
                width: { ideal: 640 },
                height: { ideal: 480 },
              },
            });
            cameraStreamRef.current = camStream;
            setCameraStream(camStream);
          } catch {
            try {
              const camStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 } },
              });
              cameraStreamRef.current = camStream;
              setCameraStream(camStream);
              toast.warning('Vybraná kamera není dostupná — používám výchozí.', {
                title: 'Kamera',
              });
            } catch {
              toast.warning('Kameru se nepodařilo otevřít — nahrávám bez ní.', {
                title: 'Kamera',
              });
            }
          }
        }

        // 4) Video track for recorder
        let videoTrack: MediaStreamTrack;
        if (cameraOverlay && cameraStreamRef.current) {
          const composite = startCompositor(displayMS, cameraStreamRef.current);
          canvasStreamRef.current = composite.stream;
          compositorRef.current = { stop: composite.stop };
          videoTrack = composite.stream.getVideoTracks()[0];
        } else {
          videoTrack = displayMS.getVideoTracks()[0];
        }

        // 5) Mixed audio (system audio + mic with gain)
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const audioDest = audioCtx.createMediaStreamDestination();
        let hasAudio = false;

        const displayAudio = displayMS.getAudioTracks();
        if (displayAudio.length > 0) {
          const src = audioCtx.createMediaStreamSource(
            new MediaStream([displayAudio[0]])
          );
          src.connect(audioDest);
          hasAudio = true;
        }
        if (
          micStreamRef.current &&
          micStreamRef.current.getAudioTracks().length > 0
        ) {
          const src = audioCtx.createMediaStreamSource(micStreamRef.current);
          const gain = audioCtx.createGain();
          gain.gain.value = Math.max(0, micGain);
          src.connect(gain).connect(audioDest);
          hasAudio = true;
        }

        const tracks: MediaStreamTrack[] = [videoTrack];
        if (hasAudio) tracks.push(audioDest.stream.getAudioTracks()[0]);
        const combined = new MediaStream(tracks);

        // 6) Countdown (streams already active, preview shows)
        if (countdownSeconds > 0) {
          setState('countdown');
          setCountdownRemaining(countdownSeconds);
          await new Promise<void>((resolve) => {
            countdownResolveRef.current = resolve;
            let remaining = countdownSeconds;
            countdownTimerRef.current = window.setInterval(() => {
              remaining -= 1;
              setCountdownRemaining(remaining);
              if (remaining <= 0 || cancelledRef.current) {
                if (countdownTimerRef.current !== null) {
                  clearInterval(countdownTimerRef.current);
                  countdownTimerRef.current = null;
                }
                countdownResolveRef.current = null;
                resolve();
              }
            }, 1000);
          });
          if (cancelledRef.current) {
            stopAllStreams();
            setState('idle');
            return;
          }
        }

        // 7) Arm + start the MediaRecorder, with one automatic WebM retry
        // if the preferred (MP4) muxer errors out right after starting.
        const finishAll = (st: RecorderState) => {
          stopTimer();
          stopAllStreams();
          setState(st);
        };

        const armAndStart = (candidates: string[]) => {
          const { recorder, mimeType } = createRecorder(combined, candidates);
          chunksRef.current = [];

          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
          };

          recorder.onerror = (ev) => {
            console.error('[recorder] error event:', ev);
            recorderErrorRef.current = true;
            // Chrome typically fires onstop right after error; force it if not.
            if (recorder.state !== 'inactive') {
              try {
                recorder.stop();
              } catch {}
            }
          };

          recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, {
              type: mimeType || 'video/webm',
            });
            const durationMs = Math.max(
              0,
              Date.now() -
                startedAtRef.current -
                pausedAccumRef.current -
                (pausedAtRef.current ? Date.now() - pausedAtRef.current : 0)
            );
            chunksRef.current = [];

            // a) User pressed our Stop — resolve their await.
            const resolver = resolveStopRef.current;
            if (resolver) {
              finishAll('idle');
              resolver({ blob, mimeType: mimeType || 'video/webm', durationMs });
              resolveStopRef.current = null;
              return;
            }

            // b) Cancelled — discard.
            if (cancelledRef.current) {
              finishAll('idle');
              return;
            }

            // c) Recorder errored right after start (typically MP4 muxer
            //    rejecting the track layout) — retry once with WebM on the
            //    SAME streams, no new screen picker needed.
            if (recorderErrorRef.current && !retriedWebmRef.current) {
              recorderErrorRef.current = false;
              retriedWebmRef.current = true;
              const webmOnly = candidates.filter((c) => c.includes('webm'));
              try {
                console.warn('[recorder] retrying with WebM after MP4 failure');
                toast.warning(
                  'Nahrávání v MP4 selhalo — pokračuji ve WebM. Po uložení můžeš použít „Konvertovat na MP4".',
                  { title: 'Nahrávání', duration: 6000 }
                );
                armAndStart(webmOnly.length ? webmOnly : ['video/webm']);
                return;
              } catch (e) {
                console.error('[recorder] WebM retry failed too:', e);
              }
            }

            // d) Unexpected stop ("Stop sharing" in browser bar, or fatal
            //    error) — keep the result so the UI can save it.
            autoResultRef.current = {
              blob,
              mimeType: mimeType || 'video/webm',
              durationMs,
            };
            finishAll('autostopped');
          };

          recorderRef.current = recorder;
          recorder.start(1000);
        };

        armAndStart(mimeCandidates(hasAudio));

        displayMS.getVideoTracks()[0].onended = () => {
          if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.stop();
          }
        };

        startedAtRef.current = Date.now();
        pausedAccumRef.current = 0;
        pausedAtRef.current = null;
        setElapsedMs(0);
        timerRef.current = window.setInterval(() => {
          const paused = pausedAtRef.current ? Date.now() - pausedAtRef.current : 0;
          setElapsedMs(
            Date.now() - startedAtRef.current - pausedAccumRef.current - paused
          );
        }, 100);
        setState('recording');
      } catch (e: any) {
        stopAllStreams();
        setState('idle');
        const msg =
          e?.name === 'NotAllowedError'
            ? 'Sdílení obrazovky bylo zrušeno.'
            : e?.message || String(e);
        setError(msg);
        throw e;
      }
    },
    [stopAllStreams, stopTimer]
  );

  const pause = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.pause();
      pausedAtRef.current = Date.now();
      setState('paused');
    }
  }, []);

  const resume = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'paused') {
      if (pausedAtRef.current) {
        pausedAccumRef.current += Date.now() - pausedAtRef.current;
        pausedAtRef.current = null;
      }
      recorderRef.current.resume();
      setState('recording');
    }
  }, []);

  const stop = useCallback(() => {
    return new Promise<StopResult | null>((resolve) => {
      const rec = recorderRef.current;
      if (!rec || rec.state === 'inactive') {
        // Recording may have already auto-stopped — hand over that result.
        if (autoResultRef.current) {
          const r = autoResultRef.current;
          autoResultRef.current = null;
          resolve(r);
          return;
        }
        resolve(null);
        return;
      }
      resolveStopRef.current = resolve;
      setState('stopping');
      rec.stop();
    });
  }, []);

  const takeAutoResult = useCallback((): StopResult | null => {
    const r = autoResultRef.current;
    autoResultRef.current = null;
    return r;
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    // Release any pending countdown await so the start() async chain unwinds.
    if (countdownResolveRef.current) {
      countdownResolveRef.current();
      countdownResolveRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      chunksRef.current = [];
      rec.onstop = null;
      rec.stop();
    }
    stopTimer();
    stopAllStreams();
    setState('idle');
    resolveStopRef.current = null;
    autoResultRef.current = null;
  }, [stopAllStreams, stopTimer]);

  return {
    state,
    elapsedMs,
    countdownRemaining,
    cameraStream,
    displayStream,
    start,
    pause,
    resume,
    stop,
    cancel,
    takeAutoResult,
    error,
  };
}

// ────── Canvas compositor: screen + circular webcam PiP → captureStream ──────
function startCompositor(displayStream: MediaStream, camStream: MediaStream) {
  const screenVideo = document.createElement('video');
  screenVideo.srcObject = displayStream;
  screenVideo.muted = true;
  screenVideo.playsInline = true;
  screenVideo.play().catch(() => {});

  const camVideo = document.createElement('video');
  camVideo.srcObject = camStream;
  camVideo.muted = true;
  camVideo.playsInline = true;
  camVideo.play().catch(() => {});

  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d')!;

  let raf = 0;
  let stopped = false;

  const draw = () => {
    if (stopped) return;
    const sw = screenVideo.videoWidth;
    const sh = screenVideo.videoHeight;
    if (sw && sh) {
      if (canvas.width !== sw || canvas.height !== sh) {
        canvas.width = sw;
        canvas.height = sh;
      }
      ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const cw = camVideo.videoWidth;
    const ch = camVideo.videoHeight;
    if (cw && ch) {
      const size = Math.min(canvas.width, canvas.height) * 0.18;
      const margin = size * 0.15;
      const cx = canvas.width - size - margin;
      const cy = canvas.height - size - margin;
      const scale = Math.max(size / cw, size / ch);
      const drawW = cw * scale;
      const drawH = ch * scale;
      const dx = cx + (size - drawW) / 2;
      const dy = cy + (size - drawH) / 2;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx + size / 2, cy + size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.translate(cx + size / 2, cy + size / 2);
      ctx.scale(-1, 1);
      ctx.translate(-(cx + size / 2), -(cy + size / 2));
      ctx.drawImage(camVideo, dx, dy, drawW, drawH);
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(3, size * 0.02);
      ctx.beginPath();
      ctx.arc(cx + size / 2, cy + size / 2, size / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    raf = requestAnimationFrame(draw);
  };
  draw();

  const stream = canvas.captureStream(30);
  return {
    stream,
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      screenVideo.srcObject = null;
      camVideo.srcObject = null;
    },
  };
}
