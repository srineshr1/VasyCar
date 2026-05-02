import { useRef, useState, useCallback, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import HUD from './components/HUD';
import Minimap from './components/Minimap';
import NeuralNetPanel from './components/NeuralNetPanel';
import { useGameLoop, HudState } from './hooks/useGameLoop';
import { createSelfDrivingState } from './utils/selfDriving';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldBoundsRef = useRef<{ minX: number; maxX: number; minY: number; maxY: number } | null>(null);

  const [hud, setHud] = useState<HudState>({
    speedKmh: 0, time: 0,
    violation: { active: false, message: '', age: 0 },
    fuel: 100, fuelWarning: false, fps: 60,
    autopilot: false,
    selfDrivingState: createSelfDrivingState(),
  });

  const onHud = useCallback((s: HudState) => setHud(s), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') {
        const map = document.querySelector('[data-map-modal]') as HTMLElement | null;
        if (map) map.classList.toggle('hidden');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useGameLoop(canvasRef, minimapRef, onHud, mapCanvasRef, worldBoundsRef);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#e8efe6]">
      <GameCanvas canvasRef={canvasRef} />
      <HUD
        speedKmh={hud.speedKmh}
        time={hud.time}
        violation={hud.violation}
        fuel={hud.fuel}
        fuelWarning={hud.fuelWarning}
        fps={hud.fps}
        autopilot={hud.autopilot}
      />
      <NeuralNetPanel state={hud.selfDrivingState} active={hud.autopilot} />
      <Minimap minimapRef={minimapRef} onOpenMap={() => {}} />

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur-sm border border-white/10 rounded-lg px-4 py-1.5 text-white/60 text-xs flex gap-3">
        <span><span className="font-mono bg-white/10 px-1 py-0.5 rounded">WASD</span> drive</span>
        <span><span className="font-mono bg-white/10 px-1 py-0.5 rounded">SPACE</span> honk</span>
        <span><span className="font-mono bg-white/10 px-1 py-0.5 rounded">M</span> map</span>
        <span><span className="font-mono bg-white/10 px-1 py-0.5 rounded">P</span> autopilot</span>
      </div>
    </div>
  );
}

export default App;
