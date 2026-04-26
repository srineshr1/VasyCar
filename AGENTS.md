# AGENTS.md — carsim2

## Project type
React 18 + Vite + TypeScript + Tailwind CSS. Single-page HTML5 Canvas isometric highway sim. No external assets — all graphics procedural.

## Commands
```bash
npm install          # install deps
npm run dev          # Vite dev server
npm run build        # tsc typecheck then vite build → dist/
npm run preview      # preview production build
```
- No test runner, linter, or formatter configured. `tsc` (as part of `build`) is the only static check.
- `tsconfig.json` enables `strict`, `noUnusedLocals`, `noUnusedParameters`. Vite config uses `base: './'` (relative paths).

## Entrypoint
`index.html` → `src/main.tsx` → `src/App.tsx`

## Architecture

### Module map
- **`src/hooks/useGameLoop.ts`** — owns the RAF loop and **all mutable game state in `useRef`**. React state is used only for the HUD, throttled to ~12 Hz via `hudAcc`. Handles keyboard input, horn AudioContext, physics, AI, violations, open-world logic, camera lerp, and rendering.
- **`src/utils/highway.ts`** — closed-loop centerline polyline (stretched, wobbled oval) with 4 one-way lanes. Exposes `createHighway`, `positionOnLane(t, laneIdx)`, `headingAt(t)`, `advanceT(t, distance)`, `nearestT(x, y)`, `arcLengthAtT`/`tAtArcLength`. Generates roadside scenery, collectibles, interactive buildings (gas stations, upgrade shops, garages), and intersections with traffic lights.
- **`src/utils/cars.ts`** — `PlayerCar` (free-world x/y/heading/speed), `AICar` (parametric `t ∈ [0,1)` + `laneIdx`), `CrossTrafficCar` (drives perpendicular at intersections). AI does lane-keeping, slows for traffic, lane-changes with conflict avoidance, stops at red lights. Cross-traffic respects light phase. Violations: WRONG WAY (heading·tangent dot < 0 for >1.5s) and OFF ROAD (>1s off asphalt). Player collision: axis-aligned obstacle stop-and-friction; off-road applies rumble-strip drag.
- **`src/utils/gameState.ts`** — open-world state: money, fuel, upgrades, collectibles, missions. Mission types: collect_stars, reach_destination, full_lap. Fuel drains while moving; empty fuel = no throttle. Stuck detection (>3s at low speed) auto-respawns player onto road.
- **`src/utils/render.ts`** — isometric Canvas 2D. `TILE_W=64`, `TILE_H=32`. Static world (grass, asphalt, shoulders, lane markings, scenery, intersections) is **pre-rasterized once** into an offscreen cache via `buildBackgroundCache()`. Per-frame: blit cache, z-sort and draw cars + traffic-light sprites + collectibles + mission marker. `drawMinimap()` renders a top-down minimap.
- **`src/components/{GameCanvas,HUD,Minimap}.tsx`** — thin React wrappers; no game logic.

### Coordinate systems
- **World coords**: 1 unit = 1 tile. Origin-centered, includes negatives.
- **Iso projection**: `pointIso(x, y) = ((x - y) * TILE_W/2, (x + y) * TILE_H/2)`.
- **Lane convention**: lane 0 = leftmost (innermost on loop). Offset along inner-pointing perpendicular.
- **Closed-loop**: `t` is mod 1. Use `advanceT()` to move parametrically (handles wrap). Never compare raw `t` deltas across the seam.

## Key invariants
- Per-frame game data **must not** live in React state. Mutate refs in `useGameLoop`; only push HUD values via throttled `onHud`.
- Background cache is built once. If static-world visuals change, regenerate the cache — don't draw them per frame.
- WRONG WAY detection uses heading·tangent dot product, **not** `t` deltas (which false-positive at the loop seam).
- Traffic light timing is derived from elapsed wall-clock seconds (`timeS`), not frame count.
- AI lane-change must check both `other.laneIdx` and `other.targetLane` to avoid two cars converging into the same gap.
- No heavy external libraries. No physics/game/asset frameworks.

## Controls
- **WASD / Arrow keys** — drive
- **SPACE** — horn
- **E** — interact with nearby building (gas station, upgrade shop, garage)
