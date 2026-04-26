import React from 'react';

interface HUDProps {
  speedKmh: number;
  time: number;
  violation: { active: boolean; message: string; age: number };
  money: number;
  fuel: number;
  fuelWarning: boolean;
  missionLabel: string;
  missionComplete: boolean;
  nearBuildingLabel: string | null;
}

const HUD: React.FC<HUDProps> = ({
  speedKmh, time, violation,
  money, fuel, fuelWarning,
  missionLabel, missionComplete,
  nearBuildingLabel,
}) => {
  const displaySpeed = Math.round(speedKmh);
  const barPercent = Math.min(100, (displaySpeed / 120) * 100);
  const status = displaySpeed > 2 ? 'drive' : 'idle';
  const minutes = Math.floor(time / 60).toString().padStart(2, '0');
  const seconds = Math.floor(time % 60).toString().padStart(2, '0');
  const flashOpacity = violation.active ? Math.max(0, 1 - violation.age / 1.6) : 0;
  const fuelPct = Math.round(fuel);
  const fuelColor = fuel < 20 ? '#f87171' : fuel < 40 ? '#fbbf24' : '#4ade80';
  const fuelSegments = 10;

  return (
    <>
      {/* Time — top left */}
      <div className="absolute top-4 left-4 bg-black/55 backdrop-blur-sm border border-white/15 rounded-lg px-4 py-2 text-white">
        <span className="text-xs uppercase tracking-widest text-white/55">Time</span>
        <span className="ml-2 text-sm font-bold font-mono text-amber-300 tabular-nums">{minutes}:{seconds}</span>
      </div>

      {/* Money — top right */}
      <div className="absolute top-4 right-4 bg-black/55 backdrop-blur-sm border border-white/15 rounded-lg px-4 py-2 text-white">
        <span className="text-xs uppercase tracking-widest text-white/55">$</span>
        <span className="ml-1 text-sm font-bold font-mono text-green-300 tabular-nums">{money}</span>
      </div>

      {/* Mission — top center */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/55 backdrop-blur-sm border border-white/15 rounded-lg px-5 py-2 text-white text-center min-w-[180px]">
        <span className={`text-xs font-semibold tracking-wide ${missionComplete ? 'text-green-400' : 'text-amber-300'}`}>
          {missionLabel}
        </span>
      </div>

      {/* Interaction prompt */}
      {nearBuildingLabel && (
        <div className="absolute bottom-36 left-1/2 -translate-x-1/2 bg-black/75 border border-white/25 rounded-lg px-4 py-2 text-white text-sm pointer-events-none">
          <span className="font-mono bg-white/20 px-1.5 py-0.5 rounded text-xs font-bold">E</span>
          <span className="ml-2">{nearBuildingLabel}</span>
        </div>
      )}

      {/* Speed + fuel cluster — bottom center */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-end gap-3 pointer-events-none">
        {/* Fuel gauge */}
        <div className="bg-black/60 backdrop-blur-sm border border-white/15 rounded-lg px-3 py-3 flex flex-col items-center gap-1">
          <span className="text-[9px] uppercase tracking-wider text-white/55">fuel</span>
          <div className="flex flex-col-reverse gap-0.5 h-20">
            {Array.from({ length: fuelSegments }, (_, i) => (
              <div
                key={i}
                className="w-4 h-1.5 rounded-sm"
                style={{
                  background: i < Math.round(fuelPct / (100 / fuelSegments)) ? fuelColor : 'rgba(255,255,255,0.1)',
                }}
              />
            ))}
          </div>
          <span className="text-[9px] font-mono text-white/40 tabular-nums">{fuelPct}%</span>
        </div>

        {/* Speed */}
        <div className="bg-black/60 backdrop-blur-sm border border-white/15 rounded-lg px-5 py-4 text-center text-white shadow-2xl w-44">
          <div className="text-4xl leading-none font-bold font-mono tabular-nums">{displaySpeed}</div>
          <div className="text-[10px] uppercase tracking-[0.35em] text-white/55 mt-2">km/h</div>
          <div className="text-[10px] uppercase tracking-[0.35em] text-white/45 mt-1">{status}</div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mt-3">
            <div className="h-full rounded-full bg-white/70 transition-all duration-100" style={{ width: `${barPercent}%` }} />
          </div>
        </div>
      </div>

      {/* Violation flash */}
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

      {/* Low fuel warning */}
      {fuelWarning && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none select-none">
          <div className="bg-amber-600/90 border-2 border-white rounded-lg px-6 py-2 text-white text-sm font-bold tracking-widest uppercase animate-pulse">
            Low Fuel — Find a Gas Station
          </div>
        </div>
      )}
    </>
  );
};

export default React.memo(HUD);
