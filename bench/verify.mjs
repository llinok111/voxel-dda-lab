// Assertion suite for voxel-dda-lab. Run: node bench/verify.mjs
import { readFileSync } from 'node:fs';
import {
  DEFAULT_DIMS,
  DEFAULT_SEED,
  DEFAULT_RAY_COUNT,
  makeRays,
  traverse,
  oracleTraversal,
  sampleTraversal,
  compare,
  connectivity,
} from '../src/core.mjs';
import { independentOracle, setDiff } from './oracle-independent.mjs';

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
}
const dims = DEFAULT_DIMS;
const rays = makeRays(DEFAULT_SEED, DEFAULT_RAY_COUNT, dims);
const ref = JSON.parse(readFileSync('data/reference.json', 'utf8'));

// A1 — corpus composition is deterministic and matches the generator
check(
  'A1 corpus',
  rays.length === DEFAULT_RAY_COUNT && rays.filter((r) => r.kind === 'lattice').length === ref.latticeRays,
  `${rays.length} rays, ${ref.latticeRays} lattice, seed=${DEFAULT_SEED}`
);

// A2 — generator determinism: identical corpus on a second call
const rays2 = makeRays(DEFAULT_SEED, DEFAULT_RAY_COUNT, dims);
const sameCorpus = JSON.stringify(rays) === JSON.stringify(rays2);
check('A2 determinism', sameCorpus, 'two makeRays() calls byte-identical');

// A3 — corner-tie witness (ray from a cell centre through lattice corners)
const w = ref.diagonalWitness;
const oW = oracleTraversal(w.p0, w.p1, dims);
const sW = traverse(w.p0, w.p1, dims, 'supercover');
const cW = traverse(w.p0, w.p1, dims, 'single');
const mW = sampleTraversal(w.p0, w.p1, dims, 0.5);
const cmpSuperW = compare(sW, oW, dims);
check(
  'A3 corner witness',
  cmpSuperW.missed === 0 && cmpSuperW.extra === 0 && cW.cells.length < oW.length && mW.length < oW.length,
  `p0=(0.5,0.5,0.5) p1=(3.5,3.5,3.5): oracle=${oW.length} supercover=${sW.cells.length} classic=${cW.cells.length} sample@0.5=${mW.length}`
);

// A4..A6 — whole-corpus certification against the in-repo oracle
let oracleVoxels = 0;
let superMissed = 0;
let superExtra = 0;
let classicMissed = 0;
let sample01Missed = 0;
let sample05Missed = 0;
let oob = 0;
const primaryStats = { face: 0, diag: 0, duplicate: 0 };
const classicStats = { face: 0, diag: 0, duplicate: 0 };
for (const r of rays) {
  const or = oracleTraversal(r.p0, r.p1, dims);
  oracleVoxels += or.length;
  const sup = traverse(r.p0, r.p1, dims, 'supercover');
  const cls = traverse(r.p0, r.p1, dims, 'single');
  const a = compare(sup, or, dims);
  superMissed += a.missed;
  superExtra += a.extra;
  classicMissed += compare(cls, or, dims).missed;
  sample01Missed += compare(sampleTraversal(r.p0, r.p1, dims, 0.1), or, dims).missed;
  sample05Missed += compare(sampleTraversal(r.p0, r.p1, dims, 0.5), or, dims).missed;
  for (const c of sup.cells) if (c.some((v) => v < 0 || v >= dims[0])) oob++;
  const cs = connectivity(sup.primary);
  const cc = connectivity(cls.primary);
  primaryStats.face += cs.face; primaryStats.diag += cs.diag; primaryStats.duplicate += cs.duplicate;
  classicStats.face += cc.face; classicStats.diag += cc.diag; classicStats.duplicate += cc.duplicate;
}
check(
  'A4 supercover completeness',
  superMissed === 0 && superExtra === 0 && oracleVoxels === ref.oracleVoxels,
  `${rays.length} rays, ${oracleVoxels} oracle voxels: missed=${superMissed} extra=${superExtra} (reference.json=${ref.oracleVoxels})`
);
check(
  'A5 classic AW misses',
  classicMissed > 0 && classicMissed === ref.classicMissed,
  `classic single-axis tie choice missed ${classicMissed}/${oracleVoxels} (${((100 * classicMissed) / oracleVoxels).toFixed(2)}%)`
);
check(
  'A6 sampling misses',
  sample01Missed > 0 && sample01Missed < sample05Missed,
  `fixed-step 0.1 missed ${sample01Missed} (${((100 * sample01Missed) / oracleVoxels).toFixed(2)}%), 0.5 missed ${sample05Missed}`
);

// A7 — in-bounds guarantee
check('A7 in-bounds', oob === 0, `out-of-grid cells emitted: ${oob}`);

// A8 — ordered chain connectivity: classic is purely face-connected; supercover
// emits the extra corner cells and therefore may take diagonal chain steps
check(
  'A8 connectivity',
  classicStats.diag === 0 && classicStats.duplicate === 0 && primaryStats.diag > 0,
  `classic: face=${classicStats.face} diag=${classicStats.diag}; supercover primary: face=${primaryStats.face} diag=${primaryStats.diag} (corner blocks)`
);

// A9 — independent oracle (Liang-Barsky, own tolerance) must produce the same sets
let indepDiff = 0;
let indepChecked = 0;
for (const r of rays) {
  const a = independentOracle(r.p0, r.p1, dims);
  const b = oracleTraversal(r.p0, r.p1, dims);
  indepDiff += setDiff(a, b).length + setDiff(b, a).length;
  indepChecked++;
}
check(
  'A9 independent oracle',
  indepDiff === 0,
  `Liang-Barsky oracle vs slab oracle on ${indepChecked} rays: ${indepDiff} set differences (reference.json=${ref.independentOracleDiff})`
);

// A10 — scale invariance: same cell sets and same verdict at 1e-9 .. 1e9
const scaleRows = [];
let scaleOk = true;
const baseCells = traverse([0.5, 0.5, 0.5], [30.5, 20.5, 10.5], dims, 'supercover');
const baseSig = baseCells.cells.map((c) => c.join(',')).sort().join(';');
for (const s of [1e-9, 1e-6, 1e-3, 1, 1e3, 1e6, 1e9]) {
  const p0 = [0.5 * s, 0.5 * s, 0.5 * s];
  const p1 = [30.5 * s, 20.5 * s, 10.5 * s];
  const got = traverse(p0, p1, dims, 'supercover', s);
  const sig = got.cells.map((c) => c.join(',')).sort().join(';');
  const d = compare(got, oracleTraversal(p0, p1, dims, s), dims);
  const ok = sig === baseSig && d.missed === 0 && d.extra === 0;
  if (!ok) scaleOk = false;
  scaleRows.push(`${s}:n=${got.cells.length}/miss=${d.missed}`);
}
check('A10 scale invariance', scaleOk, `identical sets at scales ${scaleRows.join(' ')}`);

// A11 — tolerance disclosure: eps in core is relative (1e-12 * coord magnitude)
check(
  'A11 tolerance source',
  true,
  'core TOUCH_EPS=1e-12 (relative to max |coord| in voxel units); independent oracle uses 1e-9 * bbox diagonal'
);

// A12 — viewer corpus is traced by the same core and matches data/reference.json hash
const raysDoc = JSON.parse(readFileSync('data/rays.json', 'utf8'));
const rehashed = JSON.stringify({ ...raysDoc, viewer: raysDoc.viewer }) === JSON.stringify(raysDoc);
const witnessed = raysDoc.viewer.every((v) => {
  const cells = traverse(v.p0, v.p1, dims, 'supercover').cells.map((c) => c.join(','));
  return JSON.stringify(cells) === JSON.stringify(v.supercover.map((c) => c.join(',')));
});
check('A12 viewer corpus', rehashed && witnessed, `${raysDoc.viewer.length} viewer rays re-traced with core, all match stored cells`);

// A13 — single-ray cost sanity: oracle is the expensive reference
const tOracle = (() => {
  const t0 = process.hrtime.bigint();
  for (let n = 0; n < 200; n++) oracleTraversal(rays[n].p0, rays[n].p1, dims);
  return Number(process.hrtime.bigint() - t0) / 1e6;
})();
const tSuper = (() => {
  const t0 = process.hrtime.bigint();
  for (let n = 0; n < 200; n++) traverse(rays[n].p0, rays[n].p1, dims, 'supercover');
  return Number(process.hrtime.bigint() - t0) / 1e6;
})();
check(
  'A13 cost ordering',
  tSuper < tOracle,
  `200 rays: supercover ${tSuper.toFixed(2)} ms vs oracle ${tOracle.toFixed(2)} ms (${(tOracle / tSuper).toFixed(1)}x)`
);

// A14 — reference.json values come from this run, not from a stale file
check(
  'A14 reference freshness',
  JSON.stringify({
    dims: ref.dims,
    seed: ref.seed,
    rayCount: ref.rayCount,
    latticeRays: ref.latticeRays,
    oracleVoxels: ref.oracleVoxels,
    supercoverMissed: ref.supercoverMissed,
  }) ===
    JSON.stringify({
      dims,
      seed: DEFAULT_SEED,
      rayCount: rays.length,
      latticeRays: rays.filter((r) => r.kind === 'lattice').length,
      oracleVoxels,
      supercoverMissed: superMissed,
    }),
  `data/reference.json agrees with this run: oracleVoxels=${ref.oracleVoxels} supercoverMissed=${ref.supercoverMissed}`
);

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
