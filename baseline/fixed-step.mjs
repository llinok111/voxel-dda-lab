// Baseline 2: fixed-step point sampling along the segment.
// Runnable on its own: node baseline/fixed-step.mjs [step]
import {
  DEFAULT_DIMS,
  DEFAULT_SEED,
  DEFAULT_RAY_COUNT,
  makeRays,
  sampleTraversal,
  oracleTraversal,
  compare,
} from '../src/core.mjs';

const step = Number(process.argv[2] ?? 0.1);
const dims = DEFAULT_DIMS;
const rays = makeRays(DEFAULT_SEED, DEFAULT_RAY_COUNT, dims);
const idx = Array.from({ length: 2000 }, (_, i) => Math.floor((i * rays.length) / 2000));
let oracleVoxels = 0;
let missed = 0;
let extra = 0;
let samples = 0;
for (const i of idx) {
  const r = rays[i];
  const or = oracleTraversal(r.p0, r.p1, dims);
  const c = compare(sampleTraversal(r.p0, r.p1, dims, step), or, dims);
  oracleVoxels += or.length;
  missed += c.missed;
  extra += c.extra;
  const len = Math.hypot(r.p1[0] - r.p0[0], r.p1[1] - r.p0[1], r.p1[2] - r.p0[2]);
  samples += Math.ceil(len / step) + 1;
}
console.log(
  `baseline fixed-step (step=${step}): ${idx.length} rays, ${oracleVoxels} oracle voxels -> ` +
    `missed=${missed} (${((100 * missed) / oracleVoxels).toFixed(2)}%), extra=${extra}, ${samples} samples`
);
