import { useEffect, useState } from 'react';

/**
 * Generates thumbnail data URLs at evenly spaced timestamps from a video blob.
 * Runs entirely in the browser via offscreen <video> + <canvas>.
 */
export function useThumbnails(blob: Blob | null, count: number = 12, height: number = 64) {
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!blob) {
      setThumbnails([]);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';

    const cleanup = () => {
      video.src = '';
      URL.revokeObjectURL(url);
    };

    const generate = async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error('video load error'));
        });
        if (cancelled) return;

        const duration = video.duration;
        if (!isFinite(duration) || duration <= 0) {
          cleanup();
          setLoading(false);
          return;
        }

        const ratio = video.videoHeight > 0 ? video.videoWidth / video.videoHeight : 16 / 9;
        const w = Math.round(height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          setLoading(false);
          return;
        }

        const out: string[] = [];
        for (let i = 0; i < count; i++) {
          if (cancelled) break;
          const t = (i / Math.max(1, count - 1)) * Math.max(0, duration - 0.05);
          await seek(video, t);
          ctx.drawImage(video, 0, 0, w, height);
          out.push(canvas.toDataURL('image/jpeg', 0.55));
          setThumbnails([...out]);
        }
      } catch {
        // ignore — thumbnails are best-effort
      } finally {
        if (!cancelled) setLoading(false);
        cleanup();
      }
    };

    generate();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [blob, count, height]);

  return { thumbnails, loading };
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const handle = () => {
      video.removeEventListener('seeked', handle);
      resolve();
    };
    video.addEventListener('seeked', handle);
    video.currentTime = t;
  });
}
