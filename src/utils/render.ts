import {
  World,
  TILE_W,
  TILE_H,
  NUM_LANES,
  LANE_WIDTH,
  HALF_ROAD_WIDTH,
  CROSS_HALF_LENGTH,
  SceneryItem,
  highwayLightState,
  crossLightState,
} from './highway';
import { PlayerCar, AICar } from './cars';

export interface Camera {
  tx: number;
  ty: number;
}

export interface RenderCache {
  bg: HTMLCanvasElement;
  offsetX: number;
  offsetY: number;
}

const ASPHALT = '#3a3a42';
const SHOULDER_COLOR = '#54545c';
const GRASS_COLOR = '#9bbf85';
const GRASS_DARK = '#86ad72';
const SKY_COLOR = '#cfe7d8';
const MARKING_COLOR = '#f6f6f0';
const EDGE_LINE = '#fff5b3';

const HALF_LANES = (NUM_LANES * LANE_WIDTH) / 2;

function pointIso(x: number, y: number): { x: number; y: number } {
  return {
    x: ((x - y) * TILE_W) / 2,
    y: ((x + y) * TILE_H) / 2,
  };
}

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.floor(((n >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.floor(((n >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.floor((n & 0xff) * factor)));
  return `rgb(${r},${g},${b})`;
}

function normalAt(world: World, i: number): { x: number; y: number } {
  const t = world.tangents[i];
  return { x: -t.y, y: t.x };
}

function edgePoint(
  world: World,
  i: number,
  offset: number,
): { x: number; y: number } {
  const c = world.centerline[i];
  const n = normalAt(world, i);
  return { x: c.x + n.x * offset, y: c.y + n.y * offset };
}

function drawQuadIso(
  ctx: CanvasRenderingContext2D,
  corners: { x: number; y: number }[],
  color: string,
  ox: number,
  oy: number,
): void {
  const pts = corners.map((c) => pointIso(c.x, c.y));
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0].x + ox, pts[0].y + oy);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + ox, pts[i].y + oy);
  ctx.closePath();
  ctx.fill();
}

function drawLineIso(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  color: string,
  lineWidth: number,
  ox: number,
  oy: number,
): void {
  const a = pointIso(ax, ay);
  const b = pointIso(bx, by);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(a.x + ox, a.y + oy);
  ctx.lineTo(b.x + ox, b.y + oy);
  ctx.stroke();
}

function drawCrossRoads(
  ctx: CanvasRenderingContext2D,
  world: World,
  ox: number,
  oy: number,
): void {
  const HRW = HALF_ROAD_WIDTH;
  const laneHalf = (NUM_LANES * LANE_WIDTH) / 2;

  for (const ix of world.intersections) {
    const { x, y, tangentX: tx, tangentY: ty, normalX: nx, normalY: ny } = ix;

    // Draw each stub: +normal side and -normal side
    for (const sign of [1, -1]) {
      const startDist = HRW;
      const endDist = CROSS_HALF_LENGTH;
      // 4 corners of asphalt + shoulder band
      const A = { x: x + nx * sign * startDist - tx * HRW, y: y + ny * sign * startDist - ty * HRW };
      const B = { x: x + nx * sign * startDist + tx * HRW, y: y + ny * sign * startDist + ty * HRW };
      const C = { x: x + nx * sign * endDist + tx * HRW, y: y + ny * sign * endDist + ty * HRW };
      const D = { x: x + nx * sign * endDist - tx * HRW, y: y + ny * sign * endDist - ty * HRW };
      drawQuadIso(ctx, [A, B, C, D], ASPHALT, ox, oy);

      // Shoulder strips (along each side of the cross road)
      for (const sSign of [1, -1]) {
        const s0 = laneHalf;
        const s1 = HRW;
        const S0A = { x: x + nx * sign * startDist + tx * sSign * s0, y: y + ny * sign * startDist + ty * sSign * s0 };
        const S0B = { x: x + nx * sign * endDist + tx * sSign * s0, y: y + ny * sign * endDist + ty * sSign * s0 };
        const S1A = { x: x + nx * sign * startDist + tx * sSign * s1, y: y + ny * sign * startDist + ty * sSign * s1 };
        const S1B = { x: x + nx * sign * endDist + tx * sSign * s1, y: y + ny * sign * endDist + ty * sSign * s1 };
        drawQuadIso(ctx, [S0A, S0B, S1B, S1A], SHOULDER_COLOR, ox, oy);
      }

      // Outer edge lines
      for (const sSign of [1, -1]) {
        const ex = laneHalf * sSign;
        const Ea = { x: x + nx * sign * startDist + tx * ex, y: y + ny * sign * startDist + ty * ex };
        const Eb = { x: x + nx * sign * endDist + tx * ex, y: y + ny * sign * endDist + ty * ex };
        drawLineIso(ctx, Ea.x, Ea.y, Eb.x, Eb.y, EDGE_LINE, 2, ox, oy);
      }

      // Center dashed line (cross road is 2-way)
      ctx.setLineDash([6, 6]);
      const Ca = { x: x + nx * sign * startDist, y: y + ny * sign * startDist };
      const Cb = { x: x + nx * sign * endDist, y: y + ny * sign * endDist };
      drawLineIso(ctx, Ca.x, Ca.y, Cb.x, Cb.y, MARKING_COLOR, 2, ox, oy);
      ctx.setLineDash([]);

      // Stop line (at intersection edge, perpendicular to cross road)
      const stopDist = startDist + 0.2;
      const SL0 = { x: x + nx * sign * stopDist - tx * laneHalf, y: y + ny * sign * stopDist - ty * laneHalf };
      const SL1 = { x: x + nx * sign * stopDist + tx * laneHalf, y: y + ny * sign * stopDist + ty * laneHalf };
      drawLineIso(ctx, SL0.x, SL0.y, SL1.x, SL1.y, MARKING_COLOR, 3, ox, oy);
    }

    // Intersection box (solid asphalt, no markings)
    const IA = { x: x - tx * HRW - nx * HRW, y: y - ty * HRW - ny * HRW };
    const IB = { x: x + tx * HRW - nx * HRW, y: y + ty * HRW - ny * HRW };
    const IC = { x: x + tx * HRW + nx * HRW, y: y + ty * HRW + ny * HRW };
    const ID = { x: x - tx * HRW + nx * HRW, y: y - ty * HRW + ny * HRW };
    drawQuadIso(ctx, [IA, IB, IC, ID], ASPHALT, ox, oy);

    // Stop lines on highway approaches (perpendicular to highway)
    for (const hwSign of [1, -1]) {
      const stopX = x + tx * hwSign * (HRW + 0.2);
      const stopY = y + ty * hwSign * (HRW + 0.2);
      const HS0 = { x: stopX - nx * laneHalf, y: stopY - ny * laneHalf };
      const HS1 = { x: stopX + nx * laneHalf, y: stopY + ny * laneHalf };
      drawLineIso(ctx, HS0.x, HS0.y, HS1.x, HS1.y, MARKING_COLOR, 3, ox, oy);
    }
  }
}

function drawTrafficLight(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cam: Camera,
  W: number,
  H: number,
  state: 'green' | 'yellow' | 'red',
): void {
  const base = project(cx, cy, cam, W, H);
  const poleH = 30;
  const headH = 22;
  ctx.save();
  ctx.fillStyle = '#222';
  ctx.fillRect(base.x - 1.5, base.y - poleH, 3, poleH);
  ctx.fillStyle = '#1a1a1f';
  ctx.fillRect(base.x - 6, base.y - poleH - headH, 12, headH);
  const top = base.y - poleH - headH + 4;
  const r = 3;
  const gap = 6;
  const colors = {
    red: state === 'red' ? '#ff5050' : '#451a1a',
    yellow: state === 'yellow' ? '#ffd23f' : '#403520',
    green: state === 'green' ? '#7ed957' : '#1d3a1f',
  };
  const palette = [colors.red, colors.yellow, colors.green];
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = palette[i];
    ctx.beginPath();
    ctx.arc(base.x, top + i * gap, r, 0, Math.PI * 2);
    ctx.fill();
    const lit =
      (i === 0 && state === 'red') ||
      (i === 1 && state === 'yellow') ||
      (i === 2 && state === 'green');
    if (lit) {
      ctx.shadowBlur = 8;
      ctx.shadowColor = palette[i];
      ctx.beginPath();
      ctx.arc(base.x, top + i * gap, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
  ctx.restore();
}

export function buildBackgroundCache(world: World): RenderCache {
  const corners = [
    pointIso(world.bounds.minX, world.bounds.minY),
    pointIso(world.bounds.maxX, world.bounds.minY),
    pointIso(world.bounds.maxX, world.bounds.maxY),
    pointIso(world.bounds.minX, world.bounds.maxY),
  ];
  let isoMinX = Infinity;
  let isoMaxX = -Infinity;
  let isoMinY = Infinity;
  let isoMaxY = -Infinity;
  for (const p of corners) {
    if (p.x < isoMinX) isoMinX = p.x;
    if (p.x > isoMaxX) isoMaxX = p.x;
    if (p.y < isoMinY) isoMinY = p.y;
    if (p.y > isoMaxY) isoMaxY = p.y;
  }
  const sceneryLift = 80;
  isoMinY -= sceneryLift;
  const pad = 60;
  const w = Math.ceil(isoMaxX - isoMinX) + pad * 2;
  const h = Math.ceil(isoMaxY - isoMinY) + pad * 2;
  const offsetX = -isoMinX + pad;
  const offsetY = -isoMinY + pad;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = GRASS_COLOR;
  ctx.fillRect(0, 0, w, h);
  drawGrassPattern(ctx, world, offsetX, offsetY);
  drawAsphalt(ctx, world, offsetX, offsetY);
  drawShoulders(ctx, world, offsetX, offsetY);
  drawLaneMarkings(ctx, world, offsetX, offsetY);
  drawCrossRoads(ctx, world, offsetX, offsetY);
  drawScenery(ctx, world, offsetX, offsetY);

  return { bg: canvas, offsetX, offsetY };
}

function drawGrassPattern(
  ctx: CanvasRenderingContext2D,
  world: World,
  ox: number,
  oy: number,
): void {
  ctx.fillStyle = GRASS_DARK;
  const step = 4;
  for (let gy = world.bounds.minY; gy < world.bounds.maxY; gy += step) {
    for (let gx = world.bounds.minX; gx < world.bounds.maxX; gx += step) {
      const seed = Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453;
      const r = seed - Math.floor(seed);
      if (r < 0.18) {
        const p = pointIso(gx, gy);
        ctx.beginPath();
        ctx.ellipse(p.x + ox, p.y + oy, 12, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawRibbonBand(
  ctx: CanvasRenderingContext2D,
  world: World,
  innerOffset: number,
  outerOffset: number,
  color: string,
  ox: number,
  oy: number,
): void {
  const n = world.centerline.length;
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ai = edgePoint(world, i, innerOffset);
    const bi = edgePoint(world, j, innerOffset);
    const ao = edgePoint(world, i, outerOffset);
    const bo = edgePoint(world, j, outerOffset);
    const isoAi = pointIso(ai.x, ai.y);
    const isoBi = pointIso(bi.x, bi.y);
    const isoAo = pointIso(ao.x, ao.y);
    const isoBo = pointIso(bo.x, bo.y);
    ctx.beginPath();
    ctx.moveTo(isoAi.x + ox, isoAi.y + oy);
    ctx.lineTo(isoBi.x + ox, isoBi.y + oy);
    ctx.lineTo(isoBo.x + ox, isoBo.y + oy);
    ctx.lineTo(isoAo.x + ox, isoAo.y + oy);
    ctx.closePath();
    ctx.fill();
  }
}

function drawAsphalt(
  ctx: CanvasRenderingContext2D,
  world: World,
  ox: number,
  oy: number,
): void {
  drawRibbonBand(ctx, world, HALF_LANES, -HALF_LANES, ASPHALT, ox, oy);
}

function drawShoulders(
  ctx: CanvasRenderingContext2D,
  world: World,
  ox: number,
  oy: number,
): void {
  drawRibbonBand(ctx, world, HALF_ROAD_WIDTH, HALF_LANES, SHOULDER_COLOR, ox, oy);
  drawRibbonBand(ctx, world, -HALF_LANES, -HALF_ROAD_WIDTH, SHOULDER_COLOR, ox, oy);
}

function drawLineAtOffset(
  ctx: CanvasRenderingContext2D,
  world: World,
  offset: number,
  ox: number,
  oy: number,
  dashed: boolean,
  color: string,
  lineWidth: number,
): void {
  const n = world.centerline.length;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'butt';
  if (dashed) {
    for (let i = 0; i < n; i += 2) {
      const a = edgePoint(world, i, offset);
      const b = edgePoint(world, (i + 1) % n, offset);
      const isoA = pointIso(a.x, a.y);
      const isoB = pointIso(b.x, b.y);
      ctx.beginPath();
      ctx.moveTo(isoA.x + ox, isoA.y + oy);
      ctx.lineTo(isoB.x + ox, isoB.y + oy);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const idx = i % n;
      const p = edgePoint(world, idx, offset);
      const iso = pointIso(p.x, p.y);
      if (i === 0) ctx.moveTo(iso.x + ox, iso.y + oy);
      else ctx.lineTo(iso.x + ox, iso.y + oy);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

function drawLaneMarkings(
  ctx: CanvasRenderingContext2D,
  world: World,
  ox: number,
  oy: number,
): void {
  drawLineAtOffset(ctx, world, HALF_LANES, ox, oy, false, EDGE_LINE, 2.5);
  drawLineAtOffset(ctx, world, -HALF_LANES, ox, oy, false, EDGE_LINE, 2.5);
  for (let k = 1; k < NUM_LANES; k++) {
    const off = HALF_LANES - k * LANE_WIDTH;
    drawLineAtOffset(ctx, world, off, ox, oy, true, MARKING_COLOR, 2);
  }
}

function drawScenery(
  ctx: CanvasRenderingContext2D,
  world: World,
  ox: number,
  oy: number,
): void {
  const sorted = [...world.scenery].sort((a, b) => a.x + a.y - (b.x + b.y));
  for (const s of sorted) {
    if (s.type === 'tree') drawTree(ctx, s, ox, oy);
    else if (s.type === 'building') drawBuilding(ctx, s, ox, oy);
    else drawSign(ctx, s, ox, oy);
  }
}

function drawTree(
  ctx: CanvasRenderingContext2D,
  s: SceneryItem,
  ox: number,
  oy: number,
): void {
  const ground = pointIso(s.x, s.y);
  const liftPx = s.height * TILE_H * 1.6;
  const gx = ground.x + ox;
  const gy = ground.y + oy;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(gx, gy + 1, TILE_W * 0.22 * s.size, TILE_H * 0.22 * s.size, 0, 0, Math.PI * 2);
  ctx.fill();
  // trunk
  ctx.fillStyle = '#5b4030';
  ctx.fillRect(gx - 1.5, gy - liftPx * 0.45, 3, liftPx * 0.45);
  // canopy
  const cR = TILE_W * 0.28 * s.size;
  const cTop = gy - liftPx;
  ctx.fillStyle = shade(s.color, 0.7);
  ctx.beginPath();
  ctx.ellipse(gx, cTop + cR * 0.6, cR * 1.05, cR * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = s.color;
  ctx.beginPath();
  ctx.ellipse(gx - cR * 0.15, cTop + cR * 0.4, cR * 0.95, cR * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  s: SceneryItem,
  ox: number,
  oy: number,
): void {
  const half = s.size / 2;
  const x1 = s.x - half;
  const y1 = s.y - half;
  const x2 = s.x + half;
  const y2 = s.y + half;
  const liftPx = s.height * TILE_H * 1.6;

  const nGround = pointIso(x1, y1);
  const eGround = pointIso(x2, y1);
  const sGround = pointIso(x2, y2);
  const wGround = pointIso(x1, y2);
  const lift = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - liftPx });
  const nTop = lift(nGround);
  const eTop = lift(eGround);
  const sTop = lift(sGround);
  const wTop = lift(wGround);

  const stroke = shade(s.color, 0.55);
  ctx.lineWidth = 1;
  ctx.strokeStyle = stroke;

  ctx.fillStyle = shade(s.color, 0.78);
  ctx.beginPath();
  ctx.moveTo(eGround.x + ox, eGround.y + oy);
  ctx.lineTo(sGround.x + ox, sGround.y + oy);
  ctx.lineTo(sTop.x + ox, sTop.y + oy);
  ctx.lineTo(eTop.x + ox, eTop.y + oy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = shade(s.color, 0.62);
  ctx.beginPath();
  ctx.moveTo(wGround.x + ox, wGround.y + oy);
  ctx.lineTo(sGround.x + ox, sGround.y + oy);
  ctx.lineTo(sTop.x + ox, sTop.y + oy);
  ctx.lineTo(wTop.x + ox, wTop.y + oy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = s.color;
  ctx.beginPath();
  ctx.moveTo(nTop.x + ox, nTop.y + oy);
  ctx.lineTo(eTop.x + ox, eTop.y + oy);
  ctx.lineTo(sTop.x + ox, sTop.y + oy);
  ctx.lineTo(wTop.x + ox, wTop.y + oy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawSign(
  ctx: CanvasRenderingContext2D,
  s: SceneryItem,
  ox: number,
  oy: number,
): void {
  const ground = pointIso(s.x, s.y);
  const liftPx = s.height * TILE_H * 1.6;
  const gx = ground.x + ox;
  const gy = ground.y + oy;
  ctx.fillStyle = '#222';
  ctx.fillRect(gx - 1, gy - liftPx, 2, liftPx);
  ctx.fillStyle = s.color;
  ctx.fillRect(gx - 9, gy - liftPx - 5, 18, 10);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(gx - 9, gy - liftPx - 5, 18, 10);
  ctx.fillStyle = '#fff';
  ctx.fillRect(gx - 6, gy - liftPx - 1, 12, 2);
  ctx.fillRect(gx - 6, gy - liftPx - 4, 12, 1);
}

function project(
  tx: number,
  ty: number,
  cam: Camera,
  W: number,
  H: number,
): { x: number; y: number } {
  const sx = ((tx - ty) * TILE_W) / 2;
  const sy = ((tx + ty) * TILE_H) / 2;
  const cx = ((cam.tx - cam.ty) * TILE_W) / 2;
  const cy = ((cam.tx + cam.ty) * TILE_H) / 2;
  return { x: sx - cx + W / 2, y: sy - cy + H / 2 };
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  car: { x: number; y: number; heading: number; width: number; length: number; color: string },
  cam: Camera,
  W: number,
  H: number,
): void {
  const cosH = Math.cos(car.heading);
  const sinH = Math.sin(car.heading);
  const L = car.length / 2;
  const Wd = car.width / 2;

  const corners = [
    { x: car.x + cosH * L - sinH * Wd, y: car.y + sinH * L + cosH * Wd },
    { x: car.x + cosH * L + sinH * Wd, y: car.y + sinH * L - cosH * Wd },
    { x: car.x - cosH * L + sinH * Wd, y: car.y - sinH * L - cosH * Wd },
    { x: car.x - cosH * L - sinH * Wd, y: car.y - sinH * L + cosH * Wd },
  ];

  const projected = corners.map((c) => project(c.x, c.y, cam, W, H));
  const center = project(car.x, car.y, cam, W, H);

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(center.x, center.y + 4, TILE_W * 0.34, TILE_H * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const lift = 4;
  const top = projected.map((p) => ({ x: p.x, y: p.y - lift }));

  ctx.fillStyle = shade(car.color, 0.75);
  ctx.beginPath();
  ctx.moveTo(projected[1].x, projected[1].y);
  ctx.lineTo(projected[2].x, projected[2].y);
  ctx.lineTo(top[2].x, top[2].y);
  ctx.lineTo(top[1].x, top[1].y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = shade(car.color, 0.6);
  ctx.beginPath();
  ctx.moveTo(projected[2].x, projected[2].y);
  ctx.lineTo(projected[3].x, projected[3].y);
  ctx.lineTo(top[3].x, top[3].y);
  ctx.lineTo(top[2].x, top[2].y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.moveTo(top[0].x, top[0].y);
  ctx.lineTo(top[1].x, top[1].y);
  ctx.lineTo(top[2].x, top[2].y);
  ctx.lineTo(top[3].x, top[3].y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade(car.color, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();

  const fLeft = {
    x: car.x + cosH * L * 0.3 - sinH * Wd * 0.85,
    y: car.y + sinH * L * 0.3 + cosH * Wd * 0.85,
  };
  const fRight = {
    x: car.x + cosH * L * 0.3 + sinH * Wd * 0.85,
    y: car.y + sinH * L * 0.3 - cosH * Wd * 0.85,
  };
  const bLeft = {
    x: car.x - cosH * L * 0.1 - sinH * Wd * 0.85,
    y: car.y - sinH * L * 0.1 + cosH * Wd * 0.85,
  };
  const bRight = {
    x: car.x - cosH * L * 0.1 + sinH * Wd * 0.85,
    y: car.y - sinH * L * 0.1 - cosH * Wd * 0.85,
  };
  const ws = [fLeft, fRight, bRight, bLeft].map((c) => project(c.x, c.y, cam, W, H));
  ctx.fillStyle = 'rgba(35,45,60,0.85)';
  ctx.beginPath();
  ctx.moveTo(ws[0].x, ws[0].y - lift);
  for (let i = 1; i < 4; i++) ctx.lineTo(ws[i].x, ws[i].y - lift);
  ctx.closePath();
  ctx.fill();

  const wheelOffsets = [
    [L * 0.78, Wd * 1.05],
    [L * 0.78, -Wd * 1.05],
    [-L * 0.78, Wd * 1.05],
    [-L * 0.78, -Wd * 1.05],
  ];
  ctx.fillStyle = '#1a1a1f';
  for (const [lx, ly] of wheelOffsets) {
    const wx = car.x + cosH * lx - sinH * ly;
    const wy = car.y + sinH * lx + cosH * ly;
    const p = project(wx, wy, cam, W, H);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  world: World,
  cache: RenderCache,
  cam: Camera,
  player: PlayerCar,
  ai: AICar[],
  timeS: number,
): void {
  ctx.fillStyle = SKY_COLOR;
  ctx.fillRect(0, 0, W, H);

  const camIso = pointIso(cam.tx, cam.ty);
  const bgX = W / 2 - camIso.x - cache.offsetX;
  const bgY = H / 2 - camIso.y - cache.offsetY;
  ctx.drawImage(cache.bg, bgX, bgY);

  type Sprite = { depth: number; draw: () => void };
  const sprites: Sprite[] = [];

  for (const ix of world.intersections) {
    const hwState = highwayLightState(ix, timeS);
    const crState = crossLightState(ix, timeS);
    const HRW = HALF_ROAD_WIDTH;
    const lightPositions: { x: number; y: number; state: 'green' | 'yellow' | 'red' }[] = [
      { x: ix.x + ix.normalX * (HRW + 0.4) + ix.tangentX * (HRW + 0.4), y: ix.y + ix.normalY * (HRW + 0.4) + ix.tangentY * (HRW + 0.4), state: hwState },
      { x: ix.x - ix.normalX * (HRW + 0.4) - ix.tangentX * (HRW + 0.4), y: ix.y - ix.normalY * (HRW + 0.4) - ix.tangentY * (HRW + 0.4), state: hwState },
      { x: ix.x + ix.tangentX * (HRW + 0.4) - ix.normalX * (HRW + 0.4), y: ix.y + ix.tangentY * (HRW + 0.4) - ix.normalY * (HRW + 0.4), state: crState },
      { x: ix.x - ix.tangentX * (HRW + 0.4) + ix.normalX * (HRW + 0.4), y: ix.y - ix.tangentY * (HRW + 0.4) + ix.normalY * (HRW + 0.4), state: crState },
    ];
    for (const lp of lightPositions) {
      const lx = lp.x;
      const ly = lp.y;
      const st = lp.state;
      sprites.push({
        depth: lx + ly + 0.6,
        draw: () => drawTrafficLight(ctx, lx, ly, cam, W, H, st),
      });
    }
  }

  for (const car of ai) {
    sprites.push({
      depth: car.x + car.y + 0.5,
      draw: () => drawCar(ctx, car, cam, W, H),
    });
  }
  sprites.push({
    depth: player.x + player.y + 0.55,
    draw: () => drawCar(ctx, player, cam, W, H),
  });

  sprites.sort((a, b) => a.depth - b.depth);
  for (const s of sprites) s.draw();
}

export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  world: World,
  player: PlayerCar,
  ai: AICar[],
  timeS: number,
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#1d1d22';
  ctx.fillRect(0, 0, w, h);

  const padding = 6;
  const wx = world.bounds.maxX - world.bounds.minX;
  const wy = world.bounds.maxY - world.bounds.minY;
  const scale = Math.min((w - padding * 2) / wx, (h - padding * 2) / wy);
  const tx = (x: number) => (x - world.bounds.minX) * scale + padding;
  const ty = (y: number) => (y - world.bounds.minY) * scale + padding;

  ctx.strokeStyle = '#7c7c8a';
  ctx.lineWidth = Math.max(2, world.halfRoadWidth * scale * 1.6);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i <= world.centerline.length; i++) {
    const p = world.centerline[i % world.centerline.length];
    if (i === 0) ctx.moveTo(tx(p.x), ty(p.y));
    else ctx.lineTo(tx(p.x), ty(p.y));
  }
  ctx.stroke();

  ctx.strokeStyle = '#3a3a44';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= world.centerline.length; i++) {
    const p = world.centerline[i % world.centerline.length];
    if (i === 0) ctx.moveTo(tx(p.x), ty(p.y));
    else ctx.lineTo(tx(p.x), ty(p.y));
  }
  ctx.stroke();

  for (const ix of world.intersections) {
    const state = highwayLightState(ix, timeS);
    ctx.fillStyle = state === 'green' ? '#7ed957' : state === 'yellow' ? '#ffd23f' : '#ff5050';
    ctx.fillRect(tx(ix.x) - 3, ty(ix.y) - 3, 6, 6);
  }

  ctx.fillStyle = '#ffffff';
  for (const c of ai) {
    ctx.beginPath();
    ctx.arc(tx(c.x), ty(c.y), 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#ff5e8a';
  ctx.beginPath();
  ctx.arc(tx(player.x), ty(player.y), 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();
}
