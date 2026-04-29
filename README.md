# carsim2

Browser-based isometric driving simulator. Single-page Canvas 2D game built with React + TypeScript + Vite + Tailwind. No external assets — all graphics are procedurally drawn.

## Getting Started

```bash
npm install
npm run dev
```

Open the URL printed by Vite. Production build: `npm run build`.

## Controls

Drive around a procedurally generated closed-loop highway. Avoid violations:

- **WRONG WAY** — driving against traffic for >1.5 s
- **OFF ROAD** — leaving the asphalt for >1 s

## Stack

| Layer | Tech |
|---|---|
| UI / HUD | React 18 |
| Rendering | Canvas 2D (isometric) |
| Build | Vite + TypeScript |
| Styles | Tailwind CSS |

## Architecture

```
src/
  hooks/
    useGameLoop.ts      # RAF loop, all mutable game state (refs)
  utils/
    highway.ts          # World model: closed-loop centerline, lanes, intersections, traffic lights
    cars.ts             # PlayerCar, AICar, CrossTrafficCar — physics + AI
    render.ts           # Isometric renderer, background cache, minimap
  components/
    GameCanvas.tsx
    HUD.tsx
    Minimap.tsx
  App.tsx
```

- Game state lives in `useRef`, never React state. HUD values pushed at ~10 Hz.
- Static world geometry pre-rasterized once into an offscreen canvas (`buildBackgroundCache`).
- Highway uses a parametric `t ∈ [0,1)` closed loop; AI cars travel at uniform tile/s via arc-length mapping.
- Traffic lights derived from wall-clock `timeS` — no separate timer.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | TypeScript check + production build → `dist/` |
| `npm run preview` | Preview production build |
