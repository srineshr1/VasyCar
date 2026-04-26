import {
  World,
  InteractiveBuilding,
  arcLengthAtT,
  nearestT,
  tangentAt,
  positionOnLane,
} from './highway';
import { PlayerCar } from './cars';

export type MissionType = 'collect_stars' | 'reach_destination' | 'full_lap';

export interface MissionState {
  type: MissionType;
  index: number;
  complete: boolean;
  label: string;
  requiredCollected: number;
  destinationBuildingId: number | null;
  nextCheckpoint: number;
  checkpointsDone: number;
  lapComplete: boolean;
}

export interface OpenWorldState {
  money: number;
  fuel: number;
  upgrades: number;
  collectibleCollected: boolean[];
  collectedCount: number;
  mission: MissionState;
}

export const FUEL_DRAIN_RATE = 0.28;
export const FUEL_WARN_THRESHOLD = 15;
export const COLLECT_RADIUS = 2.5;
export const INTERACT_RADIUS = 5.0;
const LAP_CHECKPOINTS = [0.0, 0.25, 0.5, 0.75];
const LAP_CHECKPOINT_RADIUS_ARC = 10.0;

export function createMission(index: number): MissionState {
  const types: MissionType[] = ['collect_stars', 'reach_destination', 'full_lap'];
  const type = types[index % 3];
  const labels: Record<MissionType, string> = {
    collect_stars: 'Collect 5 stars',
    reach_destination: 'Reach the destination',
    full_lap: 'Complete a full lap',
  };
  return {
    type,
    index,
    complete: false,
    label: labels[type],
    requiredCollected: 5,
    destinationBuildingId: index % 20,
    nextCheckpoint: 0,
    checkpointsDone: 0,
    lapComplete: false,
  };
}

export function createOpenWorldState(numCollectibles: number): OpenWorldState {
  return {
    money: 200,
    fuel: 100,
    upgrades: 0,
    collectibleCollected: new Array(numCollectibles).fill(false),
    collectedCount: 0,
    mission: createMission(0),
  };
}

function handleBuildingInteraction(ow: OpenWorldState, b: InteractiveBuilding): void {
  if (b.type === 'gas_station' && ow.money >= 50) {
    ow.money -= 50;
    ow.fuel = 100;
  } else if (b.type === 'upgrade_shop' && ow.money >= 100) {
    ow.money -= 100;
    ow.upgrades = Math.min(3, ow.upgrades + 1);
  } else if (b.type === 'garage' && ow.money >= 30) {
    ow.money -= 30;
    ow.fuel = Math.min(100, ow.fuel + 30);
  }
}

function updateLapProgress(ow: OpenWorldState, player: PlayerCar, world: World): void {
  const m = ow.mission;
  const targetT = LAP_CHECKPOINTS[m.nextCheckpoint];
  const playerT = nearestT(world, player.x, player.y).t;
  const playerS = arcLengthAtT(world, playerT);
  const targetS = arcLengthAtT(world, targetT);
  const dist = Math.abs(playerS - targetS);
  const wrappedDist = Math.min(dist, world.totalLength - dist);

  const tangent = tangentAt(world, playerT);
  const moving = Math.cos(player.heading) * tangent.x + Math.sin(player.heading) * tangent.y;

  if (wrappedDist < LAP_CHECKPOINT_RADIUS_ARC && moving > 0.3) {
    m.checkpointsDone++;
    m.nextCheckpoint = (m.nextCheckpoint + 1) % LAP_CHECKPOINTS.length;
    if (m.checkpointsDone >= LAP_CHECKPOINTS.length) {
      m.lapComplete = true;
    }
  }
}

function updateMission(ow: OpenWorldState, player: PlayerCar, world: World): boolean {
  if (ow.mission.complete) return false;
  const m = ow.mission;

  if (m.type === 'collect_stars') {
    if (ow.collectedCount >= m.requiredCollected) {
      m.complete = true;
      ow.money += 150;
      ow.collectibleCollected.fill(false);
      ow.collectedCount = 0;
      return true;
    }
  } else if (m.type === 'reach_destination') {
    if (m.destinationBuildingId !== null && world.interactives[m.destinationBuildingId]) {
      const b = world.interactives[m.destinationBuildingId];
      const d = Math.hypot(player.x - b.x, player.y - b.y);
      if (d < INTERACT_RADIUS * 2) {
        m.complete = true;
        ow.money += 100;
        return true;
      }
    }
  } else if (m.type === 'full_lap') {
    updateLapProgress(ow, player, world);
    if (m.lapComplete) {
      m.complete = true;
      ow.money += 200;
      return true;
    }
  }
  return false;
}

export function getMissionMarker(
  ow: OpenWorldState,
  world: World,
): { x: number; y: number } | null {
  const m = ow.mission;
  if (m.complete) return null;
  if (m.type === 'reach_destination' && m.destinationBuildingId !== null && world.interactives[m.destinationBuildingId]) {
    const b = world.interactives[m.destinationBuildingId];
    return { x: b.x, y: b.y };
  }
  if (m.type === 'full_lap') {
    const targetT = LAP_CHECKPOINTS[m.nextCheckpoint];
    const p = positionOnLane(world, targetT, 1);
    return { x: p.x, y: p.y };
  }
  return null;
}

export interface UpdateOwResult {
  nearBuildingId: number | null;
  missionMarker: { x: number; y: number } | null;
  fuelWarning: boolean;
  missionJustComplete: boolean;
}

export function updateOpenWorld(
  ow: OpenWorldState,
  player: PlayerCar,
  world: World,
  dt: number,
  eJustPressed: boolean,
): UpdateOwResult {
  if (Math.abs(player.speed) > 0.5 && ow.fuel > 0) {
    ow.fuel = Math.max(0, ow.fuel - FUEL_DRAIN_RATE * dt);
  }

  for (let i = 0; i < world.collectibles.length; i++) {
    if (ow.collectibleCollected[i]) continue;
    const c = world.collectibles[i];
    if (Math.hypot(player.x - c.x, player.y - c.y) < COLLECT_RADIUS) {
      ow.collectibleCollected[i] = true;
      ow.collectedCount++;
    }
  }

  let nearBuildingId: number | null = null;
  let nearDist = Infinity;
  for (const b of world.interactives) {
    const d = Math.hypot(player.x - b.x, player.y - b.y);
    if (d < INTERACT_RADIUS && d < nearDist) {
      nearDist = d;
      nearBuildingId = b.id;
    }
  }

  if (eJustPressed && nearBuildingId !== null) {
    handleBuildingInteraction(ow, world.interactives[nearBuildingId]);
  }

  const missionJustComplete = updateMission(ow, player, world);

  return {
    nearBuildingId,
    missionMarker: getMissionMarker(ow, world),
    fuelWarning: ow.fuel <= FUEL_WARN_THRESHOLD,
    missionJustComplete,
  };
}
