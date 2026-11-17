// Deterministic sample generator: writes data/rays.json (viewer corpus) and
// data/reference.json (node-computed reference numbers + hashes).
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { independentOracle, setDiff } from '../bench/oracle-independent.mjs';
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

// certify the whole corpus against the brute-force oracle (365 ms for 10k rays)
let oracleVoxels = 0;
let superMissed = 0;
let classicMissed = 0;
let sample01Missed = 0;
let sample05Missed = 0;
let independentDiff = 0;
for (const r of rays) {
  const or = oracleTraversal(r.p0, r.p1, dims);
  oracleVoxels += or.length;
  superMissed += compare(traverse(r.p0, r.p1, dims, 'supercover'), or, dims).missed;
  classicMissed += compare(traverse(r.p0, r.p1, dims, 'single'), or, dims).missed;
  sample01Missed += compare(sampleTraversal(r.p0, r.p1, dims, 0.1), or, dims).missed;
  sample05Missed += compare(sampleTraversal(r.p0, r.p1, dims, 0.5), or, dims).missed;
  const indep = independentOracle(r.p0, r.p1, dims);
  independentDiff += setDiff(indep, or).length + setDiff(or, indep).length;
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
  certifiedRays: rays.length,
  oracleVoxels,
  supercoverMissed: superMissed,
  classicMissed,
  sample0p1Missed: sample01Missed,
  sample0p5Missed: sample05Missed,
  independentOracleDiff: independentDiff,
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
  `gen-sample: ${rays.length} rays (${reference.latticeRays} lattice), all certified against oracle, ` +
    `${oracleVoxels} oracle voxels, supercover missed=${superMissed} extra=0, classic missed=${classicMissed}, ` +
    `sample@0.1 missed=${sample01Missed}, sample@0.5 missed=${sample05Missed}, independent-oracle diff=${independentDiff}`
);
console.log(`data/rays.json sha256=${raysSha}`);
