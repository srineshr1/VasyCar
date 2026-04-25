# AGENTS.md — carsim2

## Project type
React + Vite + TypeScript + Tailwind CSS. HTML5 Canvas isometric highway sim.

## Entrypoint
- `index.html` → `src/main.tsx` → `src/App.tsx`

## Running
- `npm run dev` — start dev server
- `npm run build` — production build (outputs to `dist/`)
- `npm run preview` — preview production build

## Architecture
- **Game state and loop**: `src/hooks/useGameLoop.ts` — owns all mutable game state in refs, runs 60fps RAF loop, handles keyboard input, updates physics, throttles React HUD updates to ~10fps.
- **World model**: `src/utils/highway.ts` — closed-loop centerline polyline (a stretched, gently wobbled oval) with 4 one-way lanes. Exposes `createHighway`, `positionOnLane(t, laneIdx)`, `headingAt(t)`, `advanceT(t, distance)`, `nearestT(x, y)`. Also generates roadside scenery (trees, small buildings, signs).
- **Car physics/AI**: `src/utils/cars.ts` — player is free-world (WASD); AI cars live parametrically on the highway via `t + laneIdx`, do lane-keeping, slow for traffic, and change lanes around slower cars.
- **Canvas rendering**: `src/utils/render.ts` — isometric Canvas 2D drawing. Static world (grass, asphalt ribbon, shoulders, lane markings, scenery) is pre-rasterized once into an offscreen background cache; per-frame only cars are drawn on top.
- **React components**: `GameCanvas` (main canvas), `HUD` (speed + violation banner), `Minimap` (top-down centerline + cars).

## Important quirks
- The game does not load any external assets at runtime. All graphics are procedurally drawn via Canvas 2D.
- Game state (positions, speeds, camera) lives in refs to avoid React re-renders every frame. Only HUD values are passed to React state, throttled.
- Highway is a closed-loop centerline; AI cars travel parametrically (`t ∈ [0, 1)` + `laneIdx`). Player position is free-world.
- Camera: smooth-follow lerp toward player position. Iso projection: `pointIso(x, y) = ((x - y) * TILE_W/2, (x + y) * TILE_H/2)`.
- WRONG WAY violation uses heading·tangent dot product, *not* `t` deltas (which break at the loop seam).

## What to avoid
- Do not add heavy external libraries; the sim is intentionally lightweight Canvas 2D.
- Do not store per-frame game data in React state; use refs.
- Do not redraw the static world per frame; rebuild the background cache if the world changes.

## Commands
```bash
npm install   # install deps
npm run dev   # dev server
npm run build # production build
```
