import { World, HALF_ROAD_WIDTH, headingAt as hwHeadingAt, nearestT } from './highway';
import { PlayerCar, AICar, Inputs, MAX_SPEED, TURN_RATE } from './cars';

export const RAY_ANGLES_DEG = [-60, -30, -15, 0, 15, 30, 60];
export const RAY_ANGLES = RAY_ANGLES_DEG.map(d => (d * Math.PI) / 180);
export const RAY_MAX = 20;
const RAY_STEP = 0.3;
const CAR_HIT_RADIUS = 0.9;

export interface SensorHit { dist: number; hit: boolean; }
export interface SelfDrivingState {
  sensors: SensorHit[];
  inputs: number[];
  hidden: number[];
  outputs: number[];
  active: boolean;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function wrapAngle(a: number): number {
  return ((a % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
}

// W1[8 hidden × 10 inputs]
export const NETWORK_W1: number[][] = [
  //  r0   r1   r2    r3   r4   r5   r6  spd  lat  hdg
  [   0,   0,   0,  -10,   0,   0,   0,   0,   0,   0],  // h0: fwd obstacle
  [  -6,  -6,   0,    0,   0,   0,   0,   0,   0,   0],  // h1: left obstacle
  [   0,   0,   0,    0,   0,  -6,  -6,   0,   0,   0],  // h2: right obstacle
  [   0,   0,   0,    0,   0,   0,   0,   0,   0,   6],  // h3: heading left (err>0 → steer left)
  [   0,   0,   0,    0,   0,   0,   0,   0,   0,  -6],  // h4: heading right (err<0 → steer right)
  [   0,   0,   0,    0,   0,   0,   0,  -5,   0,   0],  // h5: too slow
  [   0,  -4,  -4,    0,   0,   0,   0,   0,   0,   0],  // h6: front-left → steer right
  [   0,   0,   0,    0,  -4,  -4,   0,   0,   0,   0],  // h7: front-right → steer left
];
const b1: number[] = [6.0, 7.0, 7.0, -1.5, -1.5, 4.0, 5.5, 5.5];

// W2[4 outputs × 8 hidden]
export const NETWORK_W2: number[][] = [
  //  h0    h1    h2    h3    h4    h5    h6    h7
  [  -5,    0,    0,    0,    0,    3,    0,    0],  // accel: clear + slow → go
  [   6,    0,    0,    0,    0,    0,    0,    0],  // brake: obstacle ahead
  [   0,    0,    5,    6,    0,    0,    0,    5],  // left: right-obs / heading-left / front-right
  [   0,    5,    0,    0,    6,    0,    5,    0],  // right: left-obs / heading-right / front-left
];
const b2: number[] = [1.0, -2.5, -2.5, -2.5];

function lateralDistFast(world: World, x: number, y: number, startIdx: number): number {
  const n = world.centerline.length;
  let bestDist2 = Infinity, bestLateral = 0;
  for (let di = -30; di <= 30; di++) {
    const i = ((startIdx + di) % n + n) % n;
    const c = world.centerline[i];
    const dx = x - c.x, dy = y - c.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist2) {
      bestDist2 = d2;
      const t = world.tangents[i];
      bestLateral = dx * (-t.y) + dy * t.x;
    }
  }
  return Math.abs(bestLateral);
}

function castRay(
  world: World, nearAI: AICar[],
  startX: number, startY: number,
  angle: number, startIdx: number,
): SensorHit {
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  for (let d = RAY_STEP; d <= RAY_MAX; d += RAY_STEP) {
    const rx = startX + cosA * d;
    const ry = startY + sinA * d;
    if (lateralDistFast(world, rx, ry, startIdx) > HALF_ROAD_WIDTH) return { dist: d, hit: true };
    for (const c of nearAI) {
      const cdx = c.x - rx, cdy = c.y - ry;
      if (cdx * cdx + cdy * cdy < CAR_HIT_RADIUS * CAR_HIT_RADIUS) return { dist: d, hit: true };
    }
  }
  return { dist: RAY_MAX, hit: false };
}

export function createSelfDrivingState(): SelfDrivingState {
  return {
    sensors: RAY_ANGLES.map(() => ({ dist: RAY_MAX, hit: false })),
    inputs: new Array(10).fill(0),
    hidden: new Array(8).fill(0),
    outputs: new Array(4).fill(0),
    active: false,
  };
}

// Target lane: lane 1 (2nd from median on forward side), signedLateral ≈ 2.5
const TARGET_LATERAL = 2.5;

export function selfDrivingUpdate(
  state: SelfDrivingState,
  player: PlayerCar,
  world: World,
  ai: AICar[],
  dt: number,
): Inputs {
  const near = nearestT(world, player.x, player.y);
  const n = world.centerline.length;
  const startIdx = Math.floor(near.t * n) % n;

  // --- P-controller: road heading + lane centering ---
  // This runs every frame and directly corrects player.heading proportionally.
  // Binary threshold steering can't follow a ~6700-tile-radius curve, so we use
  // a proportional controller here and reserve NN outputs for obstacle avoidance.
  const roadHeading = hwHeadingAt(world, near.t);
  const headingErr = wrapAngle(player.heading - roadHeading);

  // Bias target heading slightly toward target lane to keep car centered
  const lateralErr = near.signedLateral - TARGET_LATERAL;
  const lateralBias = -lateralErr * 0.015; // gentle nudge toward lane center
  const effectiveErr = headingErr + lateralBias;

  const speedFactor = Math.min(1, Math.abs(player.speed) / 3);
  const KP = 4.0;
  const maxCorrection = TURN_RATE * speedFactor * dt;
  player.heading -= Math.sign(effectiveErr) * Math.min(Math.abs(effectiveErr) * KP * dt, maxCorrection);

  // Pre-filter AI cars within sensor range
  const rangeLimit = (RAY_MAX + 2) * (RAY_MAX + 2);
  const nearAI = ai.filter(c => {
    const dx = c.x - player.x, dy = c.y - player.y;
    return dx * dx + dy * dy < rangeLimit;
  });

  // Cast rays
  for (let i = 0; i < RAY_ANGLES.length; i++) {
    state.sensors[i] = castRay(world, nearAI, player.x, player.y, player.heading + RAY_ANGLES[i], startIdx);
  }

  // Build inputs (heading error before correction for visualization)
  const inp = state.inputs;
  for (let i = 0; i < 7; i++) inp[i] = state.sensors[i].dist / RAY_MAX;
  inp[7] = Math.min(1, Math.max(0, player.speed / MAX_SPEED));
  inp[8] = Math.min(1, Math.max(-1, near.signedLateral / HALF_ROAD_WIDTH));
  inp[9] = Math.min(1, Math.max(-1, headingErr / Math.PI));

  // Forward pass
  const hid = state.hidden;
  for (let h = 0; h < 8; h++) {
    let sum = b1[h];
    for (let j = 0; j < 10; j++) sum += NETWORK_W1[h][j] * inp[j];
    hid[h] = sigmoid(sum);
  }
  const out = state.outputs;
  for (let o = 0; o < 4; o++) {
    let sum = b2[o];
    for (let j = 0; j < 8; j++) sum += NETWORK_W2[o][j] * hid[j];
    out[o] = sigmoid(sum);
  }

  // NN handles accel/brake; emergency steering overrides P-controller for obstacles
  return {
    up: out[0] > 0.55,
    down: out[1] > 0.55,
    left: out[2] > 0.60,   // high threshold — only imminent obstacle
    right: out[3] > 0.60,
  };
}
