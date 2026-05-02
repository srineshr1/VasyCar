import { World, positionOnLane, nearestT, advanceT, headingAt as hwHeadingAt } from './highway';

export const CAR_COLORS = ['#a26bff','#36c5c0','#ffd23f','#4a90e2','#ff7eb6','#ff8a3d','#ff5e5e','#7ed957'];
export const PLAYER_COLOR = '#ff5e8a';

export const SPEED_TO_KMH = 13.5;   // 1 tile = 3.75 m → 1 tile/s = 13.5 km/h
export const MAX_SPEED = 9;          // 9 × 13.5 ≈ 121.5 km/h (ORR limit 120)
export const MAX_REVERSE = 2;        // ~27 km/h reverse
export const ACCEL = 9;
export const BRAKE = 14;
export const FRICTION = 2.5;
export const TURN_RATE = 2.4;

const DEFAULT_CAR_WIDTH = 0.55;
const DEFAULT_CAR_LENGTH = 0.95;
const HALF_ROAD_WIDTH = 5.25; // 0.75 median + 4 lanes + 0.5 shoulder per side
const NUM_LANES = 8;

export interface PlayerCar {
  x: number; y: number; heading: number; speed: number;
  width: number; length: number; color: string;
}

export interface AICar {
  id: number; x: number; y: number; heading: number; speed: number;
  width: number; length: number; color: string;
  t: number; laneIdx: number; targetLane: number;
  laneChangeCooldown: number; targetSpeed: number; reversed: boolean;
}

export interface Inputs { up: boolean; down: boolean; left: boolean; right: boolean; }

export function createPlayer(world: World): PlayerCar {
  const p = positionOnLane(world, 0, 1); // lane 1 = 2nd from outer, forward side
  return { x: p.x, y: p.y, heading: hwHeadingAt(world, 0), speed: 0,
    width: DEFAULT_CAR_WIDTH, length: DEFAULT_CAR_LENGTH, color: PLAYER_COLOR };
}

export function createAICars(world: World, count: number): AICar[] {
  const cars: AICar[] = [];
  const spreadTiles = 280;
  for (let i = 0; i < count; i++) {
    const offsetTiles = (Math.random() * 2 - 1) * spreadTiles;
    const t = (((offsetTiles / world.totalLength) % 1) + 1) % 1;
    const reversed = i % 2 === 1;
    const fast = !reversed && Math.random() < 0.25;
    const lane = reversed ? 4 + Math.floor(Math.random() * 4) : fast ? Math.floor(Math.random() * 2) : Math.floor(Math.random() * 4);
    const p = positionOnLane(world, t, lane);
    const targetSpeed = fast ? 10.5 + Math.random() * 1.5 : 5 + Math.random() * 3;
    cars.push({
      id: i, x: p.x, y: p.y,
      heading: reversed ? Math.PI : 0,
      speed: fast ? 9 + Math.random() : 4 + Math.random() * 2,
      width: DEFAULT_CAR_WIDTH, length: DEFAULT_CAR_LENGTH,
      color: fast ? '#ffffff' : CAR_COLORS[i % CAR_COLORS.length],
      t, laneIdx: lane, targetLane: lane,
      laneChangeCooldown: 1 + Math.random() * 3, targetSpeed, reversed,
    });
  }
  return cars;
}

function aheadInLane(car: AICar, others: AICar[], player: PlayerCar, laneFilter: number, horizon: number) {
  let minDist = Infinity, otherSpeed = Infinity;
  const fx = Math.cos(car.heading), fy = Math.sin(car.heading);
  const h2 = horizon * horizon * 4;
  for (const o of others) {
    if (o.id === car.id) continue;
    const dx = o.x - car.x, dy = o.y - car.y;
    if (dx * dx + dy * dy > h2) continue;
    if (Math.abs(o.laneIdx - laneFilter) > 0.6) continue;
    const ahead = dx * fx + dy * fy;
    if (ahead <= 0.05 || ahead > horizon) continue;
    const lateral = Math.abs(-dx * fy + dy * fx);
    if (lateral > 1.0) continue;
    if (ahead < minDist) { minDist = ahead; otherSpeed = o.speed; }
  }
  const dxp = player.x - car.x, dyp = player.y - car.y;
  const aheadP = dxp * fx + dyp * fy;
  if (aheadP > 0.05 && aheadP < horizon) {
    const lateral = Math.abs(-dxp * fy + dyp * fx);
    if (lateral < 1.0 && aheadP < minDist) { minDist = aheadP; otherSpeed = Math.max(0, player.speed); }
  }
  return { dist: minDist, otherSpeed };
}

function laneIsBlocked(car: AICar, others: AICar[], targetLane: number): boolean {
  const fx = Math.cos(car.heading), fy = Math.sin(car.heading);
  for (const o of others) {
    if (o.id === car.id) continue;
    const occupies = Math.abs(o.laneIdx - targetLane) < 0.6 || Math.abs(o.targetLane - targetLane) < 0.5;
    if (!occupies) continue;
    const dx = o.x - car.x, dy = o.y - car.y;
    const ahead = dx * fx + dy * fy;
    const lateral = Math.abs(-dx * fy + dy * fx);
    if (ahead > -3.0 && ahead < 8.0 && lateral < 1.4) return true;
  }
  return false;
}

export function updatePlayer(player: PlayerCar, dt: number, inputs: Inputs, world: World): void {
  const accelInput = (inputs.up ? 1 : 0) - (inputs.down ? 1 : 0);
  if (accelInput > 0) player.speed += ACCEL * dt;
  else if (accelInput < 0) { if (player.speed > 0) player.speed -= BRAKE * dt; else player.speed -= ACCEL * 0.5 * dt; }
  else { if (player.speed > 0) player.speed = Math.max(0, player.speed - FRICTION * dt);
    else if (player.speed < 0) player.speed = Math.min(0, player.speed + FRICTION * dt); }
  player.speed = Math.max(-MAX_REVERSE, Math.min(MAX_SPEED, player.speed));

  const turnInput = (inputs.right ? 1 : 0) - (inputs.left ? 1 : 0);
  const speedFactor = Math.min(1, Math.abs(player.speed) / 3);
  const dirSign = player.speed >= 0 ? 1 : -1;
  player.heading += turnInput * TURN_RATE * speedFactor * dirSign * dt;

  const dx = Math.cos(player.heading) * player.speed * dt;
  const dy = Math.sin(player.heading) * player.speed * dt;
  const nx = player.x + dx, ny = player.y + dy;

  const margin = 0.18;
  const blocked = (cx: number, cy: number) => {
    for (const s of world.scenery) {
      if (s.type === 'sign') continue;
      const half = s.size / 2;
      if (cx > s.x - half && cx < s.x + half && cy > s.y - half && cy < s.y + half) return true;
    }
    return false;
  };
  if (!blocked(nx + margin, player.y) && !blocked(nx - margin, player.y)) player.x = nx;
  else player.speed *= 0.3;
  if (!blocked(player.x, ny + margin) && !blocked(player.x, ny - margin)) player.y = ny;
  else player.speed *= 0.3;

  const near = nearestT(world, player.x, player.y);
  if (near.lateralDist > HALF_ROAD_WIDTH) player.speed *= Math.pow(0.992, dt * 60);
}


export function updateAICar(car: AICar, dt: number, world: World, others: AICar[], player: PlayerCar): void {
  const pdx = car.x - player.x, pdy = car.y - player.y;
  if (pdx * pdx + pdy * pdy > 1200 * 1200) {
    car.t = advanceT(world, car.t, car.speed * (car.reversed ? -1 : 1) * dt);
    const fp = positionOnLane(world, car.t, car.laneIdx);
    car.x = fp.x; car.y = fp.y;
    car.heading = hwHeadingAt(world, car.t) + (car.reversed ? Math.PI : 0);
    return;
  }
  car.laneChangeCooldown = Math.max(0, car.laneChangeCooldown - dt);
  const aligned = Math.abs(car.laneIdx - car.targetLane) < 0.05;
  const minLane = car.reversed ? NUM_LANES / 2 : 0;
  const maxLane = car.reversed ? NUM_LANES - 1 : NUM_LANES / 2 - 1;

  if (aligned && car.laneChangeCooldown <= 0) {
    const sameLaneAhead = aheadInLane(car, others, player, car.targetLane, 20);
    const blockedAhead = sameLaneAhead.dist < 20 && sameLaneAhead.otherSpeed < car.targetSpeed - 0.4;
    if (blockedAhead) {
      const candidates: number[] = [];
      if (car.targetLane > minLane) candidates.push(car.targetLane - 1);
      if (car.targetLane < maxLane) candidates.push(car.targetLane + 1);
      for (const lane of candidates) {
        if (!laneIsBlocked(car, others, lane)) { car.targetLane = lane; car.laneChangeCooldown = 4; break; }
      }
    } else if (Math.random() < 0.04 * dt * 60) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const candidate = car.targetLane + dir;
      if (candidate >= minLane && candidate <= maxLane && !laneIsBlocked(car, others, candidate)) {
        car.targetLane = candidate; car.laneChangeCooldown = 6;
      }
    }
  }

  const laneRate = 1.0;
  if (car.laneIdx < car.targetLane) car.laneIdx = Math.min(car.targetLane, car.laneIdx + laneRate * dt);
  else if (car.laneIdx > car.targetLane) car.laneIdx = Math.max(car.targetLane, car.laneIdx - laneRate * dt);

  let desired = car.targetSpeed;
  const inLane = aheadInLane(car, others, player, car.laneIdx, 20);
  if (inLane.dist < 20) {
    const safe = Math.max(0, (inLane.dist - 2.0) / 18.0 * car.targetSpeed);
    desired = Math.min(desired, safe, inLane.otherSpeed - 0.3);
  }
  if (desired < 0) desired = 0;

  if (desired > car.speed) car.speed = Math.min(desired, car.speed + ACCEL * 0.7 * dt);
  else car.speed = Math.max(desired, car.speed - BRAKE * 0.7 * dt);
  if (car.speed < 0) car.speed = 0;

  car.t = advanceT(world, car.t, car.speed * (car.reversed ? -1 : 1) * dt);
  const p = positionOnLane(world, car.t, car.laneIdx);
  car.x = p.x; car.y = p.y;
  car.heading = hwHeadingAt(world, car.t) + (car.reversed ? Math.PI : 0);
}

export interface ViolationFlag { active: boolean; message: string; age: number; }

export function checkPlayerViolations(
  player: PlayerCar, world: World, flag: ViolationFlag, dt: number, prev: ViolationState,
): void {
  if (flag.active) { flag.age += dt; if (flag.age > 1.6) { flag.active = false; flag.age = 0; } }
  const near = nearestT(world, player.x, player.y);
  const ti = world.tangents[Math.floor(near.t * world.centerline.length) % world.centerline.length];
  const headDx = Math.cos(player.heading), headDy = Math.sin(player.heading);
  const align = headDx * ti.x + headDy * ti.y;
  const onHighway = near.lateralDist <= HALF_ROAD_WIDTH;
  const wrongDir = onHighway && align * near.signedLateral < -0.09 && Math.abs(player.speed) > 0.8;
  if (wrongDir) prev.wrongWayTime += dt; else prev.wrongWayTime = Math.max(0, prev.wrongWayTime - dt * 2);
  if (prev.wrongWayTime > 1.5 && !flag.active) {
    flag.active = true; flag.age = 0; flag.message = 'WRONG WAY! Turn around.'; prev.wrongWayTime = 0;
  }
}

export interface ViolationState { wrongWayTime: number; }
export function newViolationState(): ViolationState { return { wrongWayTime: 0 }; }
