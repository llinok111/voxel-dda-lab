// voxel-dda-lab core — exact segment <-> voxel traversal (supercover DDA).
// Pure ES module: no three.js, no DOM, no IO. All coordinates are in voxel units:
// voxel (i,j,k) is the closed box [i,i+1] x [j,j+1] x [k,k+1].

/** Numerical tolerance for "the ray touches this face/corner" tests. */
export const TOUCH_EPS = 1e-12;

export function sign(x) {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

/** Relative tolerance: scaled to the coordinate magnitude (scale-invariant tests). */
export function tolerance(points) {
  let m = 1;
  for (const p of points) for (const v of p) m = Math.max(m, Math.abs(v));
  return TOUCH_EPS * m;
}

/** Closed slab test: does the segment p0->p1 touch the closed box [min,max]? */
export function segmentTouchesBox(p0, p1, min, max, eps = TOUCH_EPS) {
  let t0 = 0;
  let t1 = 1;
  for (let a = 0; a < 3; a++) {
    const d = p1[a] - p0[a];
    const lo = min[a];
    const hi = max[a];
    if (Math.abs(d) <= eps) {
      if (p0[a] < lo - eps || p0[a] > hi + eps) return false;
      continue;
    }
    let ta = (lo - p0[a]) / d;
    let tb = (hi - p0[a]) / d;
    if (ta > tb) {
      const s = ta;
      ta = tb;
      tb = s;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1 + eps) return false;
  }
  return t0 <= t1 + eps;
}

function key(i, j, k) {
  return i + ',' + j + ',' + k;
}

function inBounds(i, j, k, dims) {
  return i >= 0 && j >= 0 && k >= 0 && i < dims[0] && j < dims[1] && k < dims[2];
}

function pushCell(out, seen, i, j, k, dims) {
  if (!inBounds(i, j, k, dims)) return;
  const kk = key(i, j, k);
  if (seen.has(kk)) return;
  seen.add(kk);
  out.push([i, j, k]);
}

/** Voxels whose closed box the segment touches — brute-force reference oracle. */
export function oracleTraversal(p0w, p1w, dims, scale = 1) {
  const p0 = [p0w[0] / scale, p0w[1] / scale, p0w[2] / scale];
  const p1 = [p1w[0] / scale, p1w[1] / scale, p1w[2] / scale];
  const eps = tolerance([p0, p1]);
  const out = [];
  const lo = [0, 1, 2].map((a) => Math.floor(Math.min(p0[a], p1[a])) - 1);
  const hi = [0, 1, 2].map((a) => Math.floor(Math.max(p0[a], p1[a])) + 1);
  for (let i = Math.max(0, lo[0]); i <= Math.min(dims[0] - 1, hi[0]); i++) {
    for (let j = Math.max(0, lo[1]); j <= Math.min(dims[1] - 1, hi[1]); j++) {
      for (let k = Math.max(0, lo[2]); k <= Math.min(dims[2] - 1, hi[2]); k++) {
        if (segmentTouchesBox(p0, p1, [i, j, k], [i + 1, j + 1, k + 1], eps)) {
          out.push([i, j, k]);
        }
      }
    }
  }
  return out;
}

/**
 * Amanatides & Woo style voxel traversal.
 * mode 'single'    : on a tie only one axis advances (the common textbook version)
 * mode 'supercover': on a tie every tied axis advances and the 2^k-1 cells that
 *                    share the touched corner/edge are emitted as well.
 * `primary` (supercover only) receives the face-connected chain for diagnostics.
 */
export function traverse(p0w, p1w, dims, mode = 'supercover', scale = 1) {
  const supercover = mode === 'supercover';
  const p0 = [p0w[0] / scale, p0w[1] / scale, p0w[2] / scale];
  const p1 = [p1w[0] / scale, p1w[1] / scale, p1w[2] / scale];
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const idx = [
    Math.min(dims[0] - 1, Math.max(0, Math.floor(p0[0]))),
    Math.min(dims[1] - 1, Math.max(0, Math.floor(p0[1]))),
    Math.min(dims[2] - 1, Math.max(0, Math.floor(p0[2]))),
  ];
  const step = [sign(d[0]), sign(d[1]), sign(d[2])];
  const tDelta = [0, 1, 2].map((a) => (step[a] === 0 ? Infinity : Math.abs(1 / d[a])));
  const tMax = [0, 1, 2].map((a) => {
    if (step[a] === 0) return Infinity;
    return step[a] > 0 ? (idx[a] + 1 - p0[a]) / d[a] : (idx[a] - p0[a]) / d[a];
  });
  const out = [];
  const seen = new Set();
  const primary = [];
  pushCell(out, seen, idx[0], idx[1], idx[2], dims);
  primary.push([idx[0], idx[1], idx[2]]);
  let guard = 0;
  const guardMax = 4 * (dims[0] + dims[1] + dims[2]) + 64;
  for (;;) {
    if (++guard > guardMax) throw new Error('traverse: guard exceeded');
    let tMin = Math.min(tMax[0], tMax[1], tMax[2]);
    if (!(tMin <= 1)) break;
    // the ray left the grid: a straight segment never re-enters
    if (!inBounds(idx[0], idx[1], idx[2], dims)) break;
    // axes whose entry time equals the minimum (corner / edge tie)
    const tied = [];
    for (let a = 0; a < 3; a++) {
      if (tMax[a] === Infinity) continue;
      if (Math.abs(tMax[a] - tMin) <= 1e-9 * (1 + Math.abs(tMin))) tied.push(a);
    }
    if (tied.length === 1 || !supercover) {
      const a = tied.length === 1 ? tied[0] : [0, 1, 2].find((x) => tMax[x] === tMin);
      idx[a] += step[a];
      tMax[a] += tDelta[a];
      pushCell(out, seen, idx[0], idx[1], idx[2], dims);
      primary.push([idx[0], idx[1], idx[2]]);
    } else {
      // Supercover: every cell sharing this corner is touched by the segment.
      const block = [];
      for (let mask = 1; mask < 1 << tied.length; mask++) {
        const cell = [idx[0], idx[1], idx[2]];
        const bits = [];
        for (let b = 0; b < tied.length; b++) {
          if (mask & (1 << b)) {
            cell[tied[b]] += step[tied[b]];
            bits.push(b);
          }
        }
        block.push({ cell, bits });
      }
      block.sort((x, y) => x.bits.length - y.bits.length);
      for (const { cell } of block) pushCell(out, seen, cell[0], cell[1], cell[2], dims);
      for (const a of tied) {
        idx[a] += step[a];
        tMax[a] += tDelta[a];
      }
      pushCell(out, seen, idx[0], idx[1], idx[2], dims);
      primary.push([idx[0], idx[1], idx[2]]);
    }
  }
  return supercover ? { cells: out, primary } : { cells: out, primary };
}

/** Classic fixed-step sampling: sample every `step` voxels and floor the point. */
export function sampleTraversal(p0w, p1w, dims, stepSize = 0.5, scale = 1) {
  const p0 = [p0w[0] / scale, p0w[1] / scale, p0w[2] / scale];
  const p1 = [p1w[0] / scale, p1w[1] / scale, p1w[2] / scale];
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const n = Math.max(1, Math.ceil(len / stepSize));
  const out = [];
  const seen = new Set();
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    const x = p0[0] + (p1[0] - p0[0]) * t;
    const y = p0[1] + (p1[1] - p0[1]) * t;
    const z = p0[2] + (p1[2] - p0[2]) * t;
    pushCell(out, seen, Math.floor(x), Math.floor(y), Math.floor(z), dims);
  }
  return out;
}

function cellsToSet(cells) {
  const s = new Set();
  for (const c of cells) s.add(key(c[0], c[1], c[2]));
  return s;
}

/** Compare a candidate traversal against the oracle set. */
export function compare(candidate, oracle, dims) {
  const cand = candidate.cells ? cellsToSet(candidate.cells) : cellsToSet(candidate);
  const ref = cellsToSet(oracle);
  const missed = [];
  const extra = [];
  for (const k of ref) if (!cand.has(k)) missed.push(k);
  for (const k of cand) if (!ref.has(k)) extra.push(k);
  return {
    oracleCount: ref.size,
    candidateCount: cand.size,
    missed: missed.length,
    extra: extra.length,
    missedSample: missed.slice(0, 8),
    extraSample: extra.slice(0, 8),
  };
}

/** Face-adjacency check on the ordered primary chain. */
export function connectivity(primary) {
  let face = 0;
  let diag = 0;
  let duplicate = 0;
  for (let i = 1; i < primary.length; i++) {
    const a = primary[i - 1];
    const b = primary[i];
    const dx = Math.abs(a[0] - b[0]);
    const dy = Math.abs(a[1] - b[1]);
    const dz = Math.abs(a[2] - b[2]);
    const m = dx + dy + dz;
    if (m === 0) duplicate++;
    else if (m === 1) face++;
    else diag++;
  }
  return { face, diag, duplicate };
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic ray corpus: random rays + exact integer-lattice (corner-tie) rays. */
export function makeRays(seed, count, dims) {
  const next = rng(seed);
  const rays = [];
  const nCraft = Math.max(1, Math.round(count * 0.1));
  const nRand = count - nCraft;
  const dirs = [
    [1, 1, 1], [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 2, 0],
    [2, 3, 4], [1, -1, 1], [3, 3, 1], [1, 2, 3], [2, 2, 1],
  ];
  for (let n = 0; n < nRand; n++) {
    const p0 = [next() * dims[0], next() * dims[1], next() * dims[2]];
    const u = next() * 2 - 1;
    const phi = next() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const dir = [s * Math.cos(phi), s * Math.sin(phi), u];
    const len = 3 + next() * 15;
    const p1 = [p0[0] + dir[0] * len, p0[1] + dir[1] * len, p0[2] + dir[2] * len];
    rays.push({ kind: 'random', p0, p1 });
  }
  for (let n = 0; n < nCraft; n++) {
    const base = [
      Math.floor(next() * (dims[0] - 12)) + 1,
      Math.floor(next() * (dims[1] - 12)) + 1,
      Math.floor(next() * (dims[2] - 12)) + 1,
    ];
    const p0 = [base[0] + 0.5, base[1] + 0.5, base[2] + 0.5];
    const dir = dirs[Math.floor(next() * dirs.length)];
    const reps = 2 + Math.floor(next() * 4);
    const p1 = [p0[0] + dir[0] * reps, p0[1] + dir[1] * reps, p0[2] + dir[2] * reps];
    rays.push({ kind: 'lattice', p0, p1 });
  }
  return rays;
}

export const DEFAULT_DIMS = [48, 48, 48];
export const DEFAULT_SEED = 20261117;
export const DEFAULT_RAY_COUNT = 10000;