import { useRef, useState, useCallback, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import HUD from './components/HUD';
import Minimap from './components/Minimap';
import MapModal from './components/MapModal';
import { useGameLoop, HudState } from './hooks/useGameLoop';

interface Waypoint { x: number; y: number }
interface WorldBounds { minX: number; maxX: number; minY: number; maxY: number }

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldBoundsRef = useRef<WorldBounds | null>(null);

  const [mapOpen, setMapOpen] = useState(false);
  const [waypoint, setWaypointState] = useState<Waypoint | null>(null);
  const waypointRef = useRef<Waypoint | null>(null);
  waypointRef.current = waypoint;

  const setWaypoint = useCallback((wp: Waypoint | null) => {
    waypointRef.current = wp;
    setWaypointState(wp);
  }, []);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') setMapOpen(v => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useGameLoop(canvasRef, minimapRef, onHud, mapCanvasRef, waypointRef, worldBoundsRef);

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
      <Minimap minimapRef={minimapRef} onOpenMap={() => setMapOpen(true)} />

      <MapModal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        mapCanvasRef={mapCanvasRef}
        worldBoundsRef={worldBoundsRef}
        waypoint={waypoint}
        setWaypoint={setWaypoint}
      />

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur-sm border border-white/10 rounded-lg px-4 py-1.5 text-white/60 text-xs flex gap-3">
        <span><span className="font-mono bg-white/10 px-1 py-0.5 rounded">WASD</span> drive</span>
        <span><span className="font-mono bg-white/10 px-1 py-0.5 rounded">SPACE</span> honk</span>
        <span><span className="font-mono bg-white/10 px-1 py-0.5 rounded">E</span> interact</span>
        <span><span className="font-mono bg-white/10 px-1 py-0.5 rounded">M</span> map</span>
      </div>
    </div>
  );
}

export default App;
