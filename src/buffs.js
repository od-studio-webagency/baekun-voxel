// Buff orbs: glowing pickups that grant timed buffs (멀티샷, 래피드파이어,
// 관통 화살, 폭발 화살, 슬로모션, 힐), HUD pills, sky-mode reactions.
import * as THREE from 'three';

export const BUFF_DEFS = {
  multishot: { name: '멀티샷', icon: '🏹', color: 0xffd25e, dur: 9, sky: 'golden' },
  rapid: { name: '래피드파이어', icon: '⚡', color: 0xffe94a, dur: 9, sky: 'golden' },
  pierce: { name: '관통 화살', icon: '🎯', color: 0x5ee8ff, dur: 9, sky: 'aurora' },
  explosive: { name: '폭발 화살', icon: '💥', color: 0xff6a3d, dur: 9, sky: 'red' },
  slowmo: { name: '슬로모션', icon: '🌀', color: 0x9a6bff, dur: 8, sky: 'aurora' },
  heal: { name: '힐', icon: '💚', color: 0x5eff9a, dur: 0, sky: 'heal' },
};

const ALIASES = {};
for (const [id, d] of Object.entries(BUFF_DEFS)) ALIASES[d.name] = id;

const MAX_ORBS = 6;
const MAX_RINGS = 8;
const ORB_FIELD = { x0: -44, x1: 46, z0: 16, z1: 66 };
const ORB_INTERVAL = 15;
const PICKUP_R = 1.6;
const HEAL_SKY_TIME = 2;

const ORB_FIELD_IDS = Object.keys(BUFF_DEFS);

const HALO_VERT = /* glsl */`
attribute float aSize;
attribute vec3 aCol;
uniform float uTime;
varying vec3 vC;
varying float vA;
void main() {
  vC = aCol;
  vA = 0.75 + 0.25 * sin(uTime * 2.4 + position.x * 3.1 + position.z * 1.7);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (160.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const HALO_FRAG = /* glsl */`
precision mediump float;
uniform sampler2D uMap;
varying vec3 vC;
varying float vA;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vC * t.rgb, t.a * vA);
}
`;

function softSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBuffs(opts) {
  const { scene, camera, player, sky, hooks } = opts;
  const tmpC = new THREE.Color();
  const dummy = new THREE.Object3D();
  const tmpV = new THREE.Vector3();

  // --- orb visuals: instanced cores + instanced light beams + one halo Points ---
  const cores = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.55, 0.55, 0.55),
    new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }),
    MAX_ORBS,
  );
  cores.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ORBS * 3), 3);
  cores.frustumCulled = false;
  cores.count = 0;
  scene.add(cores);

  const beams = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.16, 0.4, 9, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    }),
    MAX_ORBS,
  );
  beams.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ORBS * 3), 3);
  beams.frustumCulled = false;
  beams.count = 0;
  scene.add(beams);

  const hGeo = new THREE.BufferGeometry();
  const hPos = new Float32Array(MAX_ORBS * 3);
  const hSize = new Float32Array(MAX_ORBS);
  const hCol = new Float32Array(MAX_ORBS * 3);
  hGeo.setAttribute('position', new THREE.BufferAttribute(hPos, 3).setUsage(THREE.DynamicDrawUsage));
  hGeo.setAttribute('aSize', new THREE.BufferAttribute(hSize, 1).setUsage(THREE.DynamicDrawUsage));
  hGeo.setAttribute('aCol', new THREE.BufferAttribute(hCol, 3).setUsage(THREE.DynamicDrawUsage));
  hGeo.setDrawRange(0, 0);
  const halos = new THREE.Points(hGeo, new THREE.ShaderMaterial({
    vertexShader: HALO_VERT,
    fragmentShader: HALO_FRAG,
    uniforms: { uTime: { value: 0 }, uMap: { value: softSprite() } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  }));
  halos.frustumCulled = false;
  scene.add(halos);

  // --- explosion rings (instanced, flat on the ground) ---
  const rings = new THREE.InstancedMesh(
    new THREE.RingGeometry(0.82, 1.0, 36),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    }),
    MAX_RINGS,
  );
  rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_RINGS * 3), 3);
  rings.frustumCulled = false;
  rings.count = 0;
  scene.add(rings);
  const ringAnims = [];
  for (let i = 0; i < MAX_RINGS; i++) ringAnims.push({ on: false, x: 0, y: 0, z: 0, t: 0, max: 0.5, r: 1, g: 0.6, b: 0.3 });

  // --- DOM: pills + orb labels + vignettes ---
  const hud = document.createElement('div');
  hud.id = 'buffs-hud';
  document.body.appendChild(hud);
  const pills = {};
  for (const [id, d] of Object.entries(BUFF_DEFS)) {
    if (!d.dur) continue;
    const el = document.createElement('div');
    el.className = 'buff-pill';
    el.style.setProperty('--bc', `#${d.color.toString(16).padStart(6, '0')}`);
    el.innerHTML = `<span class="bp-name">${d.icon} ${d.name}</span><span class="bp-time"><i></i></span>`;
    el.style.display = 'none';
    hud.appendChild(el);
    pills[id] = { el, bar: el.querySelector('.bp-time i') };
  }
  const slowmoVig = document.createElement('div');
  slowmoVig.id = 'slowmo-vig';
  document.body.appendChild(slowmoVig);
  const healFlash = document.createElement('div');
  healFlash.id = 'heal-flash';
  document.body.appendChild(healFlash);
  let healFlashA = 0;

  const labelEls = [];
  for (let i = 0; i < MAX_ORBS; i++) {
    const el = document.createElement('div');
    el.className = 'orb-label';
    el.style.display = 'none';
    document.body.appendChild(el);
    labelEls.push(el);
  }

  const orbs = [];
  for (let i = 0; i < MAX_ORBS; i++) {
    orbs.push({ on: false, id: 'heal', x: 0, z: 0, y: 0, phase: 0, label: labelEls[i] });
  }
  const active = new Map(); // id -> { remaining, dur }
  let lastTimed = null;
  let healT = 0;
  let lastDesired = 'night';
  let orbTimer = 6;
  let time = 0;

  function resolve(idOrName) {
    if (BUFF_DEFS[idOrName]) return idOrName;
    return ALIASES[idOrName] || null;
  }

  function desiredMode() {
    if (healT > 0) return 'heal';
    if (lastTimed && active.has(lastTimed)) return BUFF_DEFS[lastTimed].sky;
    for (const id of active.keys()) return BUFF_DEFS[id].sky;
    return 'night';
  }

  function syncSky() {
    const d = desiredMode();
    if (d !== lastDesired) {
      lastDesired = d;
      sky.setMode(d);
    }
  }

  function apply(id) {
    const def = BUFF_DEFS[id];
    if (id === 'heal') {
      hooks.heal(40);
      healT = HEAL_SKY_TIME;
      healFlashA = 0.85;
    } else {
      const cur = active.get(id);
      if (cur) cur.remaining = def.dur;
      else active.set(id, { remaining: def.dur, dur: def.dur });
      lastTimed = id;
    }
    hooks.banner(`${def.icon} ${def.name}!`, 1.2);
    syncSky();
  }

  function spawn(idOrName, x, z) {
    const orb = orbs.find((o) => !o.on);
    if (!orb) return false;
    let id = resolve(idOrName);
    if (!id) id = ORB_FIELD_IDS[(Math.random() * ORB_FIELD_IDS.length) | 0];
    let px = Number.isFinite(x) ? x : ORB_FIELD.x0 + Math.random() * (ORB_FIELD.x1 - ORB_FIELD.x0);
    let pz = Number.isFinite(z) ? z : ORB_FIELD.z0 + Math.random() * (ORB_FIELD.z1 - ORB_FIELD.z0);
    for (let i = 0; i < 14 && hooks.isBlocked(px, pz, 0.7); i++) {
      px = ORB_FIELD.x0 + Math.random() * (ORB_FIELD.x1 - ORB_FIELD.x0);
      pz = ORB_FIELD.z0 + Math.random() * (ORB_FIELD.z1 - ORB_FIELD.z0);
    }
    orb.on = true;
    orb.id = id;
    orb.x = px;
    orb.z = pz;
    orb.phase = Math.random() * 6.28;
    const def = BUFF_DEFS[id];
    orb.label.textContent = `${def.icon} ${def.name}`;
    orb.label.style.color = `#${def.color.toString(16).padStart(6, '0')}`;
    orb.label.style.display = 'block';
    return true;
  }

  function despawn(orb) {
    orb.on = false;
    orb.label.style.display = 'none';
  }

  function pickup(orb) {
    const def = BUFF_DEFS[orb.id];
    tmpV.set(orb.x, orb.y, orb.z);
    hooks.burst(tmpV, def.color, 18);
    hooks.burst(tmpV, 0xffffff, 8);
    hooks.shake(0.14);
    apply(orb.id);
    despawn(orb);
  }

  function onKill(pos) {
    if (Math.random() < 0.25) spawn(null, pos.x + (Math.random() - 0.5) * 2, pos.z + (Math.random() - 0.5) * 2);
  }

  function explode(pos, radius, exclude) {
    ringSpawn(pos.x, pos.y, pos.z);
    tmpV.copy(pos);
    hooks.burst(tmpV, 0xff7a30, 26);
    hooks.burst(tmpV, 0xffe9a8, 12);
    hooks.burst(tmpV, 0x3a3a3a, 10);
    hooks.shake(0.4);
    for (const m of [...hooks.monsters()]) {
      if (!m.alive || m === exclude) continue;
      const d = Math.hypot(m.pos.x - pos.x, m.pos.z - pos.z);
      if (d <= radius + m.r) hooks.damageMonster(m, { x: m.pos.x - pos.x, y: 0, z: m.pos.z - pos.z });
    }
  }

  function ringSpawn(x, y, z) {
    const r = ringAnims.find((k) => !k.on) || ringAnims[0];
    r.on = true;
    r.x = x; r.y = Math.max(2.06, y - 1.2); r.z = z;
    r.t = 0; r.max = 0.55;
    tmpC.setHex(0xffa040);
    r.r = tmpC.r; r.g = tmpC.g; r.b = tmpC.b;
  }

  function clear() {
    for (const o of orbs) despawn(o);
    active.clear();
    lastTimed = null;
    healT = 0;
    healFlashA = 0;
    for (const r of ringAnims) r.on = false;
    for (const p of Object.values(pills)) p.el.style.display = 'none';
    slowmoVig.classList.remove('on');
    syncSky();
  }

  function update(dt) {
    time += dt;
    healT = Math.max(0, healT - dt);
    healFlashA = Math.max(0, healFlashA - dt * 1.6);
    healFlash.style.opacity = healFlashA.toFixed(3);
    slowmoVig.classList.toggle('on', active.has('slowmo'));

    for (const [id, s] of active) {
      s.remaining -= dt;
      if (s.remaining <= 0) active.delete(id);
    }
    syncSky();

    // pills
    for (const [id, p] of Object.entries(pills)) {
      const s = active.get(id);
      if (!s) { p.el.style.display = 'none'; continue; }
      p.el.style.display = 'block';
      p.bar.style.width = `${Math.max(0, (s.remaining / s.dur) * 100)}%`;
    }

    // periodic field orb
    orbTimer -= dt;
    if (orbTimer <= 0) {
      orbTimer = ORB_INTERVAL;
      if (orbs.some((o) => !o.on)) spawn(null);
    }

    // orb visuals + pickup
    let n = 0;
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const orb of orbs) {
      if (!orb.on) continue;
      const def = BUFF_DEFS[orb.id];
      orb.y = 3.1 + Math.sin(time * 1.8 + orb.phase) * 0.35;
      dummy.position.set(orb.x, orb.y, orb.z);
      dummy.rotation.set(0.4, time * 1.6 + orb.phase, 0.4);
      const pulse = 1 + Math.sin(time * 4 + orb.phase) * 0.12;
      dummy.scale.setScalar(pulse);
      dummy.updateMatrix();
      cores.setMatrixAt(n, dummy.matrix);
      tmpC.setHex(def.color);
      cores.setColorAt(n, tmpC);
      dummy.position.set(orb.x, 6.5, orb.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      beams.setMatrixAt(n, dummy.matrix);
      beams.setColorAt(n, tmpC);
      hPos[n * 3] = orb.x;
      hPos[n * 3 + 1] = orb.y;
      hPos[n * 3 + 2] = orb.z;
      hSize[n] = 5.5;
      hCol[n * 3] = tmpC.r;
      hCol[n * 3 + 1] = tmpC.g;
      hCol[n * 3 + 2] = tmpC.b;
      tmpV.set(orb.x, orb.y + 1.1, orb.z).project(camera);
      if (tmpV.z < 1) {
        orb.label.style.left = `${(tmpV.x * 0.5 + 0.5) * w}px`;
        orb.label.style.top = `${(-tmpV.y * 0.5 + 0.5) * h}px`;
        orb.label.style.display = 'block';
      } else {
        orb.label.style.display = 'none';
      }
      n++;
      const dx = player.x - orb.x;
      const dz = player.z - orb.z;
      if (dx * dx + dz * dz < PICKUP_R * PICKUP_R) pickup(orb);
    }
    cores.count = n;
    beams.count = n;
    hGeo.setDrawRange(0, n);
    if (n) {
      cores.instanceMatrix.needsUpdate = true;
      cores.instanceColor.needsUpdate = true;
      beams.instanceMatrix.needsUpdate = true;
      beams.instanceColor.needsUpdate = true;
      hGeo.attributes.position.needsUpdate = true;
      hGeo.attributes.aSize.needsUpdate = true;
      hGeo.attributes.aCol.needsUpdate = true;
    }
    halos.material.uniforms.uTime.value = time;

    // rings
    let rn = 0;
    for (const r of ringAnims) {
      if (!r.on) continue;
      r.t += dt;
      const f = r.t / r.max;
      if (f >= 1) { r.on = false; continue; }
      const s = 0.6 + f * 7.5;
      dummy.position.set(r.x, r.y, r.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      rings.setMatrixAt(rn, dummy.matrix);
      tmpC.setRGB(r.r * (1 - f), r.g * (1 - f), r.b * (1 - f));
      rings.setColorAt(rn, tmpC);
      rn++;
    }
    rings.count = rn;
    if (rn) {
      rings.instanceMatrix.needsUpdate = true;
      rings.instanceColor.needsUpdate = true;
    }
  }

  return {
    update,
    spawn,
    clear,
    explode,
    onKill,
    giveBuff(idOrName) {
      const id = resolve(idOrName);
      if (id) apply(id);
      return id;
    },
    has(id) { return active.has(id); },
    list() {
      const out = [];
      for (const [id, s] of active) out.push({ id, name: BUFF_DEFS[id].name, remaining: s.remaining });
      return out;
    },
    get active() { return active; },
  };
}
