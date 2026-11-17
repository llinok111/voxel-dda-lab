// Timing harness: 1 cold run + 1 warmup + 7 samples, median/p95/stddev per op.
// Run: node bench/bench.mjs   (writes bench/result.json)
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  DEFAULT_DIMS,
  DEFAULT_SEED,
  DEFAULT_RAY_COUNT,
  makeRays,
  traverse,
  oracleTraversal,
  sampleTraversal,
} from '../src/core.mjs';

const dims = DEFAULT_DIMS;
const rays = makeRays(DEFAULT_SEED, DEFAULT_RAY_COUNT, dims);
const oracleIdx = rays.slice(0, 250);

const ops = {
  supercover_10k: () => rays.forEach((r) => traverse(r.p0, r.p1, dims, 'supercover')),
  classic_10k: () => rays.forEach((r) => traverse(r.p0, r.p1, dims, 'single')),
  sample0p5_10k: () => rays.forEach((r) => sampleTraversal(r.p0, r.p1, dims, 0.5)),
  sample0p1_10k: () => rays.forEach((r) => sampleTraversal(r.p0, r.p1, dims, 0.1)),
  oracle_250: () => oracleIdx.forEach((r) => oracleTraversal(r.p0, r.p1, dims)),
  oracle_certify_all10k: () => rays.forEach((r) => oracleTraversal(r.p0, r.p1, dims)),
};

function timeOnce(fn) {
  const t0 = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const n = s.length;
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const med = s[Math.floor(n / 2)];
  const p95 = s[Math.min(n - 1, Math.ceil(0.95 * n) - 1)];
  const variance = s.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const relSD = mean === 0 ? 0 : Math.sqrt(variance) / mean;
  return { n, min: s[0], median: med, p95, max: s[n - 1], mean, relSD };
}

const cold = {};
const result = { dims, seed: DEFAULT_SEED, rayCount: DEFAULT_RAY_COUNT, samples: 7, ops: {} };
for (const [name, fn] of Object.entries(ops)) {
  cold[name] = timeOnce(fn);
}
for (const [name, fn] of Object.entries(ops)) {
  timeOnce(fn); // warmup
  const samples = [];
  for (let i = 0; i < 7; i++) samples.push(timeOnce(fn));
  result.ops[name] = { cold: cold[name], ...stats(samples) };
}

const speedup = (a, b) => result.ops[a].median / result.ops[b].median;
result.derived = {
  supercover_us_per_ray: (result.ops.supercover_10k.median / 10000) * 1000,
  oracle_us_per_ray: (result.ops.oracle_250.median / 250) * 1000,
  supercover_vs_oracle: result.ops.oracle_certify_all10k.median / 10000 / (result.ops.supercover_10k.median / 10000),
};

mkdirSync('bench', { recursive: true });
writeFileSync('bench/result.json', JSON.stringify(result, null, 1) + '\n');
for (const [name, v] of Object.entries(result.ops)) {
  console.log(
    `${name}: cold=${v.cold.toFixed(2)} median=${v.median.toFixed(2)} p95=${v.p95.toFixed(2)} min=${v.min.toFixed(2)} relSD=${(100 * v.relSD).toFixed(1)}%`
  );
}
console.log('wrote bench/result.json');
