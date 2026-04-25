# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` — install deps
- `npm run dev` — Vite dev server
- `npm run build` — typecheck (`tsc`) then production build to `dist/`
- `npm run preview` — preview the production build

No test runner, linter, or formatter is configured. `tsc` runs as part of `build` and is the only static check.

## Stack

React 18 + Vite + TypeScript + Tailwind. Single-page Canvas 2D game; no external assets are loaded at runtime — all graphics are procedurally drawn.

## Architecture

The whole game is one React app that mounts a `<canvas>` and runs a RAF loop. Architectural cohesion lives in three `src/utils/*` modules plus one hook; React is used only for the HUD and to host the canvases.

### Module layout

- `src/hooks/useGameLoop.ts` — owns the RAF loop and **all mutable game state in `useRef`**. React state is used only for the HUD, throttled to ~10 Hz via `hudAcc`. Wires keyboard input, audio honk (`AudioContext`), physics, AI, violation checks, and rendering. Camera does smooth-follow on the player.
- `src/utils/highway.ts` — the world model: a **closed-loop centerline polyline** (a stretched, gently wobbled oval) with **4 one-way lanes** offset perpendicular to the tangent. Exposes `createHighway(seed)`, `positionOnLane(t, laneIdx)`, `headingAt(t)`, `tangentAt(t)`, `advanceT(t, distance)`, `nearestT(x, y)`, plus `arcLengthAtT`/`tAtArcLength` for the parametric ↔ arc-length mapping. Also generates roadside `scenery` (trees, small buildings, signs) and a world `bounds` rectangle. There are **no tiles, no intersections, no traffic lights, no stop signs.**
- `src/utils/cars.ts` — `PlayerCar` is free-world (x/y/heading/speed in tile units). `AICar` lives parametrically on the highway via `t ∈ [0,1)` + a float `laneIdx`. AI does basic lane-keeping, slows for traffic ahead in the same lane, and changes lanes around slower cars (with a target-lane-conflict check so two adjacent cars can't both target the same gap). Player physics: scenery acts as axis-aligned obstacles using the existing axis-by-axis stop-and-friction; off-road (lateral distance > `HALF_ROAD_WIDTH` from centerline) applies a soft per-frame speed multiplier (rumble-strip drag), no hard wall. Violations are **WRONG WAY** (heading vs. centerline tangent dot product < 0 for >1.5 s — *not* a previous-`t` delta, which would false-positive at the loop seam) and **OFF ROAD** (>1 s off the asphalt).
- `src/utils/render.ts` — isometric Canvas 2D. `TILE_W=64`, `TILE_H=32`. The static world (grass, asphalt ribbon, shoulders, lane markings, scenery) is **pre-rasterized once into an offscreen canvas** by `buildBackgroundCache(world)`; per-frame `renderScene` blits that, then z-sorts and draws cars (player + AI) on top. `drawMinimap` shows the centerline as a fat grey closed polyline plus dots for cars.
- `src/components/{GameCanvas,HUD,Minimap}.tsx` — thin React wrappers around canvas elements / HUD DOM. They hold no game logic.
- `src/App.tsx` — composes the three components and calls `useGameLoop(canvasRef, minimapRef, onHud)`.

### Coordinate systems

- **World/tile coords**: 1 unit = 1 tile. Player position, AI position (computed from `positionOnLane`), camera, centerline points, scenery — all in tile units. The world is centered at the origin and includes negative coordinates (the city version was 0..GRID_SIZE).
- **Isometric pixel coords**: `pointIso(x, y) = ((x - y) * TILE_W/2, (x + y) * TILE_H/2)`. The background cache stores pixels in this iso space with an `offsetX/offsetY` so all coords are non-negative. Per-frame, `project` adds the camera offset.
- **Lane index convention**: in `positionOnLane`, lane 0 is the leftmost lane relative to the direction of travel (innermost on the closed loop). Offset = `((numLanes - 1) / 2 - laneIdx) * laneWidth` along the inner-pointing perpendicular `(-tangent.y, tangent.x)`.
- **Closed-loop topology**: `t` is mod 1. `advanceT(t, d)` uses `cumulativeLengths` to convert distance-in-tiles → param, so AI cars travel at uniform tile/s regardless of curvature.

### Invariants worth preserving

- Per-frame game data **must not** live in React state. Mutate the refs in `useGameLoop`; only push HUD-relevant values out via the throttled `onHud` callback.
- The background cache is built once from the seeded `World`. If you change anything that affects static visuals (centerline shape, lane count, scenery), regenerate the cache rather than drawing it per frame.
- The closed loop assumes `t` is mod 1; any new code that compares `t` deltas across the seam must wrap-aware (or, like the wrong-way check, avoid `t` deltas entirely and use the heading·tangent dot product).
- AI lane-change decisions must consider both `other.laneIdx` and `other.targetLane` of nearby cars to avoid two cars converging into the same gap.
- The sim is intentionally lightweight — no physics/game/asset libraries.

## Notes on `AGENTS.md`

`AGENTS.md` has been kept in sync with this file's architecture description.
