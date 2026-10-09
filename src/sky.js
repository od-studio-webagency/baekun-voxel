// Fantasy night sky: shader dome (stars, milky way, aurora), procedural moon,
// pooled meteors, fireflies, mode crossfade + lighting palette hook.
import * as THREE from 'three';

const R_DOME = 900;
const MAX_METEORS = 24;
const METEOR_SEGS = 8;
const FIREFLY_N = 200;
const FADE_TIME = 1.5;

const CAMPUS = { x0: -88, x1: 104, z0: -92, z1: 80, ground: 2 };
// moon over 백운산: azimuth toward (+1, 0, -0.6), elevation ~25°
const MOON_AZ = Math.atan2(-0.6, 1.0);
const MOON_EL = (25 * Math.PI) / 180;
const MOON_DIR = new THREE.Vector3(
  Math.cos(MOON_AZ) * Math.cos(MOON_EL),
  Math.sin(MOON_EL),
  Math.sin(MOON_AZ) * Math.cos(MOON_EL),
);

// par: [stars, nebula, aurora, horizonGlow] — packed into a vec4 uniform
const MODES = {
  night: {
    top: 0x05081f, hor: 0x1b1650, glow: 0x4a3670, neb: 0x7f6cff,
    par: [1.0, 1.0, 0.0, 0.55], metColor: 0xbcd2ff, metMin: 0.6, metMax: 2.5, moon: 0xfff4e0,
    palette: {
      hemiSky: 0x5a6cc0, hemiGround: 0x2a3a30, hemiIntensity: 2.0,
      keyColor: 0xaac0ff, keyIntensity: 1.6,
      fogColor: 0x0a1024, fogNear: 55, fogFar: 240,
      exposure: 1.2, windowGlow: 1.0, windowColor: 0xffc56b,
    },
  },
  aurora: {
    top: 0x03121a, hor: 0x0a3038, glow: 0x1e6a58, neb: 0x4fc8a8,
    par: [1.0, 0.55, 1.0, 0.45], metColor: 0x9fffd8, metMin: 0.8, metMax: 3.0, moon: 0xd8fff0,
    palette: {
      hemiSky: 0x14423f, hemiGround: 0x0a1410, hemiIntensity: 1.9,
      keyColor: 0x9fe8d0, keyIntensity: 1.4,
      fogColor: 0x08181c, fogNear: 55, fogFar: 250,
      exposure: 1.15, windowGlow: 1.0, windowColor: 0xffc56b,
    },
  },
  golden: {
    top: 0x160c04, hor: 0x54300e, glow: 0xa06428, neb: 0xffb35c,
    par: [0.9, 0.6, 0.0, 0.7], metColor: 0xffd27a, metMin: 0.18, metMax: 0.6, moon: 0xffe2b0,
    palette: {
      hemiSky: 0x4a3416, hemiGround: 0x1c120a, hemiIntensity: 1.9,
      keyColor: 0xffcf7a, keyIntensity: 1.4,
      fogColor: 0x1e1408, fogNear: 55, fogFar: 240,
      exposure: 1.15, windowGlow: 1.0, windowColor: 0xffc56b,
    },
  },
  red: {
    top: 0x14030a, hor: 0x4a0d18, glow: 0x8c1e2c, neb: 0xff4a55,
    par: [0.9, 1.0, 0.0, 0.6], metColor: 0xff7a5c, metMin: 0.5, metMax: 1.8, moon: 0xffb8a8,
    palette: {
      hemiSky: 0x48101c, hemiGround: 0x160a0c, hemiIntensity: 1.9,
      keyColor: 0xff7a66, keyIntensity: 1.4,
      fogColor: 0x1c0a10, fogNear: 55, fogFar: 235,
      exposure: 1.15, windowGlow: 1.0, windowColor: 0xffc56b,
    },
  },
  heal: {
    top: 0x041410, hor: 0x0e4034, glow: 0x2e8c6a, neb: 0x66e8b0,
    par: [0.9, 0.5, 0.35, 0.6], metColor: 0xa8ffd8, metMin: 1.0, metMax: 3.0, moon: 0xe0ffe8,
    palette: {
      hemiSky: 0x144a38, hemiGround: 0x0a1610, hemiIntensity: 1.9,
      keyColor: 0x8affc4, keyIntensity: 1.4,
      fogColor: 0x0a1c14, fogNear: 55, fogFar: 245,
      exposure: 1.15, windowGlow: 1.0, windowColor: 0xffc56b,
    },
  },
  day: {
    top: 0x4a90d8, hor: 0xd8ecf6, glow: 0xffe0b0, neb: 0x000000,
    par: [0.0, 0.0, 0.0, 0.35], metColor: 0xffffff, metMin: 9e9, metMax: 9e9, moon: 0xfff4e0,
    palette: {
      hemiSky: 0xbcd6ff, hemiGround: 0x6b5a43, hemiIntensity: 0.9,
      keyColor: 0xffd9a8, keyIntensity: 2.4,
      fogColor: 0xc5e4f4, fogNear: 80, fogFar: 240,
      exposure: 1.05, windowGlow: 0.0, windowColor: 0xffc56b,
    },
  },
};

const DOME_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w * 0.99995; // pin to far plane
}
`;

const DOME_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform float uMix;
uniform float uOct;
uniform vec3 uTopA; uniform vec3 uHorA; uniform vec3 uGlowA; uniform vec3 uNebA;
uniform vec3 uTopB; uniform vec3 uHorB; uniform vec3 uGlowB; uniform vec3 uNebB;
uniform vec4 uParA; uniform vec4 uParB; // x:stars y:nebula z:aurora w:horizonGlow
uniform sampler2D uNoise; // baked once: r=fbm(d*3) g=fbm(d*7) b=azimuth-periodic fbm
uniform float uStarL;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x),
        mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
        mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uOct) break;
    s += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}
vec3 starCell(vec3 d, float scale, float thresh, float bright) {
  vec3 p = d * scale;
  // pixel footprint in cell units (computed before any branch: derivatives need
  // uniform control flow). Stars are kept >= ~1 px wide with energy preserved, so
  // they don't sparkle/crawl (temporal aliasing) when the view rotates.
  float px = length(fwidth(p));
  float r = max(0.10, px * 0.9);
  float energy = (0.10 * 0.10) / (r * r);
  vec3 c = floor(p);
  vec3 f = fract(p) - 0.5;
  float h1 = hash13(c);
  if (h1 < thresh) return vec3(0.0);
  vec3 o = (hash33(c + 17.31) - 0.5) * 0.62;
  float dd = length(f - o);
  float tw = 0.5 + 0.5 * sin(uTime * (1.2 + h1 * 6.5) + h1 * 90.0);
  float i = smoothstep(r, 0.0, dd) * min(1.0, energy * 1.6) * (0.35 + 0.65 * tw) * bright;
  vec3 tint = mix(vec3(1.0), hash33(c + 41.7) * 0.6 + 0.55, step(0.93, h1));
  return tint * i * (1.0 + step(0.96, h1) * 1.6);
}
void main() {
  vec3 d = normalize(vDir);
  float m = smoothstep(0.0, 1.0, uMix);
  vec3 top = mix(uTopA, uTopB, m);
  vec3 hor = mix(uHorA, uHorB, m);
  vec3 glowC = mix(uGlowA, uGlowB, m);
  vec3 nebC = mix(uNebA, uNebB, m);
  vec4 par = mix(uParA, uParB, m);
  float h = d.y;

  vec3 col = mix(hor, top, smoothstep(-0.08, 0.55, h));
  col += glowC * par.w * exp(-max(h, 0.0) * 5.0) * smoothstep(-0.3, 0.03, h);

  if (par.x > 0.001) {
    float hfade = smoothstep(-0.02, 0.18, h);
    col += starCell(d, 140.0, 0.80, 0.9) * par.x * hfade;
    col += starCell(d, 60.0, 0.90, 1.5) * par.x * hfade;
    if (uStarL > 2.5) col += starCell(d, 260.0, 0.88, 0.5) * par.x * hfade;
  }

  if (par.y > 0.001) {
    vec3 mwN = normalize(vec3(0.2, -0.15, -0.96));
    float bd = dot(d, mwN);
    float band = exp(-bd * bd * 6.5);
    vec2 euv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
    vec4 nz = texture2D(uNoise, euv);
    float n1 = nz.r;
    float n2 = nz.g;
    float cloud = smoothstep(0.30, 0.85, n1);
    float dust = smoothstep(0.55, 0.85, n2);
    col += band * par.y * (cloud * 1.35 + 0.14) * nebC * 0.75;
    col += band * par.y * pow(max(n1, 0.0), 3.0) * vec3(1.0, 0.75, 0.9) * 0.55;
    col -= band * par.y * dust * nebC * 0.25;
  }

  if (par.z > 0.001 && h > 0.05) {
    float az = atan(d.z, d.x);
    float au = az * 0.15915494 + 0.5;
    float w = texture2D(uNoise, vec2(au * 2.0 + uTime * 0.004, fract(h * 0.9 - uTime * 0.018))).b;
    float rib = texture2D(uNoise, vec2(au * 6.0 + w * 0.5, fract(0.37 + uTime * 0.012))).b;
    float bandA = smoothstep(0.08, 0.38, h) * smoothstep(0.95, 0.45, h);
    float a = bandA * smoothstep(0.42, 0.78, rib)
      * (0.6 + 0.4 * sin(az * 6.0 + uTime * 0.45 + w * 4.0));
    vec3 ac = mix(vec3(0.15, 1.0, 0.55), vec3(0.55, 0.25, 1.0), clamp(h * 1.7, 0.0, 1.0));
    col += ac * a * par.z * 0.9;
  }

  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

const BAKE_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x),
        mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
        mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
void main() {
  float az = (vUv.x - 0.5) * 6.2831853;
  float el = (vUv.y - 0.5) * 3.1415927;
  vec3 d = vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
  float n1 = fbm(d * 3.0);
  float n2 = fbm(d * 7.0 + vec3(4.7, 1.3, 8.1));
  // azimuth-periodic noise on a cylinder (tiles in u and v) for animated aurora
  vec3 cyl = vec3(cos(vUv.x * 6.2831853) * 1.6, sin(vUv.x * 6.2831853) * 1.6, 0.0);
  float a1 = fbm(cyl + vec3(0.0, 0.0, sin(vUv.y * 6.2831853) * 1.2) + vec3(0.0, 0.0, cos(vUv.y * 6.2831853) * 1.2 + 7.0));
  gl_FragColor = vec4(n1, n2, a1, 1.0);
}
`;

const MOON_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const MOON_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec3 uTint;
uniform float uOct;
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x),
        mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
        mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uOct) break;
    s += a * vnoise(p);
    p *= 2.11;
    a *= 0.5;
  }
  return s;
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float disc = 1.0 - smoothstep(0.42, 0.455, r);
  vec3 n = vec3(p.x, p.y, sqrt(max(0.0, 0.42 * 0.42 - r * r)) / 0.42);
  vec3 L = normalize(vec3(-0.45, 0.5, 0.72));
  float li = clamp(dot(n, L) * 0.85 + 0.15, 0.0, 1.0);
  float crat = fbm(vec3(p * 5.0, 1.7));
  float maria = fbm(vec3(p * 1.9, 4.2));
  vec3 mcol = vec3(0.88, 0.89, 0.92);
  mcol *= 0.72 + 0.38 * li;
  mcol *= 0.82 + 0.36 * crat;
  mcol = mix(mcol, mcol * vec3(0.58, 0.62, 0.75), smoothstep(0.48, 0.78, maria) * 0.75);
  mcol *= uTint;
  float limb = smoothstep(0.30, 0.44, r) * disc * li;
  mcol += uTint * limb * 0.35;
  float halo = (1.0 - smoothstep(0.40, 1.0, r)) * 0.30;
  float a = max(disc, halo);
  vec3 col = mcol * disc + uTint * halo * 0.85;
  gl_FragColor = vec4(col, a);
}
`;

const FIRE_VERT = /* glsl */`
attribute float aSeed;
uniform float uTime;
uniform float uSize;
varying float vA;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.42 + aSeed * 13.0) * 1.6;
  p.y += sin(uTime * 0.66 + aSeed * 7.0) * 0.9;
  p.z += cos(uTime * 0.51 + aSeed * 11.0) * 1.6;
  float bl = 0.5 + 0.5 * sin(uTime * (0.9 + fract(aSeed * 0.37) * 1.6) + aSeed * 21.0);
  vA = 0.15 + 0.85 * bl * bl;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(uSize * (120.0 / max(1.0, -mv.z)), 2.0, 20.0);
  gl_Position = projectionMatrix * mv;
}
`;

const FIRE_FRAG = /* glsl */`
precision mediump float;
uniform sampler2D uMap;
uniform vec3 uColor;
varying float vA;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(uColor * t.rgb, t.a * vA);
}
`;

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

// Bake the expensive fbm noise for the milky way / nebula / aurora into a
// 1024x512 equirect texture ONCE, so the full-screen dome shader only does
// texture lookups + cheap star hashing per pixel.
function bakeNoise(renderer) {
  const W = 1024;
  const H = 512;
  if (!renderer) {
    const data = new Uint8Array(4 * 4).fill(128);
    const t = new THREE.DataTexture(data, 2, 2);
    t.needsUpdate = true;
    return t;
  }
  const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false, generateMipmaps: false });
  rt.texture.wrapS = THREE.RepeatWrapping;
  rt.texture.wrapT = THREE.RepeatWrapping;
  rt.texture.minFilter = THREE.LinearFilter;
  rt.texture.magFilter = THREE.LinearFilter;
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: BAKE_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const bakeScene = new THREE.Scene();
  bakeScene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(bakeScene, cam);
  renderer.setRenderTarget(prev);
  mat.dispose();
  quad.geometry.dispose();
  return rt.texture;
}

export function createSky(scene, camera, opts = {}) {
  let quality = opts.quality === 'low' ? 'low' : 'high';
  const sprite = softSprite();
  const tmpC = new THREE.Color();

  // --- sky dome ---
  const domeUniforms = {
    uTime: { value: 0 },
    uMix: { value: 1 },
    uOct: { value: 4 },
    uTopA: { value: new THREE.Color() }, uHorA: { value: new THREE.Color() },
    uGlowA: { value: new THREE.Color() }, uNebA: { value: new THREE.Color() },
    uTopB: { value: new THREE.Color() }, uHorB: { value: new THREE.Color() },
    uGlowB: { value: new THREE.Color() }, uNebB: { value: new THREE.Color() },
    uParA: { value: new THREE.Vector4() }, uParB: { value: new THREE.Vector4() },
    uNoise: { value: bakeNoise(opts.renderer) },
    uStarL: { value: 3 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(R_DOME, 40, 24),
    new THREE.ShaderMaterial({
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      uniforms: domeUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  scene.add(dome);

  // --- moon billboard ---
  const moonUniforms = {
    uTime: { value: 0 },
    uTint: { value: new THREE.Color(0xfff4e0) },
    uOct: { value: 4 },
  };
  const moon = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: MOON_VERT,
      fragmentShader: MOON_FRAG,
      uniforms: moonUniforms,
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
  moon.renderOrder = -9;
  moon.frustumCulled = false;
  scene.add(moon);

  // --- meteors: one ribbon buffer, additive ---
  const mGeo = new THREE.BufferGeometry();
  const mPos = new Float32Array(MAX_METEORS * METEOR_SEGS * 4 * 3);
  const mCol = new Float32Array(MAX_METEORS * METEOR_SEGS * 4 * 4);
  const mIdx = [];
  for (let q = 0; q < MAX_METEORS * METEOR_SEGS; q++) {
    const b = q * 4;
    mIdx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  mGeo.setIndex(mIdx);
  mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3).setUsage(THREE.DynamicDrawUsage));
  mGeo.setAttribute('color', new THREE.BufferAttribute(mCol, 4).setUsage(THREE.DynamicDrawUsage));
  mGeo.setDrawRange(0, 0);
  const meteorMesh = new THREE.Mesh(mGeo, new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
  }));
  meteorMesh.frustumCulled = false;
  meteorMesh.renderOrder = -8;
  scene.add(meteorMesh);

  const meteors = [];
  for (let i = 0; i < MAX_METEORS; i++) {
    meteors.push({ on: false, hx: 0, hy: 0, hz: 0, dx: 0, dy: 0, dz: 0, sp: 0, len: 0, life: 0, age: 0, r: 1, g: 1, b: 1 });
  }
  let metTimer = 1.0;
  let metQuads = 0;
  const _tmpV4 = new THREE.Vector4();
  const _view = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _side = new THREE.Vector3();
  const _p0 = new THREE.Vector3();
  const _p1 = new THREE.Vector3();

  const _vd = new THREE.Vector3();
  function spawnMeteor(def, towardView) {
    const m = meteors.find((k) => !k.on);
    if (!m) return;
    let az = Math.random() * Math.PI * 2;
    let el = 0.35 + Math.random() * 0.95;
    // Most meteors appear in front of the camera so players actually see them.
    if (towardView || Math.random() < 0.65) {
      camera.getWorldDirection(_vd);
      az = Math.atan2(_vd.z, _vd.x) + (Math.random() - 0.5) * 1.5;
      el = Math.max(0.12, Math.asin(Math.max(-1, Math.min(1, _vd.y)))) + 0.05 + Math.random() * 0.45;
    }
    const dist = Math.min(520, camera.far * 0.55);
    const dx = Math.cos(az) * Math.cos(el);
    const dy = Math.sin(el);
    const dz = Math.sin(az) * Math.cos(el);
    m.hx = camera.position.x + dx * dist;
    m.hy = Math.max(camera.position.y, 0) + dy * dist;
    m.hz = camera.position.z + dz * dist;
    const ta = Math.random() * Math.PI * 2;
    _dir.set(Math.cos(ta), -(0.12 + Math.random() * 0.4), Math.sin(ta));
    const along = _dir.x * dx + _dir.y * dy + _dir.z * dz;
    _dir.x -= dx * along;
    _dir.y -= dy * along;
    _dir.z -= dz * along;
    _dir.normalize();
    m.dx = _dir.x; m.dy = _dir.y; m.dz = _dir.z;
    m.sp = 190 + Math.random() * 240;
    m.len = 55 + Math.random() * 95;
    m.life = 0.9 + Math.random() * 0.8;
    m.age = 0;
    tmpC.setHex(def.metColor);
    const vary = 0.8 + Math.random() * 0.3;
    m.r = Math.min(1, tmpC.r * vary);
    m.g = Math.min(1, tmpC.g * vary);
    m.b = Math.min(1, tmpC.b * vary);
    m.on = true;
  }

  function updateMeteors(dt, def) {
    metTimer -= dt;
    if (metTimer <= 0) {
      metTimer = def.metMin + Math.random() * (def.metMax - def.metMin);
      spawnMeteor(def);
      if (def === MODES.golden && Math.random() < 0.55) spawnMeteor(def);
    }
    camera.getWorldDirection(_view);
    metQuads = 0;
    for (const m of meteors) {
      if (!m.on) continue;
      m.age += dt;
      if (m.age >= m.life) { m.on = false; continue; }
      m.hx += m.dx * m.sp * dt;
      m.hy += m.dy * m.sp * dt;
      m.hz += m.dz * m.sp * dt;
      _dir.set(m.dx, m.dy, m.dz);
      _side.crossVectors(_dir, _view).normalize();
      const fade = Math.sin((m.age / m.life) * Math.PI);
      for (let s = 0; s < METEOR_SEGS && metQuads < MAX_METEORS * METEOR_SEGS; s++) {
        const f0 = s / METEOR_SEGS;
        const f1 = (s + 1) / METEOR_SEGS;
        _p0.set(m.hx - m.dx * m.len * f0, m.hy - m.dy * m.len * f0, m.hz - m.dz * m.len * f0);
        _p1.set(m.hx - m.dx * m.len * f1, m.hy - m.dy * m.len * f1, m.hz - m.dz * m.len * f1);
        const w0 = 2.4 * (1 - f0 * 0.85) * fade;
        const w1 = 2.4 * (1 - f1 * 0.85) * fade;
        const o = metQuads * 12;
        mPos[o] = _p0.x + _side.x * w0; mPos[o + 1] = _p0.y + _side.y * w0; mPos[o + 2] = _p0.z + _side.z * w0;
        mPos[o + 3] = _p0.x - _side.x * w0; mPos[o + 4] = _p0.y - _side.y * w0; mPos[o + 5] = _p0.z - _side.z * w0;
        mPos[o + 6] = _p1.x - _side.x * w1; mPos[o + 7] = _p1.y - _side.y * w1; mPos[o + 8] = _p1.z - _side.z * w1;
        mPos[o + 9] = _p1.x + _side.x * w1; mPos[o + 10] = _p1.y + _side.y * w1; mPos[o + 11] = _p1.z + _side.z * w1;
        const a0 = (1 - f0) * fade;
        const a1 = (1 - f1) * fade;
        const c = metQuads * 16;
        const head0 = s === 0 ? 1.0 : 0.0;
        const head1 = s === 0 ? 1.0 : 0.0;
        for (let v = 0; v < 4; v++) {
          const isP0 = v < 2;
          const aa = isP0 ? a0 : a1;
          const boost = isP0 ? head0 : head1;
          mCol[c + v * 4] = Math.min(1, m.r + boost * 0.6);
          mCol[c + v * 4 + 1] = Math.min(1, m.g + boost * 0.6);
          mCol[c + v * 4 + 2] = Math.min(1, m.b + boost * 0.6);
          mCol[c + v * 4 + 3] = aa;
        }
        metQuads++;
      }
    }
    mGeo.attributes.position.needsUpdate = true;
    mGeo.attributes.color.needsUpdate = true;
    mGeo.setDrawRange(0, metQuads * 6);
  }

  // --- fireflies ---
  const fGeo = new THREE.BufferGeometry();
  const fPos = new Float32Array(FIREFLY_N * 3);
  const fSeed = new Float32Array(FIREFLY_N);
  for (let i = 0; i < FIREFLY_N; i++) {
    fPos[i * 3] = CAMPUS.x0 + Math.random() * (CAMPUS.x1 - CAMPUS.x0);
    fPos[i * 3 + 1] = CAMPUS.ground + 0.6 + Math.random() * 5.5;
    fPos[i * 3 + 2] = CAMPUS.z0 + Math.random() * (CAMPUS.z1 - CAMPUS.z0);
    fSeed[i] = Math.random() * 100;
  }
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  fGeo.setAttribute('aSeed', new THREE.BufferAttribute(fSeed, 1));
  const fireUniforms = {
    uTime: { value: 0 },
    uSize: { value: 1.6 },
    uMap: { value: sprite },
    uColor: { value: new THREE.Color(0xd4ff8a) },
  };
  const fireflies = new THREE.Points(fGeo, new THREE.ShaderMaterial({
    vertexShader: FIRE_VERT,
    fragmentShader: FIRE_FRAG,
    uniforms: fireUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  }));
  fireflies.frustumCulled = false;
  scene.add(fireflies);

  // --- mode state + palette lerp ---
  let mode = MODES[opts.mode] ? opts.mode : 'night';
  let trans = 1; // 0..1 progress of crossfade
  let transStart = 0;
  const cur = {
    top: new THREE.Color(), hor: new THREE.Color(), glow: new THREE.Color(),
    neb: new THREE.Color(), par: new THREE.Vector4(), moon: new THREE.Color(),
  };
  const from = { top: new THREE.Color(), hor: new THREE.Color(), glow: new THREE.Color(), neb: new THREE.Color(), par: new THREE.Vector4(), moon: new THREE.Color() };
  const pal = {
    hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiIntensity: 0,
    keyColor: new THREE.Color(), keyIntensity: 0,
    fogColor: new THREE.Color(), fogNear: 0, fogFar: 0,
    exposure: 1, windowGlow: 0, windowColor: new THREE.Color(),
  };
  const palPrev = {
    hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiIntensity: 0,
    keyColor: new THREE.Color(), keyIntensity: 0,
    fogColor: new THREE.Color(), fogNear: 0, fogFar: 0,
    exposure: 1, windowGlow: 0, windowColor: new THREE.Color(),
  };
  const listeners = [];

  function snapTo(def) {
    cur.top.setHex(def.top); cur.hor.setHex(def.hor); cur.glow.setHex(def.glow);
    cur.neb.setHex(def.neb); cur.par.set(...def.par); cur.moon.setHex(def.moon);
  }
  snapTo(MODES[mode]);

  const p = MODES[mode].palette;
  pal.hemiSky.setHex(p.hemiSky); pal.hemiGround.setHex(p.hemiGround);
  pal.hemiIntensity = p.hemiIntensity; pal.keyColor.setHex(p.keyColor);
  pal.keyIntensity = p.keyIntensity; pal.fogColor.setHex(p.fogColor);
  pal.fogNear = p.fogNear; pal.fogFar = p.fogFar; pal.exposure = p.exposure;
  pal.windowGlow = p.windowGlow; pal.windowColor.setHex(p.windowColor);
  palPrev.hemiSky.copy(pal.hemiSky); palPrev.hemiGround.copy(pal.hemiGround);
  palPrev.hemiIntensity = pal.hemiIntensity; palPrev.keyColor.copy(pal.keyColor);
  palPrev.keyIntensity = pal.keyIntensity; palPrev.fogColor.copy(pal.fogColor);
  palPrev.fogNear = pal.fogNear; palPrev.fogFar = pal.fogFar;
  palPrev.exposure = pal.exposure; palPrev.windowGlow = pal.windowGlow;
  palPrev.windowColor.copy(pal.windowColor);

  function pushUniforms() {
    domeUniforms.uTopA.value.copy(from.top); domeUniforms.uHorA.value.copy(from.hor);
    domeUniforms.uGlowA.value.copy(from.glow); domeUniforms.uNebA.value.copy(from.neb);
    domeUniforms.uParA.value.copy(from.par);
    const def = MODES[mode];
    domeUniforms.uTopB.value.setHex(def.top); domeUniforms.uHorB.value.setHex(def.hor);
    domeUniforms.uGlowB.value.setHex(def.glow); domeUniforms.uNebB.value.setHex(def.neb);
    domeUniforms.uParB.value.set(...def.par);
  }
  pushUniforms();
  from.top.copy(cur.top); from.hor.copy(cur.hor); from.glow.copy(cur.glow);
  from.neb.copy(cur.neb); from.par.copy(cur.par); from.moon.copy(cur.moon);

  function setMode(name) {
    if (!MODES[name] || name === mode) return;
    // freeze current interpolated state as 'from'
    from.top.copy(cur.top); from.hor.copy(cur.hor); from.glow.copy(cur.glow);
    from.neb.copy(cur.neb); from.par.copy(cur.par); from.moon.copy(cur.moon);
    palPrev.hemiSky.copy(pal.hemiSky); palPrev.hemiGround.copy(pal.hemiGround);
    palPrev.hemiIntensity = pal.hemiIntensity; palPrev.keyColor.copy(pal.keyColor);
    palPrev.keyIntensity = pal.keyIntensity; palPrev.fogColor.copy(pal.fogColor);
    palPrev.fogNear = pal.fogNear; palPrev.fogFar = pal.fogFar;
    palPrev.exposure = pal.exposure; palPrev.windowGlow = pal.windowGlow;
    palPrev.windowColor.copy(pal.windowColor);
    mode = name;
    trans = 0;
    transStart = performance.now() * 0.001;
    pushUniforms();
  }

  const ease = (t) => t * t * (3 - 2 * t);

  function update(dt, time) {
    const t = time !== undefined ? time * 0.001 : 0;
    domeUniforms.uTime.value = t;
    moonUniforms.uTime.value = t;
    fireUniforms.uTime.value = t;
    dome.position.copy(camera.position);

    const def = MODES[mode];
    if (trans < 1) {
      trans = Math.min(1, (performance.now() * 0.001 - transStart) / FADE_TIME);
      const e = ease(trans);
      cur.top.copy(from.top).lerp(tmpC.setHex(def.top), e);
      cur.hor.copy(from.hor).lerp(tmpC.setHex(def.hor), e);
      cur.glow.copy(from.glow).lerp(tmpC.setHex(def.glow), e);
      cur.neb.copy(from.neb).lerp(tmpC.setHex(def.neb), e);
      _tmpV4.set(def.par[0], def.par[1], def.par[2], def.par[3]);
      cur.par.copy(from.par).lerp(_tmpV4, e);
      cur.moon.copy(from.moon).lerp(tmpC.setHex(def.moon), e);
      const tp = def.palette;
      pal.hemiSky.copy(palPrev.hemiSky).lerp(tmpC.setHex(tp.hemiSky), e);
      pal.hemiGround.copy(palPrev.hemiGround).lerp(tmpC.setHex(tp.hemiGround), e);
      pal.hemiIntensity = palPrev.hemiIntensity + (tp.hemiIntensity - palPrev.hemiIntensity) * e;
      pal.keyColor.copy(palPrev.keyColor).lerp(tmpC.setHex(tp.keyColor), e);
      pal.keyIntensity = palPrev.keyIntensity + (tp.keyIntensity - palPrev.keyIntensity) * e;
      pal.fogColor.copy(palPrev.fogColor).lerp(tmpC.setHex(tp.fogColor), e);
      pal.fogNear = palPrev.fogNear + (tp.fogNear - palPrev.fogNear) * e;
      pal.fogFar = palPrev.fogFar + (tp.fogFar - palPrev.fogFar) * e;
      pal.exposure = palPrev.exposure + (tp.exposure - palPrev.exposure) * e;
      pal.windowGlow = palPrev.windowGlow + (tp.windowGlow - palPrev.windowGlow) * e;
      pal.windowColor.copy(palPrev.windowColor).lerp(tmpC.setHex(tp.windowColor), e);
      domeUniforms.uMix.value = e;
    }

    // moon follows camera, pinned within far plane
    const md = Math.min(700, camera.far * 0.72);
    moon.position.copy(camera.position).addScaledVector(MOON_DIR, md);
    moon.scale.setScalar(md * 0.24);
    moon.lookAt(camera.position);
    moonUniforms.uTint.value.copy(cur.moon);

    updateMeteors(dt, def);

    for (const cb of listeners) cb(pal);
  }

  function setQuality(q) {
    quality = q === 'low' ? 'low' : 'high';
    domeUniforms.uOct.value = quality === 'low' ? 2 : 4;
    domeUniforms.uStarL.value = quality === 'low' ? 2 : 3;
    moonUniforms.uOct.value = quality === 'low' ? 2 : 4;
    fireUniforms.uSize.value = quality === 'low' ? 1.3 : 1.6;
  }
  setQuality(quality);

  return {
    update,
    setMode,
    setQuality,
    onPalette(cb) { if (typeof cb === 'function') listeners.push(cb); },
    shower(n = 12) { const def = MODES[mode] || MODES.night; for (let i = 0; i < n; i++) spawnMeteor(def, true); },
    get mode() { return mode; },
    get dbg() { return { trans, mix: domeUniforms.uMix.value, parB: domeUniforms.uParB.value.toArray(), topB: domeUniforms.uTopB.value.getHex() }; },
    get palette() { return pal; },
    get moonDir() { return MOON_DIR; },
    objects: { dome, moon, meteors: meteorMesh, fireflies },
  };
}
