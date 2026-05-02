export const TILE_W = 64;
export const TILE_H = 32;

export const NUM_LANES = 8;          // 4 lanes per direction, like ORR Hyderabad
export const LANE_WIDTH = 1.0;       // 1 tile = 3.75 m (one ORR lane)
export const SHOULDER_WIDTH = 0.5;
export const MEDIAN_WIDTH = 1.5;     // jersey-barrier median (~5.6 m)
export const MEDIAN_HALF = MEDIAN_WIDTH / 2;
// total half-width: median + 4 lanes + shoulder
export const HALF_ROAD_WIDTH = MEDIAN_HALF + (NUM_LANES / 2) * LANE_WIDTH + SHOULDER_WIDTH;
export const CENTERLINE_RESOLUTION = 8192;

export type SceneryType = 'tree' | 'building' | 'sign';

export interface SceneryItem {
  type: SceneryType;
  x: number;
  y: number;
  size: number;
  height: number;
  color: string;
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
  medianHalf: number;
  scenery: SceneryItem[];
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

function buildCenterline(_rand: () => number): { x: number; y: number }[] {
  const SCALE = 285;
  const raw = [
    { x: -15.64, y: -0.90 }, { x: -18.05, y: -5.61 }, { x: -23.69, y: -14.91 },
    { x: -15.64, y: -17.09 }, { x: -9.11, y: -17.59 }, { x: -5.41, y: -21.13 },
    { x: 0.93, y: -22.30 }, { x: 5.89, y: -21.00 }, { x: 11.84, y: -19.39 },
    { x: 17.63, y: -17.11 }, { x: 20.69, y: -11.00 }, { x: 22.02, y: -4.85 },
    { x: 23.70, y: 0.86 }, { x: 21.16, y: 7.12 }, { x: 20.07, y: 13.27 },
    { x: 16.20, y: 16.87 }, { x: 10.35, y: 20.26 }, { x: 4.92, y: 21.86 },
    { x: -1.09, y: 22.30 }, { x: -7.22, y: 22.18 }, { x: -8.34, y: 13.50 },
    { x: -9.30, y: 8.61 }, { x: -10.97, y: 5.61 }, { x: -11.78, y: 2.46 },
  ];
  const wp = raw.map(p => ({ x: p.x * SCALE, y: p.y * SCALE }));
  const m = wp.length;
  const N = CENTERLINE_RESOLUTION;
  const pts: { x: number; y: number }[] = [];

  for (let i = 0; i < N; i++) {
    const t = i / N;
    const pos = t * m;
    const seg = Math.floor(pos) % m;
    const frac = pos - Math.floor(pos);
    const p0 = wp[(seg - 1 + m) % m];
    const p1 = wp[seg];
    const p2 = wp[(seg + 1) % m];
    const p3 = wp[(seg + 2) % m];
    const t2 = frac * frac, t3 = t2 * frac;
    pts.push({
      x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * frac + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * frac + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    });
  }
  return pts;
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

function computeBounds(
  centerline: { x: number; y: number }[],
  scenery: SceneryItem[],
): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
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

function generateScenery(
  centerline: { x: number; y: number }[],
  tangents: { x: number; y: number }[],
  rand: () => number,
): SceneryItem[] {
  const items: SceneryItem[] = [];
  const n = centerline.length;
  const minOff = HALF_ROAD_WIDTH + 1.6;
  const maxOff = HALF_ROAD_WIDTH + 9.0;
  const numItems = 5000;
  const stride = n / numItems;
  for (let i = 0; i < numItems; i++) {
    const idx = Math.floor((i + rand() * 0.8) * stride) % n;
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
        type: 'tree', x, y,
        size: 0.55 + rand() * 0.45,
        height: 0.45 + rand() * 0.55,
        color: TREE_COLORS[Math.floor(rand() * TREE_COLORS.length)],
      });
    } else if (r < 0.96) {
      items.push({
        type: 'building', x, y,
        size: 1.1 + rand() * 1.7,
        height: 0.5 + rand() * 1.6,
        color: BUILDING_COLORS[Math.floor(rand() * BUILDING_COLORS.length)],
      });
    } else {
      items.push({ type: 'sign', x, y, size: 0.55, height: 1.4 + rand() * 0.4, color: '#2b6cb0' });
    }
  }
  return items;
}

function wrap01(t: number): number {
  return ((t % 1) + 1) % 1;
}

function sampleInterp(world: HighwayWorld, t: number): { cx: number; cy: number; tx: number; ty: number } {
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
  tx /= len; ty /= len;
  return { cx, cy, tx, ty };
}

export function positionOnLane(world: HighwayWorld, t: number, laneIdx: number): { x: number; y: number } {
  const s = sampleInterp(world, t);
  const lanesPerDir = world.numLanes / 2;
  const mh = world.medianHalf;
  // lanes 0..lanesPerDir-1 → forward (positive normal), lanesPerDir..numLanes-1 → reverse (negative)
  const offset = laneIdx < lanesPerDir
    ? mh + (lanesPerDir - 0.5 - laneIdx) * world.laneWidth
    : -(mh + (laneIdx - lanesPerDir + 0.5) * world.laneWidth);
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
  let lo = 0, hi = n;
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
  return tAtArcLength(world, arcLengthAtT(world, t) + distance);
}

export function nearestT(world: HighwayWorld, x: number, y: number): { t: number; lateralDist: number; signedLateral: number } {
  const n = world.centerline.length;
  let bestI = 0, bestD2 = Infinity;
  for (let i = 0; i < n; i++) {
    const dx = world.centerline[i].x - x;
    const dy = world.centerline[i].y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; bestI = i; }
  }
  const projOnSeg = (aIdx: number, bIdx: number): { f: number; px: number; py: number; d: number } => {
    const a = world.centerline[aIdx], b = world.centerline[bIdx];
    const abx = b.x - a.x, aby = b.y - a.y;
    const apx = x - a.x, apy = y - a.y;
    const denom = abx * abx + aby * aby || 1;
    let f = (apx * abx + apy * aby) / denom;
    if (f < 0) f = 0; else if (f > 1) f = 1;
    const px = a.x + f * abx, py = a.y + f * aby;
    return { f, px, py, d: Math.hypot(px - x, py - y) };
  };
  const iPrev = (bestI - 1 + n) % n, iNext = (bestI + 1) % n;
  const segA = projOnSeg(iPrev, bestI), segB = projOnSeg(bestI, iNext);
  let t: number, lateralDist: number, segStart: number;
  if (segA.d < segB.d) { t = (iPrev + segA.f) / n; lateralDist = segA.d; segStart = iPrev; }
  else { t = (bestI + segB.f) / n; lateralDist = segB.d; segStart = bestI; }
  const ta = world.tangents[segStart], nxn = -ta.y, nyn = ta.x;
  const s = sampleInterp(world, t);
  const dx = x - s.cx, dy = y - s.cy;
  return { t, lateralDist, signedLateral: dx * nxn + dy * nyn };
}

export function createHighway(seed = 7): HighwayWorld {
  const rand = rng(seed);
  const centerline = buildCenterline(rand);
  const tangents = buildTangents(centerline);
  const { cumulativeLengths, totalLength } = buildCumulativeLengths(centerline);
  const scenery = generateScenery(centerline, tangents, rand);
  const bounds = computeBounds(centerline, scenery);
  return {
    centerline, tangents, cumulativeLengths, totalLength,
    numLanes: NUM_LANES, laneWidth: LANE_WIDTH,
    shoulderWidth: SHOULDER_WIDTH, halfRoadWidth: HALF_ROAD_WIDTH,
    medianHalf: MEDIAN_HALF,
    scenery, bounds,
  };
}
