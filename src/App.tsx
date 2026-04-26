import { useRef, useState, useCallback } from 'react';
import GameCanvas from './components/GameCanvas';
import HUD from './components/HUD';
import Minimap from './components/Minimap';
import { useGameLoop, HudState } from './hooks/useGameLoop';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState<HudState>({
    speedKmh: 0,
    time: 0,
    violation: { active: false, message: '', age: 0 },
    money: 200,
    fuel: 100,
    fuelWarning: false,
    missionLabel: 'Collect 5 stars',
    missionComplete: false,
    nearBuildingLabel: null,
  });

  const onHud = useCallback((s: HudState) => setHud(s), []);

  useGameLoop(canvasRef, minimapRef, onHud);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#e8efe6]">
      <GameCanvas canvasRef={canvasRef} />
      <HUD
        speedKmh={hud.speedKmh}
        time={hud.time}
        violation={hud.violation}
        money={hud.money}
        fuel={hud.fuel}
        fuelWarning={hud.fuelWarning}
        missionLabel={hud.missionLabel}
        missionComplete={hud.missionComplete}
        nearBuildingLabel={hud.nearBuildingLabel}
      />
      <Minimap minimapRef={minimapRef} />

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur-sm border border-white/10 rounded-lg px-4 py-1.5 text-white/60 text-xs flex gap-3">
        <span><span className="font-mono bg-white/10 px-1 py-0.5 rounded">WASD</span> drive</span>
        <span><span className="font-mono bg-white/10 px-1 py-0.5 rounded">SPACE</span> honk</span>
        <span><span className="font-mono bg-white/10 px-1 py-0.5 rounded">E</span> interact</span>
      </div>
    </div>
  );
}

export default App;
