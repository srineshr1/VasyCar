import { World, TILE_W, TILE_H, NUM_LANES, LANE_WIDTH, HALF_ROAD_WIDTH, MEDIAN_HALF, SceneryItem } from './highway';
import { PlayerCar, AICar } from './cars';
import { SelfDrivingState, RAY_ANGLES } from './selfDriving';

export interface Camera { tx: number; ty: number; }

export interface RenderCache { bg: HTMLCanvasElement | null; offsetX: number; offsetY: number; }

export interface SceneState {
  world: World;
  cache: RenderCache;
  cam: Camera;
  player: PlayerCar;
  ai: AICar[];
  selfDrivingState?: SelfDrivingState;
}

const ASPHALT = '#3a3a42';
const MEDIAN_COLOR = '#505058';     // concrete jersey barrier
const SHOULDER_COLOR = '#54545c';
const GRASS_COLOR = '#9bbf85';
const MARKING_COLOR = '#f6f6f0';
const EDGE_LINE = '#fff5b3';
const MEDIAN_LINE = '#f0c020';      // solid yellow at median boundary

// HALF_LANES: from centerline to outer edge of each carriageway (excludes shoulder)
const HALF_LANES = MEDIAN_HALF + (NUM_LANES / 2) * LANE_WIDTH;

function pointIso(x: number, y: number) {
  return { x: ((x - y) * TILE_W) / 2, y: ((x + y) * TILE_H) / 2 };
}

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.floor(((n >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.floor(((n >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.floor((n & 0xff) * factor)));
  return `rgb(${r},${g},${b})`;
}

function normalAt(world: World, i: number) {
  const t = world.tangents[i];
  return { x: -t.y, y: t.x };
}

function edgePoint(world: World, i: number, offset: number) {
  const c = world.centerline[i];
  const n = normalAt(world, i);
  return { x: c.x + n.x * offset, y: c.y + n.y * offset };
}

function drawRibbonBandViewport(
  ctx: CanvasRenderingContext2D, world: World, visibleSegs: number[],
  innerOffset: number, outerOffset: number, color: string, cam: Camera, W: number, H: number,
) {
  const n = world.centerline.length;
  ctx.fillStyle = color;
  for (const i of visibleSegs) {
    const j = (i + 1) % n;
    const ai = edgePoint(world, i, innerOffset);
    const bi = edgePoint(world, j, innerOffset);
    const ao = edgePoint(world, i, outerOffset);
    const bo = edgePoint(world, j, outerOffset);
    const pAi = project(ai.x, ai.y, cam, W, H);
    const pBi = project(bi.x, bi.y, cam, W, H);
    const pAo = project(ao.x, ao.y, cam, W, H);
    const pBo = project(bo.x, bo.y, cam, W, H);
    ctx.beginPath();
    ctx.moveTo(pAi.x, pAi.y);
    ctx.lineTo(pBi.x, pBi.y);
    ctx.lineTo(pBo.x, pBo.y);
    ctx.lineTo(pAo.x, pAo.y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawLineAtOffsetViewport(
  ctx: CanvasRenderingContext2D, world: World, visibleSegs: number[],
  offset: number, dashed: boolean, color: string, lineWidth: number, cam: Camera, W: number, H: number,
) {
  const n = world.centerline.length;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'butt';
  for (const i of visibleSegs) {
    if (dashed && i % 2 !== 0) continue;
    const a = edgePoint(world, i, offset);
    const b = edgePoint(world, (i + 1) % n, offset);
    const pA = project(a.x, a.y, cam, W, H);
    const pB = project(b.x, b.y, cam, W, H);
    ctx.beginPath();
    ctx.moveTo(pA.x, pA.y);
    ctx.lineTo(pB.x, pB.y);
    ctx.stroke();
  }
}

function collectVisibleSegs(world: World, cam: Camera, W: number, H: number): number[] {
  const n = world.centerline.length;
  const margin = HALF_ROAD_WIDTH * TILE_W * 2 + 80;
  const result: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = world.centerline[i];
    const p = project(c.x, c.y, cam, W, H);
    if (p.x > -margin && p.x < W + margin && p.y > -margin * 1.5 && p.y < H + margin * 1.5) {
      result.push(i);
    }
  }
  return result;
}

function drawRoadViewport(ctx: CanvasRenderingContext2D, world: World, cam: Camera, W: number, H: number) {
  const visibleSegs = collectVisibleSegs(world, cam, W, H);
  if (visibleSegs.length === 0) return;
  const lanesPerDir = NUM_LANES / 2;
  drawRibbonBandViewport(ctx, world, visibleSegs, HALF_LANES, -HALF_LANES, ASPHALT, cam, W, H);
  drawRibbonBandViewport(ctx, world, visibleSegs, HALF_ROAD_WIDTH, HALF_LANES, SHOULDER_COLOR, cam, W, H);
  drawRibbonBandViewport(ctx, world, visibleSegs, -HALF_LANES, -HALF_ROAD_WIDTH, SHOULDER_COLOR, cam, W, H);
  drawRibbonBandViewport(ctx, world, visibleSegs, MEDIAN_HALF, -MEDIAN_HALF, MEDIAN_COLOR, cam, W, H);
  drawLineAtOffsetViewport(ctx, world, visibleSegs, HALF_LANES, false, EDGE_LINE, 2.5, cam, W, H);
  drawLineAtOffsetViewport(ctx, world, visibleSegs, -HALF_LANES, false, EDGE_LINE, 2.5, cam, W, H);
  for (let i = 1; i < lanesPerDir; i++) {
    const off = MEDIAN_HALF + i * LANE_WIDTH;
    drawLineAtOffsetViewport(ctx, world, visibleSegs, off, true, MARKING_COLOR, 2, cam, W, H);
    drawLineAtOffsetViewport(ctx, world, visibleSegs, -off, true, MARKING_COLOR, 2, cam, W, H);
  }
  drawLineAtOffsetViewport(ctx, world, visibleSegs, MEDIAN_HALF, false, MEDIAN_LINE, 3, cam, W, H);
  drawLineAtOffsetViewport(ctx, world, visibleSegs, -MEDIAN_HALF, false, MEDIAN_LINE, 3, cam, W, H);
}

export function buildBackgroundCache(_world: World): RenderCache {
  return { bg: null, offsetX: 0, offsetY: 0 };
}

function drawSceneryItem(ctx: CanvasRenderingContext2D, s: SceneryItem, ox: number, oy: number) {
  if (s.type === 'tree') drawTree(ctx, s, ox, oy);
  else if (s.type === 'building') drawBuilding(ctx, s, ox, oy);
  else drawSign(ctx, s, ox, oy);
}

function sceneryDepth(s: SceneryItem): number {
  if (s.type === 'building') return s.x + s.y + s.size;
  if (s.type === 'tree') return s.x + s.y + s.size * 0.3;
  return s.x + s.y + 0.2;
}

function sceneryIsVisible(s: SceneryItem, cam: Camera, W: number, H: number): boolean {
  const p = project(s.x, s.y, cam, W, H);
  const radius = s.type === 'building'
    ? Math.max(70, s.size * TILE_W * 1.2 + s.height * TILE_H * 1.8)
    : Math.max(35, s.size * TILE_W * 0.8 + s.height * TILE_H * 1.8);
  return p.x > -radius && p.x < W + radius && p.y > -radius * 1.8 && p.y < H + radius;
}

function drawTree(ctx: CanvasRenderingContext2D, s: SceneryItem, ox: number, oy: number) {
  const ground = pointIso(s.x, s.y);
  const liftPx = s.height * TILE_H * 1.6;
  const gx = ground.x + ox, gy = ground.y + oy;
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

function drawBuilding(ctx: CanvasRenderingContext2D, s: SceneryItem, ox: number, oy: number) {
  const half = s.size / 2;
  const x1 = s.x - half, y1 = s.y - half, x2 = s.x + half, y2 = s.y + half;
  const liftPx = s.height * TILE_H * 1.6;
  const nG = pointIso(x1, y1), eG = pointIso(x2, y1), sG = pointIso(x2, y2), wG = pointIso(x1, y2);
  const lift = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - liftPx });
  const nT = lift(nG), eT = lift(eG), sT = lift(sG), wT = lift(wG);
  const stroke = shade(s.color, 0.55);
  ctx.lineWidth = 1;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = shade(s.color, 0.78);
  ctx.beginPath(); ctx.moveTo(eG.x + ox, eG.y + oy); ctx.lineTo(sG.x + ox, sG.y + oy); ctx.lineTo(sT.x + ox, sT.y + oy); ctx.lineTo(eT.x + ox, eT.y + oy); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = shade(s.color, 0.62);
  ctx.beginPath(); ctx.moveTo(wG.x + ox, wG.y + oy); ctx.lineTo(sG.x + ox, sG.y + oy); ctx.lineTo(sT.x + ox, sT.y + oy); ctx.lineTo(wT.x + ox, wT.y + oy); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = s.color;
  ctx.beginPath(); ctx.moveTo(nT.x + ox, nT.y + oy); ctx.lineTo(eT.x + ox, eT.y + oy); ctx.lineTo(sT.x + ox, sT.y + oy); ctx.lineTo(wT.x + ox, wT.y + oy); ctx.closePath(); ctx.fill(); ctx.stroke();
}

function drawSign(ctx: CanvasRenderingContext2D, s: SceneryItem, ox: number, oy: number) {
  const ground = pointIso(s.x, s.y);
  const liftPx = s.height * TILE_H * 1.6;
  const gx = ground.x + ox, gy = ground.y + oy;
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

function project(tx: number, ty: number, cam: Camera, W: number, H: number) {
  const sx = ((tx - ty) * TILE_W) / 2;
  const sy = ((tx + ty) * TILE_H) / 2;
  const cx = ((cam.tx - cam.ty) * TILE_W) / 2;
  const cy = ((cam.tx + cam.ty) * TILE_H) / 2;
  return { x: sx - cx + W / 2, y: sy - cy + H / 2 };
}

type RenderCar = { x: number; y: number; heading: number; width: number; length: number; color: string };
type ScreenPoint = { x: number; y: number };

function drawPoly(ctx: CanvasRenderingContext2D, points: ScreenPoint[], fill: string, stroke?: string, lineWidth = 1) {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function localCarPoint(car: RenderCar, along: number, side: number) {
  const cosH = Math.cos(car.heading), sinH = Math.sin(car.heading);
  return { x: car.x + cosH * along - sinH * side, y: car.y + sinH * along + cosH * side };
}

function projectCarPoint(car: RenderCar, along: number, side: number, liftPx: number, cam: Camera, W: number, H: number) {
  const p = localCarPoint(car, along, side);
  const screen = project(p.x, p.y, cam, W, H);
  return { x: screen.x, y: screen.y - liftPx };
}

function drawCarWheel(ctx: CanvasRenderingContext2D, car: RenderCar, along: number, side: number, cam: Camera, W: number, H: number) {
  const center = projectCarPoint(car, along, side, 2, cam, W, H);
  const front = projectCarPoint(car, along + 0.15, side, 2, cam, W, H);
  const rear = projectCarPoint(car, along - 0.15, side, 2, cam, W, H);
  const angle = Math.atan2(front.y - rear.y, front.x - rear.x);
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(angle);
  ctx.fillStyle = '#111217';
  ctx.beginPath(); ctx.ellipse(0, 0, 5.4, 2.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6d737c';
  ctx.beginPath(); ctx.ellipse(0.2, -0.1, 2.1, 1.0, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawCar(ctx: CanvasRenderingContext2D, car: RenderCar, cam: Camera, W: number, H: number) {
  const L = Math.max(car.length * 0.62, 0.6);
  const Wd = Math.max(car.width * 0.62, 0.34);
  const bodyLift = 7, cabinLift = 8;
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
  ctx.ellipse(center.x + 1.5, center.y + 6, TILE_W * 0.32, TILE_H * 0.26, Math.atan2(projectedNose.y - projectedTail.y, projectedNose.x - projectedTail.x), 0, Math.PI * 2);
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
  const glass = 'rgba(28,43,58,0.9)', glassStroke = 'rgba(225,242,255,0.42)';
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
  for (const p of headlights) { ctx.beginPath(); ctx.ellipse(p.x, p.y, 2.3, 1.3, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#ff3d4f';
  for (const p of taillights) { ctx.beginPath(); ctx.ellipse(p.x, p.y, 2.2, 1.2, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = 'rgba(255,255,255,0.24)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(deck.fl.x, deck.fl.y); ctx.lineTo(cabinBase.fl.x, cabinBase.fl.y); ctx.lineTo(cabinRoof.fl.x, cabinRoof.fl.y); ctx.stroke();
  ctx.restore();
}

function drawSensorOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, state: SceneState) {
  const { cam, player, selfDrivingState: sd } = state;
  if (!sd) return;
  for (let i = 0; i < RAY_ANGLES.length; i++) {
    const sensor = sd.sensors[i];
    const angle = player.heading + RAY_ANGLES[i];
    const ex = player.x + Math.cos(angle) * sensor.dist;
    const ey = player.y + Math.sin(angle) * sensor.dist;
    const start = project(player.x, player.y, cam, W, H);
    const end = project(ex, ey, cam, W, H);
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = sensor.hit ? '#ff4444' : '#44ff88';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    if (sensor.hit) {
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff4444';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export function renderScene(ctx: CanvasRenderingContext2D, W: number, H: number, state: SceneState) {
  const { world, cam, player, ai } = state;
  ctx.fillStyle = GRASS_COLOR;
  ctx.fillRect(0, 0, W, H);
  drawRoadViewport(ctx, world, cam, W, H);
  const camIso = pointIso(cam.tx, cam.ty);
  const spriteOx = W / 2 - camIso.x;
  const spriteOy = H / 2 - camIso.y;
  type Sprite = { depth: number; draw: () => void };
  const sprites: Sprite[] = [];
  for (const s of world.scenery) {
    if (!sceneryIsVisible(s, cam, W, H)) continue;
    sprites.push({ depth: sceneryDepth(s), draw: () => drawSceneryItem(ctx, s, spriteOx, spriteOy) });
  }
  for (const car of ai) {
    const sp = project(car.x, car.y, cam, W, H);
    if (sp.x < -200 || sp.x > W + 200 || sp.y < -300 || sp.y > H + 300) continue;
    sprites.push({ depth: car.x + car.y + 0.5, draw: () => drawCar(ctx, car, cam, W, H) });
  }
  sprites.push({ depth: player.x + player.y + 0.55, draw: () => drawCar(ctx, player, cam, W, H) });
  sprites.sort((a, b) => a.depth - b.depth);
  for (const s of sprites) s.draw();
  if (state.selfDrivingState?.active) drawSensorOverlay(ctx, W, H, state);
}

export function drawMinimap(ctx: CanvasRenderingContext2D, w: number, h: number, state: SceneState) {
  const { world, player, ai } = state;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#1d1d2a';
  ctx.fillRect(0, 0, w, h);
  const padding = 6;
  const wx = world.bounds.maxX - world.bounds.minX;
  const wy = world.bounds.maxY - world.bounds.minY;
  const scale = Math.min((w - padding * 2) / wx, (h - padding * 2) / wy);
  const mx = (x: number) => (x - world.bounds.minX) * scale + padding;
  const my = (y: number) => (y - world.bounds.minY) * scale + padding;
  const n = world.centerline.length;
  const step = 8;
  ctx.strokeStyle = '#7c7c8a';
  ctx.lineWidth = Math.max(2, world.halfRoadWidth * scale * 1.6);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i <= n; i += step) {
    const p = world.centerline[i % n];
    if (i === 0) ctx.moveTo(mx(p.x), my(p.y)); else ctx.lineTo(mx(p.x), my(p.y));
  }
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  for (const c of ai) { ctx.beginPath(); ctx.arc(mx(c.x), my(c.y), 2, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#ff5e8a';
  ctx.beginPath(); ctx.arc(mx(player.x), my(player.y), 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
}

export function drawMapModal(ctx: CanvasRenderingContext2D, w: number, h: number, state: SceneState) {
  const { world, player, ai } = state;
  ctx.fillStyle = '#12121a';
  ctx.fillRect(0, 0, w, h);
  const padding = 16;
  const wx = world.bounds.maxX - world.bounds.minX;
  const wy = world.bounds.maxY - world.bounds.minY;
  const scale = Math.min((w - padding * 2) / wx, (h - padding * 2) / wy);
  const mapW = wx * scale, mapH = wy * scale;
  const ox = (w - mapW) / 2, oy = (h - mapH) / 2;
  const tx = (x: number) => (x - world.bounds.minX) * scale + ox;
  const ty = (y: number) => (y - world.bounds.minY) * scale + oy;
  ctx.strokeStyle = '#8a8898';
  ctx.lineWidth = Math.max(3, world.halfRoadWidth * scale * 2);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i <= world.centerline.length; i++) {
    const p = world.centerline[i % world.centerline.length];
    if (i === 0) ctx.moveTo(tx(p.x), ty(p.y)); else ctx.lineTo(tx(p.x), ty(p.y));
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= world.centerline.length; i++) {
    const p = world.centerline[i % world.centerline.length];
    if (i === 0) ctx.moveTo(tx(p.x), ty(p.y)); else ctx.lineTo(tx(p.x), ty(p.y));
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  for (const c of ai) { ctx.beginPath(); ctx.arc(tx(c.x), ty(c.y), 2.5, 0, Math.PI * 2); ctx.fill(); }
  const px = tx(player.x), py = ty(player.y);
  ctx.fillStyle = '#ff5e8a';
  ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.strokeStyle = '#ff5e8a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(player.heading) * 10, py + Math.sin(player.heading) * 10); ctx.stroke();
}
