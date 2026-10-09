import { createLookFilter } from './look.js';
import * as THREE from 'three';
import { createWorld } from './world.js';
import { createSky } from './sky.js';
import { createBuffs } from './buffs.js';

const R = 0.34;
const H = 1.72;
const EYE = 1.55;
const WALK = 6.4;
const RUN = 10.4;
const GRAV = 26;
const JUMP = 8.2;
const LOOK = 0.0022;
const ARROW_BASE = 28;
const ARROW_EXTRA = 26;
const ARROW_GRAV = 15;
const COOL = 0.35;
const CHARGE_TIME = 0.75;
const BEST_KEY = 'baekun-defense-best';
const MAX_P = 320;
const TRAIL_LEN = 14;
const TRAIL_LIFE = 0.25;
const TRAIL_MAXQ = 360;
const DEBRIS_MAX = 240;
const MENU_LOOP = 60;
const FOV_BASE = 72;
const FAN_OFFSETS = [-0.349, -0.1745, 0, 0.1745, 0.349];
const RAPID_RATE = 0.12;

const KIND = {
  slime: { hp: 1, speed: 2.15, score: 10, r: 0.55, h: 1.15 },
  zombie: { hp: 2, speed: 3.35, score: 20, r: 0.42, h: 1.8 },
  boss: { hp: 10, speed: 2.55, score: 100, r: 0.95, h: 3.4 },
};

export function createGame() {
  const params = new URLSearchParams(window.location.search);
  const debug = params.get('debug') === '1';
  const qParam = params.get('q');
  // Quality ladder (auto steps DOWN while FPS is low; pixel ratio first, then
  // shadows, then effects):
  //   4 high : dpr<=1.5, shadow 2048 soft     3 : dpr<=1.25, shadow 2048 soft
  //   2      : dpr 1,    shadow 2048 PCF      1 low : dpr 1, shadow 1024 PCF, far 180
  //   0 min  : dpr 0.75, no shadows, no fireflies, far 160
  const Q_LEVELS = [
    { name: 'min', dpr: 0.75, shadow: 0, soft: false, far: 160, fx: false },
    { name: 'low', dpr: 1, shadow: 1024, soft: false, far: 180, fx: true },
    { name: 'med', dpr: 1, shadow: 2048, soft: false, far: 1e9, fx: true },
    { name: 'med+', dpr: 1.25, shadow: 2048, soft: true, far: 1e9, fx: true },
    { name: 'high', dpr: 1.5, shadow: 2048, soft: true, far: 1e9, fx: true },
  ];
  let qLevel = qParam === 'min' ? 0 : qParam === 'low' ? 1 : 4;
  let quality = qLevel >= 2 ? 'high' : 'low';
  let qualityLocked = qParam === 'low' || qParam === 'high' || qParam === 'min';
  let qPrevP90 = 0;
  let qPrevLevel = -1;
  let qWarm = 0;
  let qSum = 0;
  let qN = 0;
  const qBuf = new Float32Array(512);
  let realDt = 0;
  let playT = 0; // seconds since start() — auto quality may only act in the first 3 s
  let qDecision = qualityLocked ? `fixed ?q=${qParam}` : 'measuring…';
  // Touch UI (joystick, fire button, touch-drag look) only after a REAL touch event
  // (or ?touch=1). maxTouchPoints / (pointer: coarse) give false positives on some
  // laptops/browsers. Mouse look is never disabled by this flag.
  function enableTouchUI() { document.body.classList.add('touch'); }
  if (params.get('touch') === '1') enableTouchUI();
  window.addEventListener('touchstart', enableTouchUI, { once: true, passive: true });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3d6b0);
  scene.fog = new THREE.Fog(0xf3d6b0, 80, 240);
  scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x6b5a43, 0.9));
  const elev = 35 * Math.PI / 180;
  const horiz = Math.cos(elev);
  const sunDir = new THREE.Vector3(-Math.SQRT1_2 * horiz, Math.sin(elev), Math.SQRT1_2 * horiz);
  const sunTarget = new THREE.Vector3(8, 8, -4);
  const sun = new THREE.DirectionalLight(0xffd9a8, 2.4);
  sun.position.copy(sunTarget).addScaledVector(sunDir, 170);
  sun.target.position.copy(sunTarget);
  scene.add(sun);
  scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -110;
  sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 100;
  sun.shadow.camera.bottom = -100;
  sun.shadow.camera.near = 8;
  sun.shadow.camera.far = 460;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.22;
  sun.shadow.camera.updateProjectionMatrix();

  const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 250);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const CAM_RANGE = { far: 250, fogNear: 80, fogFar: 240 };
  let rangeReq = { far: CAM_RANGE.far, fogNear: CAM_RANGE.fogNear, fogFar: CAM_RANGE.fogFar };

  const canvas = document.createElement('canvas');
  canvas.id = 'game';
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      failIfMajorPerformanceCaveat: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Static world: render the shadow map only when lighting/quality changes.
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    document.body.insertBefore(canvas, document.body.firstChild);
  } catch (err) {
    renderer = null;
  }

  const skyMesh = makeSkyDome(sunDir);
  scene.add(skyMesh);
  const world = createWorld(scene, renderer);
  const voxelMeshes = world.voxelMeshes || 0;
  const colliders = world.colliders;

  // --- night sky dome + buff orbs (self-contained modules; hooks only) ---
  const sky = createSky(scene, camera, { mode: 'night', quality, renderer });
  scene.background = null;
  skyMesh.visible = false; // replaced by the fantasy sky dome from sky.js
  const hemiLight = scene.children.find((c) => c.isHemisphereLight) || null;

  function applySkyPalette(p) {
    if (hemiLight) {
      hemiLight.color.copy(p.hemiSky);
      hemiLight.groundColor.copy(p.hemiGround);
      hemiLight.intensity = p.hemiIntensity;
    }
    sun.color.copy(p.keyColor);
    sun.intensity = p.keyIntensity;
    // Key light stays from the south-west (over the road) so the 본관/신관 facades read;
    // the visible moon sits over 백운산 for composition.
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 170);
    if (scene.fog) {
      if (scene.fog.isFog && camPreset == null) {
        scene.fog.near = p.fogNear;
        scene.fog.far = p.fogFar;
      } else if (scene.fog.isFogExp2) {
        scene.fog.density = p.fogDensity ?? scene.fog.density;
      }
      scene.fog.color.copy(p.fogColor);
    }
    if (renderer) renderer.toneMappingExposure = p.exposure;
    if (world.setWindowGlow) world.setWindowGlow(p.windowGlow, p.windowColor);
  }
  sky.onPalette(applySkyPalette);

  // --- end sky/buffs wiring ---

  const { bow, string } = buildBow();
  camera.add(bow);
  bow.visible = false;

  const pGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  const pMat = new THREE.MeshLambertMaterial();
  const pMesh = new THREE.InstancedMesh(pGeo, pMat, MAX_P);
  pMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_P * 3), 3);
  pMesh.frustumCulled = false;
  pMesh.count = 0;
  scene.add(pMesh);

  // --- juice FX resources: one pooled trail ribbon + one instanced debris mesh ---
  const trailGeo = new THREE.BufferGeometry();
  const trailPos = new Float32Array(TRAIL_MAXQ * 12);
  const trailCol = new Float32Array(TRAIL_MAXQ * 16);
  const trailIdx = [];
  for (let q = 0; q < TRAIL_MAXQ; q++) {
    const b = q * 4;
    trailIdx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  trailGeo.setIndex(trailIdx);
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 4).setUsage(THREE.DynamicDrawUsage));
  trailGeo.setDrawRange(0, 0);
  const trailMesh = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  trailMesh.frustumCulled = false;
  scene.add(trailMesh);

  const dMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial(),
    DEBRIS_MAX,
  );
  dMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DEBRIS_MAX * 3), 3);
  dMesh.frustumCulled = false;
  dMesh.count = 0;
  scene.add(dMesh);
  // --- end juice FX resources ---

  const arrowProto = buildArrow();
  // Pools: arrow meshes and particle objects are recycled (no per-shot / per-hit GC churn).
  const arrowPool = [];
  const partPool = [];
  const _prev = new THREE.Vector3();
  const _mid = new THREE.Vector3();
  const _proj = new THREE.Vector3();
  function takeArrowMesh() {
    return arrowPool.pop() || arrowProto.clone();
  }
  function releaseArrowMesh(mesh) {
    scene.remove(mesh);
    mesh.rotation.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.scale.set(1, 1, 1);
    if (arrowPool.length < 64) arrowPool.push(mesh);
  }
  const GEO = makeGeos();

  let state = 'menu';
  let score = 0;
  let wave = 0;
  let hp = 100;
  const player = {
    x: world.spawn.x,
    y: world.spawn.y,
    z: world.spawn.z,
    vy: 0,
    yaw: 0,
    pitch: 0,
    onGround: true,
    hurtT: 0,
    bob: 0,
  };
  const monsters = [];
  const buffs = createBuffs({
    scene,
    camera,
    player,
    sky,
    hooks: {
      monsters: () => monsters,
      damageMonster,
      burst,
      shake: addShake,
      banner: showBanner,
      heal: (n) => { hp = Math.min(100, hp + n); },
      isBlocked: (x, z, r) => blockedCircle(x, z, r),
    },
  });
  const arrows = [];
  const particles = [];
  const popups = [];
  const keys = new Set();
  const joy = { x: 0, y: 0, mag: 0, id: null, cx: 0, cy: 0 };

  let toSpawn = [];
  let spawnIn = 0;
  let breaking = false;
  let breakLeft = 0;
  let clearedWave = 0;
  let cool = 0;
  let charging = false;
  let chargeT = 0;
  let hurtFlash = 0;
  let jumpQueued = false;
  let dragging = false;
  let sawLock = false;
  let lastTouch = 0;
  let lookId = null;
  let lookX = 0;
  let lookY = 0;
  let bannerLeft = 0;
  let fpsFrames = 0;
  let fpsAcc = 0;
  let fps = 0;
  let suppressMouse = false;
  let frontBias = false;
  let camPreset = null;
  let fireHeld = false;
  let rapidT = 0;

  const hudScore = document.getElementById('hud-score');
  const hudWave = document.getElementById('hud-wave');
  const hudLeft = document.getElementById('hud-left');
  const hpFill = document.getElementById('hp-fill');
  const hpText = document.getElementById('hp-text');
  const banner = document.getElementById('banner');
  const charge = document.getElementById('charge');
  const chargeFill = document.getElementById('charge-fill');
  const hurt = document.getElementById('hurt');
  const fpsEl = document.getElementById('fps');
  const overScore = document.getElementById('over-score');
  const overWave = document.getElementById('over-wave');
  const overBest = document.getElementById('over-best');
  const startBest = document.getElementById('start-best');
  const joyEl = document.getElementById('joy');
  const knob = document.getElementById('knob');
  const fireBtn = document.getElementById('fire');
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  if (debug) fpsEl.classList.remove('hidden');

  // --- frame-time instrumentation (always on, ~zero cost; graph only in ?debug=1) ---
  const SEG_NAMES = ['look', 'move', 'arrows', 'buffs', 'monsters', 'fx', 'hud', 'sky', 'render', 'post'];
  const SEG = {};
  SEG_NAMES.forEach((n, i) => { SEG[n] = i; });
  const segMs = new Float64Array(SEG_NAMES.length);
  let segT = 0;
  function segStart() { segMs.fill(0); segT = performance.now(); }
  function seg(i) { const n = performance.now(); segMs[i] += n - segT; segT = n; }
  const PERF_N = 240;
  const perfFrame = new Float32Array(PERF_N);
  const perfCpu = new Float32Array(PERF_N);
  let perfI = 0;
  const perfLog = { maxFrameMs: 0, maxCpuMs: 0, frames: 0, hitches: [], events: [], quality: [] };
  let pendingEvents = [];
  function perfEvent(note) {
    pendingEvents.push(note);
    perfLog.events.push({ t: Math.round(performance.now()), note });
    if (perfLog.events.length > 100) perfLog.events.shift();
  }
  let perfGraph = null;
  let perfGraphCtx = null;
  if (debug) {
    perfGraph = document.createElement('canvas');
    perfGraph.width = PERF_N;
    perfGraph.height = 60;
    perfGraph.style.cssText = 'position:fixed;right:12px;top:52px;z-index:50;background:rgba(0,0,0,.55);pointer-events:none;border-radius:4px';
    document.body.appendChild(perfGraph);
    perfGraphCtx = perfGraph.getContext('2d');
  }
  function drawPerfGraph() {
    const g = perfGraphCtx;
    g.clearRect(0, 0, PERF_N, 60);
    g.fillStyle = 'rgba(255,255,255,.25)';
    g.fillRect(0, 60 - 16.7, PERF_N, 1); // 60 fps line (1 px per ms)
    g.fillRect(0, 60 - 33.3, PERF_N, 1);
    for (let k = 0; k < PERF_N; k++) {
      const i = (perfI + k) % PERF_N;
      const f = perfFrame[i];
      g.fillStyle = f > 25 ? '#ff5050' : f > 17.5 ? '#ffc040' : '#50e080';
      g.fillRect(k, 60 - Math.min(60, f), 1, Math.min(60, f));
      g.fillStyle = '#6aa8ff';
      g.fillRect(k, 60 - Math.min(60, perfCpu[i]), 1, 1);
    }
    let mx = 0;
    for (let i = 0; i < PERF_N; i++) if (perfFrame[i] > mx) mx = perfFrame[i];
    g.fillStyle = '#fff';
    g.font = '10px monospace';
    g.fillText(`4s max ${mx.toFixed(0)}ms · worst ${perfLog.maxFrameMs.toFixed(0)} · >25ms ${perfLog.hitches.length}`, 3, 10);
  }
  const segSum = new Float64Array(SEG_NAMES.length);
  const segMax = new Float64Array(SEG_NAMES.length);
  let cpuSum = 0;
  let cpuMaxW = 0;
  let cpuN = 0;
  function perfWindow(reset) {
    const o = { frames: cpuN, cpuAvg: cpuN ? +(cpuSum / cpuN).toFixed(2) : 0, cpuMax: +cpuMaxW.toFixed(1), avg: {}, max: {} };
    for (let i = 0; i < SEG_NAMES.length; i++) {
      o.avg[SEG_NAMES[i]] = cpuN ? +(segSum[i] / cpuN).toFixed(2) : 0;
      o.max[SEG_NAMES[i]] = +segMax[i].toFixed(1);
    }
    if (reset) { segSum.fill(0); segMax.fill(0); cpuSum = 0; cpuMaxW = 0; cpuN = 0; }
    return o;
  }
  let perfPrevPrograms = 0;
  let perfPrevTex = 0;
  function perfEnd(frameMs, now) {
    let cpu = 0;
    let worst = 0;
    for (let i = 0; i < segMs.length; i++) {
      cpu += segMs[i];
      if (segMs[i] > segMs[worst]) worst = i;
    }
    for (let i = 0; i < segMs.length; i++) {
      segSum[i] += segMs[i];
      if (segMs[i] > segMax[i]) segMax[i] = segMs[i];
    }
    cpuSum += cpu;
    if (cpu > cpuMaxW) cpuMaxW = cpu;
    cpuN++;
    perfFrame[perfI] = frameMs;
    perfCpu[perfI] = cpu;
    perfI = (perfI + 1) % PERF_N;
    perfLog.frames++;
    const programs = renderer && renderer.info.programs ? renderer.info.programs.length : 0;
    const tex = renderer ? renderer.info.memory.textures : 0;
    // skip the first frames after load (compile + upload expected there)
    if (perfLog.frames > 5) {
      if (frameMs > perfLog.maxFrameMs) perfLog.maxFrameMs = frameMs;
      if (cpu > perfLog.maxCpuMs) perfLog.maxCpuMs = cpu;
      if ((frameMs > 25 || cpu > 25) && perfLog.hitches.length < 300) {
        const segs = {};
        for (let i = 0; i < segMs.length; i++) if (segMs[i] > 0.5) segs[SEG_NAMES[i]] = +segMs[i].toFixed(1);
        perfLog.hitches.push({
          t: Math.round(now), state, frameMs: +frameMs.toFixed(1), cpuMs: +cpu.toFixed(1),
          worst: SEG_NAMES[worst], segs, newPrograms: programs - perfPrevPrograms, newTextures: tex - perfPrevTex,
          events: pendingEvents.length ? pendingEvents.slice() : undefined,
        });
        if (debug) console.info(`[hitch] ${frameMs.toFixed(1)}ms frame, cpu ${cpu.toFixed(1)}ms, worst=${SEG_NAMES[worst]} ${segMs[worst].toFixed(1)}ms, +${programs - perfPrevPrograms} programs`, pendingEvents.join(','));
      }
    }
    perfPrevPrograms = programs;
    perfPrevTex = tex;
    if (pendingEvents.length) pendingEvents = [];
    if (perfGraphCtx && (perfLog.frames & 3) === 0) drawPerfGraph();
  }
  refreshStartBest();

  const indWrap = document.getElementById('edge-ind');
  const indEls = [];
  for (let i = 0; i < 8; i++) {
    const el = document.createElement('i');
    el.style.display = 'none';
    indWrap.appendChild(el);
    indEls.push(el);
  }
  const tmpV = new THREE.Vector3();

  // --- juice FX state + menu orbit path (self-contained; hooks call into these) ---
  const debris = [];
  const deadTrails = [];
  const tmpDir = new THREE.Vector3();
  const tmpView = new THREE.Vector3();
  const tmpSide = new THREE.Vector3();
  const tmpA = new THREE.Vector3();
  let trailLive = 0;
  let shakeAmt = 0;
  let shakeScale = 1;
  let fovKick = 0;
  let bowRecoil = 0;

  const orbitCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(56, 52, 104),
    new THREE.Vector3(-2, 32, 66),
    new THREE.Vector3(-64, 36, -4),
    new THREE.Vector3(-40, 44, -62),
    new THREE.Vector3(28, 40, -82),
    new THREE.Vector3(-70, 38, -40),
    new THREE.Vector3(-84, 40, 34),
  ], true, 'centripetal');
  const lookCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 8, 30),
    new THREE.Vector3(0, 8, -5),
    new THREE.Vector3(-5, 12, -29),
    new THREE.Vector3(-5, 12, -42),
    new THREE.Vector3(-30, 8, -40),
    new THREE.Vector3(-88, 6, -19),
    new THREE.Vector3(0, 10, -10),
  ], true, 'centripetal');
  // --- end juice FX state ---

  function hideIndicators() {
    for (const el of indEls) el.style.display = 'none';
  }

  function setState(next) {
    state = next;
    document.body.dataset.state = next;
    bow.visible = next !== 'menu';
    if (next !== 'playing') hideIndicators();
  }

  function syncSky() {
    skyMesh.position.copy(camera.position);
    skyMesh.scale.setScalar(Math.max(12, camera.far * 0.92));
  }

  function applyRange(far, fogNear, fogFar) {
    rangeReq = { far, fogNear, fogFar };
    const cap = Q_LEVELS[qLevel].far;
    camera.far = Math.min(far, cap);
    camera.updateProjectionMatrix();
    scene.fog.near = fogNear;
    scene.fog.far = Math.min(fogFar, Math.max(camera.far, fogNear + 1));
    syncSky();
  }

  function applyQuality() {
    if (!renderer) return;
    const L = Q_LEVELS[qLevel];
    quality = qLevel >= 2 ? 'high' : 'low';
    const high = quality === 'high';
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = (sky && sky.palette && sky.palette.exposure) || 1.05;
    if (sky && sky.setQuality) sky.setQuality(high ? 'high' : 'low');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.type = L.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    renderer.shadowMap.enabled = L.shadow > 0;
    sun.castShadow = L.shadow > 0;
    if (sun.shadow.mapSize.x !== L.shadow && L.shadow > 0) {
      sun.shadow.mapSize.set(L.shadow, L.shadow);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    renderer.shadowMap.needsUpdate = true;
    perfEvent(`applyQuality:${L.name}`);
    if (sky && sky.objects && sky.objects.fireflies) sky.objects.fireflies.visible = L.fx;
    renderer.setPixelRatio(pixelRatioFor(qLevel));
    renderer.setSize(window.innerWidth, Math.max(1, window.innerHeight), false);
    applyRange(rangeReq.far, rangeReq.fogNear, rangeReq.fogFar);
  }

  function pixelRatioFor(level) {
    const dpr = window.devicePixelRatio || 1;
    return Math.min(dpr, Q_LEVELS[level].dpr);
  }

  function setQuality(q) {
    const idx = typeof q === 'number' ? q : Q_LEVELS.findIndex((l) => l.name === q);
    if (idx < 0 || idx >= Q_LEVELS.length) return;
    qLevel = idx;
    qualityLocked = true;
    applyQuality();
  }

  function restoreCamRange() {
    applyRange(CAM_RANGE.far, CAM_RANGE.fogNear, CAM_RANGE.fogFar);
  }

  const VIEWS = {
    overview: { pos: [20, 150, 110], look: [0, 0, -15], far: 800, fogNear: 240, fogFar: 950 },
    gate: { pos: [-98, 2.6, -19], look: [-78, 8.5, -19] },
    field: { pos: [1, 3.6, 41], look: [1, 12, -6] },
    west: { pos: [-108, 30, 22], look: [-4, 6, -40], far: 900, fogNear: 160, fogFar: 980 },
    sky: { pos: [0, 6, 60], look: [62, 55, -25], far: 1200, fogNear: 60, fogFar: 240 },
    singwan: { pos: [-40, 2.5, -24], look: [-6, 17, -30] },
    bonkwan: { pos: [1, 8, 62], look: [1, 8, 0] },
    gym: { pos: [-32, 3, -48], look: [6, 9, -66] },
  };

  function applyPreset(v) {
    camera.position.set(v.pos[0], v.pos[1], v.pos[2]);
    camera.lookAt(v.look[0], v.look[1], v.look[2]);
    applyRange(v.far ?? CAM_RANGE.far, v.fogNear ?? CAM_RANGE.fogNear, v.fogFar ?? CAM_RANGE.fogFar);
  }

  function view(name) {
    if (name == null) {
      camPreset = null;
      restoreCamRange();
      return;
    }
    const v = VIEWS[name];
    if (!v) return;
    if (state === 'playing') return;
    camPreset = name;
    applyPreset(v);
  }

  function readBest() {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch (err) {
      return 0;
    }
  }

  function writeBest(n) {
    const best = Math.max(n, readBest());
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch (err) {
      return best;
    }
    return best;
  }

  function refreshStartBest() {
    const best = readBest();
    startBest.textContent = best > 0 ? `최고 점수 ${best}` : '';
  }

  function showBanner(text, dur = 2.2) {
    banner.textContent = text;
    banner.classList.remove('hidden');
    bannerLeft = dur;
  }

  function requestLock() {
    if (!renderer || !canvas.requestPointerLock) return;
    const plain = () => {
      try {
        const r = canvas.requestPointerLock();
        if (r && typeof r.catch === 'function') r.catch(() => {});
      } catch (err) { /* ignore */ }
    };
    // unadjustedMovement (raw HID deltas) is opt-in: on macOS trackpads / Magic Mouse
    // raw deltas are coarse and bursty, which reads as stutter when turning.
    if (params.get('rawmouse') !== '1') { plain(); return; }
    try {
      // raw (unaccelerated, unfiltered) deltas where supported; fall back otherwise
      const ret = canvas.requestPointerLock({ unadjustedMovement: true });
      if (ret && typeof ret.catch === 'function') {
        ret.catch((err) => { if (err && err.name === 'NotSupportedError') plain(); });
      }
    } catch (err) {
      plain();
    }
  }

  function exitLock() {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch (err) {
      return;
    }
  }

  function clearEntities() {
    for (const m of monsters) scene.remove(m.group);
    monsters.length = 0;
    for (const a of arrows) releaseArrowMesh(a.mesh);
    arrows.length = 0;
    for (const p of particles) partPool.push(p);
    particles.length = 0;
    pMesh.count = 0;
    pMesh.instanceMatrix.needsUpdate = true;
    for (const p of popups) p.el.remove();
    popups.length = 0;
    clearFx();
    toSpawn = [];
    breaking = false;
    breakLeft = 0;
    clearedWave = 0;
  }

  function reset() {
    clearEntities();
    hudCache.score = hudCache.wave = hudCache.left = hudCache.pct = hudCache.hurt = hudCache.charge = -1;
    hudCache.chargeOn = null;
    score = 0;
    wave = 0;
    hp = 100;
    player.x = world.spawn.x;
    player.y = world.spawn.y;
    player.z = world.spawn.z;
    player.vy = 0;
    player.yaw = 0;
    player.pitch = 0;
    player.onGround = true;
    player.hurtT = 0;
    player.bob = 0;
    hurtFlash = 0;
    cool = 0;
    charging = false;
    buffs.clear();
    chargeT = 0;
    jumpQueued = false;
    banner.classList.add('hidden');
    bannerLeft = 0;
    hurt.style.opacity = '0';
  }

  function start() {
    reset();
    playT = 0;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    camPreset = null;
    restoreCamRange();
    setState('playing');
    beginWave(1);
    applyCamera(false);
    requestLock();
  }

  function pause() {
    if (state !== 'playing') return;
    setState('paused');
    charging = false;
    fireHeld = false;
    exitLock();
  }

  function resume() {
    if (state !== 'paused') return;
    setState('playing');
    applyCamera(false);
    requestLock();
  }

  function gameOver() {
    hp = 0;
    charging = false;
    fireHeld = false;
    buffs.clear();
    setState('gameover');
    const best = writeBest(score);
    overScore.textContent = String(score);
    overWave.textContent = String(Math.max(wave, 1));
    overBest.textContent = String(best);
    refreshStartBest();
    exitLock();
  }

  function beginWave(n) {
    wave = n;
    const count = 3 + 2 * n;
    const zChance = Math.min(0.72, 0.12 + n * 0.08);
    toSpawn = [];
    for (let i = 0; i < count; i++) {
      if (n % 5 === 0 && i === count - 1) toSpawn.push('boss');
      else toSpawn.push(Math.random() < zChance ? 'zombie' : 'slime');
    }
    spawnIn = 0.15;
    breaking = false;
    frontBias = n <= 2;
    showBanner(`웨이브 ${n}!`);
  }

  function pickSpawn() {
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const half = frontBias ? 1.7453 : Math.PI;
    for (let i = 0; i < 36; i++) {
      const off = (Math.random() * 2 - 1) * half;
      const dx = fx * Math.cos(off) - fz * Math.sin(off);
      const dz = fx * Math.sin(off) + fz * Math.cos(off);
      const d = 28 + Math.random() * 17;
      const x = player.x + dx * d;
      const z = player.z + dz * d;
      if (Math.abs(x) > 132 || Math.abs(z) > 132) continue;
      if (!world.canSpawn(x, z)) continue;
      if (blockedCircle(x, z, 0.8)) continue;
      return new THREE.Vector3(x, 2, z);
    }
    for (let i = 0; i < 8; i++) {
      const base = world.spawns[Math.floor(Math.random() * world.spawns.length)];
      const pos = base.clone();
      pos.x += (Math.random() - 0.5) * 2.4;
      pos.z += (Math.random() - 0.5) * 2.4;
      pos.y = 2;
      if (!blockedCircle(pos.x, pos.z, 0.6)) return pos;
    }
    const fallback = world.spawns[0].clone();
    fallback.y = 2;
    return fallback;
  }

  function spawnMonster(kind, pos) {
    const spec = KIND[kind];
    const built = kind === 'slime' ? buildSlime(GEO) : buildHumanoid(GEO, kind);
    const at = pos.clone();
    at.y = 2;
    built.group.position.copy(at);
    scene.add(built.group);
    monsters.push({
      kind,
      hp: spec.hp,
      speed: spec.speed,
      score: spec.score,
      r: spec.r,
      h: spec.h,
      pos: at,
      alive: true,
      phase: Math.random() * 6,
      flash: 0,
      kbx: 0,
      kbz: 0,
      slideT: 0,
      sx: 1,
      sz: 0,
      stuck: 0,
      wpT: 0,
      tint: kind === 'boss' ? 0x7a1e28 : kind === 'zombie' ? 0x3d8a32 : 0x3dcc4a,
      group: built.group,
      body: built.body,
      armL: built.armL,
      armR: built.armR,
      legL: built.legL,
      legR: built.legR,
      mats: built.mats,
    });
  }

  function spawnTestMonster(distance) {
    let dist = Number(distance);
    if (!Number.isFinite(dist)) dist = 8;
    dist = Math.max(1.2, Math.min(80, dist));
    const dir = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    let pos = new THREE.Vector3(player.x, 2, player.z).addScaledVector(dir, dist);
    for (let i = 0; i < 18; i++) {
      if (!blockedCircle(pos.x, pos.z, 0.5)) break;
      dist = Math.max(1.2, dist - 1.4);
      pos = new THREE.Vector3(player.x, 2, player.z).addScaledVector(dir, dist);
    }
    spawnMonster('slime', pos);
  }

  function shoot() {
    fireArrow(0, true);
  }

  function fireArrow(chargeAmount, fromApi) {
    if (state !== 'playing') return;
    if (!fromApi && cool > 0) return;
    if (!fromApi) cool = COOL;
    applyCamera(false);
    const speed = ARROW_BASE + Math.max(0, Math.min(1, chargeAmount)) * ARROW_EXTRA;
    const pierce = buffs.has('pierce');
    const explosive = buffs.has('explosive');
    const fans = buffs.has('multishot') ? FAN_OFFSETS : [0];
    for (const off of fans) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      if (off) {
        const c = Math.cos(off);
        const s = Math.sin(off);
        const nx = dir.x * c + dir.z * s;
        const nz = -dir.x * s + dir.z * c;
        dir.x = nx;
        dir.z = nz;
      }
      const pos = camera.position.clone().addScaledVector(dir, 0.85);
      const vel = dir.multiplyScalar(speed);
      const mesh = takeArrowMesh();
      mesh.position.copy(pos);
      scene.add(mesh);
      arrows.push({
        pos,
        vel,
        mesh,
        stuck: false,
        life: 8,
        trail: [],
        hot: chargeAmount >= 0.95,
        pierce,
        explosive,
        hitSet: pierce ? new Set() : null,
      });
    }
    if (chargeAmount >= 0.95) {
      fovKick = 5;
      bowRecoil = 1;
    } else {
      bowRecoil = Math.max(bowRecoil, 0.45);
    }
    if (arrows.length > 48) {
      const old = arrows.shift();
      scene.remove(old.mesh);
    }
  }

  function beginCharge() {
    if (state !== 'playing' || cool > 0) return;
    fireHeld = true;
    charging = true;
    chargeT = 0;
  }

  function releaseShot() {
    fireHeld = false;
    if (!charging) return;
    const amount = Math.min(1, chargeT / CHARGE_TIME);
    charging = false;
    chargeT = 0;
    fireArrow(amount, false);
  }

  function killMonster(m) {
    if (!m.alive) return;
    m.alive = false;
    score += m.score;
    const p = m.pos.clone();
    p.y += m.h * 0.55;
    burst(p, m.tint, m.kind === 'boss' ? 20 : 12);
    debrisBurst(m);
    addShake(m.kind === 'boss' ? 0.3 : 0.16);
    popup(p, `+${m.score}`, m.kind === 'boss' ? '#ffd15a' : '#ffffff');
    buffs.onKill(p);
    scene.remove(m.group);
    m.group.traverse((obj) => {
      if (!obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) mat.dispose();
    });
    const idx = monsters.indexOf(m);
    if (idx >= 0) monsters.splice(idx, 1);
  }

  function damageMonster(m, vel) {
    if (!m.alive) return;
    m.hp -= 1;
    m.flash = 0.14;
    const len = Math.hypot(vel.x, vel.z) || 1;
    const kick = m.kind === 'boss' ? 3.2 : 7;
    m.kbx = (vel.x / len) * kick;
    m.kbz = (vel.z / len) * kick;
    if (m.hp <= 0) killMonster(m);
    else {
      const spark = m.pos.clone();
      spark.y += m.h * 0.6;
      burst(spark, m.tint, 6 + Math.floor(Math.random() * 5));
      burst(spark, 0xffffff, 5);
    }
    addShake(0.07);
  }

  let pOldest = 0;
  function burst(pos, color, n) {
    for (let i = 0; i < n; i++) {
      let p;
      if (particles.length >= MAX_P) {
        // recycle the oldest live particle in place (O(1), no allocation)
        p = particles[pOldest % particles.length];
        pOldest++;
      } else {
        p = partPool.pop() || { pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 0.9, color: 0 };
        particles.push(p);
      }
      p.pos.copy(pos);
      p.vel.set((Math.random() - 0.5) * 7, 2.5 + Math.random() * 5.5, (Math.random() - 0.5) * 7);
      p.life = 0.55 + Math.random() * 0.35;
      p.max = 0.9;
      p.color = color;
    }
  }

  function popup(pos, text, color) {
    const el = document.createElement('div');
    el.className = 'popup';
    el.textContent = text;
    el.style.color = color;
    document.getElementById('popups').appendChild(el);
    popups.push({ el, pos: pos.clone(), age: 0 });
  }

  function hurtPlayer(m) {
    if (player.hurtT > 0 || state !== 'playing') return;
    hp = Math.max(0, hp - 10);
    player.hurtT = 1;
    hurtFlash = 0.4;
    addShake(0.32);
    const dx = player.x - m.pos.x;
    const dz = player.z - m.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const kx = (dx / d) * 0.45;
    const kz = (dz / d) * 0.45;
    if (!overlaps(player.x + kx, player.y, player.z)) player.x += kx;
    if (!overlaps(player.x, player.y, player.z + kz)) player.z += kz;
    if (hp <= 0) gameOver();
  }

  function applyCamera(moving) {
    const bob = moving ? Math.sin(player.bob) * 0.045 : 0;
    const shake = hurtFlash > 0 ? (Math.random() - 0.5) * 0.08 * Math.min(1, hurtFlash * 2) : 0;
    camera.position.set(player.x + shake, player.y + EYE + bob, player.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    camera.rotation.z = 0;
    camera.updateMatrixWorld();
  }

  function updateMenu(t) {
    const u = ((t * 0.001) / MENU_LOOP) % 1;
    orbitCurve.getPointAt(u, camera.position);
    lookCurve.getPointAt(u, tmpA);
    camera.lookAt(tmpA);
    camera.rotation.z = Math.sin(u * Math.PI * 2) * 0.012;
    bow.visible = false;
  }

  const indItems = [];
  for (let i = 0; i < 32; i++) indItems.push({ x: 0, y: 0, z: 0, d: 0 });
  const indState = [];
  const byDist = (a, b) => a.d - b.d;
  const indSorted = [];
  function setInd(i, show, px, py, ang) {
    let st = indState[i];
    if (!st) st = indState[i] = { show: null, r: '' };
    const el = indEls[i];
    if (st.show !== show) { st.show = show; el.style.display = show ? 'block' : 'none'; }
    if (!show) return;
    // transform only (compositor) — no left/top layout writes while turning
    const r = `translate(${px | 0}px, ${py | 0}px) translate(-50%, -50%) rotate(${ang.toFixed(2)}rad)`;
    if (st.r !== r) { st.r = r; el.style.transform = r; }
  }
  function updateIndicators() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const margin = 16;
    let used = 0;
    let n = 0;
    for (const m of monsters) {
      if (!m.alive || n >= indItems.length) continue;
      tmpV.set(m.pos.x, m.pos.y + m.h * 0.5, m.pos.z).applyMatrix4(camera.matrixWorldInverse);
      if (tmpV.z < 0 && Math.abs(tmpV.x) < -tmpV.z * 1.4 && Math.abs(tmpV.y) < -tmpV.z * 1.0) continue;
      const it = indItems[n++];
      it.x = tmpV.x; it.y = tmpV.y; it.z = tmpV.z;
      it.d = Math.hypot(tmpV.x, tmpV.y, tmpV.z);
    }
    indSorted.length = 0;
    for (let i = 0; i < n; i++) indSorted.push(indItems[i]);
    if (n > 1) indSorted.sort(byDist);
    for (let k = 0; k < n; k++) {
      const it = indSorted[k];
      if (used >= indEls.length) break;
      const behind = it.z > 0;
      const sx = behind ? -it.x : it.x;
      let sy = behind ? -it.y : it.y;
      if (Math.abs(sx) < 0.001 && Math.abs(sy) < 0.001) sy = -1;
      const ang = Math.atan2(sy, sx);
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const tx = (w / 2 - margin) / Math.max(0.0001, Math.abs(ca));
      const ty = (h / 2 - margin) / Math.max(0.0001, Math.abs(sa));
      const t = Math.min(tx, ty);
      setInd(used++, true, w / 2 + ca * t, h / 2 + sa * t, ang + Math.PI / 2);
    }
    for (let i = used; i < indEls.length; i++) setInd(i, false, 0, 0, 0);
  }

  function movePlayer(dt) {
    let ix = 0;
    let iz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) iz += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
    if (joy.mag > 0.12) {
      ix += joy.x;
      iz += joy.y;
    }
    const len = Math.hypot(ix, iz);
    if (len > 1) {
      ix /= len;
      iz /= len;
    }
    const running = keys.has('ShiftLeft') || keys.has('ShiftRight') || joy.mag > 0.82;
    const speed = running ? RUN : WALK;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const rx = Math.cos(player.yaw);
    const rz = -Math.sin(player.yaw);
    const vx = (fx * iz + rx * ix) * speed;
    const vz = (fz * iz + rz * ix) * speed;
    player.vy -= GRAV * dt;
    if (jumpQueued && player.onGround) {
      player.vy = JUMP;
      player.onGround = false;
    }
    jumpQueued = false;
    const nx = player.x + vx * dt;
    const nz = player.z + vz * dt;
    if (!overlaps(nx, player.y, player.z)) player.x = nx;
    if (!overlaps(player.x, player.y, nz)) player.z = nz;
    let ny = player.y + player.vy * dt;
    if (ny < 2) {
      ny = 2;
      player.vy = 0;
      player.onGround = true;
    }
    if (overlaps(player.x, ny, player.z)) {
      if (player.vy < 0) player.onGround = true;
      player.vy = 0;
    } else {
      player.y = ny;
      if (ny > 2.02) player.onGround = false;
    }
    const moving = Math.hypot(vx, vz) > 0.4 && player.onGround;
    if (moving) player.bob += dt * (running ? 12 : 8);
    return moving;
  }

  function updateMonster(m, dt) {
    m.phase += dt * (m.kind === 'slime' ? 5.5 : 7.5);
    m.flash = Math.max(0, m.flash - dt);
    const flashed = m.flash > 0;
    for (const mat of m.mats) mat.emissive.setScalar(flashed ? 0.9 : 0);

    let tx = player.x;
    let tz = player.z;
    if (m.wpT > 0) {
      tx = world.gate.x;
      tz = world.gate.z;
      m.wpT -= dt;
    }
    const dx = tx - m.pos.x;
    const dz = tz - m.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    let mx = dx / dist;
    let mz = dz / dist;
    if (m.slideT > 0) {
      mx = m.sx;
      mz = m.sz;
      m.slideT -= dt;
    }
    let speed = m.speed;
    if (m.kind === 'slime') {
      const hop = (Math.sin(m.phase) + 1) / 2;
      speed = hop > 0.2 ? m.speed : m.speed * 0.12;
      m.body.position.y = 0.55 + hop * 0.42;
      m.body.scale.set(1 + hop * 0.1, 1 - hop * 0.18, 1 + hop * 0.1);
    } else {
      const swing = Math.sin(m.phase);
      m.legL.rotation.x = swing * 0.7;
      m.legR.rotation.x = -swing * 0.7;
      m.armL.rotation.x = -swing * 0.55;
      m.armR.rotation.x = swing * 0.55;
    }
    const nx = m.pos.x + (mx * speed + m.kbx) * dt;
    const nz = m.pos.z + (mz * speed + m.kbz) * dt;
    const hitX = blockedCircle(nx, m.pos.z, m.r);
    const hitZ = blockedCircle(m.pos.x, nz, m.r);
    if (!hitX) m.pos.x = nx;
    if (!hitZ) m.pos.z = nz;
    if (hitX || hitZ) {
      m.stuck += dt;
      if (hitX && hitZ) {
        m.sx = -mz;
        m.sz = mx;
        if (blockedCircle(m.pos.x + m.sx, m.pos.z + m.sz, m.r)) {
          m.sx = mz;
          m.sz = -mx;
        }
        m.slideT = 0.45;
      }
    } else {
      m.stuck = Math.max(0, m.stuck - dt);
    }
    if (m.stuck > 0.7) {
      m.wpT = 1.5;
      m.stuck = 0;
      m.slideT = 0;
    }
    m.kbx *= Math.exp(-3.2 * dt);
    m.kbz *= Math.exp(-3.2 * dt);
    m.group.rotation.y = Math.atan2(player.x - m.pos.x, player.z - m.pos.z);
    m.group.position.set(m.pos.x, 2, m.pos.z);
  }

  function updateArrows(dt) {
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i];
      if (a.stuck) {
        a.life -= dt;
        if (a.life <= 0) {
          dropTrail(a);
          releaseArrowMesh(a.mesh);
          arrows.splice(i, 1);
        }
        continue;
      }
      a.vel.y -= ARROW_GRAV * dt;
      const prev = _prev.copy(a.pos);
      a.pos.addScaledVector(a.vel, dt);
      pushTrail(a);
      const mid = _mid.copy(prev).lerp(a.pos, 0.5);
      let consumed = false;
      for (const m of monsters) {
        if (!m.alive) continue;
        if (a.hitSet && a.hitSet.has(m)) continue;
        if (hitsMonster(a.pos, m) || hitsMonster(mid, m)) {
          damageMonster(m, a.vel);
          if (a.explosive) buffs.explode(a.pos, 4, m);
          if (a.pierce) {
            a.hitSet.add(m);
            if (a.hitSet.size >= 5) {
              consumed = true;
              break;
            }
          } else {
            consumed = true;
            break;
          }
        }
      }
      if (consumed) {
        dropTrail(a);
        releaseArrowMesh(a.mesh);
        arrows.splice(i, 1);
        continue;
      }
      if (a.pos.y <= 2.08) {
        a.pos.y = 2.08;
        if (a.explosive) buffs.explode(a.pos, 4, null);
        stickArrow(a);
        continue;
      }
      for (const box of colliders) {
        if (pointInBox(a.pos, box) || pointInBox(mid, box)) {
          stickToBox(a, box);
          if (a.explosive) buffs.explode(a.pos, 4, null);
          stickArrow(a);
          break;
        }
      }
      if (a.stuck) continue;
      a.life -= dt;
      if (a.life <= 0) {
        dropTrail(a);
        releaseArrowMesh(a.mesh);
        arrows.splice(i, 1);
        continue;
      }
      aimArrow(a);
    }
  }

  function stickArrow(a) {
    a.stuck = true;
    a.life = 3;
    aimArrow(a);
  }

  function aimArrow(a) {
    a.mesh.position.copy(a.pos);
    if (a.vel.lengthSq() > 0.02) {
      a.mesh.lookAt(a.pos.x + a.vel.x, a.pos.y + a.vel.y, a.pos.z + a.vel.z);
    }
  }

  function updateWaves(dt) {
    if (toSpawn.length) {
      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawnMonster(toSpawn.shift(), pickSpawn());
        spawnIn = 0.6;
      }
      return;
    }
    if (monsters.some((m) => m.alive)) {
      return;
    }
    if (wave <= 0) return;
    if (!breaking) {
      breaking = true;
      breakLeft = 3;
      if (clearedWave !== wave) {
        clearedWave = wave;
        hp = Math.min(100, hp + 20);
        showBanner('웨이브 클리어!', 3);
      }
      return;
    }
    breakLeft -= dt;
    if (breakLeft <= 0) beginWave(wave + 1);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        // swap-remove + return to pool
        const last = particles.pop();
        if (last !== p) particles[i] = last;
        partPool.push(p);
        continue;
      }
      p.vel.y -= 16 * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 2.1) {
        p.pos.y = 2.1;
        p.vel.y *= -0.28;
        p.vel.x *= 0.7;
        p.vel.z *= 0.7;
      }
    }
    pMesh.count = particles.length;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      dummy.position.copy(p.pos);
      dummy.rotation.set(p.life * 4, p.life * 2, 0);
      dummy.scale.setScalar(Math.max(0.04, p.life / p.max));
      dummy.updateMatrix();
      pMesh.setMatrixAt(i, dummy.matrix);
      tmpColor.setHex(p.color);
      pMesh.setColorAt(i, tmpColor);
    }
    if (particles.length) {
      pMesh.instanceMatrix.needsUpdate = true;
      pMesh.instanceColor.needsUpdate = true;
    }
  }

  function updatePopups(dt) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.age += dt;
      p.pos.y += dt * 1.4;
      const v = _proj.copy(p.pos).project(camera);
      p.el.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
      p.el.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
      p.el.style.opacity = v.z > 1 ? '0' : String(Math.max(0, 1 - p.age / 0.85));
      if (p.age > 0.85) {
        p.el.remove();
        popups.splice(i, 1);
      }
    }
  }

  // --- juice FX: arrow trails, death debris, screen shake ---
  function pushTrail(a) {
    let t;
    if (a.trail.length >= TRAIL_LEN) {
      t = a.trail.shift();
    } else {
      t = {};
    }
    t.x = a.pos.x; t.y = a.pos.y; t.z = a.pos.z; t.age = 0;
    a.trail.push(t);
  }

  function dropTrail(a) {
    if (a.trail && a.trail.length) deadTrails.push({ pts: a.trail, hot: a.hot });
    a.trail = null;
  }

  function emitTrail(pts, hot) {
    if (pts.length < 2 || trailLive >= TRAIL_MAXQ) return;
    camera.getWorldDirection(tmpView);
    for (let i = 0; i < pts.length - 1 && trailLive < TRAIL_MAXQ; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const f = 1 - p0.age / TRAIL_LIFE;
      if (f <= 0) continue;
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const dz = p1.z - p0.z;
      const dl = Math.hypot(dx, dy, dz);
      if (dl < 1e-5) continue;
      tmpDir.set(dx / dl, dy / dl, dz / dl);
      tmpSide.crossVectors(tmpDir, tmpView);
      if (tmpSide.lengthSq() < 1e-6) tmpSide.set(0, 1, 0);
      else tmpSide.normalize();
      const w = (hot ? 0.1 : 0.06) * (0.45 + 0.55 * f);
      const a = f * (hot ? 0.9 : 0.65);
      const r = hot ? 1 : 0.92;
      const g = hot ? 0.8 : 0.96;
      const b = hot ? 0.32 : 1;
      const o = trailLive * 12;
      trailPos[o] = p0.x + tmpSide.x * w;
      trailPos[o + 1] = p0.y + tmpSide.y * w;
      trailPos[o + 2] = p0.z + tmpSide.z * w;
      trailPos[o + 3] = p0.x - tmpSide.x * w;
      trailPos[o + 4] = p0.y - tmpSide.y * w;
      trailPos[o + 5] = p0.z - tmpSide.z * w;
      trailPos[o + 6] = p1.x - tmpSide.x * w;
      trailPos[o + 7] = p1.y - tmpSide.y * w;
      trailPos[o + 8] = p1.z - tmpSide.z * w;
      trailPos[o + 9] = p1.x + tmpSide.x * w;
      trailPos[o + 10] = p1.y + tmpSide.y * w;
      trailPos[o + 11] = p1.z + tmpSide.z * w;
      const c = trailLive * 16;
      for (let v = 0; v < 4; v++) {
        trailCol[c + v * 4] = r;
        trailCol[c + v * 4 + 1] = g;
        trailCol[c + v * 4 + 2] = b;
        trailCol[c + v * 4 + 3] = a;
      }
      trailLive++;
    }
  }

  function updateTrails(dt) {
    trailLive = 0;
    for (const a of arrows) {
      if (!a.trail) continue;
      const pts = a.trail;
      for (const p of pts) p.age += dt;
      while (pts.length && pts[0].age >= TRAIL_LIFE) pts.shift();
      emitTrail(pts, a.hot);
    }
    for (let i = deadTrails.length - 1; i >= 0; i--) {
      const t = deadTrails[i];
      for (const p of t.pts) p.age += dt;
      while (t.pts.length && t.pts[0].age >= TRAIL_LIFE) t.pts.shift();
      if (!t.pts.length) {
        deadTrails.splice(i, 1);
        continue;
      }
      emitTrail(t.pts, t.hot);
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.color.needsUpdate = true;
    trailGeo.setDrawRange(0, trailLive * 6);
  }

  function debrisBurst(m) {
    const cols = m.kind === 'slime'
      ? [0x3dcc4a, 0x3dcc4a, 0x2da33b, 0xffffff, 0x142014]
      : m.kind === 'zombie'
        ? [0x6aaa4a, 0x2a4f86, 0x24315e, 0xffffff]
        : [0x2f6a30, 0x7a1e28, 0x3a2418, 0xd4a017, 0xff3b3b];
    const n = m.kind === 'boss' ? 150 : 44 + Math.floor(Math.random() * 24);
    for (let i = 0; i < n; i++) {
      if (debris.length >= DEBRIS_MAX) debris.shift();
      const ang = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 6.5;
      const life = 2 + Math.random() * 1;
      debris.push({
        x: m.pos.x + (Math.random() - 0.5) * m.r * 1.5,
        y: m.pos.y + 0.15 + Math.random() * (m.h - 0.2),
        z: m.pos.z + (Math.random() - 0.5) * m.r * 1.5,
        vx: Math.cos(ang) * sp,
        vy: 3.5 + Math.random() * 6.5,
        vz: Math.sin(ang) * sp,
        rx: Math.random() * 6.28,
        ry: Math.random() * 6.28,
        rz: Math.random() * 6.28,
        wx: (Math.random() - 0.5) * 14,
        wy: (Math.random() - 0.5) * 14,
        wz: (Math.random() - 0.5) * 14,
        s: 0.15 + Math.random() * 0.1,
        color: cols[(Math.random() * cols.length) | 0],
        life,
        max: life,
      });
    }
  }

  function updateDebris(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.life -= dt;
      if (d.life <= 0) {
        debris.splice(i, 1);
        continue;
      }
      d.vy -= 22 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      const floor = 2 + d.s * 0.5;
      if (d.y < floor) {
        d.y = floor;
        d.vy *= -0.38;
        d.vx *= 0.72;
        d.vz *= 0.72;
        d.wx *= 0.6;
        d.wy *= 0.6;
        d.wz *= 0.6;
        if (Math.abs(d.vy) < 0.8) {
          d.vy = 0;
          d.vx *= 0.9;
          d.vz *= 0.9;
        }
      }
      d.rx += d.wx * dt;
      d.ry += d.wy * dt;
      d.rz += d.wz * dt;
    }
    dMesh.count = debris.length;
    for (let i = 0; i < debris.length; i++) {
      const d = debris[i];
      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(d.rx, d.ry, d.rz);
      const fade = Math.min(1, d.life / 0.6);
      dummy.scale.setScalar(d.s * (0.25 + 0.75 * fade));
      dummy.updateMatrix();
      dMesh.setMatrixAt(i, dummy.matrix);
      tmpColor.setHex(d.color);
      dMesh.setColorAt(i, tmpColor);
    }
    if (debris.length) {
      dMesh.instanceMatrix.needsUpdate = true;
      dMesh.instanceColor.needsUpdate = true;
    }
  }

  function addShake(a) {
    shakeAmt = Math.min(0.6, Math.max(shakeAmt, a));
  }

  function applyShake(dt) {
    if (shakeAmt > 0.0005) {
      const s = shakeAmt * shakeScale;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      camera.rotation.z += (Math.random() - 0.5) * s * 0.35;
      camera.updateMatrixWorld();
      shakeAmt *= Math.exp(-7 * dt);
    } else {
      shakeAmt = 0;
    }
  }

  function clearFx() {
    debris.length = 0;
    dMesh.count = 0;
    dMesh.instanceMatrix.needsUpdate = true;
    deadTrails.length = 0;
    trailLive = 0;
    trailGeo.setDrawRange(0, 0);
    shakeAmt = 0;
    fovKick = 0;
    bowRecoil = 0;
  }
  // --- end juice FX ---

  // HUD: DOM is written only when a value actually changes (no per-frame style/text
  // writes → no per-frame style recalc/layout).
  const hudCache = { score: -1, wave: -1, left: -1, pct: -1, hurt: -1, charge: -1, chargeOn: null };
  function updateHUD(dt) {
    if (hudCache.score !== score) { hudCache.score = score; hudScore.textContent = String(score); }
    const wv = Math.max(wave, 1);
    if (hudCache.wave !== wv) { hudCache.wave = wv; hudWave.textContent = String(wv); }
    let left = toSpawn.length;
    for (let i = 0; i < monsters.length; i++) if (monsters[i].alive) left++;
    if (hudCache.left !== left) { hudCache.left = left; hudLeft.textContent = String(left); }
    const pct = Math.max(0, Math.min(100, hp));
    if (hudCache.pct !== pct) {
      hudCache.pct = pct;
      hpFill.style.width = `${pct}%`;
      hpFill.style.background = pct > 55 ? '#3ecf6e' : pct > 28 ? '#e2b43a' : '#e04b4b';
      hpText.textContent = `HP ${pct}`;
    }
    const hq = Math.round(Math.min(0.8, hurtFlash * 2.2) * 100);
    if (hudCache.hurt !== hq) { hudCache.hurt = hq; hurt.style.opacity = String(hq / 100); }
    const chargeOn = charging && state === 'playing';
    if (hudCache.chargeOn !== chargeOn) { hudCache.chargeOn = chargeOn; charge.classList.toggle('hidden', !chargeOn); }
    if (chargeOn) {
      const cw = Math.round(Math.min(100, (chargeT / CHARGE_TIME) * 100));
      if (hudCache.charge !== cw) { hudCache.charge = cw; chargeFill.style.width = `${cw}%`; }
    }
    const pull = charging ? Math.min(1, chargeT / CHARGE_TIME) : 0;
    string.position.z = 0.08 + pull * 0.16;
    bowRecoil = Math.max(0, bowRecoil - dt * 4.5);
    const rk = bowRecoil * bowRecoil;
    bow.position.y = -0.36 + Math.sin(player.bob) * 0.012;
    bow.position.z = -0.95 + rk * 0.09;
    bow.rotation.x = rk * 0.14;
    fovKick = Math.max(0, fovKick - dt * 14);
    const targetFov = FOV_BASE + fovKick;
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
    }
  }

  function updateFPS(dt) {
    fpsAcc += dt;
    fpsFrames += 1;
    if (fpsAcc >= 0.3) {
      fps = fpsFrames / fpsAcc;
      if (debug) {
        const info = renderer ? renderer.info.render : null;
        const geos = renderer ? renderer.info.memory.geometries : 0;
        const calls = info ? info.calls : 0;
        const tris = info ? info.triangles : 0;
        const L = Q_LEVELS[qLevel];
        fpsEl.textContent = `FPS ${Math.round(fps)} · ${calls} calls · ${(tris / 1000).toFixed(0)}k tris · ${geos} geom · ${L.name}${qualityLocked ? '' : '(auto)'} · dpr ${renderer.getPixelRatio().toFixed(2)} · shadow ${renderer.shadowMap.enabled ? L.shadow : 'off'} · ${voxelMeshes} vox · auto: ${qDecision} · look ${lookFilter ? 'filter' : 'direct'} sens×${(lookGain / LOOK).toFixed(2)}${params.get('rawmouse') === '1' ? ' raw' : ''}`;
      }
      fpsFrames = 0;
      fpsAcc = 0;
    }
    autoQuality(realDt);
  }

  // Auto quality. A mid-play setPixelRatio / shadow-map realloc / shadow-type switch
  // (= recompile of every program) is itself a big hitch, so this ONLY acts while on
  // the menu or during the first 3 s of play, then locks for good.
  // Metric: 90th-percentile frame time over ~1.5 s windows (an average hides the
  // uneven 16/33 ms pacing that reads as stutter when turning).
  function autoQuality(dt) {
    if (qualityLocked || !(dt > 0) || document.hidden) return;
    const allowed = state === 'menu' || (state === 'playing' && playT < 3);
    if (!allowed) {
      if (state === 'playing') lockQuality('play started → locked');
      return;
    }
    if (qWarm < 1) { qWarm += dt; return; }
    if (qN < qBuf.length) qBuf[qN++] = dt * 1000;
    qSum += dt;
    if (qSum < 1.5 || qN < 12) return;
    const win = qBuf.subarray(0, qN);
    win.sort();
    const p90 = win[Math.floor(qN * 0.9)];
    const avg = (qN / qSum);
    qSum = 0;
    qN = 0;
    const bad = p90 > 20; // >10% of frames miss a 60 Hz vsync
    const from = Q_LEVELS[qLevel].name;
    if (qPrevLevel >= 0 && bad && p90 > qPrevP90 * 0.9) {
      // the last step did not help (e.g. browser capped at 30 Hz / CPU bound): undo it
      qLevel = qPrevLevel;
      setLevelNow(`step ${from} did not help (p90 ${p90.toFixed(1)}ms) → back to ${Q_LEVELS[qLevel].name}`);
      lockQuality(`locked ${Q_LEVELS[qLevel].name}`);
    } else if (bad && qLevel > 0) {
      qPrevP90 = p90;
      qPrevLevel = qLevel;
      qLevel -= 1;
      setLevelNow(`p90 ${p90.toFixed(1)}ms avg ${avg.toFixed(0)}fps @${from} → ${Q_LEVELS[qLevel].name}`);
      qWarm = 0.5;
    } else {
      lockQuality(`ok p90 ${p90.toFixed(1)}ms avg ${avg.toFixed(0)}fps → locked ${from}`);
    }
  }

  function setLevelNow(reason) {
    applyQuality();
    // compile any new program variants (shadow type) right now, not on first view
    if (renderer) renderer.compile(scene, camera);
    qDecision = reason;
    perfLog.quality.push({ t: Math.round(performance.now()), state, reason });
    console.info(`[quality] ${reason}`);
  }

  function lockQuality(reason) {
    if (qualityLocked) return;
    qualityLocked = true;
    qDecision = reason;
    perfLog.quality.push({ t: Math.round(performance.now()), state, reason });
    console.info(`[quality] ${reason}`);
  }

  function overlaps(x, y, z) {
    const minX = x - R;
    const maxX = x + R;
    const minY = y;
    const maxY = y + H;
    const minZ = z - R;
    const maxZ = z + R;
    for (const b of colliders) {
      if (maxX > b.minX && minX < b.maxX && maxY > b.minY && minY < b.maxY && maxZ > b.minZ && minZ < b.maxZ) {
        return true;
      }
    }
    return false;
  }

  function blockedCircle(x, z, radius) {
    for (const b of colliders) {
      if (b.maxY <= 2.05) continue;
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < radius * radius) return true;
    }
    return false;
  }

  function resize() {
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!renderer) return;
    renderer.setPixelRatio(pixelRatioFor(qLevel));
    renderer.setSize(w, h, false);
  }

  function loop(t) {
    requestAnimationFrame(loop);
    const now = t || performance.now();
    const frameMs = loop.prev ? now - loop.prev : 0;
    const dt = loop.prev ? Math.min(0.05, frameMs / 1000) : 0;
    realDt = frameMs > 1000 ? 0 : Math.min(0.25, frameMs / 1000); // real frame time (quality decisions); >1 s = tab switch, ignore
    loop.prev = now;
    segStart();
    if (camPreset && state !== 'playing') applyPreset(VIEWS[camPreset]);
    else if (state === 'menu') updateMenu(now);
    else if (state === 'playing') {
      playT += realDt;
      if (lookFilter) applyLook(now, frameMs);
      if (charging) chargeT += dt;
      cool = Math.max(0, cool - dt);
      player.hurtT = Math.max(0, player.hurtT - dt);
      hurtFlash = Math.max(0, hurtFlash - dt);
      if (fireHeld && buffs.has('rapid')) {
        rapidT += dt;
        while (rapidT >= RAPID_RATE) {
          rapidT -= RAPID_RATE;
          fireArrow(0.35, true);
        }
      } else {
        rapidT = 0;
      }
      seg(SEG.look);
      const moving = movePlayer(dt);
      applyCamera(moving);
      applyShake(dt);
      seg(SEG.move);
      updateArrows(dt);
      seg(SEG.arrows);
      buffs.update(dt);
      seg(SEG.buffs);
      const mdt = buffs.has('slowmo') ? dt * 0.35 : dt;
      for (const m of monsters) {
        if (!m.alive) continue;
        updateMonster(m, mdt);
        if (touches(m)) hurtPlayer(m);
        if (state !== 'playing') break;
      }
      seg(SEG.monsters);
      if (state === 'playing') {
        updateWaves(dt);
        updateIndicators();
        updateParticles(dt);
        updatePopups(dt);
        updateTrails(dt);
        updateDebris(dt);
        seg(SEG.fx);
        if (bannerLeft > 0) {
          bannerLeft -= dt;
          if (bannerLeft <= 0) banner.classList.add('hidden');
        }
        updateHUD(dt);
        seg(SEG.hud);
      }
    }
    seg(SEG.move);
    syncSky();
    sky.update(dt, now);
    seg(SEG.sky);
    if (renderer) renderer.render(scene, camera);
    seg(SEG.render);
    updateFPS(dt);
    seg(SEG.post);
    diagFrame(now, frameMs);
    perfEnd(frameMs, now);
  }

  function touches(m) {
    const d = Math.hypot(m.pos.x - player.x, m.pos.z - player.z);
    const yOk = player.y < m.pos.y + m.h && player.y + H > m.pos.y;
    return yOk && d < m.r + 0.42;
  }

  document.getElementById('btn-start').addEventListener('click', (e) => {
    e.stopPropagation();
    start();
  });
  document.getElementById('btn-resume').addEventListener('click', (e) => {
    e.stopPropagation();
    resume();
  });
  document.getElementById('btn-retry').addEventListener('click', (e) => {
    e.stopPropagation();
    start();
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space' && state === 'playing') jumpQueued = true;
    if ((e.code === 'Enter' || e.code === 'Space') && state === 'menu') start();
    if (e.code === 'Escape' && state === 'playing' && document.pointerLockElement !== canvas) pause();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') e.preventDefault();
    keys.delete(e.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    charging = false;
    fireHeld = false;
    clearJoy();
  });

  window.addEventListener('mousedown', (e) => {
    if (suppressMouse || e.button !== 0 || state !== 'playing') return;
    if (e.target.closest && e.target.closest('button, .card, #fire, #joy')) return;
    beginCharge();
    dragging = document.pointerLockElement !== canvas;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    dragging = false;
    if (suppressMouse) {
      suppressMouse = false;
      return;
    }
    releaseShot();
  });
  window.addEventListener('mousemove', (e) => {
    if (performance.now() - lastTouch < 600) return;
    if (state !== 'playing') return;
    const locked = document.pointerLockElement === canvas;
    if (locked || dragging) {
      if (locked) diag.lockedEvents++;
      else diag.dragEvents++;
      onLookDelta(e.movementX, e.movementY, e.timeStamp);
    }
  });
  // Mouse look — standard FPS / PointerLockControls approach: every mousemove applies
  // yaw -= movementX*k, pitch -= movementY*k IMMEDIATELY; rendering just uses the current
  // rotation. No queue, no smoothing, no outlier filter (only a hard sanity clamp).
  // ?looksmooth=1 re-enables the experimental per-frame de-alias filter (src/look.js).
  const sensParam = parseFloat(params.get('sens'));
  const lookGain = LOOK * (Number.isFinite(sensParam) && sensParam > 0 ? Math.min(10, sensParam) : 1);
  const lookFilter = params.get('looksmooth') === '1' ? createLookFilter({ smooth: '1' }) : null;
  function onLookDelta(dx, dy, ts) {
    if (!(Math.abs(dx) <= 1500 && Math.abs(dy) <= 1500)) { diag.clamped++; return; }
    diagEvent(dx, ts || performance.now());
    if (lookFilter) { lookFilter.push(dx, dy, ts || performance.now()); return; }
    player.yaw -= dx * lookGain;
    player.pitch = clamp(player.pitch - dy * lookGain, -1.15, 1.15);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
  }
  function applyLook(now, frameMs) {
    if (!lookFilter) return;
    const d = lookFilter.take(now, frameMs);
    if (d.x === 0 && d.y === 0) return;
    player.yaw -= d.x * lookGain;
    player.pitch = clamp(player.pitch - d.y * lookGain, -1.15, 1.15);
  }

  // --- look diagnostics (always recorded, cheap; overlay with ?lookdiag=1) ---
  const DIAG_N = 1024;
  const diag = {
    evT: new Float64Array(DIAG_N), evDx: new Float32Array(DIAG_N), evI: 0, evN: 0,
    frT: new Float64Array(DIAG_N), frDt: new Float32Array(DIAG_N), frEv: new Uint8Array(DIAG_N),
    frYaw: new Float32Array(DIAG_N), frI: 0, frN: 0,
    evThisFrame: 0, lastYaw: 0, clamped: 0, dragEvents: 0, lockedEvents: 0, touchEvents: 0,
  };
  function diagEvent(dx, ts) {
    diag.evT[diag.evI] = ts;
    diag.evDx[diag.evI] = dx;
    diag.evI = (diag.evI + 1) % DIAG_N;
    diag.evN++;
    if (diag.evThisFrame < 255) diag.evThisFrame++;
  }
  function diagFrame(now, frameMs) {
    const yd = state === 'playing' ? diag.lastYaw - player.yaw : 0;
    diag.lastYaw = player.yaw;
    diag.frT[diag.frI] = now;
    diag.frDt[diag.frI] = frameMs;
    diag.frEv[diag.frI] = diag.evThisFrame;
    diag.frYaw[diag.frI] = yd;
    diag.frI = (diag.frI + 1) % DIAG_N;
    diag.frN++;
    diag.evThisFrame = 0;
    if (diagCtx && (diag.frN & 1) === 0) drawDiag(now);
  }
  function diagWindow(now, ms) {
    const fr = [];
    for (let k = 1; k <= Math.min(diag.frN, DIAG_N); k++) {
      const i = (diag.frI - k + DIAG_N) % DIAG_N;
      if (now - diag.frT[i] > ms) break;
      fr.push(i);
    }
    fr.reverse();
    const ev = [];
    for (let k = 1; k <= Math.min(diag.evN, DIAG_N); k++) {
      const i = (diag.evI - k + DIAG_N) % DIAG_N;
      if (now - diag.evT[i] > ms) break;
      ev.push(i);
    }
    ev.reverse();
    return { fr, ev };
  }
  const pct = (arr, p) => {
    if (!arr.length) return 0;
    const a = arr.slice().sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor(a.length * p))];
  };
  function lookDump() {
    const now = performance.now();
    const { fr, ev } = diagWindow(now, 5000);
    const dts = fr.map((i) => diag.frDt[i]);
    const evs = fr.map((i) => diag.frEv[i]);
    const yaws = fr.map((i) => diag.frYaw[i]);
    const gaps = [];
    for (let k = 1; k < ev.length; k++) gaps.push(diag.evT[ev[k]] - diag.evT[ev[k - 1]]);
    const hist = { 0: 0, 1: 0, 2: 0, 3: 0, '4+': 0 };
    for (const e of evs) hist[e >= 4 ? '4+' : e]++;
    // during-motion frames: yaw changed in this or neighbouring frames
    const moving = yaws.map((y, i) => Math.abs(y) > 1e-6 || Math.abs(yaws[i - 1] || 0) > 1e-6 || Math.abs(yaws[i + 1] || 0) > 1e-6);
    const zeroWhileMoving = yaws.filter((y, i) => moving[i] && Math.abs(y) < 1e-6).length;
    const r2 = (x) => Math.round(x * 100) / 100;
    return {
      at: new Date().toISOString(),
      ua: navigator.userAgent,
      dpr: window.devicePixelRatio,
      screen: `${screen.width}x${screen.height}`,
      maxTouchPoints: navigator.maxTouchPoints || 0,
      touchUI: document.body.classList.contains('touch'),
      pointerLocked: document.pointerLockElement === canvas,
      lockedEvents: diag.lockedEvents,
      dragEvents: diag.dragEvents,
      touchEvents: diag.touchEvents,
      clampedEvents: diag.clamped,
      mode: lookFilter ? 'looksmooth=1 (filter)' : 'direct',
      sens: lookGain / LOOK,
      rawmouse: params.get('rawmouse') === '1',
      state,
      quality: Q_LEVELS[qLevel].name,
      frames: fr.length,
      frameMs: { median: r2(pct(dts, 0.5)), p90: r2(pct(dts, 0.9)), p99: r2(pct(dts, 0.99)), max: r2(Math.max(0, ...dts)) },
      events: ev.length,
      eventGapMs: { median: r2(pct(gaps, 0.5)), p10: r2(pct(gaps, 0.1)), p90: r2(pct(gaps, 0.9)), max: r2(Math.max(0, ...gaps)) },
      eventsPerFrameHist: hist,
      zeroYawFramesWhileTurning: zeroWhileMoving,
      perFrame: fr.map((i) => [r2(diag.frDt[i]), diag.frEv[i], Math.round(diag.frYaw[i] * 1e5) / 1e5]),
      perEvent: ev.slice(-300).map((i) => [r2(diag.evT[i] - now), diag.evDx[i]]),
    };
  }
  let diagCtx = null;
  let diagText = null;
  if (params.get('lookdiag') === '1') {
    const c = document.createElement('canvas');
    c.width = 360;
    c.height = 120;
    c.style.cssText = 'position:fixed;left:8px;top:250px;z-index:60;background:rgba(0,0,0,.6);pointer-events:none;border-radius:4px';
    document.body.appendChild(c);
    diagCtx = c.getContext('2d');
    diagText = document.createElement('pre');
    diagText.style.cssText = 'position:fixed;left:8px;top:128px;z-index:60;margin:0;padding:6px 8px;background:rgba(0,0,0,.6);color:#cfe;font:11px/1.3 monospace;pointer-events:none;border-radius:4px;white-space:pre';
    document.body.appendChild(diagText);
  }
  function drawDiag(now) {
    const g = diagCtx;
    const W = 360;
    const H = 120;
    g.clearRect(0, 0, W, H);
    const { fr, ev } = diagWindow(now, 5000);
    let ymax = 1e-4;
    for (const i of fr) ymax = Math.max(ymax, Math.abs(diag.frYaw[i]));
    const n = fr.length;
    const bw = W / Math.max(1, n);
    for (let k = 0; k < n; k++) {
      const i = fr[k];
      const y = Math.abs(diag.frYaw[i]) / ymax;
      g.fillStyle = diag.frEv[i] === 0 ? '#ff6060' : diag.frEv[i] === 1 ? '#60e090' : '#ffd060';
      g.fillRect(k * bw, 70 - y * 60, Math.max(1, bw), Math.max(1, y * 60));
      const dtv = Math.min(50, diag.frDt[i]);
      g.fillStyle = '#6aa8ff';
      g.fillRect(k * bw, 118 - dtv, Math.max(1, bw), 1);
    }
    g.fillStyle = 'rgba(255,255,255,.3)';
    g.fillRect(0, 118 - 16.7, W, 1);
    g.fillStyle = '#fff';
    g.font = '10px monospace';
    g.fillText('|yaw/frame| (green=1 ev, yellow=2+, red=0)   blue: frame ms (line=16.7)', 3, 9);
    if ((diag.frN & 15) === 0) {
      const d = lookDump();
      diagText.textContent =
        `look ${d.mode} · locked ${d.pointerLocked} (locked ev ${d.lockedEvents}, drag ev ${d.dragEvents}, touch ev ${d.touchEvents}) · touchUI ${d.touchUI} · maxTouch ${d.maxTouchPoints}\n` +
        `frame ms med ${d.frameMs.median} p90 ${d.frameMs.p90} max ${d.frameMs.max} · events ${d.events}/5s gap med ${d.eventGapMs.median} p90 ${d.eventGapMs.p90}\n` +
        `events/frame ${JSON.stringify(d.eventsPerFrameHist)} · zero-yaw frames while turning ${d.zeroYawFramesWhileTurning} · sens ${d.sens}`;
    }
  }
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    if (locked) {
      sawLock = true;
      if (state === 'paused') setState('playing');
    } else if (sawLock && state === 'playing') {
      charging = false;
      fireHeld = false;
      setState('paused');
    }
  });

  joyEl.addEventListener('touchstart', (e) => {
    lastTouch = performance.now();
    const t = e.changedTouches[0];
    joy.id = t.identifier;
    const rect = joyEl.getBoundingClientRect();
    joy.cx = rect.left + rect.width / 2;
    joy.cy = rect.top + rect.height / 2;
    setJoy(t.clientX, t.clientY);
    e.preventDefault();
  }, { passive: false });
  joyEl.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) setJoy(t.clientX, t.clientY);
    }
    e.preventDefault();
  }, { passive: false });
  joyEl.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) clearJoy();
    }
  });
  joyEl.addEventListener('touchcancel', () => clearJoy());

  fireBtn.addEventListener('touchstart', (e) => {
    lastTouch = performance.now();
    suppressMouse = true;
    e.preventDefault();
    beginCharge();
  }, { passive: false });
  fireBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    releaseShot();
  }, { passive: false });
  fireBtn.addEventListener('mousedown', (e) => {
    if (suppressMouse) return;
    e.preventDefault();
    e.stopPropagation();
    beginCharge();
  });

  document.addEventListener('touchstart', (e) => {
    lastTouch = performance.now();
    if (state !== 'playing') return;
    for (const t of e.changedTouches) {
      if (t.target.closest && t.target.closest('#joy, #fire, button, .card')) continue;
      if (t.clientX > window.innerWidth * 0.42 && lookId === null) {
        lookId = t.identifier;
        lookX = t.clientX;
        lookY = t.clientY;
      }
    }
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    let looked = false;
    for (const t of e.changedTouches) {
      if (t.identifier !== lookId || state !== 'playing') continue;
      diag.touchEvents++;
      player.yaw -= (t.clientX - lookX) * 0.005;
      player.pitch -= (t.clientY - lookY) * 0.005;
      player.pitch = clamp(player.pitch, -1.15, 1.15);
      lookX = t.clientX;
      lookY = t.clientY;
      looked = true;
    }
    if (looked) e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === lookId) lookId = null;
    }
  });

  window.addEventListener('resize', resize);
  resize();
  updateMenu(0);
  applyQuality();
  syncSky();
  prewarm();
  if (renderer) renderer.render(scene, camera);
  requestAnimationFrame(loop);

  // Compile every shader program + upload every texture up front, including objects
  // that are hidden / empty at load (bow, monsters, particles, buff orbs, meteors,
  // fireflies) so nothing compiles the first time it scrolls into view mid-play.
  function prewarm() {
    if (!renderer) return;
    const t0 = performance.now();
    const hidden = [];
    scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    const tmp = new THREE.Group();
    for (const kind of ['slime', 'zombie', 'boss']) {
      const b = kind === 'slime' ? buildSlime(GEO) : buildHumanoid(GEO, kind);
      tmp.add(b.group);
    }
    tmp.position.set(player.x, -50, player.z);
    scene.add(tmp);
    renderer.compile(scene, camera);
    // One real draw of everything (culling off, empty instanced/ranged meshes forced to
    // draw) so the GPU driver also builds its pipeline states now — ANGLE/Metal on macOS
    // creates them lazily at the first draw, not at link time. Overwritten next frame.
    const restore = [];
    tmp.position.set(player.x, player.y, player.z - 6);
    scene.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine)) return;
      const r = { o, fc: o.frustumCulled, count: o.count, dr: o.geometry ? o.geometry.drawRange.count : 0 };
      restore.push(r);
      o.frustumCulled = false;
      if (o.isInstancedMesh && o.count === 0) o.count = 1;
      if (o.geometry && o.geometry.drawRange.count === 0) o.geometry.drawRange.count = Infinity;
    });
    const prevAuto = renderer.shadowMap.autoUpdate;
    renderer.render(scene, camera);
    renderer.shadowMap.autoUpdate = prevAuto;
    for (const r of restore) {
      r.o.frustumCulled = r.fc;
      if (r.o.isInstancedMesh) r.o.count = r.count;
      if (r.o.geometry) r.o.geometry.drawRange.count = r.dr;
    }
    scene.traverse((o) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        for (const k of ['map', 'envMap', 'alphaMap', 'emissiveMap']) if (m[k] && m[k].isTexture) renderer.initTexture(m[k]);
        if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) renderer.initTexture(u.value);
      }
    });
    scene.remove(tmp);
    for (const o of hidden) o.visible = false;
    perfEvent(`prewarm ${renderer.info.programs.length} programs ${(performance.now() - t0).toFixed(0)}ms`);
  }

  function setJoy(cx, cy) {
    const dx = cx - joy.cx;
    const dy = cy - joy.cy;
    const max = 48;
    const mag = Math.hypot(dx, dy) || 1;
    const scale = Math.min(1, max / mag);
    knob.style.left = `${40 + dx * scale}px`;
    knob.style.top = `${40 + dy * scale}px`;
    joy.x = (dx * scale) / max;
    joy.y = -(dy * scale) / max;
    joy.mag = Math.min(1, mag / max);
  }

  function clearJoy() {
    joy.x = 0;
    joy.y = 0;
    joy.mag = 0;
    joy.id = null;
    knob.style.left = '40px';
    knob.style.top = '40px';
  }

  return {
    get state() { return state; },
    get score() { return score; },
    get wave() { return wave; },
    get hp() { return hp; },
    get monsters() { return monsters.reduce((n, m) => n + (m.alive ? 1 : 0), 0); },
    get arrows() { return arrows.length; },
    get drawCalls() { return renderer ? renderer.info.render.calls : 0; },
    get quality() { return quality; },
    setQuality,
    get stats() {
      const info = renderer ? renderer.info.render : null;
      return {
        fps: Math.round(fps),
        calls: info ? info.calls : 0,
        tris: info ? info.triangles : 0,
        quality,
        level: Q_LEVELS[qLevel].name,
        dpr: renderer ? renderer.getPixelRatio() : 0,
        shadow: renderer && renderer.shadowMap.enabled ? Q_LEVELS[qLevel].shadow : 0,
        voxelMeshes,
      };
    },
    get fx() {
      return {
        trails: trailLive,
        particles: particles.length,
        debris: debris.length,
      };
    },
    get shake() { return shakeScale; },
    set shake(v) { shakeScale = clamp(Number(v) || 0, 0, 4); },
    start,
    shoot,
    spawnTestMonster,
    view,
    giveBuff: (name) => buffs.giveBuff(name),
    aim: (yaw, pitch) => { player.yaw = yaw; player.pitch = clamp(pitch, -1.15, 1.15); },
    spawnOrb: (type, x, z) => buffs.spawn(type, x, z),
    setSky: (name) => sky.setMode(name),
    meteorShower: (n) => sky.shower(n),
    get _skyObj() { return sky; },
    get _internals() { return { scene, renderer, camera, sun, world }; },
    get perf() { return perfLog; },
    perfWindow,
    resetPerf() { perfLog.maxFrameMs = 0; perfLog.maxCpuMs = 0; perfLog.hitches.length = 0; perfLog.frames = 6; },
    look: (dx, dy) => { if (state === 'playing') onLookDelta(dx, dy, performance.now()); },
    lookDump,
    get lookInfo() { return { gain: lookGain, mode: lookFilter ? 'filter' : 'direct', clamped: diag.clamped, raw: params.get('rawmouse') === '1', pointerLocked: document.pointerLockElement === canvas, touchUI: document.body.classList.contains('touch') }; },
    jump: () => { if (state === 'playing') jumpQueued = true; },
    get sky() { return sky.mode; },
    get buffs() { return buffs.list(); },
  };
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function pointInBox(p, b) {
  return p.x > b.minX && p.x < b.maxX && p.y > b.minY && p.y < b.maxY && p.z > b.minZ && p.z < b.maxZ;
}

function hitsMonster(p, m) {
  return Math.abs(p.x - m.pos.x) < m.r + 0.28
    && Math.abs(p.z - m.pos.z) < m.r + 0.28
    && p.y >= m.pos.y - 0.08
    && p.y <= m.pos.y + m.h + 0.32;
}

function stickToBox(a, b) {
  const faces = [
    { d: Math.abs(a.pos.x - b.minX), apply() { a.pos.x = b.minX - 0.06; } },
    { d: Math.abs(a.pos.x - b.maxX), apply() { a.pos.x = b.maxX + 0.06; } },
    { d: Math.abs(a.pos.y - b.minY), apply() { a.pos.y = b.minY - 0.06; } },
    { d: Math.abs(a.pos.y - b.maxY), apply() { a.pos.y = b.maxY + 0.06; } },
    { d: Math.abs(a.pos.z - b.minZ), apply() { a.pos.z = b.minZ - 0.06; } },
    { d: Math.abs(a.pos.z - b.maxZ), apply() { a.pos.z = b.maxZ + 0.06; } },
  ];
  faces.sort((p, q) => p.d - q.d);
  faces[0].apply();
}

function makeSkyDome(sunDir) {
  const geo = new THREE.SphereGeometry(1, 40, 24);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color(0x4f86c9) },
      horizon: { value: new THREE.Color(0xf3d6b0) },
      sunColor: { value: new THREE.Color(0xffd9a8) },
      sunDir: { value: sunDir.clone() },
    },
    vertexShader: [
      'varying vec3 vDir;',
      'void main() {',
      '  vDir = position;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vDir;',
      'uniform vec3 zenith;',
      'uniform vec3 horizon;',
      'uniform vec3 sunColor;',
      'uniform vec3 sunDir;',
      'void main() {',
      '  vec3 dir = normalize(vDir);',
      '  float up = smoothstep(-0.04, 0.42, dir.y);',
      '  vec3 col = mix(horizon, zenith, up);',
      '  float sunDot = max(dot(dir, normalize(sunDir)), 0.0);',
      '  col += sunColor * (pow(sunDot, 220.0) * 1.35 + pow(sunDot, 10.0) * 0.38);',
      '  gl_FragColor = vec4(col, 1.0);',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

function buildBow() {
  const bow = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x8a5a32 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe0b090 });
  const stringMat = new THREE.MeshBasicMaterial({ color: 0xf4f4f4 });
  const limbL = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.42, 0.04), wood);
  limbL.position.set(0, 0.16, 0);
  limbL.rotation.z = 0.62;
  const limbR = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.42, 0.04), wood);
  limbR.position.set(0, -0.16, 0);
  limbR.rotation.z = -0.62;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.05), wood);
  const string = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.5, 0.012), stringMat);
  string.position.z = 0.08;
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.14), skin);
  hand.position.set(0.03, -0.03, 0.12);
  bow.add(limbL, limbR, grip, string, hand);
  bow.scale.setScalar(0.62);
  bow.position.set(0.42, -0.36, -0.95);
  return { bow, string };
}

const BOX_FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

function mergeBoxes(parts) {
  const pos = [];
  const norm = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color();
  for (const p of parts) {
    const hx = p.w / 2;
    const hy = p.h / 2;
    const hz = p.d / 2;
    c.setHex(p.color);
    for (const f of BOX_FACES) {
      const base = pos.length / 3;
      const hn = [hx * f.n[0], hy * f.n[1], hz * f.n[2]];
      const hu = [hx * f.u[0], hy * f.u[1], hz * f.u[2]];
      const hv = [hx * f.v[0], hy * f.v[1], hz * f.v[2]];
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pos.push(
          p.x + hn[0] + su * hu[0] + sv * hv[0],
          p.y + hn[1] + su * hu[1] + sv * hv[1],
          p.z + hn[2] + su * hu[2] + sv * hv[2],
        );
        norm.push(f.n[0], f.n[1], f.n[2]);
        col.push(c.r, c.g, c.b);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

const ARROW_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

function buildArrow() {
  const geo = mergeBoxes([
    { w: 0.05, h: 0.05, d: 0.72, x: 0, y: 0, z: -0.12, color: 0xc4a46a },
    { w: 0.09, h: 0.09, d: 0.16, x: 0, y: 0, z: -0.52, color: 0xd0d4d8 },
    { w: 0.12, h: 0.02, d: 0.14, x: 0, y: 0, z: 0.22, color: 0xf2f2f2 },
  ]);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, ARROW_MAT));
  return g;
}

function makeGeos() {
  return {
    slime: new THREE.BoxGeometry(1.05, 1.05, 1.05),
    sEyes: mergeBoxes([
      { w: 0.14, h: 0.16, d: 0.08, x: -0.18, y: 0.08, z: 0.52, color: 0xffffff },
      { w: 0.14, h: 0.16, d: 0.08, x: 0.18, y: 0.08, z: 0.52, color: 0xffffff },
    ]),
    head: new THREE.BoxGeometry(0.48, 0.46, 0.46),
    body: new THREE.BoxGeometry(0.56, 0.66, 0.32),
    arm: new THREE.BoxGeometry(0.16, 0.56, 0.16),
    leg: new THREE.BoxGeometry(0.18, 0.62, 0.18),
    eyes: mergeBoxes([
      { w: 0.08, h: 0.08, d: 0.06, x: -0.12, y: 1.62, z: 0.24, color: 0xffffff },
      { w: 0.08, h: 0.08, d: 0.06, x: 0.12, y: 1.62, z: 0.24, color: 0xffffff },
    ]),
    crown: new THREE.BoxGeometry(0.28, 0.1, 0.28),
  };
}

function buildSlime(GEO) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x3dcc4a, emissive: 0x000000 });
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x142014, emissive: 0x000000 });
  const body = new THREE.Mesh(GEO.slime, mat);
  body.position.y = 0.55;
  const eyes = new THREE.Mesh(GEO.sEyes, eyeMat);
  body.add(eyes);
  const group = new THREE.Group();
  group.add(body);
  return { group, body, armL: null, armR: null, legL: null, legR: null, mats: [mat, eyeMat] };
}

function buildHumanoid(GEO, kind) {
  const boss = kind === 'boss';
  const skin = new THREE.MeshLambertMaterial({ color: boss ? 0x2f6a30 : 0x6aaa4a, emissive: 0x000000 });
  const shirt = new THREE.MeshLambertMaterial({ color: boss ? 0x7a1e28 : 0x2a4f86, emissive: 0x000000 });
  const pants = new THREE.MeshLambertMaterial({ color: boss ? 0x3a2418 : 0x24315e, emissive: 0x000000 });
  const eye = new THREE.MeshLambertMaterial({ color: boss ? 0xff3b3b : 0x1a1a1a, emissive: 0x000000 });
  const group = new THREE.Group();
  const head = new THREE.Mesh(GEO.head, skin);
  head.position.set(0, 1.58, 0);
  const body = new THREE.Mesh(GEO.body, shirt);
  body.position.set(0, 1.05, 0);
  const eyes = new THREE.Mesh(GEO.eyes, eye);
  const armL = limb(GEO.arm, skin, -0.4, 1.32, -0.26);
  const armR = limb(GEO.arm, skin, 0.4, 1.32, -0.26);
  const legL = limb(GEO.leg, pants, -0.14, 0.7, -0.3);
  const legR = limb(GEO.leg, pants, 0.14, 0.7, -0.3);
  group.add(head, body, eyes, armL, armR, legL, legR);
  const mats = [skin, shirt, pants, eye];
  if (boss) {
    const crownMat = new THREE.MeshLambertMaterial({ color: 0xd4a017, emissive: 0x000000 });
    const crown = new THREE.Mesh(GEO.crown, crownMat);
    crown.position.set(0, 1.88, 0);
    group.add(crown);
    mats.push(crownMat);
    group.scale.setScalar(1.85);
  }
  return { group, body, armL, armR, legL, legR, mats };
}

function limb(geo, mat, x, y, hang) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = hang;
  pivot.add(mesh);
  return pivot;
}
