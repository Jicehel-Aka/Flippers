import { Vec2 } from '../types/pinball';

export interface SplineSample {
  x: number;
  y: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  t: number;
  z: number;
  dist: number;
}

export interface RampSplineData {
  samples: SplineSample[];
  totalLen: number;
}

/**
 * Construit une spline Catmull-Rom paramétrée par abscisse curviligne réelle (`dist` en px),
 * partagée à l'identique entre le moteur physique 720 Hz et le moteur de rendu 2D/3D.
 * Ainsi la bille suit exactement l'intérieur des rails et goulottes sans jamais couper ni sauter.
 */
export function buildRampSpline(
  pts: Vec2[],
  subdivisionsPerSeg: number = 9,
  exitsToUpperDeck: boolean = false
): RampSplineData {
  if (pts.length < 2) {
    return { samples: [], totalLen: 0 };
  }

  const raw: Vec2[] = [];
  const n = pts.length;
  const clampX = (v: number) => Math.max(14.5, Math.min(211.5, v));
  const clampY = (v: number) => Math.max(19, Math.min(472, v));

  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];

    for (let s = 0; s < subdivisionsPerSeg; s++) {
      const u = s / subdivisionsPerSeg;
      const u2 = u * u;
      const u3 = u2 * u;
      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * u +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3);
      const y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * u +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3);
      raw.push({
        x: i === 0 && s === 0 ? p1.x : clampX(x),
        y: i === 0 && s === 0 ? p1.y : clampY(y),
      });
    }
  }
  raw.push({ x: pts[n - 1].x, y: pts[n - 1].y });

  const total = raw.length;
  const cumDist: number[] = new Array(total).fill(0);
  let acc = 0;
  for (let i = 1; i < total; i++) {
    acc += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y);
    cumDist[i] = acc;
  }
  const totalLen = Math.max(1e-4, acc);

  const samples: SplineSample[] = [];
  for (let i = 0; i < total; i++) {
    const prev = raw[Math.max(0, i - 1)];
    const next = raw[Math.min(total - 1, i + 1)];
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const t = cumDist[i] / totalLen;
    const z = exitsToUpperDeck
      ? 0.08 + 0.88 * Math.sin(Math.min(1, Math.max(0, t)) * Math.PI * 0.5)
      : Math.sin(Math.PI * Math.min(0.96, Math.max(0.04, t)));
    samples.push({
      x: raw[i].x,
      y: raw[i].y,
      tx: dx,
      ty: dy,
      nx: -dy,
      ny: dx,
      t,
      z,
      dist: cumDist[i],
    });
  }

  return { samples, totalLen };
}

/**
 * Construit un conduit aérien courbe continu entre un puits d'éjection VUK (`from`)
 * et son point de sortie (`to`) afin que la bille voyage visiblement dans un tube
 * pneumatique / rail chromé surélevé au lieu de se téléporter.
 */
export function buildVukTubeSpline(from: Vec2, to: Vec2): RampSplineData {
  const mx = (from.x + to.x) * 0.5;
  const my = (from.y + to.y) * 0.5;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const chord = Math.hypot(dx, dy) || 1;
  // Décalage d'arche vers le centre / haut du plateau pour une belle courbe fluide
  const archSign = mx <= 113 ? 1 : -1;
  const perpX = (-dy / chord) * Math.min(28, chord * 0.22) * archSign;
  const perpY = -Math.min(24, chord * 0.16);
  const ctrl: Vec2 = {
    x: Math.max(24, Math.min(200, mx + perpX)),
    y: Math.max(36, Math.min(448, my + perpY)),
  };
  return buildRampSpline([from, ctrl, to], 10, false);
}

/**
 * Échantillonne avec interpolation linéaire exacte la position, la tangente et l'élévation
 * sur une spline à la distance curviligne `dist` (en pixels depuis l'entrée).
 */
export function sampleSplineAtDistance(spline: RampSplineData, dist: number): SplineSample {
  const { samples, totalLen } = spline;
  if (samples.length === 0) {
    return { x: 113, y: 260, tx: 0, ty: -1, nx: 1, ny: 0, t: 0, z: 0, dist: 0 };
  }
  if (samples.length === 1 || dist <= 0) {
    return samples[0];
  }
  if (dist >= totalLen) {
    return samples[samples.length - 1];
  }

  let lo = 0;
  let hi = samples.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].dist <= dist) lo = mid;
    else hi = mid;
  }

  const a = samples[lo];
  const b = samples[hi];
  const span = b.dist - a.dist;
  const u = span > 1e-6 ? Math.max(0, Math.min(1, (dist - a.dist) / span)) : 0;

  let tx = a.tx + (b.tx - a.tx) * u;
  let ty = a.ty + (b.ty - a.ty) * u;
  const tLen = Math.hypot(tx, ty) || 1;
  tx /= tLen;
  ty /= tLen;

  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    tx,
    ty,
    nx: -ty,
    ny: tx,
    t: a.t + (b.t - a.t) * u,
    z: a.z + (b.z - a.z) * u,
    dist,
  };
}

/**
 * Test d'inclusion point-dans-polygone (algorithme ray-casting) utilisé pour les étages supérieurs (`layer = 2`).
 */
export function isPointInPolygon(x: number, y: number, poly: Vec2[]): boolean {
  const n = poly.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
