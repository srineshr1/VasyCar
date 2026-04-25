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
  });

  const onHud = useCallback((s: HudState) => setHud(s), []);

  useGameLoop(canvasRef, minimapRef, onHud);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#e8efe6]">
      <GameCanvas canvasRef={canvasRef} />
      <HUD speedKmh={hud.speedKmh} time={hud.time} violation={hud.violation} />
      <Minimap minimapRef={minimapRef} />

      <div className="absolute left-1/2 top-4 -translate-x-1/2 bg-black/55 backdrop-blur-sm border border-white/15 rounded-lg px-4 py-2 text-white/70 text-xs">
        <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">W</span>
        <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded ml-1">A</span>
        <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded ml-1">S</span>
        <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded ml-1">D</span>
        <span className="ml-2">drive</span>
        <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded ml-3">SPACE</span>
        <span className="ml-2">honk</span>
      </div>
    </div>
  );
}

export default App;
