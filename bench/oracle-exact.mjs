// Third, tolerance-free oracle. For rays whose coordinates are integer or
// half-integer (the lattice corpus), doubling every coordinate makes them exact
// integers, and the slab test can then be done with exact rational (BigInt)
// arithmetic: no floating point, no shared EPS with src/core.mjs.
export function exactOracleLattice(p0, p1, dims) {
  const toInt = (v) => {
    const x = Math.round(v * 2);
    if (Math.abs(v * 2 - x) > 1e-12) throw new Error('lattice ray needs half-integer coordinates');
    return BigInt(x);
  };
  const P0 = [toInt(p0[0]), toInt(p0[1]), toInt(p0[2])];
  const P1 = [toInt(p1[0]), toInt(p1[1]), toInt(p1[2])];
  const D = [P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]];
  const cmp = (a, b, c, d) => {
    // compare a/b vs c/d with b,d > 0
    const l = a * d;
    const r = c * b;
    return l < r ? -1 : l > r ? 1 : 0;
  };
  const out = [];
  const lo = [0, 1, 2].map((a) => Math.max(0, Math.floor(Math.min(p0[a], p1[a])) - 1));
  const hi = [0, 1, 2].map((a) => Math.min(dims[a] - 1, Math.floor(Math.max(p0[a], p1[a])) + 1));
  for (let i = lo[0]; i <= hi[0]; i++) {
    for (let j = lo[1]; j <= hi[1]; j++) {
      for (let k = lo[2]; k <= hi[2]; k++) {
        const cell = [i, j, k];
        let enterN = 0n;
        let enterD = 1n;
        let exitN = 1n;
        let exitD = 1n;
        let ok = true;
        for (let a = 0; a < 3 && ok; a++) {
          const min = BigInt(2 * cell[a]);
          const max = min + 2n;
          if (D[a] === 0n) {
            if (P0[a] < min || P0[a] > max) ok = false;
            continue;
          }
          let n1 = min - P0[a];
          let n2 = max - P0[a];
          let den = D[a];
          if (den < 0n) {
            den = -den;
            const t = n1;
            n1 = -n2;
            n2 = -t;
          }
          if (cmp(n1, den, enterN, enterD) > 0) {
            enterN = n1;
            enterD = den;
          }
          if (cmp(n2, den, exitN, exitD) < 0) {
            exitN = n2;
            exitD = den;
          }
          if (cmp(enterN, enterD, exitN, exitD) > 0) ok = false;
        }
        if (ok && cmp(exitN, exitD, 0n, 1n) >= 0 && cmp(enterN, enterD, 1n, 1n) <= 0) {
          out.push(cell);
        }
      }
    }
  }
  return out;
}
