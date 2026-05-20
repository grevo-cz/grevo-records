import { useEffect, useRef } from 'react';

interface Props {
  stream: MediaStream | null;
  cameraStream?: MediaStream | null;
}

/**
 * Full-bleed live preview of the captured screen, filling the content area.
 * Camera overlay (when active) mirrors the burned-in position in bottom-right.
 */
export function LivePreview({ stream, cameraStream }: Props) {
  const screenRef = useRef<HTMLVideoElement>(null);
  const camRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (screenRef.current && stream) {
      screenRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (camRef.current && cameraStream) {
      camRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  if (!stream) return null;

  return (
    <div className="absolute inset-0 bg-black overflow-hidden">
      <video
        ref={screenRef}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-contain"
      />
      {cameraStream && (
        <div className="absolute bottom-6 right-6 w-32 h-32 rounded-full overflow-hidden border-[3px] border-white/40 shadow-2xl bg-black">
          <video
            ref={camRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover scale-x-[-1]"
          />
        </div>
      )}
      {/* Soft top gradient for the timer overlay readability */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
      {/* Soft bottom gradient for the control bar readability */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
    </div>
  );
}
