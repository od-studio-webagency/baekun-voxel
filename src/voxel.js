import * as THREE from 'three';

const CHUNK = 32;
const CHUNK_MASK = 31;
const CHUNK_VOL = CHUNK * CHUNK * CHUNK;
const REGION = 64;
const AO_SHADE = [0.5, 0.68, 0.84, 1];
const QSTAT = (typeof window !== 'undefined' && /qstat=1/.test(window.location.search)) ? (window.__qstat = {}) : null;

function chunkKey(cx, cy, cz) {
  return (cx + 4096) * 16777216 + (cy + 4096) * 4096 + (cz + 4096);
}

function regionKey(wx, wz, size) {
  const rx = Math.floor(wx / (size || REGION));
  const rz = Math.floor(wz / (size || REGION));
  return (rx + 1024) * 4096 + (rz + 1024);
}

function srgbChannel(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function debugOn() {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1';
  } catch (err) {
    return false;
  }
}

export class VoxelVolume {
  constructor(scale, opts) {
    this.scale = scale;
    this.opts = opts || {};
    this.chunks = new Map();
    this.records = [];
    this.palette = new Map();
    this.colors = [0];
    this.glass = new Uint8Array(4096);
    this.emissive = new Uint8Array(4096);
    this._next = 1;
    this._jitter = this.opts.jitter || 0;
    this._cx = 1e9;
    this._cy = 1e9;
    this._cz = 1e9;
    this._chunk = null;
    this._lastColor = 0;
    this._lastIdx = 0;
    if (this.opts.glass) {
      for (let i = 0; i < this.opts.glass.length; i++) this.flagGlass(this.opts.glass[i]);
    }
  }

  get colorCount() {
    return this._next - 1;
  }

  colorIndex(color) {
    if (color === this._lastColor && this._lastIdx) return this._lastIdx;
    let idx = this.palette.get(color);
    if (!idx) {
      if (this._next > 4095) return 1;
      idx = this._next++;
      this.palette.set(color, idx);
      this.colors[idx] = color;
    }
    this._lastColor = color;
    this._lastIdx = idx;
    return idx;
  }

  flagGlass(color) {
    if (!color) return;
    this.glass[this.colorIndex(color)] = 1;
  }

  flagEmissive(color) {
    if (!color) return;
    this.emissive[this.colorIndex(color)] = 1;
  }

  _bakeColor(x, y, z, color) {
    if (!this._jitter) return color;
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
    h = (h ^ (h >>> 13)) >>> 0;
    if (h % 7 !== 0) return color;
    const amt = Math.max(1, Math.round(this._jitter * 18));
    const sr = ((h >>> 4) % 3) - 1;
    const sg = ((h >>> 8) % 3) - 1;
    const sb = ((h >>> 12) % 3) - 1;
    let r = Math.max(0, Math.min(255, ((color >> 16) & 255) + sr * amt)) & 0xfc;
    let g = Math.max(0, Math.min(255, ((color >> 8) & 255) + sg * amt)) & 0xfc;
    let b = Math.max(0, Math.min(255, (color & 255) + sb * amt)) & 0xfc;
    return ((r << 16) | (g << 8) | b) || 1;
  }

  _chunkFor(cx, cy, cz, create) {
    if (cx === this._cx && cy === this._cy && cz === this._cz) return this._chunk;
    const key = chunkKey(cx, cy, cz);
    let rec = this.chunks.get(key);
    if (!rec && create) {
      rec = {
        cx,
        cy,
        cz,
        data: new Uint16Array(CHUNK_VOL),
        mx: 0,
        my: 0,
        mz: 0,
      };
      this.chunks.set(key, rec);
      this.records.push(rec);
    }
    this._cx = cx;
    this._cy = cy;
    this._cz = cz;
    this._chunk = rec || null;
    return this._chunk;
  }

  set(x, y, z, color) {
    x |= 0;
    y |= 0;
    z |= 0;
    const cx = x >> 5;
    const cy = y >> 5;
    const cz = z >> 5;
    const rec = this._chunkFor(cx, cy, cz, !!color);
    if (!rec) return;
    const chunk = rec.data;
    const li = (x & CHUNK_MASK) + ((y & CHUNK_MASK) << 5) + ((z & CHUNK_MASK) << 10);
    if (!color) {
      chunk[li] = 0;
      return;
    }
    chunk[li] = this.colorIndex(this._bakeColor(x, y, z, color));
    rec.mx |= 1 << (x & CHUNK_MASK);
    rec.my |= 1 << (y & CHUNK_MASK);
    rec.mz |= 1 << (z & CHUNK_MASK);
  }

  get(x, y, z) {
    x |= 0;
    y |= 0;
    z |= 0;
    const rec = this._chunkFor(x >> 5, y >> 5, z >> 5, false);
    if (!rec) return 0;
    const idx = rec.data[(x & CHUNK_MASK) + ((y & CHUNK_MASK) << 5) + ((z & CHUNK_MASK) << 10)];
    return idx ? this.colors[idx] : 0;
  }

  fill(x0, y0, z0, x1, y1, z1, color) {
    for (let z = z0; z < z1; z++) {
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) this.set(x, y, z, color);
      }
    }
  }

  // Fill only empty cells (used to make building interiors solid so the mesher
  // culls every inward-facing wall/window face that can never be seen).
  fillEmpty(x0, y0, z0, x1, y1, z1, color) {
    for (let z = z0; z < z1; z++) {
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (!this.get(x, y, z)) this.set(x, y, z, color);
        }
      }
    }
  }

  clear(x, y, z, x1, y1, z1) {
    if (x1 === undefined) {
      this.set(x, y, z, 0);
      return;
    }
    for (let zz = z; zz < z1; zz++) {
      for (let yy = y; yy < y1; yy++) {
        for (let xx = x; xx < x1; xx++) this.set(xx, yy, zz, 0);
      }
    }
  }
}

function GrowBuf(kind) {
  this.kind = kind;
  this.n = 0;
  this.pos = new Float32Array(4096 * 3);
  this.nor = new Float32Array(4096 * 3);
  this.col = new Float32Array(4096 * 3);
  this.idx = new Uint32Array(4096 * 6);
  this.quads = 0;
}

function reserveVerts(buf, count) {
  const need = buf.n + count;
  if (need <= buf.pos.length / 3) return;
  let cap = buf.pos.length / 3;
  while (cap < need) cap *= 2;
  const pos = new Float32Array(cap * 3);
  const nor = new Float32Array(cap * 3);
  const col = new Float32Array(cap * 3);
  pos.set(buf.pos);
  nor.set(buf.nor);
  col.set(buf.col);
  buf.pos = pos;
  buf.nor = nor;
  buf.col = col;
  const idx = new Uint32Array(cap * 6);
  idx.set(buf.idx);
  buf.idx = idx;
}

function pushQuad(buf, verts, nx, ny, nz, colors, flip, baseWinding) {
  reserveVerts(buf, 4);
  const base = buf.n;
  const p = buf.pos;
  const nr = buf.nor;
  const c = buf.col;
  for (let i = 0; i < 4; i++) {
    const o = (base + i) * 3;
    const v = verts[i];
    p[o] = v[0];
    p[o + 1] = v[1];
    p[o + 2] = v[2];
    nr[o] = nx;
    nr[o + 1] = ny;
    nr[o + 2] = nz;
    const col = colors[i];
    c[o] = col[0];
    c[o + 1] = col[1];
    c[o + 2] = col[2];
  }
  const winding = flip ? (baseWinding === 0 ? [0, 1, 3, 1, 2, 3] : [0, 3, 1, 3, 2, 1]) : (baseWinding === 0 ? [0, 1, 2, 0, 2, 3] : [0, 3, 2, 0, 2, 1]);
  const io = buf.quads * 6;
  const idx = buf.idx;
  idx[io] = base + winding[0];
  idx[io + 1] = base + winding[1];
  idx[io + 2] = base + winding[2];
  idx[io + 3] = base + winding[3];
  idx[io + 4] = base + winding[4];
  idx[io + 5] = base + winding[5];
  buf.n += 4;
  buf.quads += 1;
}

function linearTable(volume) {
  const n = volume.colors.length;
  const out = new Float32Array(n * 3);
  for (let i = 1; i < n; i++) {
    const color = volume.colors[i];
    out[i * 3] = srgbChannel(((color >> 16) & 255) / 255);
    out[i * 3 + 1] = srgbChannel(((color >> 8) & 255) / 255);
    out[i * 3 + 2] = srgbChannel((color & 255) / 255);
  }
  return out;
}

function meshChunk(volume, rec, linear, regions, glassBuf, emitBuf, scale) {
  const cx = rec.cx;
  const cy = rec.cy;
  const cz = rec.cz;
  const chunk = rec.data;
  const neigh = new Array(27);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = volume.chunks.get(chunkKey(cx + dx, cy + dy, cz + dz));
        neigh[(dx + 1) + (dy + 1) * 3 + (dz + 1) * 9] = n ? n.data : null;
      }
    }
  }
  const self = chunk;
  function at(x, y, z) {
    if ((x | y | z) >>> 0 < 32) return self[x + (y << 5) + (z << 10)];
    let ix = 1;
    let iy = 1;
    let iz = 1;
    if (x < 0) { ix = 0; x += 32; }
    else if (x >= 32) { ix = 2; x -= 32; }
    if (y < 0) { iy = 0; y += 32; }
    else if (y >= 32) { iy = 2; y -= 32; }
    if (z < 0) { iz = 0; z += 32; }
    else if (z >= 32) { iz = 2; z -= 32; }
    const ch = neigh[ix + iy * 3 + iz * 9];
    if (!ch) return 0;
    return ch[x + (y << 5) + (z << 10)];
  }

  const mask = new Int32Array(CHUNK * CHUNK);
  const softAO = !!volume.softAO || (typeof window !== 'undefined' && /softao=1/.test(window.location.search));
  const noAO = !!volume.noAO || (typeof window !== 'undefined' && /noao=1/.test(window.location.search));
  const ox = cx * CHUNK;
  const oy = cy * CHUNK;
  const oz = cz * CHUNK;
  const wx = ox * scale;
  const wz = oz * scale;
  const rkey = regionKey(wx, wz, volume.regionSize);
  let region = regions.get(rkey);
  if (!region) {
    region = new GrowBuf(0);
    regions.set(rkey, region);
  }

  const corner = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const cols = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    for (let sign = 1; sign >= -1; sign -= 2) {
      const nx = d === 0 ? sign : 0;
      const ny = d === 1 ? sign : 0;
      const nz = d === 2 ? sign : 0;
      const winding = sign > 0 ? 0 : 1;
      const sliceMask = d === 0 ? rec.mx : d === 1 ? rec.my : rec.mz;
      for (let slice = 0; slice < CHUNK; slice++) {
        // Skip slices that hold no cells in this chunk AND whose boundary
        // slice is also empty: no face can originate or terminate here.
        if (!(sliceMask & (1 << slice))) {
          const adj = slice + sign;
          if (adj < 0 || adj >= CHUNK || !(sliceMask & (1 << adj))) continue;
        }
        let n = 0;
        for (let j = 0; j < CHUNK; j++) {
          for (let i = 0; i < CHUNK; i++) {
            let x = 0;
            let y = 0;
            let z = 0;
            if (d === 0) { x = slice; y = i; z = j; }
            else if (d === 1) { y = slice; z = i; x = j; }
            else { z = slice; x = i; y = j; }
            const a = at(x, y, z);
            let bx = x;
            let by = y;
            let bz = z;
            if (d === 0) bx += sign;
            else if (d === 1) by += sign;
            else bz += sign;
            if (!a || at(bx, by, bz)) {
              mask[n++] = 0;
              continue;
            }
            const ao0 = noAO ? 3 : vertexAO(x, y, z, sign, d, u, v, 0, 0);
            const ao1 = noAO ? 3 : vertexAO(x, y, z, sign, d, u, v, 1, 0);
            const ao2 = noAO ? 3 : vertexAO(x, y, z, sign, d, u, v, 1, 1);
            const ao3 = noAO ? 3 : vertexAO(x, y, z, sign, d, u, v, 0, 1);
            mask[n++] = (a << 8) | (ao0 << 6) | (ao1 << 4) | (ao2 << 2) | ao3;
          }
        }
        greedy(mask, (i, j, w, h, packed) => {
          const colorIdx = packed >>> 8;
          const ao0 = (packed >> 6) & 3;
          const ao1 = (packed >> 4) & 3;
          const ao2 = (packed >> 2) & 3;
          const ao3 = packed & 3;
          const plane = (d === 0 ? ox : d === 1 ? oy : oz) + slice + (sign > 0 ? 1 : 0);
          const u0 = (u === 0 ? ox : u === 1 ? oy : oz) + i;
          const v0 = (v === 0 ? ox : v === 1 ? oy : oz) + j;
          writeCorner(corner[0], d, u, v, plane, u0, v0);
          writeCorner(corner[1], d, u, v, plane, u0 + w, v0);
          writeCorner(corner[2], d, u, v, plane, u0 + w, v0 + h);
          writeCorner(corner[3], d, u, v, plane, u0, v0 + h);
          const lr = linear[colorIdx * 3];
          const lg = linear[colorIdx * 3 + 1];
          const lb = linear[colorIdx * 3 + 2];
          shade(cols[0], lr, lg, lb, ao0);
          shade(cols[1], lr, lg, lb, ao1);
          shade(cols[2], lr, lg, lb, ao2);
          shade(cols[3], lr, lg, lb, ao3);
          for (let k = 0; k < 4; k++) {
            corner[k][0] *= scale;
            corner[k][1] *= scale;
            corner[k][2] *= scale;
          }
          const flip = ao0 + ao2 > ao1 + ao3;
          let dest = region;
          if (volume.emissive[colorIdx]) dest = emitBuf;
          else if (volume.glass[colorIdx]) dest = glassBuf;
          pushQuad(dest, corner, nx, ny, nz, cols, flip, winding);
          if (QSTAT) { const k = volume.scale + ':' + volume.colors[colorIdx].toString(16); QSTAT[k] = (QSTAT[k] || 0) + 1; }
        });
      }
    }
  }

  function vertexAO(x, y, z, sign, d, u, v, cu, cv) {
    const tu = cu ? 1 : -1;
    const tv = cv ? 1 : -1;
    let s1x = x;
    let s1y = y;
    let s1z = z;
    let s2x = x;
    let s2y = y;
    let s2z = z;
    let cx1 = x;
    let cy1 = y;
    let cz1 = z;
    if (d === 0) { s1x += sign; s2x += sign; cx1 += sign; }
    else if (d === 1) { s1y += sign; s2y += sign; cy1 += sign; }
    else { s1z += sign; s2z += sign; cz1 += sign; }
    if (u === 0) { s1x += tu; cx1 += tu; }
    else if (u === 1) { s1y += tu; cy1 += tu; }
    else { s1z += tu; cz1 += tu; }
    if (v === 0) { s2x += tv; cx1 += tv; }
    else if (v === 1) { s2y += tv; cy1 += tv; }
    else { s2z += tv; cz1 += tv; }
    const s1 = at(s1x, s1y, s1z) !== 0;
    const s2 = at(s2x, s2y, s2z) !== 0;
    if (s1 && s2) return 0;
    const c = at(cx1, cy1, cz1) !== 0;
    const ao = 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (c ? 1 : 0));
    // 'soft' AO keeps only real corners (2+ occluders): single diagonal/edge
    // neighbours would split greedy quads for a barely visible gradient.
    return softAO && ao === 2 ? 3 : ao;
  }
}

function writeCorner(out, d, u, v, plane, uu, vv) {
  out[d] = plane;
  out[u] = uu;
  out[v] = vv;
}

function shade(out, r, g, b, ao) {
  const f = AO_SHADE[ao];
  out[0] = r * f;
  out[1] = g * f;
  out[2] = b * f;
}

function greedy(mask, emit) {
  const size = CHUNK;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size;) {
      const packed = mask[j * size + i];
      if (!packed) {
        i++;
        continue;
      }
      let w = 1;
      while (i + w < size && mask[j * size + i + w] === packed) w++;
      let h = 1;
      while (j + h < size) {
        let ok = true;
        const row = (j + h) * size + i;
        for (let k = 0; k < w; k++) {
          if (mask[row + k] !== packed) {
            ok = false;
            break;
          }
        }
        if (!ok) break;
        h++;
      }
      for (let dy = 0; dy < h; dy++) {
        const row = (j + dy) * size + i;
        for (let dx = 0; dx < w; dx++) mask[row + dx] = 0;
      }
      emit(i, j, w, h, packed);
      i += w;
    }
  }
}

function buildMesh(buf, material) {
  if (!buf.quads) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(buf.pos.slice(0, buf.n * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(buf.nor.slice(0, buf.n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(buf.col.slice(0, buf.n * 3), 3));
  geo.setIndex(new THREE.Uint32BufferAttribute(buf.idx.slice(0, buf.quads * 6), 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  return mesh;
}

// Cheap procedural surface detail so greedy meshing can merge big coplanar
// faces: brick courses / panel joints on walls and tile joints on floors are
// drawn in the fragment shader from world position (fading out with distance)
// instead of being separate voxel colours.
const PATTERN_GLSL = /* glsl */`
{
  float dCam = distance(vPW, cameraPosition);
  float fade = 1.0 - smoothstep(18.0, 60.0, dCam);
  if (fade > 0.001) {
    vec3 an = abs(vPN);
    float g = 0.0;
    float tone = 0.0;
#ifdef PAT_BRICK
    if (an.y < 0.5) {
      float cy = vPW.y * 4.0;
      float row = floor(cy);
      float along = (an.x > an.z ? vPW.z : vPW.x) * 2.0 + 0.5 * mod(row, 2.0);
      vec2 q = vec2(along, cy);
      vec2 fw = max(fwidth(q), vec2(1e-4));
      vec2 di = 0.5 - abs(fract(q) - 0.5);
      vec2 l = 1.0 - smoothstep(vec2(0.035), vec2(0.035) + fw * 1.5, di);
      l *= 1.0 - smoothstep(0.12, 0.35, max(fw.x, fw.y)); // fade lines before they alias (moire when turning)
      g = max(l.y, l.x * 0.85);
      tone = fract(sin(dot(floor(q), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    } else {
      vec2 q = vPW.xz * 2.0;
      vec2 fw = max(fwidth(q), vec2(1e-4));
      vec2 di = 0.5 - abs(fract(q) - 0.5);
      vec2 l = 1.0 - smoothstep(vec2(0.02), vec2(0.02) + fw * 1.5, di);
      l *= 1.0 - smoothstep(0.12, 0.35, max(fw.x, fw.y)); // fade lines before they alias (moire when turning)
      g = max(l.x, l.y) * 0.6;
    }
#endif
#ifdef PAT_GROUND
    if (an.y > 0.5) {
      vec3 c = diffuseColor.rgb;
      float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
      bool campus = vPW.x > -88.0 && vPW.x < 106.0 && vPW.z > -92.0 && vPW.z < 82.0;
      if (campus && sat < 0.035) {
        vec2 q = vPW.xz;
        vec2 fw = max(fwidth(q), vec2(1e-4));
        vec2 di = 0.5 - abs(fract(q) - 0.5);
        vec2 l = 1.0 - smoothstep(vec2(0.025), vec2(0.025) + fw * 1.5, di);
        l *= 1.0 - smoothstep(0.12, 0.35, max(fw.x, fw.y)); // fade lines before they alias (moire when turning)
        g = max(l.x, l.y);
        tone = fract(sin(dot(floor(q), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      } else {
        // grass / dirt: soft value-noise mottling instead of per-cell colours
        vec2 p = vPW.xz * 0.35;
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = fract(sin(dot(i, vec2(12.9898, 78.233))) * 43758.5453);
        float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(12.9898, 78.233))) * 43758.5453);
        float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
        float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
        tone = (mix(mix(a, b, f.x), mix(c, d, f.x), f.y) - 0.5) * 1.4;
      }
    }
#endif
    vec3 c0 = diffuseColor.rgb;
    bool reddish = c0.r > c0.g * 1.6 && c0.r > 0.08;
    c0 *= 1.0 + tone * 0.10 * fade;
    vec3 lineCol = reddish ? c0 * 0.55 + vec3(0.11, 0.10, 0.09) : c0 * 0.72;
    diffuseColor.rgb = mix(c0, lineCol, g * fade);
  }
}
`;

function patterned(mat, define) {
  mat.defines = Object.assign({}, mat.defines, { [define]: '' });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPW;\nvarying vec3 vPN;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\n\tvPW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n\tvPN = normalize(mat3(modelMatrix) * objectNormal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPW;\nvarying vec3 vPN;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + PATTERN_GLSL);
  };
  mat.customProgramCacheKey = () => define;
  return mat;
}

let sharedGlow = null;
export function createVoxelMaterials(renderer) {
  // Lambert (not Standard/PBR): voxels are fully rough anyway and Lambert is
  // markedly cheaper per pixel on integrated GPUs / Retina displays.
  const opaque = patterned(new THREE.MeshLambertMaterial({ vertexColors: true }), 'PAT_BRICK');
  const ground = patterned(new THREE.MeshLambertMaterial({ vertexColors: true }), 'PAT_GROUND');
  const plain = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glass = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.15,
    metalness: 0.3,
    envMapIntensity: 0.9,
  });
  if (renderer) glass.envMap = skyPMREM(renderer);
  for (const m of [opaque, ground, plain]) m.userData.glassMaterial = glass;
  return { opaque, ground, plain, glass };
}

function skyPMREM(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, '#4f86c9');
  grd.addColorStop(0.42, '#8eb0d4');
  grd.addColorStop(0.62, '#f3d6b0');
  grd.addColorStop(1, '#b08968');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#ffe6c2';
  g.beginPath();
  g.arc(96, 22, 5, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(tex);
  pmrem.dispose();
  tex.dispose();
  return target.texture;
}

function ensureEmissive() {
  if (sharedGlow) return sharedGlow;
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    emissive: 0xffffff,
    emissiveIntensity: 0,
  });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor;',
    );
  };
  sharedGlow = mat;
  return mat;
}

// Shared "lit window / lamp" material. setWindowGlow drives it:
//   intensity 0 -> plain diffuse vertex-coloured voxels (daylight look)
//   intensity 1 -> vertex colour multiplied by `color` as emission.
export function getGlowMaterial(opaque) {
  return ensureEmissive(opaque);
}

export function meshVolume(volume, material, scene) {
  const t0 = performance.now();
  const opaque = material && material.isMaterial ? material : material.opaque;
  const glassMat = (opaque.userData && opaque.userData.glassMaterial) || volume.glassMaterial || opaque;
  const linear = linearTable(volume);
  const regions = new Map();
  const glassBuf = new GrowBuf(1);
  const emitBuf = new GrowBuf(2);
  const scale = volume.scale;
  const records = volume.records;
  for (let i = 0; i < records.length; i++) {
    meshChunk(volume, records[i], linear, regions, glassBuf, emitBuf, scale);
  }
  let meshes = 0;
  let quads = 0;
  let tris = 0;
  for (const buf of regions.values()) {
    const mesh = buildMesh(buf, opaque);
    if (!mesh) continue;
    scene.add(mesh);
    meshes += 1;
    quads += buf.quads;
    tris += buf.quads * 2;
  }
  const glassMesh = buildMesh(glassBuf, glassMat);
  if (glassMesh) {
    scene.add(glassMesh);
    meshes += 1;
    quads += glassBuf.quads;
    tris += glassBuf.quads * 2;
  }
  // Always create the glow mesh+material even when empty so callers can
  // drive setWindowGlow() before/without lit voxels being present.
  const glowMat = ensureEmissive(opaque);
  const emitMesh = buildMesh(emitBuf, glowMat);
  if (emitMesh) {
    scene.add(emitMesh);
    meshes += 1;
    quads += emitBuf.quads;
    tris += emitBuf.quads * 2;
  }
  const stats = { meshes, quads, tris };
  if (debugOn()) {
    console.info(`[voxel] scale ${scale}: ${meshes} meshes, ${quads} quads, ${tris} tris in ${(performance.now() - t0).toFixed(0)} ms`);
  }
  return stats;
}
