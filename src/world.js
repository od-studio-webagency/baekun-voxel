// Orchestrator: owns colliders/spawns/signs API and assembles the three
// voxel volumes built by src/detail.js. All units are metres.
import * as THREE from 'three';
import { VoxelVolume, createVoxelMaterials, getGlowMaterial, meshVolume } from './voxel.js';
import { C, FENCE, FIELD, POND, PARKING, buildDetail } from './detail.js';

export { FENCE, FIELD };

const LINE_Y = 2.02;
const LINE_W = 0.15;

function debugOn() {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1';
  } catch (err) {
    return false;
  }
}

function signTexture(text, bg, fg, opts) {
  const o = opts || {};
  const vertical = !!o.vertical;
  const border = o.border !== false;
  const c = document.createElement('canvas');
  c.width = o.cw || (vertical ? 320 : 1024);
  c.height = o.ch || (vertical ? 1280 : 280);
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  const face = '"Noto Sans CJK KR", "Noto Sans CJK", NanumGothic, "Gothic A1", "Malgun Gothic", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (border) {
    const bw = o.bw || Math.max(6, Math.round(Math.min(c.width, c.height) * 0.045));
    g.fillStyle = fg;
    g.fillRect(0, 0, c.width, bw);
    g.fillRect(0, c.height - bw, c.width, bw);
    g.fillRect(0, 0, bw, c.height);
    g.fillRect(c.width - bw, 0, bw, c.height);
  }
  g.fillStyle = fg;
  if (vertical) {
    const chars = Array.from(text);
    const pad = border ? 28 : 12;
    const cell = (c.height - pad * 2) / Math.max(1, chars.length);
    let size = Math.floor(cell * 0.72);
    g.font = `700 ${size}px ${face}`;
    const maxW = c.width - 40;
    while (size > 16 && chars.some((ch) => g.measureText(ch).width > maxW)) {
      size -= 2;
      g.font = `700 ${size}px ${face}`;
    }
    chars.forEach((ch, i) => {
      g.fillText(ch, c.width / 2, pad + cell * (i + 0.5));
    });
  } else {
    const pad = border ? 36 : 16;
    let size = o.size || 168;
    do {
      g.font = `700 ${size}px ${face}`;
      if (g.measureText(text).width <= c.width - pad * 2) break;
      size -= 4;
    } while (size > 18);
    g.fillText(text, c.width / 2, c.height / 2 + 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function addSign(scene, text, bg, fg, w, h, x, y, z, rotY, opts) {
  const o = opts || {};
  const mat = new THREE.MeshBasicMaterial({
    map: signTexture(text, bg, fg, o),
    side: o.double ? THREE.DoubleSide : THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  mesh.frustumCulled = false;
  scene.add(mesh);
}

export function createWorld(scene, renderer) {
  const t0 = performance.now();
  const colliders = [];
  const avoid = [];

  const fine = new VoxelVolume(0.25);
  const ground = new VoxelVolume(0.5);
  const coarse = new VoxelVolume(2);
  const trees = new VoxelVolume(0.5);
  const mtn = new VoxelVolume(4);
  for (const col of [C.glass, C.glassDark, C.glassLight]) fine.flagGlass(col);
  for (const col of [C.litPane, C.litPane2, C.lampGlow, C.signGlow, C.lobby]) fine.flagEmissive(col);
  ground.flagGlass(C.water);

  function aabb(x0, z0, x1, z1, y0, y1) {
    colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, minY: y0, maxY: y1 });
  }

  function avoidRect(x0, z0, x1, z1, pad) {
    avoid.push({ x0: x0 - pad, z0: z0 - pad, x1: x1 + pad, z1: z1 + pad });
  }

  function isAvoid(x, z) {
    if (x <= FENCE.x + 2 || x >= FENCE.x2 || z <= FENCE.z + 2 || z >= FENCE.z2) return true;
    for (const r of avoid) {
      if (x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) return true;
    }
    return false;
  }

  avoidRect(POND.x0, POND.z0, POND.x1, POND.z1, 2);
  avoidRect(FIELD.x0 - 8, FIELD.z0 - 8, FIELD.x1 + 8, FIELD.z1 + 8, 2);
  avoidRect(-86, -24, -44, -10, 0); // gate walk stays clear of trees
  avoidRect(PARKING.x0, PARKING.z0, PARKING.x1, PARKING.z1, 0);

  buildDetail({ fine, ground, coarse, trees, mtn, aabb, avoidRect, isAvoid });

  const mats = createVoxelMaterials(renderer);
  const t1 = performance.now();
  // Baked per-vertex AO splits greedy quads ~2x on 0.25 m detail and is barely
  // visible next to shadows + the surface pattern shader: keep it on terrain only.
  fine.noAO = true;
  trees.noAO = true;
  ground.regionSize = 128;
  coarse.regionSize = 256;
  trees.regionSize = 96;
  const a = meshVolume(ground, mats.ground, scene);
  const b = meshVolume(fine, mats.opaque, scene);
  const c = meshVolume(coarse, mats.plain, scene);
  const d = meshVolume(trees, mats.plain, scene);
  mtn.regionSize = 1024;
  const e = meshVolume(mtn, mats.plain, scene);
  const stats = {
    meshes: a.meshes + b.meshes + c.meshes + d.meshes + e.meshes,
    quads: a.quads + b.quads + c.quads + d.quads + e.quads,
    tris: a.tris + b.tris + c.tris + d.tris + e.tris,
  };
  addFieldLines(scene);
  addSigns(scene);
  if (typeof window !== 'undefined') window.__voxelColors = fine.colorCount;
  if (debugOn()) {
    console.info(
      `[world] build ${(t1 - t0).toFixed(0)} ms + mesh ${(performance.now() - t1).toFixed(0)} ms; ` +
      `${stats.tris} tris, ${stats.meshes} voxel meshes`,
    );
  }

  const spawns = [];
  const pushSpawn = (mx, mz) => spawns.push(new THREE.Vector3(mx, 2, mz));
  for (let z = -86; z <= 72; z += 10) {
    pushSpawn(-84, z);
    pushSpawn(100, z);
  }
  for (let x = -80; x <= 96; x += 10) {
    pushSpawn(x, 76);
    pushSpawn(x, -88);
  }
  pushSpawn(-84, -20);

  const gate = new THREE.Vector3(FENCE.x + 5, 2, (FENCE.gap0 + FENCE.gap1) / 2);

  function canSpawn(x, z) {
    if (x < FENCE.x + 3 || x > FENCE.x2 - 3 || z < FENCE.z + 3 || z > FENCE.z2 - 3) return false;
    if (x > POND.x0 - 1.2 && x < POND.x1 + 1.2 && z > POND.z0 - 1.2 && z < POND.z1 + 1.2) return false;
    return true;
  }

  const glow = getGlowMaterial(mats.opaque);

  return {
    colliders,
    spawns,
    gate,
    spawn: new THREE.Vector3(1, 2, 41),
    canSpawn,
    fine,
    ground,
    volumes: [coarse, ground, fine],
    voxelMeshes: stats.meshes,
    voxelTris: stats.tris,
    setWindowGlow(intensity, color) {
      const i = Math.max(0, Math.min(1, Number(intensity) || 0));
      glow.emissive.setHex(typeof color === 'number' ? color : 0xffc56b);
      glow.emissiveIntensity = i * 1.6;
    },
  };
}

function addFieldLines(scene) {
  const { x0, z0, x1, z1 } = FIELD;
  const verts = [];
  function quad(ax, az, bx, bz, cx, cz, dx, dz) {
    verts.push(ax, LINE_Y, az, bx, LINE_Y, bz, cx, LINE_Y, cz);
    verts.push(ax, LINE_Y, az, cx, LINE_Y, cz, dx, LINE_Y, dz);
  }
  function hseg(ax, az, bx, bz, w) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const px = (-dz / len) * (w / 2);
    const pz = (dx / len) * (w / 2);
    quad(ax + px, az + pz, bx + px, bz + pz, bx - px, bz - pz, ax - px, az - pz);
  }
  function rectLoop(xa, za, xb, zb, w, closed) {
    hseg(xa, za, xb, za, w);
    hseg(xb, za, xb, zb, w);
    hseg(xb, zb, xa, zb, w);
    if (closed !== false) hseg(xa, zb, xa, za, w);
  }
  rectLoop(x0 - 2, z0 - 2, x1 + 2, z1 + 2, LINE_W, true);
  rectLoop(x0 - 8, z0 - 8, x1 + 8, z1 + 8, LINE_W, true);
  const midX = 0;
  const midZ = (z0 + z1) / 2;
  hseg(midX, z0, midX, z1, LINE_W);
  const seg = 44;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const ri = 7.6 - LINE_W / 2;
    const ro = 7.6 + LINE_W / 2;
    quad(
      midX + Math.cos(a0) * ri, midZ + Math.sin(a0) * ri,
      midX + Math.cos(a1) * ri, midZ + Math.sin(a1) * ri,
      midX + Math.cos(a1) * ro, midZ + Math.sin(a1) * ro,
      midX + Math.cos(a0) * ro, midZ + Math.sin(a0) * ro,
    );
  }
  rectLoop(x0 + 2, midZ - 8, x0 + 10, midZ + 10, LINE_W, false);
  rectLoop(x1 - 10, midZ - 8, x1 - 2, midZ + 10, LINE_W, false);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: C.white, side: THREE.DoubleSide }));
  scene.add(mesh);
}

function addSigns(scene) {
  // 신관 rooftop sign (west-facing, backed by the voxel board built in detail.js)
  addSign(scene, '광양백운고등학교', '#efe6d2', '#23324a', 18, 2.3, -6.18, 23.2, -26, Math.PI / 2, { bw: 10 });
  // 본관 portal parapet sign facing the field
  addSign(scene, '광양백운고등학교', '#efe6d2', '#23324a', 9.4, 2.2, 1, 18.2, 4.56, 0, { bw: 10 });
  addSign(scene, '과학중점학교', '#23324a', '#efe6d2', 3.4, 1.05, -6.2, 2.55, -27, Math.PI / 2, { cw: 768, ch: 220, bw: 8 });
  addSign(scene, '백운관', '#a33a2e', '#ffffff', 6, 1.8, 7, 3.5, -61.86, 0, { bw: 12 });
  addSign(scene, '광양백운고등학교', '#2e4451', '#e7eef0', 1.15, 4.8, -88.06, 5.2, -23.2, -Math.PI / 2, { vertical: true, bw: 10 });
  // Stylized stand-in: the real slogan plate hangs on a stainless pipe frame at a side
  // entrance (photo 07), not between the main-gate pillars. Hung here so the gate view reads.
  addSign(
    scene,
    '꿈을 향해 끊임없이 도전하는 광양백운고등학교',
    '#ffffff',
    '#1e7a3a',
    9.4,
    1.15,
    -87.2,
    7.05,
    -19,
    -Math.PI / 2,
    { cw: 2048, ch: 256, bw: 8 },
  );
  // Back face (readable from inside the campus, not mirrored).
  addSign(scene, '꿈을 향해 끊임없이 도전하는 광양백운고등학교', '#ffffff', '#1e7a3a', 9.4, 1.15, -87.1, 7.05, -19, Math.PI / 2, { cw: 2048, ch: 256, bw: 8 });
}
