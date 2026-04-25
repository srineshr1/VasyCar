import React from 'react';

interface HUDProps {
  speedKmh: number;
  time: number;
  violation: { active: boolean; message: string; age: number };
}

const HUD: React.FC<HUDProps> = ({ speedKmh, time, violation }) => {
  const displaySpeed = Math.round(speedKmh);
  const barPercent = Math.min(100, (displaySpeed / 120) * 100);
  const status = displaySpeed > 2 ? 'drive' : 'idle';
  const minutes = Math.floor(time / 60).toString().padStart(2, '0');
  const seconds = Math.floor(time % 60).toString().padStart(2, '0');
  const flashOpacity = violation.active ? Math.max(0, 1 - violation.age / 1.6) : 0;

  return (
    <>
      <div className="absolute top-4 left-4 bg-black/55 backdrop-blur-sm border border-white/15 rounded-lg px-4 py-2 text-white">
        <span className="text-xs uppercase tracking-widest text-white/55">Time driving</span>
        <span className="ml-2 text-sm font-bold font-mono text-amber-300 tabular-nums">{minutes}:{seconds}</span>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-44">
        <div className="bg-black/60 backdrop-blur-sm border border-white/15 rounded-lg px-5 py-4 text-center text-white shadow-2xl">
          <div className="text-4xl leading-none font-bold font-mono tabular-nums">{displaySpeed}</div>
          <div className="text-[10px] uppercase tracking-[0.35em] text-white/55 mt-2">km/h</div>
          <div className="text-[10px] uppercase tracking-[0.35em] text-white/45 mt-1">{status}</div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mt-3">
            <div className="h-full rounded-full bg-white/70 transition-all duration-100" style={{ width: `${barPercent}%` }} />
          </div>
        </div>
      </div>

      {flashOpacity > 0 && (
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none"
          style={{ opacity: flashOpacity }}
        >
          <div className="bg-red-600/90 border-4 border-white rounded-xl px-8 py-4 text-white text-2xl font-black tracking-widest shadow-2xl uppercase">
            {violation.message}
          </div>
        </div>
      )}
    </>
  );
};

export default React.memo(HUD);
