import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderState =
  | 'idle'
  | 'preparing'
  | 'countdown'
  | 'recording'
  | 'paused'
  | 'stopping';

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
  error: string | null;
}

// WebM (VP9/VP8 + Opus) is the most reliable MediaRecorder output across
// browsers — clean duration, seekable, lossless to the encoder. MP4 from
// MediaRecorder (fragmented MP4) is supported on paper but produces files
// with broken duration/seek metadata in many Chrome versions. We therefore
// record WebM and offer post-recording conversion to MP4 if the user needs
// QuickTime/iMovie compatibility.
function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    // MP4 only as a last resort
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
      return m;
    }
  }
  return '';
}

export function detectRecordingFormat(): 'mp4' | 'webm' | 'unknown' {
  const mime = pickMimeType();
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('webm')) return 'webm';
  return 'unknown';
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
  const resolveStopRef = useRef<((v: StopResult | null) => void) | null>(null);
  const mimeRef = useRef<string>('');
  const cancelledRef = useRef(false);

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

        // 2) Mic
        if (micDeviceId) {
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: micDeviceId },
              echoCancellation: true,
              noiseSuppression: true,
            },
          });
          micStreamRef.current = micStream;
        }

        // 3) Camera
        if (cameraDeviceId) {
          const camStream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: cameraDeviceId },
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
          });
          cameraStreamRef.current = camStream;
          setCameraStream(camStream);
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

        const mimeType = pickMimeType();
        mimeRef.current = mimeType;

        // 6) Countdown (streams already active, preview shows)
        if (countdownSeconds > 0) {
          setState('countdown');
          setCountdownRemaining(countdownSeconds);
          await new Promise<void>((resolve) => {
            let remaining = countdownSeconds;
            countdownTimerRef.current = window.setInterval(() => {
              remaining -= 1;
              setCountdownRemaining(remaining);
              if (remaining <= 0 || cancelledRef.current) {
                if (countdownTimerRef.current !== null) {
                  clearInterval(countdownTimerRef.current);
                  countdownTimerRef.current = null;
                }
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

        // 7) Start MediaRecorder
        const recorder = new MediaRecorder(combined, {
          mimeType: mimeType || undefined,
          videoBitsPerSecond: 5_000_000,
        });
        chunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, {
            type: mimeType || 'video/webm',
          });
          const durationMs =
            Date.now() -
            startedAtRef.current -
            pausedAccumRef.current -
            (pausedAtRef.current ? Date.now() - pausedAtRef.current : 0);
          chunksRef.current = [];
          stopTimer();
          stopAllStreams();
          setState('idle');
          resolveStopRef.current?.({
            blob,
            mimeType: mimeType || 'video/webm',
            durationMs: Math.max(0, durationMs),
          });
          resolveStopRef.current = null;
        };
        displayMS.getVideoTracks()[0].onended = () => {
          if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.stop();
          }
        };

        recorderRef.current = recorder;
        recorder.start(1000);
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
        resolve(null);
        return;
      }
      resolveStopRef.current = resolve;
      setState('stopping');
      rec.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
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
