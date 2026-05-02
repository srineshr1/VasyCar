import { useEffect, useRef, useCallback } from 'react';
import { createHighway, World, nearestT, positionOnLane, advanceT, headingAt as hwHeadingAt } from '../utils/highway';
import { OpenWorldState, createOpenWorldState, updateOpenWorld } from '../utils/gameState';
import {
  PlayerCar, AICar, Inputs, ViolationFlag, ViolationState,
  createPlayer, createAICars, updatePlayer, updateAICar,
  checkPlayerViolations, newViolationState, SPEED_TO_KMH,
} from '../utils/cars';
import { Camera, RenderCache, SceneState, buildBackgroundCache, renderScene, drawMinimap, drawMapModal } from '../utils/render';
import { SelfDrivingState, createSelfDrivingState, selfDrivingUpdate } from '../utils/selfDriving';

export interface HudState {
  speedKmh: number;
  time: number;
  violation: { active: boolean; message: string; age: number };
  fuel: number;
  fuelWarning: boolean;
  fps: number;
  autopilot: boolean;
  selfDrivingState: SelfDrivingState;
}

interface GameRefs {
  world: World;
  cache: RenderCache;
  player: PlayerCar;
  ai: AICar[];
  camera: Camera;
  inputs: Inputs;
  flag: ViolationFlag;
  vstate: ViolationState;
  audio: { ctx: AudioContext | null };
  honkPressed: boolean;
  ow: OpenWorldState;
  sdState: SelfDrivingState;
  autopilot: boolean;
}

export function useGameLoop(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  minimapRef: React.RefObject<HTMLCanvasElement>,
  onHud: (h: HudState) => void,
  mapCanvasRef?: { current: HTMLCanvasElement | null },
  worldBoundsRef?: { current: { minX: number; maxX: number; minY: number; maxY: number } | null },
) {
  const refs = useRef<GameRefs | null>(null);
  if (refs.current === null) {
    const world = createHighway(7);
    const cache = buildBackgroundCache(world);
    const player = createPlayer(world);
    refs.current = {
      world, cache, player,
      ai: createAICars(world, 120),
      camera: { tx: player.x, ty: player.y },
      inputs: { up: false, down: false, left: false, right: false },
      flag: { active: false, message: '', age: 0 },
      vstate: newViolationState(),
      audio: { ctx: null },
      honkPressed: false,
      ow: createOpenWorldState(),
      sdState: createSelfDrivingState(),
      autopilot: false,
    };
  }

  const honk = useCallback(() => {
    const r = refs.current!;
    if (!r.audio.ctx) {
      try { r.audio.ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); }
      catch { return; }
    }
    const ctx = r.audio.ctx; if (!ctx) return;
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
      KeyW: 'up', ArrowUp: 'up',
      KeyS: 'down', ArrowDown: 'down',
      KeyA: 'left', ArrowLeft: 'left',
      KeyD: 'right', ArrowRight: 'right',
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const k = map[e.code];
      if (k) { r.inputs[k] = true; e.preventDefault(); }
      if (e.code === 'Space') {
        e.preventDefault();
        if (!r.honkPressed) { r.honkPressed = true; honk(); }
      }
      if (e.code === 'KeyP') {
        r.autopilot = !r.autopilot;
        r.sdState.active = r.autopilot;
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = map[e.code];
      if (k) r.inputs[k] = false;
      if (e.code === 'Space') r.honkPressed = false;
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
    let fpsSmooth = 60;

    const RECYCLE_DIST2 = 320 * 320;
    const SPAWN_MIN = 100, SPAWN_MAX = 300;

    const loop = (ts: number) => {
      if (!last) last = ts;
      const rawDt = (ts - last) / 1000;
      const dt = Math.min(0.05, rawDt);
      last = ts;
      timeS += dt;
      fpsSmooth += (Math.min(120, 1 / (rawDt || 0.016)) - fpsSmooth) * 0.1;

      if (r.ow.fuel <= 0) r.inputs.up = false;

      const activeInputs = r.autopilot
        ? selfDrivingUpdate(r.sdState, r.player, r.world, r.ai, dt)
        : r.inputs;
      updatePlayer(r.player, dt, activeInputs, r.world);

      if ((r.inputs.up || r.inputs.down) && Math.abs(r.player.speed) < 0.4) { stuckTime += dt; }
      else if (Math.abs(r.player.speed) > 1.0) { stuckTime = 0; }

      if (stuckTime > 3.0) {
        const near = nearestT(r.world, r.player.x, r.player.y);
        const p = positionOnLane(r.world, near.t, 1);
        r.player.x = p.x; r.player.y = p.y;
        r.player.heading = hwHeadingAt(r.world, near.t); stuckTime = 0;
        r.player.speed = 0; stuckTime = 0;
        r.flag.active = true; r.flag.age = 0; r.flag.message = 'Respawning on road!';
      }

      for (const c of r.ai) updateAICar(c, dt, r.world, r.ai, r.player);

      // Recycle distant cars to near player (max 3 per frame to avoid pop-in flash)
      const pNear = nearestT(r.world, r.player.x, r.player.y);
      let recycled = 0;
      for (const c of r.ai) {
        if (recycled >= 3) break;
        const dx = c.x - r.player.x, dy = c.y - r.player.y;
        if (dx * dx + dy * dy > RECYCLE_DIST2) {
          const dist = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
          // Forward cars: place ahead (+) or behind (-) in road direction
          // Reversed cars: also alternate so oncoming comes from ahead
          const dir = (Math.random() < 0.5 ? 1 : -1);
          const newT = advanceT(r.world, pNear.t, dist * dir);
          const p2 = positionOnLane(r.world, newT, c.reversed ? 4 : 0);
          // Verify Euclidean distance is sane (skip if road wrapped to far side)
          const vdx = p2.x - r.player.x, vdy = p2.y - r.player.y;
          if (vdx * vdx + vdy * vdy > RECYCLE_DIST2) continue;
          const lane = c.reversed ? 4 + Math.floor(Math.random() * 4) : Math.floor(Math.random() * 4);
          const p = positionOnLane(r.world, newT, lane);
          c.t = newT; c.laneIdx = lane; c.targetLane = lane;
          c.x = p.x; c.y = p.y;
          c.heading = (c.reversed ? Math.PI : 0);
          c.laneChangeCooldown = 2 + Math.random() * 3;
          recycled++;
        }
      }

      checkPlayerViolations(r.player, r.world, r.flag, dt, r.vstate);

      const owResult = updateOpenWorld(r.ow, r.player, dt);

      const lerp = 0.12;
      r.camera.tx += (r.player.x - r.camera.tx) * lerp;
      r.camera.ty += (r.player.y - r.camera.ty) * lerp;

      if (worldBoundsRef && !worldBoundsRef.current) {
        worldBoundsRef.current = r.world.bounds;
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          const W = canvas.width / dpr, H = canvas.height / dpr;
          const sceneState: SceneState = {
            world: r.world, cache: r.cache, cam: r.camera,
            player: r.player, ai: r.ai,
            selfDrivingState: r.sdState,
          };
          renderScene(ctx, W, H, sceneState);
        }
      }

      const minimap = minimapRef.current;
      if (minimap) {
        const mctx = minimap.getContext('2d');
        if (mctx) drawMinimap(mctx, minimap.width, minimap.height, {
          world: r.world, cache: r.cache, cam: r.camera,
          player: r.player, ai: r.ai,
        });
      }

      const mapCanvas = mapCanvasRef?.current;
      if (mapCanvas) {
        const mctx = mapCanvas.getContext('2d');
        if (mctx) drawMapModal(mctx, mapCanvas.width, mapCanvas.height, {
          world: r.world, cache: r.cache, cam: r.camera,
          player: r.player, ai: r.ai,
        });
      }

      hudAcc += dt;
      if (hudAcc > 0.08) {
        hudAcc = 0;
        onHud({
          speedKmh: Math.abs(r.player.speed) * SPEED_TO_KMH,
          time: timeS,
          violation: { active: r.flag.active, message: r.flag.message, age: r.flag.age },
          fuel: r.ow.fuel,
          fuelWarning: owResult.fuelWarning,
          fps: Math.round(fpsSmooth),
          autopilot: r.autopilot,
          selfDrivingState: { ...r.sdState },
        });
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, minimapRef, onHud]);
}
