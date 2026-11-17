// Baseline 1: the textbook Amanatides & Woo traversal with single-axis tie
// resolution. Runnable on its own: node baseline/classic-aw.mjs
import {
  DEFAULT_DIMS,
  DEFAULT_SEED,
  DEFAULT_RAY_COUNT,
  makeRays,
  traverse,
  oracleTraversal,
  compare,
} from '../src/core.mjs';

const dims = DEFAULT_DIMS;
const rays = makeRays(DEFAULT_SEED, DEFAULT_RAY_COUNT, dims);
let oracleVoxels = 0;
let missed = 0;
let extra = 0;
let randomMissed = 0;
let latticeMissed = 0;
for (const r of rays) {
  const or = oracleTraversal(r.p0, r.p1, dims);
  const c = compare(traverse(r.p0, r.p1, dims, 'single'), or, dims);
  oracleVoxels += or.length;
  missed += c.missed;
  extra += c.extra;
  if (r.kind === 'random') randomMissed += c.missed;
  else latticeMissed += c.missed;
}
console.log(
  `baseline classic-aw: ${rays.length} rays, ${oracleVoxels} oracle voxels -> ` +
    `missed=${missed} (${((100 * missed) / oracleVoxels).toFixed(2)}%), extra=${extra}`
);
console.log(`  random rays: missed=${randomMissed}; lattice (corner-tie) rays: missed=${latticeMissed}`);
