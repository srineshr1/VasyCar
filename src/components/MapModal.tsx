import React, { useCallback, useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  mapCanvasRef: { current: HTMLCanvasElement | null };
}

const MAP_SIZE = 600;

const MapModal: React.FC<Props> = ({ open, onClose, mapCanvasRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (open) mapCanvasRef.current = canvasRef.current;
    else mapCanvasRef.current = null;
  }, [open, mapCanvasRef]);

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'm') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={handleOverlayClick}
    >
      <div className="bg-[#1a1a20] border border-white/15 rounded-2xl p-5 shadow-2xl flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-white text-sm font-bold uppercase tracking-widest">City Map</span>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white text-2xl leading-none px-1 transition-colors"
          >
            ×
          </button>
        </div>

        <canvas
          ref={canvasRef}
          width={MAP_SIZE}
          height={MAP_SIZE}
          className="rounded-xl block"
          style={{ width: MAP_SIZE, height: MAP_SIZE }}
        />

        <div className="flex items-center justify-between text-xs text-white/35">
          <span>ESC or M to close</span>
        </div>
      </div>
    </div>
  );
};

export default MapModal;
