// Independent reference oracle for the segment <-> voxel supercover problem.
// Deliberately a different code path (Liang-Barsky clipping per voxel) with its
// own tolerance derived from the grid bounding box, so "oracle agrees" is not
// an artifact of shared constants with src/core.mjs.
import { createHash } from 'node:crypto';

export function independentTolerance(dims, scale) {
  const diag = Math.hypot(dims[0], dims[1], dims[2]) * scale;
  return 1e-9 * diag; // different lineage from core's 1e-12 * maxCoord
}

export function independentOracle(p0w, p1w, dims, scale = 1) {
  const eps = independentTolerance(dims, scale);
  const p0 = [p0w[0] / scale, p0w[1] / scale, p0w[2] / scale];
  const p1 = [p1w[0] / scale, p1w[1] / scale, p1w[2] / scale];
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const lo = [0, 1, 2].map((a) => Math.max(0, Math.floor(Math.min(p0[a], p1[a])) - 1));
  const hi = [0, 1, 2].map((a) =>
    Math.min(dims[a] - 1, Math.floor(Math.max(p0[a], p1[a])) + 1)
  );
  const out = [];
  for (let i = lo[0]; i <= hi[0]; i++) {
    for (let j = lo[1]; j <= hi[1]; j++) {
      for (let k = lo[2]; k <= hi[2]; k++) {
        // Liang-Barsky clipping of the segment against the closed voxel box
        const min = [i, j, k];
        const max = [i + 1, j + 1, k + 1];
        let tEnter = 0;
        let tExit = 1;
        let hit = true;
        for (let a = 0; a < 3 && hit; a++) {
          if (d[a] === 0) {
            if (p0[a] < min[a] - eps || p0[a] > max[a] + eps) hit = false;
          } else {
            let ta = (min[a] - p0[a]) / d[a];
            let tb = (max[a] - p0[a]) / d[a];
            if (ta > tb) [ta, tb] = [tb, ta];
            tEnter = Math.max(tEnter, ta);
            tExit = Math.min(tExit, tb);
            if (tEnter - tExit > eps) hit = false;
          }
        }
        if (hit) out.push([i, j, k]);
      }
    }
  }
  return out;
}

export function setDiff(a, b) {
  const sb = new Set(b.map((c) => c.join(',')));
  return a.filter((c) => !sb.has(c.join(','))).map((c) => c.join(','));
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}
