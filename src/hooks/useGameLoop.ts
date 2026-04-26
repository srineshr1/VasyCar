import { useEffect, useRef, useCallback } from 'react';
import { createHighway, World, nearestT, positionOnLane, headingAt } from '../utils/highway';
import {
  OpenWorldState,
  createOpenWorldState,
  createMission,
  updateOpenWorld,
  UpdateOwResult,
} from '../utils/gameState';
import {
  PlayerCar,
  AICar,
  CrossTrafficCar,
  Inputs,
  ViolationFlag,
  ViolationState,
  createPlayer,
  createAICars,
  createCrossTraffic,
  updatePlayer,
  updateAICar,
  updateCrossTrafficCar,
  checkPlayerViolations,
  newViolationState,
  SPEED_TO_KMH,
} from '../utils/cars';
import { Camera, RenderCache, SceneState, buildBackgroundCache, renderScene, drawMinimap } from '../utils/render';

export interface HudState {
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

interface GameRefs {
  world: World;
  cache: RenderCache;
  player: PlayerCar;
  ai: AICar[];
  crossTraffic: CrossTrafficCar[];
  camera: Camera;
  inputs: Inputs;
  flag: ViolationFlag;
  vstate: ViolationState;
  audio: { ctx: AudioContext | null };
  honkPressed: boolean;
  ow: OpenWorldState;
  ePressed: boolean;
  ePrevPressed: boolean;
}

export function useGameLoop(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  minimapRef: React.RefObject<HTMLCanvasElement>,
  onHud: (h: HudState) => void,
) {
  const refs = useRef<GameRefs | null>(null);
  if (refs.current === null) {
    const world = createHighway(7);
    const cache = buildBackgroundCache(world);
    const player = createPlayer(world);
    refs.current = {
      world,
      cache,
      player,
      ai: createAICars(world, 8),
      crossTraffic: createCrossTraffic(world),
      camera: { tx: player.x, ty: player.y },
      inputs: { up: false, down: false, left: false, right: false },
      flag: { active: false, message: '', age: 0 },
      vstate: newViolationState(),
      audio: { ctx: null },
      honkPressed: false,
      ow: createOpenWorldState(world.collectibles.length),
      ePressed: false,
      ePrevPressed: false,
    };
  } else if (!refs.current.crossTraffic) {
    refs.current.crossTraffic = createCrossTraffic(refs.current.world);
  }

  const honk = useCallback(() => {
    const r = refs.current!;
    if (!r.audio.ctx) {
      try {
        r.audio.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch {
        return;
      }
    }
    const ctx = r.audio.ctx;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.linearRampToValueAtTime(220, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  }, []);

  useEffect(() => {
    const r = refs.current!;
    const map: Record<string, keyof Inputs> = {
      KeyW: 'up',
      ArrowUp: 'up',
      KeyS: 'down',
      ArrowDown: 'down',
      KeyA: 'left',
      ArrowLeft: 'left',
      KeyD: 'right',
      ArrowRight: 'right',
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const k = map[e.code];
      if (k) {
        r.inputs[k] = true;
        e.preventDefault();
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (!r.honkPressed) {
          r.honkPressed = true;
          honk();
        }
      }
      if (e.code === 'KeyE') {
        r.ePressed = true;
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = map[e.code];
      if (k) r.inputs[k] = false;
      if (e.code === 'Space') r.honkPressed = false;
      if (e.code === 'KeyE') r.ePressed = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [honk]);

  useEffect(() => {
    const r = refs.current!;
    let raf = 0;
    let last = 0;
    let timeS = 0;
    let hudAcc = 0;
    let stuckTime = 0;

    const loop = (ts: number) => {
      if (!last) last = ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      timeS += dt;

      const eJustPressed = r.ePressed && !r.ePrevPressed;
      r.ePrevPressed = r.ePressed;

      if (r.ow.fuel <= 0) r.inputs.up = false;

      updatePlayer(r.player, dt, r.inputs, r.world);

      if ((r.inputs.up || r.inputs.down) && Math.abs(r.player.speed) < 0.4) {
        stuckTime += dt;
      } else if (Math.abs(r.player.speed) > 1.0) {
        stuckTime = 0;
      }
      if (stuckTime > 3.0) {
        const near = nearestT(r.world, r.player.x, r.player.y);
        const p = positionOnLane(r.world, near.t, 1);
        r.player.x = p.x;
        r.player.y = p.y;
        r.player.heading = headingAt(r.world, near.t);
        r.player.speed = 0;
        stuckTime = 0;
        r.flag.active = true;
        r.flag.age = 0;
        r.flag.message = 'Respawned on road!';
      }

      for (const c of r.ai) updateAICar(c, dt, r.world, r.ai, r.player, timeS);
      for (const c of r.crossTraffic) updateCrossTrafficCar(c, dt, r.world, r.crossTraffic, timeS);
      checkPlayerViolations(r.player, r.world, timeS, r.flag, dt, r.vstate);

      const owResult: UpdateOwResult = updateOpenWorld(r.ow, r.player, r.world, dt, eJustPressed);
      if (owResult.missionJustComplete) {
        r.ow.mission = createMission(r.ow.mission.index + 1);
        honk();
      }

      const lerp = 0.12;
      r.camera.tx += (r.player.x - r.camera.tx) * lerp;
      r.camera.ty += (r.player.y - r.camera.ty) * lerp;

      const nearLabel = owResult.nearBuildingId !== null
        ? r.world.interactives[owResult.nearBuildingId].label
        : null;

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          const W = canvas.width / dpr;
          const H = canvas.height / dpr;
          const sceneState: SceneState = {
            world: r.world, cache: r.cache, cam: r.camera, player: r.player,
            ai: r.ai, crossTraffic: r.crossTraffic, timeS,
            collectibleStates: r.ow.collectibleCollected,
            missionMarker: owResult.missionMarker,
            nearBuildingId: owResult.nearBuildingId,
          };
          renderScene(ctx, W, H, sceneState);
        }
      }

      const minimap = minimapRef.current;
      if (minimap) {
        const mctx = minimap.getContext('2d');
        if (mctx) drawMinimap(mctx, minimap.width, minimap.height, {
          world: r.world, cache: r.cache, cam: r.camera, player: r.player,
          ai: r.ai, crossTraffic: r.crossTraffic, timeS,
          collectibleStates: r.ow.collectibleCollected,
          missionMarker: owResult.missionMarker,
        });
      }

      hudAcc += dt;
      if (hudAcc > 0.08) {
        hudAcc = 0;
        onHud({
          speedKmh: Math.abs(r.player.speed) * SPEED_TO_KMH,
          time: timeS,
          violation: { active: r.flag.active, message: r.flag.message, age: r.flag.age },
          money: r.ow.money,
          fuel: r.ow.fuel,
          fuelWarning: owResult.fuelWarning,
          missionLabel: r.ow.mission.complete ? 'Mission complete! ✓' : r.ow.mission.label,
          missionComplete: r.ow.mission.complete,
          nearBuildingLabel: nearLabel,
        });
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, minimapRef, onHud]);
}
