import React, { useRef, useEffect } from 'react';

interface MinimapProps {
  minimapRef: React.RefObject<HTMLCanvasElement>;
}

const Minimap: React.FC<MinimapProps> = ({ minimapRef }) => {
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
      <canvas
        ref={minimapRef}
        width={180}
        height={180}
        className="rounded-md block"
        style={{ width: 180, height: 180 }}
      />
    </div>
  );
};

export default React.memo(Minimap);
