import React, { useRef, useEffect } from 'react';

interface MinimapProps {
  minimapRef: React.RefObject<HTMLCanvasElement>;
  onOpenMap: () => void;
}

const Minimap: React.FC<MinimapProps> = ({ minimapRef, onOpenMap }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas) return;
    canvas.width = 180;
    canvas.height = 180;
  }, [minimapRef]);

  return (
    <div
      ref={containerRef}
      className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-sm border border-white/15 rounded-lg p-2 max-sm:bottom-28 max-sm:scale-75 max-sm:origin-bottom-right"
    >
      <div className="text-[10px] uppercase tracking-widest text-white/55 mb-1.5 text-center">City Map</div>
      <div className="relative group cursor-pointer" onClick={onOpenMap}>
        <canvas
          ref={minimapRef}
          width={180}
          height={180}
          className="rounded-md block"
          style={{ width: 180, height: 180 }}
        />
        <div className="absolute inset-0 rounded-md bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-[10px] font-bold uppercase tracking-widest">
            Open Map
          </span>
        </div>
      </div>
    </div>
  );
};

export default React.memo(Minimap);
