// Render layer only: consumes src/core.mjs output (no geometry recomputation of
// its own beyond calling the same core functions the node harness calls).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DEFAULT_DIMS, oracleTraversal, traverse, compare } from './src/core.mjs';

const dims = DEFAULT_DIMS;
const state = { mode: 'supercover', showMissed: true, index: 0 };
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
camera.position.set(60, 45, 60);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(dims[0] / 2, dims[1] / 2, dims[2] / 2);
controls.update();

scene.add(new THREE.GridHelper(dims[0], dims[0], 0x22384d, 0x16222e));

for (let i = 0; i < dims[0]; i += 4) {
  for (let j = 0; j < dims[1]; j += 4) scene.add(cellBox([i, j, 0], 0x16222e, 0.12));
}

function cellBox(cell, color, opacity = 0.35) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5);
  return mesh;
}

const root = new THREE.Group();
scene.add(root);
const doc = await fetch('./data/rays.json').then((r) => r.json());
const ref = await fetch('./data/reference.json').then((r) => r.json());

let totals = { rays: 0, oracle: 0, missedByClassic: 0 };
for (const v of doc.viewer) {
  const or = oracleTraversal(v.p0, v.p1, dims);
  totals.rays++;
  totals.oracle += or.length;
  totals.missedByClassic += compare(traverse(v.p0, v.p1, dims, 'single'), or, dims).missed;
}

function hashCells(cells) {
  return cells.map((c) => c.join(',')).sort().join(';').length;
}

function build(index) {
  root.clear();
  const v = doc.viewer[index % doc.viewer.length];
  const lines = new THREE.LineBasicMaterial({ color: 0xffd166 });
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...v.p0),
    new THREE.Vector3(...v.p1),
  ]);
  root.add(new THREE.Line(geo, lines));

  const cells = state.mode === 'supercover' ? v.supercover : v.classic;
  for (const c of cells) root.add(cellBox(c, 0x3fa9f5, 0.30));
  if (state.showMissed) {
    for (const key of v.missedByClassic) {
      root.add(cellBox(key.split(',').map(Number), 0xff4d4d, 0.55));
    }
  }
  const oracle = oracleTraversal(v.p0, v.p1, dims);
  const cmp = compare(traverse(v.p0, v.p1, dims, state.mode), oracle, dims);
  document.getElementById('stats').textContent =
    `ray ${index % doc.viewer.length} (${v.kind})\n` +
    `oracle voxels : ${cmp.oracleCount}\n` +
    `traced        : ${cmp.candidateCount}\n` +
    `missed        : ${cmp.missed}\n` +
    `extra         : ${cmp.extra}\n` +
    `classic-missed (red): ${v.missedByClassic.length}\n` +
    `corpus: ${totals.rays} rays, ${totals.oracle} oracle voxels\n` +
    `node ref: super missed=${ref.supercoverMissed}/2000 rays\n` +
    `browser cells sorted-key checksum: ${hashCells(cells)}`;
  document.getElementById('ray-label').textContent = `${index % doc.viewer.length}/${doc.viewer.length}`;
}

document.getElementById('btn-super').onclick = () => {
  state.mode = 'supercover';
  document.getElementById('btn-super').setAttribute('aria-pressed', 'true');
  document.getElementById('btn-classic').setAttribute('aria-pressed', 'false');
  build(state.index);
};
document.getElementById('btn-classic').onclick = () => {
  state.mode = 'single';
  document.getElementById('btn-super').setAttribute('aria-pressed', 'false');
  document.getElementById('btn-classic').setAttribute('aria-pressed', 'true');
  build(state.index);
};
document.getElementById('btn-missed').onclick = (e) => {
  state.showMissed = !state.showMissed;
  e.target.setAttribute('aria-pressed', String(state.showMissed));
  build(state.index);
};
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') { state.index = (state.index + 1) % doc.viewer.length; build(state.index); }
  if (e.key === 'ArrowLeft') { state.index = (state.index + doc.viewer.length - 1) % doc.viewer.length; build(state.index); }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
build(0);
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
