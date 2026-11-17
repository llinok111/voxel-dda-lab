// Deterministic sample generator: writes data/rays.json (viewer corpus) and
// data/reference.json (node-computed reference numbers + hashes).
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  DEFAULT_DIMS,
  DEFAULT_SEED,
  DEFAULT_RAY_COUNT,
  makeRays,
  traverse,
  oracleTraversal,
  sampleTraversal,
  compare,
} from '../src/core.mjs';

const dims = DEFAULT_DIMS;
const rays = makeRays(DEFAULT_SEED, DEFAULT_RAY_COUNT, dims);

// certification subset: 2000 evenly spaced rays (oracle is O(bbox volume))
const subsetIdx = Array.from({ length: 2000 }, (_, i) => Math.floor((i * rays.length) / 2000));
let oracleVoxels = 0;
let superMissed = 0;
let classicMissed = 0;
let sampleMissed = 0;
for (const i of subsetIdx) {
  const r = rays[i];
  const or = oracleTraversal(r.p0, r.p1, dims);
  oracleVoxels += or.length;
  superMissed += compare(traverse(r.p0, r.p1, dims, 'supercover'), or, dims).missed;
  classicMissed += compare(traverse(r.p0, r.p1, dims, 'single'), or, dims).missed;
  sampleMissed += compare(sampleTraversal(r.p0, r.p1, dims, 0.1), or, dims).missed;
}

// viewer corpus: a small deterministic slice, traced with the same core
const viewerIdx = Array.from({ length: 48 }, (_, i) => Math.floor((i * rays.length) / 48));
const viewer = viewerIdx.map((i) => {
  const r = rays[i];
  const or = oracleTraversal(r.p0, r.p1, dims);
  return {
    kind: r.kind,
    p0: r.p0,
    p1: r.p1,
    supercover: traverse(r.p0, r.p1, dims, 'supercover').cells,
    classic: traverse(r.p0, r.p1, dims, 'single').cells,
    missedByClassic: compare(traverse(r.p0, r.p1, dims, 'single'), or, dims).missedSample,
  };
});

const raysDoc = { dims, seed: DEFAULT_SEED, count: rays.length, viewer };
const raysJson = JSON.stringify(raysDoc, null, 1) + '\n';
const raysSha = createHash('sha256').update(raysJson).digest('hex');

const reference = {
  dims,
  seed: DEFAULT_SEED,
  rayCount: rays.length,
  latticeRays: rays.filter((r) => r.kind === 'lattice').length,
  certificationRays: subsetIdx.length,
  oracleVoxels,
  supercoverMissed: superMissed,
  classicMissed,
  sample0p1Missed: sampleMissed,
  diagonalWitness: {
    p0: [0.5, 0.5, 0.5],
    p1: [3.5, 3.5, 3.5],
    oracle: oracleTraversal([0.5, 0.5, 0.5], [3.5, 3.5, 3.5], dims).length,
    supercover: traverse([0.5, 0.5, 0.5], [3.5, 3.5, 3.5], dims, 'supercover').cells.length,
    classic: traverse([0.5, 0.5, 0.5], [3.5, 3.5, 3.5], dims, 'single').cells.length,
    sample0p5: sampleTraversal([0.5, 0.5, 0.5], [3.5, 3.5, 3.5], dims, 0.5).length,
  },
  raysSha256: raysSha,
};

mkdirSync('data', { recursive: true });
writeFileSync('data/rays.json', raysJson);
writeFileSync('data/reference.json', JSON.stringify(reference, null, 1) + '\n');
console.log(
  `gen-sample: ${rays.length} rays (${reference.latticeRays} lattice), ` +
    `${subsetIdx.length} certified against oracle, ${oracleVoxels} oracle voxels, ` +
    `supercover missed=${superMissed} classic missed=${classicMissed} sample@0.1 missed=${sampleMissed}`
);
console.log(`data/rays.json sha256=${raysSha}`);
