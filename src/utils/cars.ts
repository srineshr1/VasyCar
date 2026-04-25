import {
  World,
  positionOnLane,
  headingAt,
  tangentAt,
  advanceT,
  nearestT,
  intersectionAhead,
  highwayLightState,
  crossLightState,
  NUM_LANES,
  HALF_ROAD_WIDTH,
  CROSS_HALF_LENGTH,
} from './highway';

export const CAR_COLORS = [
  '#a26bff',
  '#36c5c0',
  '#ffd23f',
  '#4a90e2',
  '#ff7eb6',
  '#ff8a3d',
  '#ff5e5e',
  '#7ed957',
];

export const PLAYER_COLOR = '#ff5e8a';

export const SPEED_TO_KMH = 10;
export const MAX_SPEED = 12;
export const MAX_REVERSE = 4;
export const ACCEL = 9;
export const BRAKE = 14;
export const FRICTION = 2.5;
export const TURN_RATE = 2.4;

const DEFAULT_CAR_WIDTH = 0.55;
const DEFAULT_CAR_LENGTH = 0.95;
const HIGHWAY_STOP_FROM_CENTER = HALF_ROAD_WIDTH + DEFAULT_CAR_LENGTH * 0.65;
const CROSS_STOP_FROM_CENTER = HALF_ROAD_WIDTH + DEFAULT_CAR_LENGTH * 0.65;

export interface PlayerCar {
  x: number;
  y: number;
  heading: number;
  speed: number;
  width: number;
  length: number;
  color: string;
}

export interface AICar {
  id: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
  width: number;
  length: number;
  color: string;
  t: number;
  laneIdx: number;
  targetLane: number;
  laneChangeCooldown: number;
  targetSpeed: number;
}

export interface CrossTrafficCar {
  id: number;
  intersectionId: number;
  side: -1 | 1;
  progress: number;
  laneOffset: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
  targetSpeed: number;
  width: number;
  length: number;
  color: string;
}

export interface Inputs {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export function createPlayer(world: World): PlayerCar {
  const p = positionOnLane(world, 0, 1);
  const heading = headingAt(world, 0);
  return {
    x: p.x,
    y: p.y,
    heading,
    speed: 0,
    width: DEFAULT_CAR_WIDTH,
    length: DEFAULT_CAR_LENGTH,
    color: PLAYER_COLOR,
  };
}

export function createAICars(world: World, count: number): AICar[] {
  const cars: AICar[] = [];
  for (let i = 0; i < count; i++) {
    const t = ((i + 0.5) / count + 0.04) % 1;
    const lane = Math.floor(Math.random() * NUM_LANES);
    const p = positionOnLane(world, t, lane);
    cars.push({
      id: i,
      x: p.x,
      y: p.y,
      heading: headingAt(world, t),
      speed: 4 + Math.random() * 2,
      width: DEFAULT_CAR_WIDTH,
      length: DEFAULT_CAR_LENGTH,
      color: CAR_COLORS[i % CAR_COLORS.length],
      t,
      laneIdx: lane,
      targetLane: lane,
      laneChangeCooldown: 1 + Math.random() * 3,
      targetSpeed: 5 + Math.random() * 3,
    });
  }
  return cars;
}

function setCrossTrafficPose(car: CrossTrafficCar, world: World): void {
  const ix = world.intersections[car.intersectionId];
  const signedNormal = car.side * (CROSS_HALF_LENGTH - car.progress);
  car.x = ix.x + ix.normalX * signedNormal + ix.tangentX * car.laneOffset;
  car.y = ix.y + ix.normalY * signedNormal + ix.tangentY * car.laneOffset;
  car.heading = Math.atan2(-ix.normalY * car.side, -ix.normalX * car.side);
}

export function createCrossTraffic(world: World): CrossTrafficCar[] {
  const cars: CrossTrafficCar[] = [];
  let id = 0;
  for (const ix of world.intersections) {
    for (const side of [-1, 1] as const) {
      for (let queueIdx = 0; queueIdx < 2; queueIdx++) {
        const car: CrossTrafficCar = {
          id,
          intersectionId: ix.id,
          side,
          progress: queueIdx * 6.4 + Math.random() * 2.4,
          laneOffset: -side * 0.55,
          x: ix.x,
          y: ix.y,
          heading: 0,
          speed: 2 + Math.random() * 1.5,
          targetSpeed: 3.8 + Math.random() * 1.4,
          width: DEFAULT_CAR_WIDTH,
          length: DEFAULT_CAR_LENGTH,
          color: CAR_COLORS[(id + 3) % CAR_COLORS.length],
        };
        setCrossTrafficPose(car, world);
        cars.push(car);
        id++;
      }
    }
  }
  return cars;
}

function aheadInLane(
  car: AICar,
  others: AICar[],
  player: PlayerCar,
  laneFilter: number,
  horizon: number,
): { dist: number; otherSpeed: number } {
  let minDist = Infinity;
  let otherSpeed = Infinity;
  const fx = Math.cos(car.heading);
  const fy = Math.sin(car.heading);

  for (const o of others) {
    if (o.id === car.id) continue;
    if (Math.abs(o.laneIdx - laneFilter) > 0.6) continue;
    const dx = o.x - car.x;
    const dy = o.y - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead <= 0.05 || ahead > horizon) continue;
    const lateral = Math.abs(-dx * fy + dy * fx);
    if (lateral > 1.0) continue;
    if (ahead < minDist) {
      minDist = ahead;
      otherSpeed = o.speed;
    }
  }

  const dxp = player.x - car.x;
  const dyp = player.y - car.y;
  const aheadP = dxp * fx + dyp * fy;
  if (aheadP > 0.05 && aheadP < horizon) {
    const lateral = Math.abs(-dxp * fy + dyp * fx);
    if (lateral < 1.0 && aheadP < minDist) {
      minDist = aheadP;
      otherSpeed = Math.max(0, player.speed);
    }
  }

  return { dist: minDist, otherSpeed };
}

function laneIsBlocked(
  car: AICar,
  others: AICar[],
  targetLane: number,
): boolean {
  const fx = Math.cos(car.heading);
  const fy = Math.sin(car.heading);
  for (const o of others) {
    if (o.id === car.id) continue;
    const occupies =
      Math.abs(o.laneIdx - targetLane) < 0.6 ||
      Math.abs(o.targetLane - targetLane) < 0.5;
    if (!occupies) continue;
    const dx = o.x - car.x;
    const dy = o.y - car.y;
    const ahead = dx * fx + dy * fy;
    const lateral = Math.abs(-dx * fy + dy * fx);
    if (ahead > -1.5 && ahead < 3.5 && lateral < 1.4) return true;
  }
  return false;
}

export function updatePlayer(
  player: PlayerCar,
  dt: number,
  inputs: Inputs,
  world: World,
): void {
  const accelInput = (inputs.up ? 1 : 0) - (inputs.down ? 1 : 0);

  if (accelInput > 0) {
    player.speed += ACCEL * dt;
  } else if (accelInput < 0) {
    if (player.speed > 0) player.speed -= BRAKE * dt;
    else player.speed -= ACCEL * 0.5 * dt;
  } else {
    if (player.speed > 0) player.speed = Math.max(0, player.speed - FRICTION * dt);
    else if (player.speed < 0) player.speed = Math.min(0, player.speed + FRICTION * dt);
  }
  player.speed = Math.max(-MAX_REVERSE, Math.min(MAX_SPEED, player.speed));

  const turnInput = (inputs.right ? 1 : 0) - (inputs.left ? 1 : 0);
  const speedFactor = Math.min(1, Math.abs(player.speed) / 3);
  const dirSign = player.speed >= 0 ? 1 : -1;
  player.heading += turnInput * TURN_RATE * speedFactor * dirSign * dt;

  const dx = Math.cos(player.heading) * player.speed * dt;
  const dy = Math.sin(player.heading) * player.speed * dt;
  const nx = player.x + dx;
  const ny = player.y + dy;

  const margin = 0.18;
  const blocked = (cx: number, cy: number) => {
    for (const s of world.scenery) {
      if (s.type === 'sign') continue;
      const half = s.size / 2;
      if (
        cx > s.x - half &&
        cx < s.x + half &&
        cy > s.y - half &&
        cy < s.y + half
      ) {
        return true;
      }
    }
    return false;
  };

  if (!blocked(nx + margin, player.y) && !blocked(nx - margin, player.y)) {
    player.x = nx;
  } else {
    player.speed *= 0.3;
  }
  if (!blocked(player.x, ny + margin) && !blocked(player.x, ny - margin)) {
    player.y = ny;
  } else {
    player.speed *= 0.3;
  }

  const near = nearestT(world, player.x, player.y);
  if (near.lateralDist > HALF_ROAD_WIDTH) {
    player.speed *= Math.pow(0.985, dt * 60);
  }
}

export function updateAICar(
  car: AICar,
  dt: number,
  world: World,
  others: AICar[],
  player: PlayerCar,
  timeS: number,
): void {
  car.laneChangeCooldown = Math.max(0, car.laneChangeCooldown - dt);

  const aligned = Math.abs(car.laneIdx - car.targetLane) < 0.05;

  if (aligned && car.laneChangeCooldown <= 0) {
    const sameLaneAhead = aheadInLane(car, others, player, car.targetLane, 3.5);
    const blockedAhead =
      sameLaneAhead.dist < 3.5 && sameLaneAhead.otherSpeed < car.targetSpeed - 0.4;
    if (blockedAhead) {
      const candidates: number[] = [];
      if (car.targetLane > 0) candidates.push(car.targetLane - 1);
      if (car.targetLane < NUM_LANES - 1) candidates.push(car.targetLane + 1);
      for (const lane of candidates) {
        if (!laneIsBlocked(car, others, lane)) {
          car.targetLane = lane;
          car.laneChangeCooldown = 4;
          break;
        }
      }
    } else if (Math.random() < 0.04 * dt * 60) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const candidate = car.targetLane + dir;
      if (
        candidate >= 0 &&
        candidate < NUM_LANES &&
        !laneIsBlocked(car, others, candidate)
      ) {
        car.targetLane = candidate;
        car.laneChangeCooldown = 6;
      }
    }
  }

  const laneRate = 1.0;
  if (car.laneIdx < car.targetLane) {
    car.laneIdx = Math.min(car.targetLane, car.laneIdx + laneRate * dt);
  } else if (car.laneIdx > car.targetLane) {
    car.laneIdx = Math.max(car.targetLane, car.laneIdx - laneRate * dt);
  }

  let desired = car.targetSpeed;
  const inLane = aheadInLane(car, others, player, car.laneIdx, 2.0);
  if (inLane.dist < 2.0) {
    const safe = Math.max(0, (inLane.dist - 0.5) * 4);
    desired = Math.min(desired, safe, inLane.otherSpeed - 0.3);
  }
  const ixAhead = intersectionAhead(world, car.t, 9.0);
  if (ixAhead) {
    const state = highwayLightState(ixAhead.intersection, timeS);
    const d = ixAhead.distTiles - HIGHWAY_STOP_FROM_CENTER;
    if (state === 'red') {
      if (d > -0.25 && d < 0.45) desired = 0;
      else if (d > 0 && d < 6.0) desired = Math.min(desired, Math.max(0, (d - 0.25) * 2.6));
    } else if (state === 'yellow' && d > -0.25 && d < 3.5) {
      desired = Math.min(desired, Math.max(0, (d - 0.2) * 2.2));
    }
  }
  if (desired < 0) desired = 0;

  if (desired > car.speed) car.speed = Math.min(desired, car.speed + ACCEL * 0.7 * dt);
  else car.speed = Math.max(desired, car.speed - BRAKE * 0.7 * dt);
  if (car.speed < 0) car.speed = 0;

  car.t = advanceT(world, car.t, car.speed * dt);
  const p = positionOnLane(world, car.t, car.laneIdx);
  car.x = p.x;
  car.y = p.y;
  car.heading = headingAt(world, car.t);
}

function crossCarAhead(
  car: CrossTrafficCar,
  others: CrossTrafficCar[],
): { dist: number; speed: number } {
  let dist = Infinity;
  let speed = Infinity;
  for (const other of others) {
    if (other.id === car.id) continue;
    if (other.intersectionId !== car.intersectionId || other.side !== car.side) continue;
    const ahead = other.progress - car.progress;
    if (ahead > 0.05 && ahead < dist) {
      dist = ahead;
      speed = other.speed;
    }
  }
  return { dist, speed };
}

export function updateCrossTrafficCar(
  car: CrossTrafficCar,
  dt: number,
  world: World,
  others: CrossTrafficCar[],
  timeS: number,
): void {
  const ix = world.intersections[car.intersectionId];
  const state = crossLightState(ix, timeS);
  let desired = car.targetSpeed;

  const stopProgress = CROSS_HALF_LENGTH - CROSS_STOP_FROM_CENTER;
  const distToStop = stopProgress - car.progress;
  if (state !== 'green' && distToStop > -0.25) {
    if (distToStop < 0.45) desired = 0;
    else if (distToStop < 5.5) desired = Math.min(desired, Math.max(0, (distToStop - 0.25) * 2.4));
  }

  const ahead = crossCarAhead(car, others);
  if (ahead.dist < 3.4) {
    const safe = Math.max(0, (ahead.dist - 1.1) * 2.4);
    desired = Math.min(desired, safe, ahead.speed);
  }

  if (desired > car.speed) car.speed = Math.min(desired, car.speed + ACCEL * 0.55 * dt);
  else car.speed = Math.max(desired, car.speed - BRAKE * 0.75 * dt);
  if (car.speed < 0) car.speed = 0;

  car.progress += car.speed * dt;
  const routeLength = CROSS_HALF_LENGTH * 2 + 5;
  if (car.progress > routeLength) {
    car.progress = -4 - Math.random() * 5;
    car.targetSpeed = 3.8 + Math.random() * 1.4;
    car.speed = Math.min(car.speed, car.targetSpeed);
  }

  setCrossTrafficPose(car, world);
}

export interface ViolationFlag {
  active: boolean;
  message: string;
  age: number;
}

export interface ViolationState {
  lastWarned: number;
  wrongWayTime: number;
  offRoadTime: number;
  respawnTimer: number;
  lastRedLightId: number;
}

export function newViolationState(): ViolationState {
  return { lastWarned: -10, wrongWayTime: 0, offRoadTime: 0, respawnTimer: 0, lastRedLightId: -99 };
}

export function checkPlayerViolations(
  player: PlayerCar,
  world: World,
  timeS: number,
  flag: ViolationFlag,
  dt: number,
  prev: ViolationState,
): void {
  if (flag.active) {
    flag.age += dt;
    if (flag.age > 1.6) {
      flag.active = false;
      flag.age = 0;
    }
  }

  const near = nearestT(world, player.x, player.y);
  const tangent = tangentAt(world, near.t);
  const headDx = Math.cos(player.heading);
  const headDy = Math.sin(player.heading);
  const align = headDx * tangent.x + headDy * tangent.y;

  if (align < -0.3 && Math.abs(player.speed) > 0.8) {
    prev.wrongWayTime += dt;
  } else {
    prev.wrongWayTime = Math.max(0, prev.wrongWayTime - dt * 2);
  }
  if (prev.wrongWayTime > 1.5 && timeS - prev.lastWarned > 2.5) {
    flag.active = true;
    flag.age = 0;
    flag.message = 'WRONG WAY! Turn around.';
    prev.lastWarned = timeS;
    prev.wrongWayTime = 0;
  }

  if (near.lateralDist > HALF_ROAD_WIDTH) {
    prev.offRoadTime += dt;
    prev.respawnTimer += dt;
  } else {
    prev.offRoadTime = Math.max(0, prev.offRoadTime - dt * 2);
    prev.respawnTimer = Math.max(0, prev.respawnTimer - dt * 2);
  }
  if (prev.respawnTimer >= 5.0) {
    const p = positionOnLane(world, near.t, 1);
    player.x = p.x;
    player.y = p.y;
    player.heading = headingAt(world, near.t);
    player.speed = 0;
    prev.offRoadTime = 0;
    prev.respawnTimer = 0;
    flag.active = true;
    flag.age = 0;
    flag.message = 'RESPAWNED on highway!';
    prev.lastWarned = timeS;
  } else if (prev.offRoadTime > 1.0 && timeS - prev.lastWarned > 2.5) {
    flag.active = true;
    flag.age = 0;
    flag.message = 'OFF ROAD! Get back on the highway.';
    prev.lastWarned = timeS;
    prev.offRoadTime = 0;
  }

  for (const ix of world.intersections) {
    const dotT = (player.x - ix.x) * ix.tangentX + (player.y - ix.y) * ix.tangentY;
    const dotN = (player.x - ix.x) * ix.normalX + (player.y - ix.y) * ix.normalY;
    const inBox = Math.abs(dotT) < HALF_ROAD_WIDTH && Math.abs(dotN) < HALF_ROAD_WIDTH;
    if (!inBox) {
      if (ix.id === prev.lastRedLightId && Math.abs(dotT) > HALF_ROAD_WIDTH + 1) {
        prev.lastRedLightId = -99;
      }
      continue;
    }
    const state = highwayLightState(ix, timeS);
    if (
      state === 'red' &&
      Math.abs(player.speed) > 1.5 &&
      prev.lastRedLightId !== ix.id &&
      timeS - prev.lastWarned > 2.0
    ) {
      flag.active = true;
      flag.age = 0;
      flag.message = 'STOP! You ran a red light.';
      prev.lastWarned = timeS;
      prev.lastRedLightId = ix.id;
    }
    if (state === 'green') prev.lastRedLightId = -99;
  }
}
