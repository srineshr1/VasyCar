import React, { useCallback, useEffect, useRef } from 'react';

interface WorldBounds {
  minX: number; maxX: number; minY: number; maxY: number;
}

interface Waypoint { x: number; y: number }

interface Props {
  open: boolean;
  onClose: () => void;
  mapCanvasRef: { current: HTMLCanvasElement | null };
  worldBoundsRef: { current: WorldBounds | null };
  waypoint: Waypoint | null;
  setWaypoint: (wp: Waypoint | null) => void;
}

const MAP_SIZE = 600;

const MapModal: React.FC<Props> = ({ open, onClose, mapCanvasRef, worldBoundsRef, waypoint, setWaypoint }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (open) mapCanvasRef.current = canvasRef.current;
    else mapCanvasRef.current = null;
  }, [open, mapCanvasRef]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const bounds = worldBoundsRef.current;
    if (!canvas || !bounds) return;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
    const padding = 6;
    const bx = bounds.maxX - bounds.minX;
    const by = bounds.maxY - bounds.minY;
    const scale = Math.min((canvas.width - padding * 2) / bx, (canvas.height - padding * 2) / by);
    setWaypoint({
      x: (cx - padding) / scale + bounds.minX,
      y: (cy - padding) / scale + bounds.minY,
    });
  }, [worldBoundsRef, setWaypoint]);

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'M') onClose(); };
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
          <div className="flex items-center gap-2">
            {waypoint && (
              <button
                onClick={() => setWaypoint(null)}
                className="text-xs text-amber-300 border border-amber-300/40 rounded px-2 py-1 hover:bg-amber-300/10 transition-colors"
              >
                Clear Waypoint
              </button>
            )}
            <button
              onClick={onClose}
              className="text-white/50 hover:text-white text-2xl leading-none px-1 transition-colors"
            >
              ×
            </button>
          </div>
        </div>

        <canvas
          ref={canvasRef}
          width={MAP_SIZE}
          height={MAP_SIZE}
          className="rounded-xl cursor-crosshair block"
          style={{ width: MAP_SIZE, height: MAP_SIZE }}
          onClick={handleCanvasClick}
        />

        <div className="flex items-center justify-between text-xs text-white/35">
          <span>Click to place waypoint · ESC or M to close</span>
          {waypoint && (
            <span className="text-amber-300/70 font-mono">
              Waypoint: ({Math.round(waypoint.x)}, {Math.round(waypoint.y)})
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default MapModal;
