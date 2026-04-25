import { useEffect, useRef, useCallback } from 'react';
import { createHighway, World } from '../utils/highway';
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
import { Camera, RenderCache, buildBackgroundCache, renderScene, drawMinimap } from '../utils/render';

export interface HudState {
  speedKmh: number;
  time: number;
  violation: { active: boolean; message: string; age: number };
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

    const loop = (ts: number) => {
      if (!last) last = ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      timeS += dt;

      updatePlayer(r.player, dt, r.inputs, r.world);
      for (const c of r.ai) updateAICar(c, dt, r.world, r.ai, r.player, timeS);
      for (const c of r.crossTraffic) updateCrossTrafficCar(c, dt, r.world, r.crossTraffic, timeS);
      checkPlayerViolations(r.player, r.world, timeS, r.flag, dt, r.vstate);

      const lerp = 0.12;
      r.camera.tx += (r.player.x - r.camera.tx) * lerp;
      r.camera.ty += (r.player.y - r.camera.ty) * lerp;

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          const W = canvas.width / dpr;
          const H = canvas.height / dpr;
          renderScene(ctx, W, H, r.world, r.cache, r.camera, r.player, r.ai, r.crossTraffic, timeS);
        }
      }

      const minimap = minimapRef.current;
      if (minimap) {
        const mctx = minimap.getContext('2d');
        if (mctx) drawMinimap(mctx, minimap.width, minimap.height, r.world, r.player, r.ai, r.crossTraffic, timeS);
      }

      hudAcc += dt;
      if (hudAcc > 0.08) {
        hudAcc = 0;
        onHud({
          speedKmh: Math.abs(r.player.speed) * SPEED_TO_KMH,
          time: timeS,
          violation: { active: r.flag.active, message: r.flag.message, age: r.flag.age },
        });
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, minimapRef, onHud]);
}
