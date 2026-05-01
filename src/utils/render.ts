import {
  World,
  TILE_W,
  TILE_H,
  NUM_LANES,
  LANE_WIDTH,
  HALF_ROAD_WIDTH,
  CROSS_HALF_LENGTH,
  SceneryItem,
  InteractiveBuilding,
  Collectible,
  CityGrid,
  District,
  BlockBuilding,
  getDistrictAt,
  highwayLightState,
  crossLightState,
} from './highway';
import { PlayerCar, AICar, CrossTrafficCar } from './cars';

export interface Camera {
  tx: number;
  ty: number;
}

export interface RenderCache {
  bg: HTMLCanvasElement;
  offsetX: number;
  offsetY: number;
}

export interface SceneState {
  world: World;
  cache: RenderCache;
  cam: Camera;
  player: PlayerCar;
  ai: AICar[];
  crossTraffic: CrossTrafficCar[];
  timeS: number;
  collectibleStates?: boolean[];
  missionMarker?: { x: number; y: number } | null;
  nearBuildingId?: number | null;
  waypoint?: { x: number; y: number } | null;
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

function drawDistricts(
  ctx: CanvasRenderingContext2D,
  districts: District[],
  ox: number,
  oy: number,
): void {
  for (const d of districts) {
    drawQuadIso(ctx, [
      { x: d.x1, y: d.y1 },
      { x: d.x2, y: d.y1 },
      { x: d.x2, y: d.y2 },
      { x: d.x1, y: d.y2 },
    ], d.groundColor, ox, oy);
  }
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

    for (const sign of [1, -1]) {
      const startDist = 0;
      const endDist = CROSS_HALF_LENGTH;
      const A = { x: x + nx * sign * startDist - tx * HRW, y: y + ny * sign * startDist - ty * HRW };
      const B = { x: x + nx * sign * startDist + tx * HRW, y: y + ny * sign * startDist + ty * HRW };
      const C = { x: x + nx * sign * endDist + tx * HRW, y: y + ny * sign * endDist + ty * HRW };
      const D = { x: x + nx * sign * endDist - tx * HRW, y: y + ny * sign * endDist - ty * HRW };
      drawQuadIso(ctx, [A, B, C, D], ASPHALT, ox, oy);

      for (const sSign of [1, -1]) {
        const s0 = laneHalf;
        const s1 = HRW;
        const S0A = { x: x + nx * sign * startDist + tx * sSign * s0, y: y + ny * sign * startDist + ty * sSign * s0 };
        const S0B = { x: x + nx * sign * endDist + tx * sSign * s0, y: y + ny * sign * endDist + ty * sSign * s0 };
        const S1A = { x: x + nx * sign * startDist + tx * sSign * s1, y: y + ny * sign * startDist + ty * sSign * s1 };
        const S1B = { x: x + nx * sign * endDist + tx * sSign * s1, y: y + ny * sign * endDist + ty * sSign * s1 };
        drawQuadIso(ctx, [S0A, S0B, S1B, S1A], SHOULDER_COLOR, ox, oy);
      }

      for (const sSign of [1, -1]) {
        const ex = laneHalf * sSign;
        const Ea = { x: x + nx * sign * startDist + tx * ex, y: y + ny * sign * startDist + ty * ex };
        const Eb = { x: x + nx * sign * endDist + tx * ex, y: y + ny * sign * endDist + ty * ex };
        drawLineIso(ctx, Ea.x, Ea.y, Eb.x, Eb.y, EDGE_LINE, 2.5, ox, oy);
      }

      for (const lSign of [1, -1]) {
        const lx = (laneHalf - LANE_WIDTH) * lSign;
        const La = { x: x + nx * sign * startDist + tx * lx, y: y + ny * sign * startDist + ty * lx };
        const Lb = { x: x + nx * sign * endDist + tx * lx, y: y + ny * sign * endDist + ty * lx };
        ctx.setLineDash([6, 6]);
        drawLineIso(ctx, La.x, La.y, Lb.x, Lb.y, MARKING_COLOR, 2, ox, oy);
        ctx.setLineDash([]);
      }

      for (const mSign of [1, -1]) {
        const mx = (LANE_WIDTH / 2) * mSign;
        const Ma = { x: x + nx * sign * startDist + tx * mx, y: y + ny * sign * startDist + ty * mx };
        const Mb = { x: x + nx * sign * endDist + tx * mx, y: y + ny * sign * endDist + ty * mx };
        drawLineIso(ctx, Ma.x, Ma.y, Mb.x, Mb.y, EDGE_LINE, 2.5, ox, oy);
      }

      const stopDist = HRW + 0.2;
      const SL0 = { x: x + nx * sign * stopDist - tx * laneHalf, y: y + ny * sign * stopDist - ty * laneHalf };
      const SL1 = { x: x + nx * sign * stopDist + tx * laneHalf, y: y + ny * sign * stopDist + ty * laneHalf };
      drawLineIso(ctx, SL0.x, SL0.y, SL1.x, SL1.y, MARKING_COLOR, 3, ox, oy);
    }

    const IA = { x: x - tx * HRW - nx * HRW, y: y - ty * HRW - ny * HRW };
    const IB = { x: x + tx * HRW - nx * HRW, y: y + ty * HRW - ny * HRW };
    const IC = { x: x + tx * HRW + nx * HRW, y: y + ty * HRW + ny * HRW };
    const ID = { x: x - tx * HRW + nx * HRW, y: y - ty * HRW + ny * HRW };
    drawQuadIso(ctx, [IA, IB, IC, ID], ASPHALT, ox, oy);

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

function drawCityGrid(
  ctx: CanvasRenderingContext2D,
  grid: CityGrid,
  ox: number,
  oy: number,
): void {
  const { xLines, yLines, halfWidth, xExtent, yExtent } = grid;
  const SHOULDER = 0.4;
  const laneEdge = halfWidth - SHOULDER;

  for (const y0 of yLines) {
    drawQuadIso(ctx, [
      { x: -xExtent, y: y0 - halfWidth },
      { x: xExtent, y: y0 - halfWidth },
      { x: xExtent, y: y0 + halfWidth },
      { x: -xExtent, y: y0 + halfWidth },
    ], ASPHALT, ox, oy);
    for (const sign of [1, -1] as const) {
      drawQuadIso(ctx, [
        { x: -xExtent, y: y0 + sign * laneEdge },
        { x: xExtent, y: y0 + sign * laneEdge },
        { x: xExtent, y: y0 + sign * halfWidth },
        { x: -xExtent, y: y0 + sign * halfWidth },
      ], SHOULDER_COLOR, ox, oy);
      drawLineIso(ctx, -xExtent, y0 + sign * laneEdge, xExtent, y0 + sign * laneEdge, EDGE_LINE, 1.5, ox, oy);
    }
    ctx.setLineDash([8, 8]);
    drawLineIso(ctx, -xExtent, y0, xExtent, y0, MARKING_COLOR, 1.5, ox, oy);
    ctx.setLineDash([]);
  }

  for (const x0 of xLines) {
    drawQuadIso(ctx, [
      { x: x0 - halfWidth, y: -yExtent },
      { x: x0 + halfWidth, y: -yExtent },
      { x: x0 + halfWidth, y: yExtent },
      { x: x0 - halfWidth, y: yExtent },
    ], ASPHALT, ox, oy);
    for (const sign of [1, -1] as const) {
      drawQuadIso(ctx, [
        { x: x0 + sign * laneEdge, y: -yExtent },
        { x: x0 + sign * halfWidth, y: -yExtent },
        { x: x0 + sign * halfWidth, y: yExtent },
        { x: x0 + sign * laneEdge, y: yExtent },
      ], SHOULDER_COLOR, ox, oy);
      drawLineIso(ctx, x0 + sign * laneEdge, -yExtent, x0 + sign * laneEdge, yExtent, EDGE_LINE, 1.5, ox, oy);
    }
    ctx.setLineDash([8, 8]);
    drawLineIso(ctx, x0, -yExtent, x0, yExtent, MARKING_COLOR, 1.5, ox, oy);
    ctx.setLineDash([]);
  }
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
  drawDistricts(ctx, world.districts, offsetX, offsetY);
  drawGrassPattern(ctx, world, offsetX, offsetY);
  drawCityGrid(ctx, world.cityGrid, offsetX, offsetY);
  drawAsphalt(ctx, world, offsetX, offsetY);
  drawShoulders(ctx, world, offsetX, offsetY);
  drawLaneMarkings(ctx, world, offsetX, offsetY);
  drawCrossRoads(ctx, world, offsetX, offsetY);

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
      // Skip grass texture in built-up areas
      if (world.districts) {
        const d = getDistrictAt(gx, gy, world.districts);
        if (d.name !== 'park' && d.name !== 'countryside' && d.name !== 'suburbs') continue;
      }
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
  drawLineAtOffset(ctx, world, HALF_LANES - LANE_WIDTH, ox, oy, true, MARKING_COLOR, 2);
  drawLineAtOffset(ctx, world, -(HALF_LANES - LANE_WIDTH), ox, oy, true, MARKING_COLOR, 2);
  drawLineAtOffset(ctx, world, LANE_WIDTH / 2, ox, oy, false, EDGE_LINE, 2.5);
  drawLineAtOffset(ctx, world, -LANE_WIDTH / 2, ox, oy, false, EDGE_LINE, 2.5);
}

function drawSceneryItem(
  ctx: CanvasRenderingContext2D,
  s: SceneryItem,
  ox: number,
  oy: number,
): void {
  if (s.type === 'tree') drawTree(ctx, s, ox, oy);
  else if (s.type === 'building') drawBuilding(ctx, s, ox, oy);
  else drawSign(ctx, s, ox, oy);
}

function sceneryDepth(s: SceneryItem): number {
  if (s.type === 'building') return s.x + s.y + s.size;
  if (s.type === 'tree') return s.x + s.y + s.size * 0.3;
  return s.x + s.y + 0.2;
}

function sceneryIsVisible(
  s: SceneryItem,
  cam: Camera,
  W: number,
  H: number,
): boolean {
  const p = project(s.x, s.y, cam, W, H);
  const radius = s.type === 'building'
    ? Math.max(70, s.size * TILE_W * 1.2 + s.height * TILE_H * 1.8)
    : Math.max(35, s.size * TILE_W * 0.8 + s.height * TILE_H * 1.8);
  return (
    p.x > -radius &&
    p.x < W + radius &&
    p.y > -radius * 1.8 &&
    p.y < H + radius
  );
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
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(gx, gy + 1, TILE_W * 0.22 * s.size, TILE_H * 0.22 * s.size, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5b4030';
  ctx.fillRect(gx - 1.5, gy - liftPx * 0.45, 3, liftPx * 0.45);
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

type RenderCar = {
  x: number;
  y: number;
  heading: number;
  width: number;
  length: number;
  color: string;
};

type ScreenPoint = { x: number; y: number };

function drawPoly(
  ctx: CanvasRenderingContext2D,
  points: ScreenPoint[],
  fill: string,
  stroke?: string,
  lineWidth = 1,
): void {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function localCarPoint(car: RenderCar, along: number, side: number): { x: number; y: number } {
  const cosH = Math.cos(car.heading);
  const sinH = Math.sin(car.heading);
  return {
    x: car.x + cosH * along - sinH * side,
    y: car.y + sinH * along + cosH * side,
  };
}

function projectCarPoint(
  car: RenderCar,
  along: number,
  side: number,
  liftPx: number,
  cam: Camera,
  W: number,
  H: number,
): ScreenPoint {
  const p = localCarPoint(car, along, side);
  const screen = project(p.x, p.y, cam, W, H);
  return { x: screen.x, y: screen.y - liftPx };
}

function drawCarWheel(
  ctx: CanvasRenderingContext2D,
  car: RenderCar,
  along: number,
  side: number,
  cam: Camera,
  W: number,
  H: number,
): void {
  const center = projectCarPoint(car, along, side, 2, cam, W, H);
  const front = projectCarPoint(car, along + 0.15, side, 2, cam, W, H);
  const rear = projectCarPoint(car, along - 0.15, side, 2, cam, W, H);
  const angle = Math.atan2(front.y - rear.y, front.x - rear.x);

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(angle);
  ctx.fillStyle = '#111217';
  ctx.beginPath();
  ctx.ellipse(0, 0, 5.4, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6d737c';
  ctx.beginPath();
  ctx.ellipse(0.2, -0.1, 2.1, 1.0, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  car: RenderCar,
  cam: Camera,
  W: number,
  H: number,
): void {
  const L = Math.max(car.length * 0.62, 0.6);
  const Wd = Math.max(car.width * 0.62, 0.34);
  const bodyLift = 7;
  const cabinLift = 8;
  const outline = shade(car.color, 0.42);

  const base = {
    fl: projectCarPoint(car, L, Wd, 0, cam, W, H),
    fr: projectCarPoint(car, L, -Wd, 0, cam, W, H),
    rr: projectCarPoint(car, -L, -Wd, 0, cam, W, H),
    rl: projectCarPoint(car, -L, Wd, 0, cam, W, H),
  };
  const deck = {
    fl: projectCarPoint(car, L, Wd, bodyLift, cam, W, H),
    fr: projectCarPoint(car, L, -Wd, bodyLift, cam, W, H),
    rr: projectCarPoint(car, -L, -Wd, bodyLift, cam, W, H),
    rl: projectCarPoint(car, -L, Wd, bodyLift, cam, W, H),
  };
  const center = project(car.x, car.y, cam, W, H);
  const projectedNose = projectCarPoint(car, L * 0.9, 0, bodyLift, cam, W, H);
  const projectedTail = projectCarPoint(car, -L * 0.9, 0, bodyLift, cam, W, H);

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(
    center.x + 1.5,
    center.y + 6,
    TILE_W * 0.32,
    TILE_H * 0.26,
    Math.atan2(projectedNose.y - projectedTail.y, projectedNose.x - projectedTail.x),
    0,
    Math.PI * 2,
  );
  ctx.fill();

  const wheelSide = Wd * 1.07;
  drawCarWheel(ctx, car, L * 0.62, wheelSide, cam, W, H);
  drawCarWheel(ctx, car, -L * 0.62, wheelSide, cam, W, H);
  drawCarWheel(ctx, car, L * 0.62, -wheelSide, cam, W, H);
  drawCarWheel(ctx, car, -L * 0.62, -wheelSide, cam, W, H);

  drawPoly(ctx, [base.fr, base.rr, deck.rr, deck.fr], shade(car.color, 0.56), outline);
  drawPoly(ctx, [base.rr, base.rl, deck.rl, deck.rr], shade(car.color, 0.48), outline);
  drawPoly(ctx, [base.rl, base.fl, deck.fl, deck.rl], shade(car.color, 0.68), outline);
  drawPoly(ctx, [base.fl, base.fr, deck.fr, deck.fl], shade(car.color, 0.86), outline);
  drawPoly(ctx, [deck.fl, deck.fr, deck.rr, deck.rl], car.color, outline);

  const hood = [
    projectCarPoint(car, L * 0.88, Wd * 0.66, bodyLift + 0.7, cam, W, H),
    projectCarPoint(car, L * 0.88, -Wd * 0.66, bodyLift + 0.7, cam, W, H),
    projectCarPoint(car, L * 0.24, -Wd * 0.58, bodyLift + 0.7, cam, W, H),
    projectCarPoint(car, L * 0.16, Wd * 0.58, bodyLift + 0.7, cam, W, H),
  ];
  drawPoly(ctx, hood, 'rgba(255,255,255,0.13)');

  const trunk = [
    projectCarPoint(car, -L * 0.34, Wd * 0.58, bodyLift + 0.5, cam, W, H),
    projectCarPoint(car, -L * 0.34, -Wd * 0.58, bodyLift + 0.5, cam, W, H),
    projectCarPoint(car, -L * 0.86, -Wd * 0.64, bodyLift + 0.5, cam, W, H),
    projectCarPoint(car, -L * 0.86, Wd * 0.64, bodyLift + 0.5, cam, W, H),
  ];
  drawPoly(ctx, trunk, 'rgba(0,0,0,0.08)');

  const cabinBase = {
    fl: projectCarPoint(car, L * 0.28, Wd * 0.66, bodyLift, cam, W, H),
    fr: projectCarPoint(car, L * 0.28, -Wd * 0.66, bodyLift, cam, W, H),
    rr: projectCarPoint(car, -L * 0.42, -Wd * 0.66, bodyLift, cam, W, H),
    rl: projectCarPoint(car, -L * 0.42, Wd * 0.66, bodyLift, cam, W, H),
  };
  const cabinRoof = {
    fl: projectCarPoint(car, L * 0.12, Wd * 0.42, bodyLift + cabinLift, cam, W, H),
    fr: projectCarPoint(car, L * 0.12, -Wd * 0.42, bodyLift + cabinLift, cam, W, H),
    rr: projectCarPoint(car, -L * 0.26, -Wd * 0.42, bodyLift + cabinLift, cam, W, H),
    rl: projectCarPoint(car, -L * 0.26, Wd * 0.42, bodyLift + cabinLift, cam, W, H),
  };
  const glass = 'rgba(28,43,58,0.9)';
  const glassStroke = 'rgba(225,242,255,0.42)';

  drawPoly(ctx, [cabinBase.fr, cabinBase.rr, cabinRoof.rr, cabinRoof.fr], glass, glassStroke, 0.8);
  drawPoly(ctx, [cabinBase.rl, cabinBase.fl, cabinRoof.fl, cabinRoof.rl], 'rgba(38,57,76,0.92)', glassStroke, 0.8);
  drawPoly(ctx, [cabinBase.fl, cabinBase.fr, cabinRoof.fr, cabinRoof.fl], 'rgba(53,78,96,0.92)', glassStroke, 0.8);
  drawPoly(ctx, [cabinBase.rr, cabinBase.rl, cabinRoof.rl, cabinRoof.rr], 'rgba(20,32,44,0.92)', glassStroke, 0.8);
  drawPoly(ctx, [cabinRoof.fl, cabinRoof.fr, cabinRoof.rr, cabinRoof.rl], shade(car.color, 1.1), outline);

  const roofHighlight = [
    projectCarPoint(car, L * 0.04, Wd * 0.26, bodyLift + cabinLift + 0.5, cam, W, H),
    projectCarPoint(car, L * 0.04, -Wd * 0.24, bodyLift + cabinLift + 0.5, cam, W, H),
    projectCarPoint(car, -L * 0.2, -Wd * 0.22, bodyLift + cabinLift + 0.5, cam, W, H),
    projectCarPoint(car, -L * 0.18, Wd * 0.24, bodyLift + cabinLift + 0.5, cam, W, H),
  ];
  drawPoly(ctx, roofHighlight, 'rgba(255,255,255,0.16)');

  const headlights = [
    projectCarPoint(car, L * 1.02, Wd * 0.42, bodyLift - 1.5, cam, W, H),
    projectCarPoint(car, L * 1.02, -Wd * 0.42, bodyLift - 1.5, cam, W, H),
  ];
  const taillights = [
    projectCarPoint(car, -L * 1.02, Wd * 0.42, bodyLift - 1.5, cam, W, H),
    projectCarPoint(car, -L * 1.02, -Wd * 0.42, bodyLift - 1.5, cam, W, H),
  ];

  ctx.fillStyle = '#fff4a8';
  for (const p of headlights) {
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 2.3, 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ff3d4f';
  for (const p of taillights) {
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 2.2, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.24)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(deck.fl.x, deck.fl.y);
  ctx.lineTo(cabinBase.fl.x, cabinBase.fl.y);
  ctx.lineTo(cabinRoof.fl.x, cabinRoof.fl.y);
  ctx.stroke();
  ctx.restore();
}

const INTERACTIVE_COLORS: Record<string, string> = {
  gas_station: '#f5c842',
  upgrade_shop: '#42a5f5',
  garage: '#8bc34a',
};

function drawInteractiveBuilding(
  ctx: CanvasRenderingContext2D,
  b: InteractiveBuilding,
  showPrompt: boolean,
  ox: number,
  oy: number,
  cam: Camera,
  W: number,
  H: number,
): void {
  const color = INTERACTIVE_COLORS[b.type] ?? '#ffffff';
  const half = b.size;
  const liftPx = b.height * TILE_H * 1.6;
  const x1 = b.x - half;
  const y1 = b.y - half;
  const x2 = b.x + half;
  const y2 = b.y + half;

  const nGround = pointIso(x1, y1);
  const eGround = pointIso(x2, y1);
  const sGround = pointIso(x2, y2);
  const wGround = pointIso(x1, y2);
  const lift = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - liftPx });
  const nTop = lift(nGround);
  const eTop = lift(eGround);
  const sTop = lift(sGround);
  const wTop = lift(wGround);

  const stroke = shade(color, 0.5);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = stroke;

  ctx.fillStyle = shade(color, 0.7);
  ctx.beginPath();
  ctx.moveTo(eGround.x + ox, eGround.y + oy);
  ctx.lineTo(sGround.x + ox, sGround.y + oy);
  ctx.lineTo(sTop.x + ox, sTop.y + oy);
  ctx.lineTo(eTop.x + ox, eTop.y + oy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = shade(color, 0.55);
  ctx.beginPath();
  ctx.moveTo(wGround.x + ox, wGround.y + oy);
  ctx.lineTo(sGround.x + ox, sGround.y + oy);
  ctx.lineTo(sTop.x + ox, sTop.y + oy);
  ctx.lineTo(wTop.x + ox, wTop.y + oy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(nTop.x + ox, nTop.y + oy);
  ctx.lineTo(eTop.x + ox, eTop.y + oy);
  ctx.lineTo(sTop.x + ox, sTop.y + oy);
  ctx.lineTo(wTop.x + ox, wTop.y + oy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const screen = project(b.x, b.y, cam, W, H);
  const labelY = screen.y - liftPx - 14;

  ctx.save();
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  const labelW = ctx.measureText(b.label).width + 10;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.beginPath();
  ctx.roundRect(screen.x - labelW / 2, labelY - 12, labelW, 16, 4);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(b.label, screen.x, labelY);

  if (showPrompt) {
    const promptY = labelY - 18;
    const prompt = '[E] Enter';
    const promptW = ctx.measureText(prompt).width + 10;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.roundRect(screen.x - promptW / 2, promptY - 12, promptW, 16, 4);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillText(prompt, screen.x, promptY);
  }
  ctx.restore();
}

function drawCollectible(
  ctx: CanvasRenderingContext2D,
  c: Collectible,
  ox: number,
  oy: number,
  timeS: number,
): void {
  const iso = pointIso(c.x, c.y);
  const sx = iso.x + ox;
  const sy = iso.y + oy - 10 - Math.sin(timeS * 2.5 + c.id) * 4;
  const r = 9;
  const spikes = 5;

  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.45;
    const x = sx + Math.cos(angle) * radius;
    const y = sy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffd700';
  ctx.fill();
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  state: SceneState,
): void {
  const { world, cache, cam, player, ai, crossTraffic, timeS } = state;

  ctx.fillStyle = SKY_COLOR;
  ctx.fillRect(0, 0, W, H);

  const camIso = pointIso(cam.tx, cam.ty);
  const bgX = W / 2 - camIso.x - cache.offsetX;
  const bgY = H / 2 - camIso.y - cache.offsetY;
  const spriteOx = W / 2 - camIso.x;
  const spriteOy = H / 2 - camIso.y;
  ctx.drawImage(cache.bg, bgX, bgY);

  type Sprite = { depth: number; draw: () => void };
  const sprites: Sprite[] = [];

  for (const s of world.scenery) {
    if (!sceneryIsVisible(s, cam, W, H)) continue;
    sprites.push({
      depth: sceneryDepth(s),
      draw: () => drawSceneryItem(ctx, s, spriteOx, spriteOy),
    });
  }

  // Block buildings from district generation
  for (const bb of world.blockBuildings) {
    if (!sceneryIsVisible(bb as SceneryItem, cam, W, H)) continue;
    sprites.push({
      depth: bb.x + bb.y + bb.size,
      draw: () => drawBuilding(ctx, bb as SceneryItem, spriteOx, spriteOy),
    });
  }

  for (const ix of world.intersections) {
    const hwState = highwayLightState(ix, timeS);
    const crState = crossLightState(ix, timeS);
    const HRW = HALF_ROAD_WIDTH;
    const signalSide = HALF_LANES + 0.5;
    const lightPositions: { x: number; y: number; state: 'green' | 'yellow' | 'red' }[] = [
      {
        x: ix.x - ix.tangentX * (HRW + 0.45) - ix.normalX * signalSide,
        y: ix.y - ix.tangentY * (HRW + 0.45) - ix.normalY * signalSide,
        state: hwState,
      },
      {
        x: ix.x + ix.normalX * (HRW + 0.45) - ix.tangentX * signalSide,
        y: ix.y + ix.normalY * (HRW + 0.45) - ix.tangentY * signalSide,
        state: crState,
      },
      {
        x: ix.x - ix.normalX * (HRW + 0.45) + ix.tangentX * signalSide,
        y: ix.y - ix.normalY * (HRW + 0.45) + ix.tangentY * signalSide,
        state: crState,
      },
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

  for (const b of world.interactives) {
    const showPrompt = state.nearBuildingId === b.id;
    sprites.push({
      depth: b.x + b.y + b.size,
      draw: () => drawInteractiveBuilding(ctx, b, showPrompt, spriteOx, spriteOy, cam, W, H),
    });
  }

  if (state.collectibleStates) {
    for (let i = 0; i < world.collectibles.length; i++) {
      if (state.collectibleStates[i]) continue;
      const c = world.collectibles[i];
      sprites.push({
        depth: c.x + c.y + 0.3,
        draw: () => drawCollectible(ctx, c, spriteOx, spriteOy, timeS),
      });
    }
  }

  for (const car of crossTraffic) {
    sprites.push({
      depth: car.x + car.y + 0.5,
      draw: () => drawCar(ctx, car, cam, W, H),
    });
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

  if (state.missionMarker) {
    const ms = project(state.missionMarker.x, state.missionMarker.y, cam, W, H);
    ctx.save();
    ctx.fillStyle = '#ff4444';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ms.x, ms.y - 28);
    ctx.lineTo(ms.x + 10, ms.y - 14);
    ctx.lineTo(ms.x - 10, ms.y - 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const pulse = 0.7 + 0.3 * Math.sin(timeS * 4);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = 'rgba(255,68,68,0.25)';
    ctx.beginPath();
    ctx.arc(ms.x, ms.y - 21, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (state.waypoint) {
    const ws = project(state.waypoint.x, state.waypoint.y, cam, W, H);
    const pulse = 0.5 + 0.5 * Math.sin(timeS * 3);
    ctx.save();
    ctx.globalAlpha = 0.35 * pulse;
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.ellipse(ws.x, ws.y, 18 + pulse * 6, 9 + pulse * 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ffcc00';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(ws.x, ws.y);
    ctx.lineTo(ws.x, ws.y - 44);
    ctx.stroke();
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.moveTo(ws.x, ws.y - 56);
    ctx.lineTo(ws.x + 9, ws.y - 44);
    ctx.lineTo(ws.x, ws.y - 32);
    ctx.lineTo(ws.x - 9, ws.y - 44);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: SceneState,
): void {
  const { world, player, ai, crossTraffic, timeS } = state;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#1d1d22';
  ctx.fillRect(0, 0, w, h);

  const padding = 6;
  const wx = world.bounds.maxX - world.bounds.minX;
  const wy = world.bounds.maxY - world.bounds.minY;
  const scale = Math.min((w - padding * 2) / wx, (h - padding * 2) / wy);
  const tx = (x: number) => (x - world.bounds.minX) * scale + padding;
  const ty = (y: number) => (y - world.bounds.minY) * scale + padding;

  // District fills
  for (const d of world.districts) {
    ctx.fillStyle = d.mapColor;
    ctx.fillRect(tx(d.x1), ty(d.y1), (d.x2 - d.x1) * scale, (d.y2 - d.y1) * scale);
  }

  // City grid streets
  const grid = world.cityGrid;
  ctx.strokeStyle = '#5a5a6a';
  ctx.lineWidth = 1;
  for (const x0 of grid.xLines) {
    ctx.beginPath();
    ctx.moveTo(tx(x0), ty(-grid.yExtent));
    ctx.lineTo(tx(x0), ty(grid.yExtent));
    ctx.stroke();
  }
  for (const y0 of grid.yLines) {
    ctx.beginPath();
    ctx.moveTo(tx(-grid.xExtent), ty(y0));
    ctx.lineTo(tx(grid.xExtent), ty(y0));
    ctx.stroke();
  }

  // Ring road
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

  for (const ix of world.intersections) {
    const st = highwayLightState(ix, timeS);
    ctx.fillStyle = st === 'green' ? '#7ed957' : st === 'yellow' ? '#ffd23f' : '#ff5050';
    ctx.fillRect(tx(ix.x) - 3, ty(ix.y) - 3, 6, 6);
  }

  ctx.fillStyle = '#ffffff';
  for (const c of ai) {
    ctx.beginPath();
    ctx.arc(tx(c.x), ty(c.y), 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#d9f3ff';
  for (const c of crossTraffic) {
    ctx.beginPath();
    ctx.arc(tx(c.x), ty(c.y), 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  if (state.collectibleStates) {
    ctx.fillStyle = '#ffd700';
    for (let i = 0; i < world.collectibles.length; i++) {
      if (state.collectibleStates[i]) continue;
      const c = world.collectibles[i];
      ctx.beginPath();
      ctx.arc(tx(c.x), ty(c.y), 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const b of world.interactives) {
    ctx.fillStyle = INTERACTIVE_COLORS[b.type] ?? '#fff';
    ctx.fillRect(tx(b.x) - 3, ty(b.y) - 3, 6, 6);
  }

  if (state.missionMarker) {
    const mx = tx(state.missionMarker.x);
    const my = ty(state.missionMarker.y);
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.moveTo(mx, my - 7);
    ctx.lineTo(mx + 4, my);
    ctx.lineTo(mx - 4, my);
    ctx.closePath();
    ctx.fill();
  }

  if (state.waypoint) {
    const wpx = tx(state.waypoint.x);
    const wpy = ty(state.waypoint.y);
    ctx.save();
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(tx(player.x), ty(player.y));
    ctx.lineTo(wpx, wpy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(wpx, wpy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = '#ff5e8a';
  ctx.beginPath();
  ctx.arc(tx(player.x), ty(player.y), 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawMapModal(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: SceneState,
): void {
  const { world, player, ai, crossTraffic, timeS } = state;

  ctx.fillStyle = '#12121a';
  ctx.fillRect(0, 0, w, h);

  const padding = 16;
  const wx = world.bounds.maxX - world.bounds.minX;
  const wy = world.bounds.maxY - world.bounds.minY;
  const scale = Math.min((w - padding * 2) / wx, (h - padding * 2) / wy);
  const mapW = wx * scale;
  const mapH = wy * scale;
  const ox = (w - mapW) / 2;
  const oy = (h - mapH) / 2;
  const tx = (x: number) => (x - world.bounds.minX) * scale + ox;
  const ty = (y: number) => (y - world.bounds.minY) * scale + oy;

  // District fills
  for (const d of world.districts) {
    ctx.fillStyle = d.mapColor;
    ctx.fillRect(tx(d.x1), ty(d.y1), (d.x2 - d.x1) * scale, (d.y2 - d.y1) * scale);
  }

  // City grid streets
  const grid = world.cityGrid;
  const streetW = grid.halfWidth * 2 * scale;
  ctx.fillStyle = '#5a5a6a';
  for (const x0 of grid.xLines) {
    ctx.fillRect(tx(x0 - grid.halfWidth), ty(-grid.yExtent), streetW, grid.yExtent * 2 * scale);
  }
  for (const y0 of grid.yLines) {
    ctx.fillRect(tx(-grid.xExtent), ty(y0 - grid.halfWidth), grid.xExtent * 2 * scale, streetW);
  }

  // Cross-road stubs
  ctx.fillStyle = '#6a6a7a';
  for (const ix of world.intersections) {
    const stW = HALF_ROAD_WIDTH * 2 * scale;
    const stL = CROSS_HALF_LENGTH * scale;
    // Draw in both normal directions
    for (const sign of [1, -1]) {
      const sx = tx(ix.x + ix.normalX * sign * CROSS_HALF_LENGTH / 2) - (stW * Math.abs(ix.tangentX) + stL * Math.abs(ix.normalX)) / 2;
      const sy = ty(ix.y + ix.normalY * sign * CROSS_HALF_LENGTH / 2) - (stW * Math.abs(ix.tangentY) + stL * Math.abs(ix.normalY)) / 2;
      // Simple cross-road rect approximation
      const rw = stW * Math.abs(ix.tangentX) + stL * Math.abs(ix.normalX);
      const rh = stW * Math.abs(ix.tangentY) + stL * Math.abs(ix.normalY);
      ctx.fillRect(
        tx(ix.x) + ix.normalX * sign * (stL * 0.05 + HALF_ROAD_WIDTH * scale * 0.5) - (stW * Math.abs(ix.tangentY) + stL * Math.abs(ix.normalX)) / 2,
        ty(ix.y) + ix.normalY * sign * (stL * 0.05 + HALF_ROAD_WIDTH * scale * 0.5) - (stW * Math.abs(ix.tangentX) + stL * Math.abs(ix.normalY)) / 2,
        Math.max(2, stW * Math.abs(ix.tangentY) + stL * Math.abs(ix.normalX)),
        Math.max(2, stW * Math.abs(ix.tangentX) + stL * Math.abs(ix.normalY)),
      );
    }
  }

  // Ring road (thick)
  ctx.strokeStyle = '#8a8898';
  ctx.lineWidth = Math.max(3, world.halfRoadWidth * scale * 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i <= world.centerline.length; i++) {
    const p = world.centerline[i % world.centerline.length];
    if (i === 0) ctx.moveTo(tx(p.x), ty(p.y));
    else ctx.lineTo(tx(p.x), ty(p.y));
  }
  ctx.stroke();

  // Ring road white center line
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= world.centerline.length; i++) {
    const p = world.centerline[i % world.centerline.length];
    if (i === 0) ctx.moveTo(tx(p.x), ty(p.y));
    else ctx.lineTo(tx(p.x), ty(p.y));
  }
  ctx.stroke();

  // Intersection lights
  for (const ix of world.intersections) {
    const st = highwayLightState(ix, timeS);
    ctx.fillStyle = st === 'green' ? '#7ed957' : st === 'yellow' ? '#ffd23f' : '#ff5050';
    ctx.beginPath();
    ctx.arc(tx(ix.x), ty(ix.y), 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Interactive buildings
  for (const b of world.interactives) {
    ctx.fillStyle = INTERACTIVE_COLORS[b.type] ?? '#fff';
    ctx.fillRect(tx(b.x) - 4, ty(b.y) - 4, 8, 8);
  }

  // Collectibles
  if (state.collectibleStates) {
    ctx.fillStyle = '#ffd700';
    for (let i = 0; i < world.collectibles.length; i++) {
      if (state.collectibleStates[i]) continue;
      const c = world.collectibles[i];
      ctx.beginPath();
      ctx.arc(tx(c.x), ty(c.y), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // AI cars
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  for (const c of ai) {
    ctx.beginPath();
    ctx.arc(tx(c.x), ty(c.y), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cross traffic
  ctx.fillStyle = 'rgba(180,230,255,0.6)';
  for (const c of crossTraffic) {
    ctx.beginPath();
    ctx.arc(tx(c.x), ty(c.y), 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mission marker
  if (state.missionMarker) {
    const mx = tx(state.missionMarker.x);
    const my = ty(state.missionMarker.y);
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.moveTo(mx, my - 10);
    ctx.lineTo(mx + 6, my);
    ctx.lineTo(mx - 6, my);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Waypoint
  if (state.waypoint) {
    const wpx = tx(state.waypoint.x);
    const wpy = ty(state.waypoint.y);
    ctx.save();
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(tx(player.x), ty(player.y));
    ctx.lineTo(wpx, wpy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(wpx, wpy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // Player dot + heading arrow
  const px = tx(player.x);
  const py = ty(player.y);
  ctx.fillStyle = '#ff5e8a';
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = '#ff5e8a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + Math.cos(player.heading) * 10, py + Math.sin(player.heading) * 10);
  ctx.stroke();

  // District labels
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const d of world.districts) {
    const cx = tx((d.x1 + d.x2) / 2);
    const cy = ty((d.y1 + d.y2) / 2);
    const labelW = (d.x2 - d.x1) * scale;
    const labelH = (d.y2 - d.y1) * scale;
    if (labelW < 28 || labelH < 12) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(d.label, cx + 1, cy + 1);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(d.label, cx, cy);
  }
}
