import { useEffect, useState } from 'react';
import type { MediaDevice } from '../types';

export function useDevices() {
  const [microphones, setMicrophones] = useState<MediaDevice[]>([]);
  const [cameras, setCameras] = useState<MediaDevice[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Request permission so labels become visible
        try {
          const probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          probe.getTracks().forEach((t) => t.stop());
        } catch {
          // Permission may be granted later; still enumerate
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setMicrophones(
          devices
            .filter((d) => d.kind === 'audioinput')
            .map((d, i) => ({
              deviceId: d.deviceId,
              label: d.label || `Mikrofon ${i + 1}`,
            }))
        );
        setCameras(
          devices
            .filter((d) => d.kind === 'videoinput')
            .map((d, i) => ({
              deviceId: d.deviceId,
              label: d.label || `Kamera ${i + 1}`,
            }))
        );
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    }
    load();
    const handler = () => load();
    navigator.mediaDevices.addEventListener('devicechange', handler);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener('devicechange', handler);
    };
  }, []);

  return { microphones, cameras, error };
}
