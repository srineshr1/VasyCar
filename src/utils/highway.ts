export const TILE_W = 64;
export const TILE_H = 32;

export const NUM_LANES = 4;
export const LANE_WIDTH = 1.0;
export const SHOULDER_WIDTH = 0.6;
export const HALF_ROAD_WIDTH = (NUM_LANES * LANE_WIDTH) / 2 + SHOULDER_WIDTH;
export const CENTERLINE_RESOLUTION = 256;

export const LIGHT_PERIOD = 20;
export const LIGHT_HW_GREEN = 8;
export const LIGHT_YELLOW = 2;
export const CROSS_HALF_LENGTH = 60;

export type SceneryType = 'tree' | 'building' | 'sign';

export interface SceneryItem {
  type: SceneryType;
  x: number;
  y: number;
  size: number;
  height: number;
  color: string;
}

export interface Intersection {
  id: number;
  t: number;
  x: number;
  y: number;
  tangentX: number;
  tangentY: number;
  normalX: number;
  normalY: number;
  phaseOffset: number;
}

export type BuildingType = 'gas_station' | 'upgrade_shop' | 'garage';

export interface InteractiveBuilding {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  size: number;
  height: number;
  label: string;
  intersectionId: number;
}

export interface Collectible {
  id: number;
  x: number;
  y: number;
}

export interface CityGrid {
  xLines: number[];
  yLines: number[];
  halfWidth: number;
  xExtent: number;
  yExtent: number;
}

export interface HighwayWorld {
  centerline: { x: number; y: number }[];
  tangents: { x: number; y: number }[];
  cumulativeLengths: number[];
  totalLength: number;
  numLanes: number;
  laneWidth: number;
  shoulderWidth: number;
  halfRoadWidth: number;
  scenery: SceneryItem[];
  intersections: Intersection[];
  interactives: InteractiveBuilding[];
  collectibles: Collectible[];
  cityGrid: CityGrid;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export type World = HighwayWorld;

const TREE_COLORS = ['#5b8a4a', '#6e9c5a', '#4f7a40', '#7aa66a'];
const BUILDING_COLORS = ['#d4cfc4', '#c9b8a8', '#bcd0c5', '#cfc1d4', '#d8d0bd', '#b8c5cf'];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function buildCenterline(rand: () => number): { x: number; y: number }[] {
  const rx = 130;
  const ry = 52;
  const phase1 = rand() * Math.PI * 2;
  const phase2 = rand() * Math.PI * 2;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < CENTERLINE_RESOLUTION; i++) {
    const a = (i / CENTERLINE_RESOLUTION) * Math.PI * 2;
    const baseX = rx * Math.cos(a);
    const baseY = ry * Math.sin(a);
    const wobble = 4.5 * Math.sin(a * 3 + phase1) + 2.8 * Math.sin(a * 5 + phase2);
    const nxRaw = Math.cos(a) / rx;
    const nyRaw = Math.sin(a) / ry;
    const nlen = Math.hypot(nxRaw, nyRaw) || 1;
    const nx = nxRaw / nlen;
    const ny = nyRaw / nlen;
    points.push({ x: baseX + nx * wobble, y: baseY + ny * wobble });
  }
  return points;
}

function buildTangents(centerline: { x: number; y: number }[]): { x: number; y: number }[] {
  const n = centerline.length;
  const tangents: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = centerline[(i - 1 + n) % n];
    const p1 = centerline[(i + 1) % n];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    tangents.push({ x: dx / len, y: dy / len });
  }
  return tangents;
}

function buildCumulativeLengths(centerline: { x: number; y: number }[]): {
  cumulativeLengths: number[];
  totalLength: number;
} {
  const n = centerline.length;
  const lengths = new Array<number>(n + 1);
  lengths[0] = 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a = centerline[i];
    const b = centerline[(i + 1) % n];
    acc += Math.hypot(b.x - a.x, b.y - a.y);
    lengths[i + 1] = acc;
  }
  return { cumulativeLengths: lengths, totalLength: acc };
}

function generateScenery(
  centerline: { x: number; y: number }[],
  tangents: { x: number; y: number }[],
  rand: () => number,
): SceneryItem[] {
  const items: SceneryItem[] = [];
  const n = centerline.length;
  const minOff = HALF_ROAD_WIDTH + 1.6;
  const maxOff = HALF_ROAD_WIDTH + 9.0;
  const numItems = 600;
  for (let i = 0; i < numItems; i++) {
    const idx = Math.floor(rand() * n);
    const c = centerline[idx];
    const t = tangents[idx];
    const nx = -t.y;
    const ny = t.x;
    const side = rand() < 0.5 ? -1 : 1;
    const off = minOff + rand() * (maxOff - minOff);
    const x = c.x + nx * off * side;
    const y = c.y + ny * off * side;
    const r = rand();
    if (r < 0.72) {
      items.push({
        type: 'tree',
        x,
        y,
        size: 0.55 + rand() * 0.45,
        height: 0.45 + rand() * 0.55,
        color: TREE_COLORS[Math.floor(rand() * TREE_COLORS.length)],
      });
    } else if (r < 0.96) {
      items.push({
        type: 'building',
        x,
        y,
        size: 1.1 + rand() * 1.7,
        height: 0.5 + rand() * 1.6,
        color: BUILDING_COLORS[Math.floor(rand() * BUILDING_COLORS.length)],
      });
    } else {
      items.push({
        type: 'sign',
        x,
        y,
        size: 0.55,
        height: 1.4 + rand() * 0.4,
        color: '#2b6cb0',
      });
    }
  }
  return items;
}

function computeBounds(
  centerline: { x: number; y: number }[],
  scenery: SceneryItem[],
): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of centerline) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  for (const s of scenery) {
    const r = Math.max(s.size, 1) + s.height;
    if (s.x - r < minX) minX = s.x - r;
    if (s.x + r > maxX) maxX = s.x + r;
    if (s.y - r < minY) minY = s.y - r;
    if (s.y + r > maxY) maxY = s.y + r;
  }
  const pad = HALF_ROAD_WIDTH + 2;
  return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
}

function generateIntersections(
  centerline: { x: number; y: number }[],
  tangents: { x: number; y: number }[],
): Intersection[] {
  const tValues = [0.08, 0.25, 0.42, 0.60, 0.78];
  return tValues.map((t, id) => {
    const n = centerline.length;
    const tn = t * n;
    const i = Math.floor(tn) % n;
    const f = tn - Math.floor(tn);
    const j = (i + 1) % n;
    const x = centerline[i].x + (centerline[j].x - centerline[i].x) * f;
    const y = centerline[i].y + (centerline[j].y - centerline[i].y) * f;
    const tx = tangents[i].x + (tangents[j].x - tangents[i].x) * f;
    const ty = tangents[i].y + (tangents[j].y - tangents[i].y) * f;
    const tlen = Math.hypot(tx, ty) || 1;
    const tangentX = tx / tlen;
    const tangentY = ty / tlen;
    return {
      id,
      t,
      x,
      y,
      tangentX,
      tangentY,
      normalX: -tangentY,
      normalY: tangentX,
      phaseOffset: id * (LIGHT_PERIOD / tValues.length),
    };
  });
}

export function highwayLightState(
  ix: Intersection,
  timeS: number,
): 'green' | 'yellow' | 'red' {
  const t = ((timeS + ix.phaseOffset) % LIGHT_PERIOD + LIGHT_PERIOD) % LIGHT_PERIOD;
  if (t < LIGHT_HW_GREEN) return 'green';
  if (t < LIGHT_HW_GREEN + LIGHT_YELLOW) return 'yellow';
  if (t < LIGHT_HW_GREEN + LIGHT_YELLOW + LIGHT_HW_GREEN) return 'red';
  return 'yellow';
}

export function crossLightState(
  ix: Intersection,
  timeS: number,
): 'green' | 'yellow' | 'red' {
  const state = highwayLightState(ix, timeS);
  if (state === 'green') return 'red';
  if (state === 'red') return 'green';
  return 'yellow';
}

export function intersectionAhead(
  world: HighwayWorld,
  carT: number,
  horizonTiles: number,
): { intersection: Intersection; distTiles: number } | null {
  const carS = arcLengthAtT(world, carT);
  let best: { intersection: Intersection; distTiles: number } | null = null;
  for (const ix of world.intersections) {
    const ixS = arcLengthAtT(world, ix.t);
    let dist = ixS - carS;
    if (dist < 0) dist += world.totalLength;
    if (dist > 0 && dist <= horizonTiles) {
      if (!best || dist < best.distTiles) {
        best = { intersection: ix, distTiles: dist };
      }
    }
  }
  return best;
}

function generateCityGrid(): CityGrid {
  return {
    xLines: [-60, -40, -20, 0, 20, 40, 60],
    yLines: [-28, -14, 0, 14, 28],
    halfWidth: 1.5,
    xExtent: 100,
    yExtent: 40,
  };
}

export function isOnCityStreet(world: World, x: number, y: number): boolean {
  const { xLines, yLines, halfWidth, xExtent, yExtent } = world.cityGrid;
  for (const y0 of yLines) {
    if (Math.abs(y - y0) <= halfWidth && Math.abs(x) <= xExtent) return true;
  }
  for (const x0 of xLines) {
    if (Math.abs(x - x0) <= halfWidth && Math.abs(y) <= yExtent) return true;
  }
  return false;
}

function generateInteractiveBuildings(intersections: Intersection[]): InteractiveBuilding[] {
  const TYPES: BuildingType[] = ['gas_station', 'upgrade_shop', 'garage'];
  const LABELS: Record<BuildingType, string> = { gas_station: 'Gas Station', upgrade_shop: 'Upgrade Shop', garage: 'Garage' };
  const NORMAL_DIST = 25;
  const TANGENT_OFFSET = HALF_ROAD_WIDTH + 5.0;
  const buildings: InteractiveBuilding[] = [];
  let idx = 0;
  for (const ix of intersections) {
    for (const side of [-1, 1] as const) {
      for (const lat of [-1, 1] as const) {
        const x = ix.x + ix.normalX * NORMAL_DIST * side + ix.tangentX * TANGENT_OFFSET * lat;
        const y = ix.y + ix.normalY * NORMAL_DIST * side + ix.tangentY * TANGENT_OFFSET * lat;
        const type = TYPES[idx % TYPES.length];
        buildings.push({ id: idx, type, x, y, size: 2.0, height: 1.8, label: LABELS[type], intersectionId: ix.id });
        idx++;
      }
    }
  }
  return buildings;
}

function generateCollectibles(centerline: { x: number; y: number }[], rand: () => number): Collectible[] {
  const NUM = 20;
  const step = Math.floor(centerline.length / NUM);
  const collectibles: Collectible[] = [];
  for (let i = 0; i < NUM; i++) {
    const base = centerline[i * step];
    const angle = rand() * Math.PI * 2;
    const r = 8 + rand() * 30;
    collectibles.push({ id: i, x: base.x + Math.cos(angle) * r, y: base.y + Math.sin(angle) * r });
  }
  return collectibles;
}

export function createHighway(seed = 7): HighwayWorld {
  const rand = rng(seed);
  const centerline = buildCenterline(rand);
  const tangents = buildTangents(centerline);
  const { cumulativeLengths, totalLength } = buildCumulativeLengths(centerline);
  const intersections = generateIntersections(centerline, tangents);
  const scenery = generateScenery(centerline, tangents, rand);
  const interactives = generateInteractiveBuildings(intersections);
  const collectibles = generateCollectibles(centerline, rand);
  const cityGrid = generateCityGrid();
  const bounds = computeBounds(centerline, scenery);
  return {
    centerline,
    tangents,
    cumulativeLengths,
    totalLength,
    numLanes: NUM_LANES,
    laneWidth: LANE_WIDTH,
    shoulderWidth: SHOULDER_WIDTH,
    halfRoadWidth: HALF_ROAD_WIDTH,
    intersections,
    scenery,
    interactives,
    collectibles,
    cityGrid,
    bounds,
  };
}

function wrap01(t: number): number {
  return ((t % 1) + 1) % 1;
}

function sampleInterp(world: HighwayWorld, t: number): {
  cx: number;
  cy: number;
  tx: number;
  ty: number;
} {
  const n = world.centerline.length;
  const tn = wrap01(t) * n;
  const i = Math.floor(tn) % n;
  const f = tn - Math.floor(tn);
  const j = (i + 1) % n;
  const a = world.centerline[i];
  const b = world.centerline[j];
  const ta = world.tangents[i];
  const tb = world.tangents[j];
  const cx = a.x + (b.x - a.x) * f;
  const cy = a.y + (b.y - a.y) * f;
  let tx = ta.x + (tb.x - ta.x) * f;
  let ty = ta.y + (tb.y - ta.y) * f;
  const len = Math.hypot(tx, ty) || 1;
  tx /= len;
  ty /= len;
  return { cx, cy, tx, ty };
}

export function positionOnLane(
  world: HighwayWorld,
  t: number,
  laneIdx: number,
): { x: number; y: number } {
  const s = sampleInterp(world, t);
  const halfLanes = (world.numLanes - 1) / 2;
  const offset = (halfLanes - laneIdx) * world.laneWidth;
  const nx = -s.ty;
  const ny = s.tx;
  return { x: s.cx + nx * offset, y: s.cy + ny * offset };
}

export function headingAt(world: HighwayWorld, t: number): number {
  const s = sampleInterp(world, t);
  return Math.atan2(s.ty, s.tx);
}

export function tangentAt(world: HighwayWorld, t: number): { x: number; y: number } {
  const s = sampleInterp(world, t);
  return { x: s.tx, y: s.ty };
}

export function arcLengthAtT(world: HighwayWorld, t: number): number {
  const n = world.centerline.length;
  const tn = wrap01(t) * n;
  const i = Math.floor(tn);
  const f = tn - i;
  const seg = world.cumulativeLengths[i + 1] - world.cumulativeLengths[i];
  return world.cumulativeLengths[i] + f * seg;
}

export function tAtArcLength(world: HighwayWorld, s: number): number {
  const n = world.centerline.length;
  const total = world.totalLength;
  const sw = ((s % total) + total) % total;
  let lo = 0;
  let hi = n;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (world.cumulativeLengths[mid] <= sw) lo = mid;
    else hi = mid;
  }
  const seg = world.cumulativeLengths[lo + 1] - world.cumulativeLengths[lo];
  const f = seg > 0 ? (sw - world.cumulativeLengths[lo]) / seg : 0;
  return (lo + f) / n;
}

export function advanceT(world: HighwayWorld, t: number, distance: number): number {
  const s = arcLengthAtT(world, t);
  return tAtArcLength(world, s + distance);
}

export function nearestT(
  world: HighwayWorld,
  x: number,
  y: number,
): { t: number; lateralDist: number; signedLateral: number } {
  const n = world.centerline.length;
  let bestI = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < n; i++) {
    const dx = world.centerline[i].x - x;
    const dy = world.centerline[i].y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestI = i;
    }
  }
  const projOnSeg = (
    aIdx: number,
    bIdx: number,
  ): { f: number; px: number; py: number; d: number } => {
    const a = world.centerline[aIdx];
    const b = world.centerline[bIdx];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = x - a.x;
    const apy = y - a.y;
    const denom = abx * abx + aby * aby || 1;
    let f = (apx * abx + apy * aby) / denom;
    if (f < 0) f = 0;
    else if (f > 1) f = 1;
    const px = a.x + f * abx;
    const py = a.y + f * aby;
    const d = Math.hypot(px - x, py - y);
    return { f, px, py, d };
  };
  const iPrev = (bestI - 1 + n) % n;
  const iNext = (bestI + 1) % n;
  const segA = projOnSeg(iPrev, bestI);
  const segB = projOnSeg(bestI, iNext);
  let t: number;
  let lateralDist: number;
  let segStart: number;
  if (segA.d < segB.d) {
    t = (iPrev + segA.f) / n;
    lateralDist = segA.d;
    segStart = iPrev;
  } else {
    t = (bestI + segB.f) / n;
    lateralDist = segB.d;
    segStart = bestI;
  }
  const ta = world.tangents[segStart];
  const nxn = -ta.y;
  const nyn = ta.x;
  const s = sampleInterp(world, t);
  const dx = x - s.cx;
  const dy = y - s.cy;
  const signed = dx * nxn + dy * nyn;
  return { t, lateralDist, signedLateral: signed };
}
