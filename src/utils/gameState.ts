import { PlayerCar } from './cars';

export interface OpenWorldState {
  fuel: number;
}

export const FUEL_DRAIN_RATE = 0.28;
export const FUEL_WARN_THRESHOLD = 15;

export function createOpenWorldState(): OpenWorldState {
  return { fuel: 100 };
}

export function updateOpenWorld(
  ow: OpenWorldState,
  player: PlayerCar,
  dt: number,
): { fuelWarning: boolean } {
  if (Math.abs(player.speed) > 0.5 && ow.fuel > 0) {
    ow.fuel = Math.max(0, ow.fuel - FUEL_DRAIN_RATE * dt);
  }
  return { fuelWarning: ow.fuel <= FUEL_WARN_THRESHOLD };
}
