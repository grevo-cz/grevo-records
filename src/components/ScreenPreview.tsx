import { useEffect, useRef, useState } from 'react';
import { Minus, Square } from 'lucide-react';

interface Props {
  stream: MediaStream | null;
  cameraStream?: MediaStream | null;
}

/**
 * Small live preview of the captured screen, draggable.
 * Shows in the corner of the webapp so the user can see what they are recording
 * without switching windows. Camera (if active) is drawn as a circle in the
 * bottom-right of the preview, matching the burned-in compositing.
 */
export function ScreenPreview({ stream, cameraStream }: Props) {
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);

  const [pos, setPos] = useState(() => ({
    x: window.innerWidth - 380,
    y: 80,
  }));
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (screenVideoRef.current && stream) {
      screenVideoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (cameraVideoRef.current && cameraStream) {
      cameraVideoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const rect = containerRef.current.getBoundingClientRect();
      const next = {
        x: Math.max(
          8,
          Math.min(window.innerWidth - rect.width - 8, dragRef.current.x + dx)
        ),
        y: Math.max(
          8,
          Math.min(window.innerHeight - rect.height - 8, dragRef.current.y + dy)
        ),
      };
      setPos(next);
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  if (!stream) return null;

  return (
    <div
      ref={containerRef}
      className="fixed z-40 rounded-2xl overflow-hidden border border-bg-border bg-bg-card shadow-2xl"
      style={{
        left: pos.x,
        top: pos.y,
        width: collapsed ? 160 : 360,
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5 bg-bg-elev cursor-move text-xs text-text-secondary border-b border-bg-border"
        onMouseDown={(e) => {
          dragRef.current = {
            x: pos.x,
            y: pos.y,
            startX: e.clientX,
            startY: e.clientY,
          };
        }}
      >
        <span className="font-medium">Náhled · {collapsed ? '' : 'sdílená obrazovka'}</span>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hover:text-text-primary"
          title={collapsed ? 'Rozbalit' : 'Sbalit'}
        >
          {collapsed ? <Square className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
        </button>
      </div>
      {!collapsed && (
        <div className="relative bg-black aspect-video">
          <video
            ref={screenVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-contain"
          />
          {cameraStream && (
            <div className="absolute bottom-2 right-2 w-14 h-14 rounded-full overflow-hidden border-2 border-white/40 bg-black">
              <video
                ref={cameraVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover scale-x-[-1]"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
