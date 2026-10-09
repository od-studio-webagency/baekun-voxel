// Fine-voxel campus detail for 광양백운고등학교.
// All units are metres. Ground top is y = 2.0. Fine cells are 0.25 m,
// ground cells 0.5 m. Buildings are hollow shells (walls 0.5 m).
import * as THREE from 'three';

const Q = 0.25;
const cellOf = (m) => Math.round(m / Q);
const GC = 0.5;
const gCellOf = (m) => Math.round(m / GC);
const GY = 3; // ground layer cell: occupies y 1.5..2.0

export const C = {
  grass: 0x5ea84a,
  grass2: 0x4c983c,
  grass3: 0x6cb457,
  path: 0xb9b5a9,
  pave: 0x8f918e,
  pave2: 0x969794,
  asphalt: 0x565a5e,
  stall: 0xe8eaec,
  road: 0x4d5155,
  roadLine: 0xe8eaeb,
  roadCenter: 0xd8b23a,
  bike: 0xa63a32,
  sidewalk: 0x9c9e9a,
  curb: 0xb9bcb8,
  water: 0x2e6fa8,
  rimStone: 0x8e8a80,
  field: 0xcdb894,
  field2: 0xc2ab86,
  field3: 0xd6c29e,
  hedge: 0x3d7a35,
  hedge2: 0x2f6428,
  ivy: 0x2c6b3c,
  ivy2: 0x3a7d46,
  trunk: 0x7a5230,
  bark: 0x5d4126,
  leaf: 0x2f8f3a,
  leaf2: 0x3d9c44,
  ginkgo: 0xe2c043,
  ginkgo2: 0xd4b03a,
  ginkgoG: 0xa8b03c,
  pine: 0x2f5a35,
  pine2: 0x3b6b3f,
  mtn: 0x2d4a2e,
  mtn2: 0x33522f,
  mtn3: 0x3e6136,
  cloud: 0xdfe6ec,
  brick: 0x9b4f3d,
  brickAlt: 0x8f4838,
  brickDeep: 0x8a4a3a,
  brickCourse: 0x784838,
  mortar: 0xc9b8a6,
  glass: 0x3b4a55,
  glassDark: 0x2e3a44,
  glassLight: 0xdfe6ea,
  litPane: 0xd9c08e,
  litPane2: 0xc4a878,
  lampGlow: 0xf5e3b0,
  signGlow: 0xe8efe8,
  lobby: 0xc4ad7e,
  frame: 0xe8e4dc,
  portal: 0xe3ded6,
  portalShade: 0xd0cbc2,
  hip: 0x6e5a4e,
  hipAlt: 0x655248,
  hipEdge: 0x5d4d49,
  gutter: 0x4a4442,
  canopy: 0x3f7fc4,
  canopyEdge: 0x2f66a0,
  steel: 0x9aa0a6,
  iron: 0x34383c,
  gateMetal: 0x9aa0a6,
  concrete: 0xb5b2ab,
  greenRoof: 0x4e826f,
  greenRoofAlt: 0x477a66,
  lavender: 0xcbb5bb,
  ivory: 0xefe6d2,
  ivoryAlt: 0xe6dcc6,
  louver: 0x2f6fd0,
  louverDark: 0x255aa8,
  stripeRed: 0xc8372d,
  stripeBlue: 0x2f5fc0,
  maroon: 0x8e4a44,
  maroonAlt: 0x83423d,
  olive: 0xb8b85a,
  annex: 0x94a2b4,
  annexSeam: 0x7f8da0,
  annexTrim: 0x2f5fc0,
  dorm: 0xe9e4da,
  dormAlt: 0xdfd8cc,
  dormRoof: 0xb9bcbc,
  plaque: 0x1e2428,
  plaqueBlue: 0x2e4451,
  gymWall: 0xe6e1d4,
  gymJoint: 0xd5cfc2,
  barrel: 0xc9ccce,
  barrelAlt: 0xbec1c4,
  white: 0xf4f6f8,
  goalNet: 0xd8dde0,
  flagPole: 0x2c3034,
  flagGold: 0xd4a017,
  flagBase: 0x5e6368,
  bench: 0x8a6134,
  benchLeg: 0x3a3e42,
  stone: 0xb0aa9e,
  stoneDark: 0x8a857b,
};

export const FENCE = { x: -88, x2: 104, z: -92, z2: 80, gap0: -24, gap1: -14 };
export const FIELD = { x0: -44, z0: 16, x1: 46, z1: 66 };
export const POND = { x0: -72, z0: 32, x1: -58, z1: 46 };
export const PARKING = { x0: -80, z0: -80, x1: -16, z1: -36 };
export const ROAD = { x0: -116, x1: -92, z0: -140, z1: 140 };

export function hash3(x, y, z) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- small voxel helpers (metre inputs) ----
function fb(vol, x0, y0, z0, x1, y1, z1, col) {
  vol.fill(cellOf(x0), cellOf(y0), cellOf(z0), cellOf(x1), cellOf(y1), cellOf(z1), col);
}
function fs(vol, x, y, z, col) {
  vol.set(cellOf(x), cellOf(y), cellOf(z), col);
}
// Per-cell paint over a metre rect; fn(xM,yM,zM,cx,cy,cz) -> color | 0
function area(vol, x0, y0, z0, x1, y1, z1, fn) {
  for (let z = cellOf(z0); z < cellOf(z1); z++) {
    for (let y = cellOf(y0); y < cellOf(y1); y++) {
      for (let x = cellOf(x0); x < cellOf(x1); x++) {
        const col = fn(x * Q, y * Q, z * Q, x, y, z);
        if (col) vol.set(x, y, z, col);
      }
    }
  }
}
// Ground-volume helpers (0.5 m cells, single layer, top at y=2)
function gfill(vol, x0, z0, x1, z1, fn) {
  for (let z = gCellOf(z0); z < gCellOf(z1); z++) {
    for (let x = gCellOf(x0); x < gCellOf(x1); x++) {
      const col = typeof fn === 'function' ? fn(x * GC, z * GC, x, z) : fn;
      if (col) vol.set(x, GY, z, col);
    }
  }
}

// Wall painter: paints a shell `th` cells thick. `outer` tells which fixed
// coordinate is the outside face so fn(aM, yM, layer) sees layer 0 = outermost.
// axis 'x': wall spans z=a0..a1, x=f0..f1.  axis 'z': spans x=a0..a1, z=f0..f1.
function paintWall(vol, axis, f0, f1, outer, a0, a1, y0, y1, fn) {
  const F0 = cellOf(f0);
  const F1 = cellOf(f1);
  const A0 = cellOf(a0);
  const A1 = cellOf(a1);
  const Y0 = cellOf(y0);
  const Y1 = cellOf(y1);
  for (let f = F0; f < F1; f++) {
    const layer = outer === 'hi' ? F1 - 1 - f : f - F0;
    for (let a = A0; a < A1; a++) {
      const aM = a * Q;
      for (let y = Y0; y < Y1; y++) {
        const col = fn(aM, y * Q, layer, a, y);
        if (!col) continue;
        if (axis === 'x') vol.set(f, y, a, col);
        else vol.set(a, y, f, col);
      }
    }
  }
}

// lit-window decision: deterministic per window, ~42 % lit
function litAt(a, f, face) {
  return hash3(Math.round(a * 4), f * 31, face) % 100 < 42;
}

// Standard bay-window facade painter factory.
// o: {wall, wallAlt, mortar, frame, win, lit, floors, base(=2), bay(=3.5),
//     winW(=2), sillY(=0.9), winH(=2.3), seed, skip(aM,yM), band(aM,yM,layer)}
function stdFacade(o) {
  const bay = o.bay ?? 3.5;
  const winW = o.winW ?? 2;
  const wall = o.wall;
  const wallAlt = o.wallAlt ?? o.wall;
  const frame = o.frame ?? C.frame;
  const win = o.win ?? C.glass;
  const seed = o.seed ?? 0;
  const base = o.base ?? 2;
  const sill = o.sillY ?? 0.9;
  const winH = o.winH ?? 2.3;
  return (aM, yM, layer) => {
    const f = Math.floor((yM - base) / 4);
    if (f < 0 || f >= o.floors) return wall;
    const inSlab = (yM - base) % 4 >= 3.75;
    if (o.skip && o.skip(aM, yM)) return 0;
    if (inSlab) return o.mortar ?? wallAlt;
    if (o.band) {
      const b = o.band(aM, yM, layer);
      if (b) return b;
    }
    // window bay geometry
    const rel = aM - o.a0;
    const bayI = Math.floor((rel - 0.9) / bay);
    const bayC = o.a0 + 0.9 + bayI * bay + bay / 2;
    const w0 = bayC - winW / 2;
    const wy0 = base + f * 4 + sill;
    const wy1 = wy0 + winH;
    const inWin = aM >= w0 && aM < w0 + winW && yM >= wy0 && yM < wy1;
    if (!inWin || bayI < 0) {
      // brick courses: alternate rows, subtle
      return layer === 0 ? wall : wall;
    }
    const border = aM < w0 + Q || aM >= w0 + winW - Q || yM < wy0 + Q || yM >= wy1 - Q;
    if (layer === 0) return border ? frame : 0;
    if (layer === 1) {
      const mid = Math.abs(aM - (w0 + winW / 2)) < Q;
      const lit = litAt(w0, f, seed);
      if (mid) return frame;
      if (winH > 2 && Math.abs(yM - (wy0 + winH / 2)) < Q) return frame;
      return lit ? (o.lit ?? C.litPane) : win;
    }
    return win;
  };
}

function hipRoof(vol, x0, z0, x1, z1, yBase, slope, maxH, colFn) {
  const X0 = cellOf(x0);
  const X1 = cellOf(x1);
  const Z0 = cellOf(z0);
  const Z1 = cellOf(z1);
  for (let z = Z0; z < Z1; z++) {
    for (let x = X0; x < X1; x++) {
      const cxm = (x + 0.5) * Q;
      const czm = (z + 0.5) * Q;
      const dW = cxm - x0;
      const dE = x1 - cxm;
      const dN = czm - z0;
      const dS = z1 - czm;
      const d = Math.min(dW, dE, dN, dS);
      if (d < -Q) continue;
      const h = Math.min(Math.max(0.25, d * slope), maxH);
      const yTop = cellOf(yBase + h);
      const sorted = [dW, dE, dN, dS].sort((p, q2) => p - q2);
      const hipLine = sorted[1] - sorted[0] < 0.35;
      const edge = d < 0.55;
      const crest = h >= maxH - 0.01;
      for (let y = cellOf(yBase); y < yTop; y++) {
        let col = colFn ? colFn(cxm, czm, y * Q) : C.hip;
        if (y === yTop - 1) {
          if (hipLine && !crest) col = C.hipEdge;
          if (crest) col = C.hipEdge;
          if (edge) col = C.hipEdge;
        }
        vol.set(x, y, z, col);
      }
    }
  }
}

// ============================================================ GROUND
function paintGround(ground, fine) {
  const inFence = (x, z) => x > FENCE.x && x < FENCE.x2 + 2 && z > FENCE.z && z < FENCE.z2;
  const inField = (x, z) => {
    if (x < FIELD.x0 || x >= FIELD.x1 || z < FIELD.z0 || z >= FIELD.z1) return false;
    const r = 12;
    const cx = x < FIELD.x0 + r ? FIELD.x0 + r : x > FIELD.x1 - r ? FIELD.x1 - r : x;
    const cz = z < FIELD.z0 + r ? FIELD.z0 + r : z > FIELD.z1 - r ? FIELD.z1 - r : z;
    return (x - cx) * (x - cx) + (z - cz) * (z - cz) <= (x === cx && z === cz ? 0 : r * r) || (x === cx && z === cz);
  };
  const grassTone = (x, z) => {
    const h = hash3(Math.floor(x / 8), 11, Math.floor(z / 8)) % 10;
    return h < 4 ? C.grass2 : h < 8 ? C.grass : C.grass3;
  };
  gfill(ground, -140, -140, 140, 140, (x, z) => {
    // road corridor
    if (x >= -124 && x < -120) return C.sidewalk;
    if (x >= -120 && x < -116) return C.bike;
    if (x >= ROAD.x0 && x < ROAD.x1) {
      const zi = Math.round(z / 2);
      if (x >= -104.5 && x < -104) return zi % 2 ? C.roadCenter : C.road;
      const lane = [-112.5, -108.5, -100.5, -96.5];
      for (let i = 0; i < lane.length; i++) {
        if (x >= lane[i] && x < lane[i] + 0.5) return zi % 2 ? C.roadLine : C.road;
      }
      if (x >= -115.5 && x < -115) return C.roadLine;
      if (x >= -92.5 && x < -92) return C.roadLine;
      return C.road;
    }
    // gate approach outside fence
    if (x >= -92 && x < FENCE.x && z >= -26 && z < -10) return C.sidewalk;
    // pond
    if (x >= POND.x0 && x < POND.x1 && z >= POND.z0 && z < POND.z1) return C.water;
    if (inField(x, z)) {
      const h = hash3(Math.floor(x / 12), 7, Math.floor(z / 12)) % 9;
      return h < 3 ? C.field2 : h < 7 ? C.field : C.field3;
    }
    if (inFence(x, z)) {
      // grass beds
      if (z >= 68 || (x >= 96 && z >= -88) || (x <= -80 && z >= -34)) return grassTone(x, z);
      // parking lot
      if (x >= PARKING.x0 && x < PARKING.x1 && z >= PARKING.z0 && z < PARKING.z1) {
        const stallLine =
          ((x - PARKING.x0) % 3 < 0.5 && ((z >= -76 && z < -70) || (z >= -48 && z < -42))) ||
          (z >= -49.5 && z < -48) || (z >= -70.5 && z < -70);
        return stallLine ? C.stall : C.asphalt;
      }
      // paths
      if (x >= -86 && x < -44 && z >= -24 && z < -10) return C.path; // gate walk
      if (x >= -6 && x < 10 && z >= 4 && z < 16) return C.path; // portal walk
      if (x >= -84 && x < -78 && z >= -34 && z < -10) return C.path;
      if (x >= 56 && x < 96 && z >= 50 && z < 56) return C.path; // east path
      // campus paving: subtle 1 m joint grid
      return C.pave;
    }
    return grassTone(x, z);
  });
  // curbs along the sidewalk (fine voxels, +0.2 m)
  fb(fine, -120.25, 2, -140, -120, 2.25, 140, C.curb);
  fb(fine, -92.25, 2, -140, -92, 2.25, 140, C.curb);
  // pond stone rim
  area(fine, POND.x0 - 0.75, 2, POND.z0 - 0.75, POND.x1 + 0.75, 2.5, POND.z1 + 0.75, (x, y, z) => {
    const edge = x < POND.x0 || x >= POND.x1 || z < POND.z0 || z >= POND.z1;
    return edge ? C.rimStone : 0;
  });
}

// ============================================================ 본관 main
function buildMain(vol, aabb, avoidRect) {
  const X0 = -30;
  const X1 = 40;
  const Z0 = -12;
  const Z1 = 2;
  const TOP = 14;
  aabb(X0, Z0, X1, Z1, 2, 17.8);
  avoidRect(X0, Z0, X1, Z1, 4);

  const mkFace = (face, a0, a1) =>
    stdFacade({
      wall: C.brick,
      wallAlt: C.brickAlt,
      mortar: C.mortar,
      frame: C.frame,
      win: C.glass,
      floors: 3,
      a0,
      seed: face,
      skip: face === 1 ? (a) => a >= -4 && a < 6 : null, // portal zone on south
    });
  paintWall(vol, 'z', Z1 - 0.5, Z1, 'hi', X0, X1, 2, TOP, mkFace(1, X0, X1)); // south
  paintWall(vol, 'z', Z0, Z0 + 0.5, 'lo', X0, X1, 2, TOP, mkFace(2, X0, X1)); // north
  paintWall(vol, 'x', X0, X0 + 0.5, 'lo', Z0, Z1, 2, TOP, mkFace(3, Z0, Z1)); // west
  paintWall(vol, 'x', X1 - 0.5, X1, 'hi', Z0, Z1, 2, TOP, mkFace(4, Z0, Z1)); // east
  // protruding piers between windows on long faces (0.25 m proud)
  for (const zf of [Z1, Z0 - 0.25]) {
    const zA = zf === Z1 ? Z1 : Z0 - 0.25;
    const zB = zf === Z1 ? Z1 + 0.25 : Z0;
    for (let x = X0 + 2.15; x < X1 - 1; x += 3.5) {
      fb(vol, x, 2.75, zA, x + 0.25, 13.75, zB, C.brickCourse);
    }
  }
  // gutter line under the eaves
  fb(vol, X0, 13.75, Z1, X1, 14, Z1 + 0.25, C.gutter);
  fb(vol, X0, 13.75, Z0 - 0.25, X1, 14, Z0, C.gutter);
  // ceiling so hollow interior does not show sky
  fb(vol, X0, 13.75, Z0, X1, 14, Z1, C.concrete);
  // hip roof with tile courses
  hipRoof(vol, X0 - 0.75, Z0 - 0.75, X1 + 0.75, Z1 + 0.75, 14, 0.75, 5.5, (x, z) =>
    C.hip,
  );
  buildPortal(vol, aabb);
  buildMainWest(vol, aabb, avoidRect);
}

function buildPortal(vol, aabb) {
  // Protruding light portal x -4..6, depth z 2..4.5, rising to y 19.
  const PX0 = -4;
  const PX1 = 6;
  aabb(PX0, 2, PX1, 4.75, 2, 19.5);
  // solid piers either side of the arch bay
  fb(vol, PX0, 2, 2, -2, 19, 4.5, C.portal);
  fb(vol, 4, 2, 2, PX1, 19, 4.5, C.portal);
  // recessed back plane (arch glass) at the facade line z=2
  area(vol, -2, 2, 1.75, 4, 17, 2, (x, y) => {
    const inRect = y >= 5.5 && y < 14;
    const dx = x + 0.125 - 1;
    const dy = y + 0.125 - 14;
    const inArch = y >= 14 && dx * dx + dy * dy <= 3 * 3;
    if (!(inRect || inArch)) {
      if (y < 5.5) return C.portalShade;
      return C.portal;
    }
    // mullion grid: verticals every 1.5 m, transoms every 1.75 m
    const vx = Math.abs(((x - 1) % 1.5 + 1.5) % 1.5);
    const hy = ((y - 5.5) % 1.75 + 1.75) % 1.75;
    if (vx < Q || hy < Q) return C.frame;
    // lower part is the lit lobby / doors
    if (y < 8) {
      const doorMid = Math.abs(x - 1) < Q;
      if (y < 5.75 && doorMid) return C.frame;
      return C.lobby;
    }
    return C.glassDark;
  });
  // arch surround on the portal south face: white ring around opening
  area(vol, -2, 5.25, 4.25, 4, 17, 4.5, (x, y) => {
    const dx = x + 0.125 - 1;
    const dy = y + 0.125 - 14;
    const r = Math.sqrt(dx * dx + dy * dy);
    const inside = (y < 14 && Math.abs(dx) < 3 - 0.75) || (y >= 14 && r < 3 - 0.75);
    return inside ? 0 : C.portal;
  });
  // portal top block above the arch
  fb(vol, -2, 17, 2, 4, 19, 4.5, C.portal);
  // cornice
  fb(vol, PX0 - 0.25, 18.75, 2, PX1 + 0.25, 19, 4.75, C.frame);
  // blue canopy on two steel posts
  fb(vol, -4, 6.25, 4.5, 6, 6.5, 8.5, C.canopy);
  fb(vol, -4, 6, 4.5, 6, 6.25, 8.5, C.canopyEdge);
  fb(vol, -3, 2, 8, -2.75, 6.25, 8.25, C.steel);
  fb(vol, 4.75, 2, 8, 5, 6.25, 8.25, C.steel);
  // concrete steps down toward the field
  const steps = [
    [4.5, 5.25, 3.0],
    [5.25, 6.0, 2.75],
    [6.0, 6.75, 2.5],
    [6.75, 7.5, 2.25],
  ];
  for (const [z0, z1, top] of steps) fb(vol, -2, 2, z0, 8, top, z1, C.concrete);
  aabb(-2, 4.5, 8, 7.5, 2, 3);
  // low hedge boxes either side of the steps
  fb(vol, -9, 2, 4, -4.5, 3, 8, C.hedge);
  fb(vol, 8, 2, 4, 12.5, 3, 8, C.hedge2);
}

function buildMainWest(vol, aabb, avoidRect) {
  // 4-floor west end block, rounded west corners (r = 2.5 m), flat roof.
  const X0 = -40;
  const X1 = -30;
  const Z0 = -12;
  const Z1 = 2;
  const TOP = 18;
  aabb(X0, Z0, X1, Z1, 2, 20);
  avoidRect(X0, Z0, X1, Z1, 4);
  const round = (x, z) => {
    // keep cells inside the rounded corner circles at the two west corners
    if (x >= X0 + 2.5) return true;
    const cs = [Z0 + 2.5, Z1 - 2.5];
    for (const cz of cs) {
      const dz = z - cz;
      if (Math.abs(dz) <= 2.5 && (x - (X0 + 2.5)) ** 2 + dz * dz <= 2.5 * 2.5 + 0.01) return true;
    }
    return false;
  };
  const face = stdFacade({
    wall: C.brick,
    wallAlt: C.brickAlt,
    mortar: C.mortar,
    frame: C.frame,
    win: C.glass,
    floors: 4,
    a0: Z0,
    seed: 9,
    bay: 3,
    winW: 1.5,
    winH: 2,
  });
  paintWall(vol, 'x', X0, X0 + 0.5, 'lo', Z0, Z1, 2, TOP, (aM, yM, layer, a, y) => {
    const xm = X0 + layer * Q + Q / 2;
    if (!round(xm, aM)) return 0;
    return face(aM, yM, layer);
  });
  paintWall(vol, 'z', Z0, Z0 + 0.5, 'lo', X0, X1, 2, TOP, face);
  paintWall(vol, 'z', Z1 - 0.5, Z1, 'hi', X0, X1, 2, TOP, face);
  // flat roof + parapet
  fb(vol, X0, TOP, Z0, X1, TOP + 0.25, Z1, C.hipEdge);
  area(vol, X0, TOP + 0.25, Z0, X1, TOP + 1, Z1, (x, y, z) => {
    const rim = x < X0 + 0.25 || x >= X1 - 0.25 || z < Z0 + 0.25 || z >= Z1 - 0.25;
    return rim ? C.brickDeep : 0;
  });
  // black plaque on west face
  fb(vol, X0 - 0.05, 4.2, -6, X0, 6.4, -3.8, C.plaque);
  // rooftop AC units
  fb(vol, -38, TOP + 0.25, -8, -36.5, TOP + 1.25, -6.5, C.steel);
  fb(vol, -35, TOP + 0.25, -4, -33.5, TOP + 1.25, -2.5, C.steel);
}

// ============================================================ 신관 link + tower
function buildLink(vol, aabb, avoidRect) {
  const X0 = -6;
  const X1 = 8;
  const Z0 = -44;
  const Z1 = -12;
  const TOP = 22;
  aabb(X0, Z0, X1, Z1, 2, 24);
  avoidRect(X0, Z0, X1, Z1, 4);
  // west face: ivory curtain wall + blue louvers
  const CURT = { z0: -34, z1: -18, y0: 6, y1: 20 };
  paintWall(vol, 'x', X0, X0 + 0.5, 'lo', Z0, Z1, 2, TOP, (aM, yM, layer) => {
    // floor-line stripes
    const stripe = yM >= 6 && yM < 6.25 ? C.stripeRed
      : yM >= 10 && yM < 10.25 ? C.stripeBlue
      : yM >= 14 && yM < 14.25 ? C.stripeRed
      : yM >= 18 && yM < 18.25 ? C.stripeBlue : 0;
    const inCurt = aM >= CURT.z0 && aM < CURT.z1 && yM >= CURT.y0 && yM < CURT.y1;
    // pilotis level: columns + recessed doors
    if (yM < 6) {
      const colEvery = Math.abs(((aM - (Z0 + 1.5)) % 4 + 4) % 4);
      if (layer === 0 && colEvery < 0.75) return C.portal;
      return 0; // open under the slab
    }
    if (!inCurt) {
      if (stripe) return stripe;
      const rel = aM - Z0;
      const bayC = 1.75 + Math.floor((rel - 1.0) / 3.5) * 3.5 + 1.75;
      const w0 = bayC - 1;
      const wy0 = 2 + Math.floor((yM - 2) / 4) * 4 + 1;
      const inWin = aM >= w0 && aM < w0 + 2 && yM >= wy0 && yM < wy0 + 2.2;
      if (!inWin) return C.ivory;
      const border = aM < w0 + Q || aM >= w0 + 2 - Q || yM < wy0 + Q || yM >= wy0 + 2.2 - Q;
      if (layer === 0) return border ? C.ivory : 0;
      return litAt(w0, Math.floor((yM - 2) / 4), 11) ? C.litPane : C.glass;
    }
    // curtain wall: recessed glass at layer 1, frame border at layer 0
    const edge = aM < CURT.z0 + 0.5 || aM >= CURT.z1 - 0.5 || yM < CURT.y0 + 0.5 || yM >= CURT.y1 - 0.5;
    if (layer === 0) return edge ? C.ivory : (stripe || 0);
    const mull = ((aM - CURT.z0) % 1.5 + 1.5) % 1.5 < Q;
    const trans = ((yM - CURT.y0) % 1.75 + 1.75) % 1.75 < Q;
    if (mull || trans) return C.frame;
    return litAt(aM, Math.floor(yM), 12) ? C.litPane2 : C.glass;
  });
  // blue louver fins protruding west of the curtain wall
  for (let z = CURT.z0 + 0.5; z < CURT.z1 - 0.25; z += 0.75) {
    fb(vol, X0 - 0.5, CURT.y0 + 0.25, z, X0, CURT.y1 - 0.25, z + 0.25, C.louver);
  }
  // recessed ground floor: glass doors + lobby glow near z -26
  paintWall(vol, 'x', X0 + 1.5, X0 + 2, 'lo', Z0, Z1, 2, 6, (aM, yM, layer) => {
    const doors = aM >= -27.5 && aM < -24.5 && yM < 5;
    if (doors) return layer === 0 ? C.frame : C.lobby;
    const glassBand = yM >= 2.5 && yM < 5;
    if (!glassBand) return C.ivoryAlt;
    const mull = ((aM - Z0) % 1.5 + 1.5) % 1.5 < Q;
    return mull ? C.frame : litAt(aM, 1, 13) ? C.litPane : C.glass;
  });
  // other faces: maroon + olive floor bands + regular windows
  const maroonFace = (seed) => (aM, yM, layer) => {
    if (yM >= 5.75 && yM < 6.25) return C.olive;
    if (yM >= 9.75 && yM < 10.25) return C.olive;
    if (yM >= 13.75 && yM < 14.25) return C.olive;
    if (yM >= 17.75 && yM < 18.25) return C.olive;
    const rel = aM % 3.5;
    const inBay = rel >= 0.75 && rel < 2.75;
    const wy = 2 + Math.floor((yM - 2) / 4) * 4 + 1;
    const inWin = inBay && yM >= wy && yM < wy + 2.1 && yM < TOP - 1;
    if (!inWin) return C.maroon;
    const border = rel < 0.75 + Q || rel >= 2.75 - Q || yM < wy + Q || yM >= wy + 2.1 - Q;
    if (layer === 0) return border ? C.maroon : 0;
    return litAt(aM, Math.floor((yM - 2) / 4), seed) ? C.litPane : C.glass;
  };
  paintWall(vol, 'z', Z0, Z0 + 0.5, 'lo', X0, X1, 2, TOP, maroonFace(21)); // north
  paintWall(vol, 'x', X1 - 0.5, X1, 'hi', Z0, Z1, 2, TOP, maroonFace(22)); // east
  paintWall(vol, 'z', Z1 - 0.5, Z1, 'hi', X0, X1, 2, TOP, maroonFace(23)); // south
  // flat green roof + parapet
  fb(vol, X0, TOP, Z0, X1, TOP + 0.25, Z1, C.greenRoof);
  area(vol, X0, TOP + 0.25, Z0, X1, TOP + 1, Z1, (x, y, z) => {
    const rim = x < X0 + 0.25 || x >= X1 - 0.25 || z < Z0 + 0.25 || z >= Z1 - 0.25;
    return rim ? C.ivoryAlt : 0;
  });
  // rooftop sign board behind the existing sign plane (x -6 face), back-lit
  fb(vol, X0, 22.2, -35, X0 + 0.5, 24.6, -17, C.ivory);
  area(vol, X0, 22.2, -35, X0 + 0.5, 24.6, -17, (x, y, z) => {
    const edge = y < 22.45 || y >= 24.35 || z < -34.75 || z >= -17.25;
    return edge ? C.stripeBlue : 0;
  });
  // back-light strip along the top
  fb(vol, X0 - 0.25, 24.6, -34.5, X0, 24.85, -17.5, C.signGlow);

  buildTower(vol, aabb, avoidRect);
}

function buildTower(vol, aabb, avoidRect) {
  const X0 = -8;
  const X1 = -2;
  const Z0 = -46;
  const Z1 = -38;
  const TOP = 26;
  aabb(X0, Z0, X1, Z1, 2, 33);
  avoidRect(X0, Z0, X1, Z1, 4);
  const maroon = (a, y) => C.maroon;
  paintWall(vol, 'x', X0, X0 + 0.5, 'lo', Z0, Z1, 2, TOP, (aM, yM, layer) => {
    // four round portholes stacked on the west face
    const czc = -42;
    for (const cy of [6.5, 11.5, 16.5, 21.5]) {
      const dz = aM + 0.125 - czc;
      const dy = yM + 0.125 - cy;
      const r = Math.sqrt(dz * dz + dy * dy);
      if (r < 1.05) {
        if (layer === 0) return r > 0.78 ? C.frame : 0;
        if (layer === 1) return r < 0.78 ? C.glassLight : C.frame;
      }
    }
    return maroon(aM, yM);
  });
  paintWall(vol, 'x', X1 - 0.5, X1, 'hi', Z0, Z1, 2, TOP, (a, y) => maroon(a, y));
  paintWall(vol, 'z', Z0, Z0 + 0.5, 'lo', X0, X1, 2, TOP, (a, y) => maroon(a, y));
  paintWall(vol, 'z', Z1 - 0.5, Z1, 'hi', X0, X1, 2, TOP, (a, y) => maroon(a, y));
  // wedge-shaped ivory cap: tall at the west, sloping down to the east
  for (let y = TOP; y < 30.5; y += Q) {
    const t = (y - TOP) / 4.5;
    const xe = X0 + 0.5 + (X1 - X0 - 0.5) * Math.max(0.22, 1 - t);
    const zInset = t * 1.2;
    fb(vol, X0, y, Z0 + zInset, xe, y + Q, Z1 - zInset, C.ivory);
  }
  fb(vol, X0 - 0.25, 30.25, Z0 + 0.75, X0 + 1.5, 30.5, Z1 - 0.75, C.ivoryAlt);
}

// ============================================================ 신관 동관 'new'
function buildNew(vol, aabb, avoidRect) {
  const X0 = 36;
  const X1 = 96;
  const Z0 = -36;
  const Z1 = -20;
  const TOP = 22;
  aabb(X0, Z0, X1, Z1, 2, 24);
  avoidRect(X0, Z0, X1, Z1, 4);
  const face = (seed) => (aM, yM, layer) => {
    if (yM >= 5.75 && yM < 6.25) return C.olive;
    if (yM >= 9.75 && yM < 10.25) return C.olive;
    if (yM >= 13.75 && yM < 14.25) return C.olive;
    if (yM >= 17.75 && yM < 18.25) return C.olive;
    const rel = ((aM - X0) % 3.5 + 3.5) % 3.5;
    const inBay = rel >= 0.75 && rel < 2.75;
    const wy = 2 + Math.floor((yM - 2) / 4) * 4 + 1;
    const inWin = inBay && yM >= wy && yM < wy + 2.1 && yM < TOP - 1;
    if (!inWin) return C.maroon;
    const border = rel < 0.75 + Q || rel >= 2.75 - Q || yM < wy + Q || yM >= wy + 2.1 - Q;
    if (layer === 0) return border ? C.maroon : 0;
    return litAt(aM, Math.floor((yM - 2) / 4), seed) ? C.litPane : C.glass;
  };
  paintWall(vol, 'z', Z0, Z0 + 0.5, 'lo', X0, X1, 2, TOP, face(31));
  paintWall(vol, 'z', Z1 - 0.5, Z1, 'hi', X0, X1, 2, TOP, face(32));
  paintWall(vol, 'x', X0, X0 + 0.5, 'lo', Z0, Z1, 2, TOP, face(33));
  paintWall(vol, 'x', X1 - 0.5, X1, 'hi', Z0, Z1, 2, TOP, face(34));
  fb(vol, X0, TOP, Z0, X1, TOP + 0.25, Z1, C.greenRoof);
  fb(vol, 70, TOP + 0.01, -34, 90, TOP + 0.25, -26, C.lavender); // lavender patch
  area(vol, X0, TOP + 0.25, Z0, X1, TOP + 1, Z1, (x, y, z) => {
    const rim = x < X0 + 0.25 || x >= X1 - 0.25 || z < Z0 + 0.25 || z >= Z1 - 0.25;
    return rim ? C.maroon : 0;
  });
  // rooftop railing: sparse posts + top rail above parapet
  for (let x = X0; x < X1; x += 1) {
    fb(vol, x, TOP + 1, Z0 + 0.25, x + 0.1, TOP + 2, Z0 + 0.35, C.iron);
    fb(vol, x, TOP + 1, Z1 - 0.35, x + 0.1, TOP + 2, Z1 - 0.25, C.iron);
  }
  fb(vol, X0, TOP + 1.9, Z0 + 0.2, X1, TOP + 2, Z0 + 0.4, C.iron);
  fb(vol, X0, TOP + 1.9, Z1 - 0.4, X1, TOP + 2, Z1 - 0.2, C.iron);
}

// ============================================================ 연결동 annex
function buildAnnex(vol, aabb, avoidRect) {
  const X0 = -2;
  const X1 = 12;
  const Z0 = -62;
  const Z1 = -44;
  const TOP = 14;
  aabb(X0, Z0, X1, Z1, 2, 15);
  avoidRect(X0, Z0, X1, Z1, 4);
  const face = (seed) => (aM, yM, layer) => {
    if (yM >= 5.75 && yM < 6.25) return C.annexTrim;
    if (yM >= 9.75 && yM < 10.25) return C.annexTrim;
    const seam = ((aM - X0) % 1 + 1) % 1 < Q;
    const wy = 2 + Math.floor((yM - 2) / 4) * 4 + 1.2;
    const rel = ((aM - X0) % 3.5 + 3.5) % 3.5;
    const inWin = rel >= 1 && rel < 2.5 && yM >= wy && yM < wy + 1.6 && yM < TOP - 1;
    if (!inWin) return seam ? C.annexSeam : C.annex;
    const border = rel < 1 + Q || rel >= 2.5 - Q || yM < wy + Q || yM >= wy + 1.6 - Q;
    if (layer === 0) return border ? C.annexTrim : 0;
    return litAt(aM, Math.floor((yM - 2) / 4), seed) ? C.litPane : C.glass;
  };
  paintWall(vol, 'z', Z0, Z0 + 0.5, 'lo', X0, X1, 2, TOP, face(41));
  paintWall(vol, 'z', Z1 - 0.5, Z1, 'hi', X0, X1, 2, TOP, face(42));
  paintWall(vol, 'x', X1 - 0.5, X1, 'hi', Z0, Z1, 2, TOP, face(43));
  paintWall(vol, 'x', X0, X0 + 0.5, 'lo', Z0, Z1, 2, TOP, face(44));
  fb(vol, X0, TOP, Z0, X1, TOP + 0.25, Z1, C.annex);
  fb(vol, X0, TOP + 0.25, Z0, X1, TOP + 0.5, Z0 + 0.25, C.annexTrim);
  // external steel stair on the west side, two flights + landing
  aabb(X0 - 3, Z0, X0, Z1, 2, 14);
  const stairX0 = X0 - 3;
  // flight 1: south end up to y 8
  for (let i = 0; i < 20; i++) {
    const z = Z0 + 2 + i * 0.5;
    const top = 2 + (i + 1) * 0.3;
    fb(vol, stairX0, 2, z, X0 - 0.5, top, z + 0.5, C.steel);
  }
  // landing
  fb(vol, stairX0, 7.8, -52, X0 - 0.5, 8, -48, C.steel);
  // flight 2: up to y 14 along north half
  for (let i = 0; i < 20; i++) {
    const z = -48 - i * 0.3;
    const top = 8 + (i + 1) * 0.3;
    fb(vol, stairX0, 8, z - 0.3, X0 - 0.5, top, z, C.steel);
  }
  // railings
  fb(vol, stairX0, 8, Z0, stairX0 + 0.1, 9, Z1, C.iron);
  fb(vol, stairX0, 14, Z0, stairX0 + 0.1, 15, Z1, C.iron);
}

// ============================================================ 백운관 gym
function buildGym(vol, aabb, avoidRect) {
  const X0 = 4;
  const X1 = 38;
  const Z0 = -84;
  const Z1 = -62;
  const TOP = 18;
  aabb(X0, Z0, X1, Z1, 2, 23);
  avoidRect(X0, Z0, X1, Z1, 4);
  const face = (seed) => (aM, yM, layer) => {
    if (yM < 6) {
      // brick base with courses
      return C.brickDeep;
    }
    // blue-framed ribbon band just under the eaves
    if (yM >= 15.5 && yM < 17.25) {
      const mull = ((aM) % 1 + 1) % 1 < Q;
      if (layer === 0) {
        const border = yM < 15.75 || yM >= 17;
        return border ? C.louver : 0;
      }
      if (mull) return C.louver;
      return litAt(aM, 1, seed) ? C.litPane : C.glass;
    }
    if (yM >= 15.25 && yM < 15.5) return C.louverDark;
    // cream panels with vertical joints every 2 m
    const joint = ((aM) % 2 + 2) % 2 < Q;
    const rel = ((aM - X0) % 7 + 7) % 7;
    const inWin = rel >= 2.5 && rel < 4 && yM >= 9 && yM < 10.5;
    if (inWin && layer >= 1) return C.glass;
    if (inWin) return C.frame;
    return joint ? C.gymJoint : C.gymWall;
  };
  paintWall(vol, 'z', Z0, Z0 + 0.5, 'lo', X0, X1, 2, TOP, face(51));
  paintWall(vol, 'z', Z1 - 0.5, Z1, 'hi', X0, X1, 2, TOP, face(52));
  // gable ends: fill up to the roof curve
  const cz = (Z0 + Z1) / 2;
  const half = (Z1 - Z0) / 2;
  const riseAt = (z) => {
    const t = Math.min(1, Math.abs(z - cz) / half);
    return 4.5 * Math.sqrt(1 - t * t);
  };
  for (const xe of [X0, X1]) {
    area(vol, xe, 2, Z0, xe + 0.5, TOP + 4.5, Z1, (x, y, z) => {
      if (y < 6) return C.brickDeep;
      if (y < TOP) {
        const joint = ((z - Z0) % 2 + 2) % 2 < Q;
        return joint ? C.gymJoint : C.gymWall;
      }
      if (y < TOP + riseAt(z + 0.125)) return C.gymWall;
      return 0;
    });
  }
  // barrel-vault roof: axis along x, standing seams every 0.5 m
  for (let z = cellOf(Z0 - 0.5); z < cellOf(Z1 + 0.5); z++) {
    const zm = (z + 0.5) * Q;
    const h = riseAt(Math.max(Z0, Math.min(Z1, zm)));
    const seam = (z % 2 + 2) % 2 === 0;
    for (let x = cellOf(X0 - 0.5); x < cellOf(X1 + 0.5); x++) {
      for (let y = cellOf(TOP); y < cellOf(TOP + h); y++) {
        vol.set(x, y, z, seam ? C.barrelAlt : C.barrel);
      }
    }
  }
  // entrance on south face + canopy
  area(vol, 18, 2, Z1 - 0.5, 24, 6, Z1, (x, y, z, cx, cy, cz2) => {
    const layer = cz2 === cellOf(Z1) - 1 ? 0 : 1;
    const border = x < 18.5 || x >= 23.5 || y >= 5.5;
    if (layer === 0) return border ? C.louver : 0;
    return border ? C.frame : C.lobby;
  });
  fb(vol, 17.5, 5.75, Z1, 24.5, 6, Z1 + 1.5, C.steel);
  // '백운관' plaque board (behind the sign plane on the south face, x ~4..10)
  fb(vol, 3.5, 2.6, Z1 - 0.3, 10.5, 4.6, Z1, 0xa33a2e);
}

// ============================================================ 기숙사 dorm
function buildDorm(vol, aabb, avoidRect) {
  const X0 = 80;
  const X1 = 94;
  const Z0 = -80;
  const Z1 = -44;
  const TOP = 18;
  aabb(X0, Z0, X1, Z1, 2, 20);
  avoidRect(X0, Z0, X1, Z1, 4);
  const face = (seed) => (aM, yM, layer) => {
    const rel = ((aM - X0) % 4 + 4) % 4;
    const wy = 2 + Math.floor((yM - 2) / 4) * 4 + 0.9;
    const inWin = rel >= 1 && rel < 3 && yM >= wy && yM < wy + 2.2 && yM < TOP - 0.5;
    if (!inWin) return C.dorm;
    const border = rel < 1 + Q || rel >= 3 - Q || yM < wy + Q || yM >= wy + 2.2 - Q;
    if (layer === 0) return border ? C.dorm : 0;
    return litAt(aM, Math.floor((yM - 2) / 4), seed) ? C.litPane2 : C.glass;
  };
  paintWall(vol, 'z', Z0, Z0 + 0.5, 'lo', X0, X1, 2, TOP, face(61));
  paintWall(vol, 'z', Z1 - 0.5, Z1, 'hi', X0, X1, 2, TOP, face(62));
  paintWall(vol, 'x', X0, X0 + 0.5, 'lo', Z0, Z1, 2, TOP, face(63));
  paintWall(vol, 'x', X1 - 0.5, X1, 'hi', Z0, Z1, 2, TOP, face(64));
  fb(vol, X0, TOP, Z0, X1, TOP + 0.25, Z1, C.dormRoof);
  area(vol, X0, TOP + 0.25, Z0, X1, TOP + 0.9, Z1, (x, y, z) => {
    const rim = x < X0 + 0.25 || x >= X1 - 0.25 || z < Z0 + 0.25 || z >= Z1 - 0.25;
    return rim ? C.dormAlt : 0;
  });
  // guess: balcony slabs + rails on the south face each floor
  for (let z = Z0 + 2; z < Z1 - 1; z += 4) {
    for (const fy of [5.9, 9.9, 13.9]) {
      fb(vol, X1, fy, z - 1, X1 + 1.2, fy + 0.15, z + 1, C.dormRoof);
      fb(vol, X1 + 1.1, fy + 0.15, z - 1, X1 + 1.2, fy + 1.1, z + 1, C.iron);
    }
  }
}

// ============================================================ east blocks + library
function buildSmall(vol, aabb, avoidRect, o) {
  aabb(o.x0, o.z0, o.x1, o.z1, 2, o.collideTop);
  if (!o.outside) avoidRect(o.x0, o.z0, o.x1, o.z1, 4);
  const face = stdFacade({
    wall: o.wall,
    wallAlt: o.wallAlt,
    mortar: o.mortar,
    frame: o.frame ?? C.frame,
    win: o.win ?? C.glass,
    floors: o.floors,
    a0: o.x0,
    seed: o.seed,
    lit: o.lit,
  });
  paintWall(vol, 'z', o.z0, o.z0 + 0.5, 'lo', o.x0, o.x1, 2, o.top, face);
  paintWall(vol, 'z', o.z1 - 0.5, o.z1, 'hi', o.x0, o.x1, 2, o.top, face);
  paintWall(vol, 'x', o.x0, o.x0 + 0.5, 'lo', o.z0, o.z1, 2, o.top, face);
  paintWall(vol, 'x', o.x1 - 0.5, o.x1, 'hi', o.z0, o.z1, 2, o.top, face);
  if (o.roof === 'hip') {
    fb(vol, o.x0, o.top - 0.25, o.z0, o.x1, o.top, o.z1, C.concrete);
    hipRoof(vol, o.x0 - 0.75, o.z0 - 0.75, o.x1 + 0.75, o.z1 + 0.75, o.top, 0.55, 3.5, (x, z) =>
      C.hip,
    );
  } else {
    fb(vol, o.x0, o.top, o.z0, o.x1, o.top + 0.25, o.z1, o.roofCol);
    area(vol, o.x0, o.top + 0.25, o.z0, o.x1, o.top + 0.9, o.z1, (x, y, z) => {
      const rim = x < o.x0 + 0.25 || x >= o.x1 - 0.25 || z < o.z0 + 0.25 || z >= o.z1 - 0.25;
      return rim ? (o.parapet ?? o.roofCol) : 0;
    });
  }
}

// ============================================================ FENCE + GATE
function buildFence(vol, aabb) {
  const { x: XW, x2: XE, z: ZN, z2: ZS, gap0, gap1 } = FENCE;
  const post = (x0, z0) => {
    // brick post 0.5x0.5 with cap
    fb(vol, x0, 2, z0, x0 + 0.5, 3.6, z0 + 0.5, C.brickDeep);
    fb(vol, x0 - 0.05, 3.6, z0 - 0.05, x0 + 0.55, 3.85, z0 + 0.55, C.mortar);
  };
  const ivyAt = (a) => hash3(Math.round(a * 2), 3, 77) % 11 < 3;
  const run = (axis, fixed, a0, a1) => {
    for (let a = a0; a < a1; a += 0.25) {
      if (Math.round((a - a0) / 6) !== Math.round((a + 0.25 - a0) / 6)) {
        // brick post every 6 m
        if (axis === 'x') post(fixed, a);
        else post(a, fixed);
        a += 0.5;
        if (a >= a1) break;
      }
      const ivy = ivyAt(a * 2);
      const brickCol = ivy ? (hash3(Math.round(a * 4), 1, 5) % 2 ? C.ivy : C.ivy2) : C.brick;
      // low brick wall y2..3, coping y3..3.25, iron railing y3.25..4
      if (axis === 'x') {
        fb(vol, fixed, 2, a, fixed + 0.75, 3, a + 0.25, brickCol);
        fb(vol, fixed - 0.05, 3, a, fixed + 0.8, 3.25, a + 0.25, C.mortar);
        if (Math.round(a / Q) % 4 === 0) fb(vol, fixed + 0.25, 3.25, a, fixed + 0.5, 3.75, a + 0.25, ivy ? C.ivy : C.iron);
        fb(vol, fixed + 0.25, 3.75, a, fixed + 0.5, 4, a + 0.25, C.iron);
      } else {
        fb(vol, a, 2, fixed, a + 0.25, 3, fixed + 0.75, brickCol);
        fb(vol, a, 3, fixed - 0.05, a + 0.25, 3.25, fixed + 0.8, C.mortar);
        if (Math.round(a / Q) % 4 === 0) fb(vol, a, 3.25, fixed + 0.25, a + 0.25, 3.75, fixed + 0.5, ivy ? C.ivy : C.iron);
        fb(vol, a, 3.75, fixed + 0.25, a + 0.25, 4, fixed + 0.5, C.iron);
      }
    }
  };
  // west fence with gate gap
  run('x', XW, ZN, gap0 - 1.5);
  run('x', XW, gap1 + 1.5, ZS);
  aabb(XW, ZN, XW + 2, gap0 - 1.5, 2, 4.5);
  aabb(XW, gap1 + 1.5, XW + 2, ZS, 2, 4.5);
  // east, north, south
  run('x', XE, ZN, ZS);
  aabb(XE, ZN, XE + 2, ZS, 2, 4.5);
  run('z', ZN, XW, XE + 2);
  aabb(XW, ZN, XE + 2, ZN + 2, 2, 4.5);
  run('z', ZS, XW, XE + 2);
  aabb(XW, ZS, XE + 2, ZS + 2, 2, 4.5);
}

function buildGate(vol, aabb) {
  const XW = FENCE.x;
  // two 1.5 m-square pillars inside the gap edges, ~7 m + corbelled arch tops
  const pillars = [
    { z0: FENCE.gap0, z1: FENCE.gap0 + 1.5, south: true },
    { z0: FENCE.gap1 - 1.5, z1: FENCE.gap1, south: false },
  ];
  for (const p of pillars) {
    // white mortar base band
    fb(vol, XW, 2, p.z0, XW + 1.5, 2.5, p.z1, C.mortar);
    // shaft with brick courses
    area(vol, XW, 2.5, p.z0, XW + 1.5, 8, p.z1, (x, y, z, cx, cy) =>
      cy % 2 ? C.brickDeep : C.brick,
    );
    // corbelled semicircular arch cap: 1.75 m of stepped semicircle
    const czm = (p.z0 + p.z1) / 2;
    const cxm = XW + 0.75;
    for (let y = 8; y < 9.75; y += Q) {
      const t = (y - 8) / 1.5;
      const hw = 0.75 * Math.sqrt(Math.max(0, 1 - t * t));
      area(vol, cxm - hw, y, czm - hw, cxm + hw, y + Q, czm + hw, () => (Math.round(y / Q) % 2 ? C.brickDeep : C.brick));
    }
    aabb(XW, p.z0, XW + 1.5, p.z1, 2, 10);
  }
  // dark vertical plaque on the south pillar's west face + glow lamp above it
  fb(vol, XW - 0.25, 3.4, -24, XW, 7.2, -22.8, C.plaqueBlue);
  fb(vol, XW - 0.3, 7.3, -23.8, XW - 0.05, 7.55, -23, C.lampGlow);
  // grey folding sliding gate beside the north pillar (partly opened)
  const gx0 = XW + 2;
  for (let z = -12; z < -6; z += 0.5) {
    fb(vol, gx0, 2, z, gx0 + 0.15, 4, z + 0.15, C.gateMetal);
  }
  fb(vol, gx0 - 0.1, 2, -12, gx0 + 0.25, 2.3, -6, C.iron);
  fb(vol, gx0 - 0.1, 3.8, -12, gx0 + 0.25, 4, -6, C.iron);
  fb(vol, gx0 - 0.1, 2.9, -12, gx0 + 0.25, 3.05, -6, C.iron);
  // guide rail on the ground
  fb(vol, gx0 - 0.5, 2, -13.5, gx0 + 0.5, 2.1, -6, C.iron);
  aabb(gx0 - 0.5, -12, gx0 + 0.5, -6, 2, 4.5);
}

// ============================================================ PROPS
function buildProps(vol, aabb, avoidRect) {
  // soccer goals at both field ends
  const midZ = (FIELD.z0 + FIELD.z1) / 2;
  for (const [gx, dir] of [[FIELD.x0 + 1.5, -1], [FIELD.x1 - 1.5, 1]]) {
    const z0 = midZ - 3.5;
    const z1 = midZ + 3.5;
    // posts + crossbar
    fb(vol, gx - 0.15, 2, z0 - 0.15, gx + 0.15, 4.5, z0 + 0.15, C.white);
    fb(vol, gx - 0.15, 2, z1 - 0.15, gx + 0.15, 4.5, z1 + 0.15, C.white);
    fb(vol, gx - 0.15, 4.35, z0 - 0.15, gx + 0.15, 4.65, z1 + 0.15, C.white);
    // back frame poles
    const bx = gx + dir * 1.4;
    fb(vol, bx - 0.1, 2, z0 - 0.1, bx + 0.1, 3.2, z0 + 0.1, C.white);
    fb(vol, bx - 0.1, 2, z1 - 0.1, bx + 0.1, 3.2, z1 + 0.1, C.white);
    // net: back plane + top slope, sparse grid
    area(vol, Math.min(gx, bx), 2, z0, Math.max(gx, bx) + 0.05, 4.6, z1, (x, y, z) => {
      const back = Math.abs(x - bx) < 0.15;
      if (!back) return 0;
      return (Math.round(z / Q) + Math.round(y / Q)) % 2 === 0 ? C.goalNet : 0;
    });
  }
  buildFlagpole(vol);
  buildBenches(vol);
  buildBikeRacks(vol);
  buildLamps(vol);
  buildStone(vol);
  buildHedges(vol);
}

function buildFlagpole(vol) {
  const px = 12;
  const pz = 7;
  fb(vol, px - 0.5, 2, pz - 0.5, px + 0.5, 2.5, pz + 0.5, C.flagBase);
  fb(vol, px - 0.15, 2.5, pz - 0.15, px + 0.15, 15.4, pz + 0.15, C.flagPole);
  fs(vol, px, 15.4, pz, C.flagGold);
  // 태극기 (rebuilt at 0.25 m from the step-1 pattern) flying east
  const WHITE = 0xf7f4ee;
  const RED = 0xcd2e3a;
  const BLUE = 0x0047a0;
  const BLACK = 0x141414;
  const y0 = 11.5;
  const cx = 10.5;
  const cy = 6.5;
  const r = 4.15;
  for (let sy = 0; sy < 14; sy++) {
    for (let sx = 0; sx < 22; sx++) {
      let color = WHITE;
      const dx = sx - cx;
      const dy = sy - cy;
      if (dx * dx + dy * dy <= r * r) {
        const wave = Math.sin((dx / r) * Math.PI) * r * 0.42;
        color = dy + 0.2 >= wave ? RED : BLUE;
        if ((dx + 0.15) * (dx + 0.15) + (dy - r * 0.42) * (dy - r * 0.42) < 0.85) color = BLUE;
        if ((dx - 0.15) * (dx - 0.15) + (dy + r * 0.42) * (dy + r * 0.42) < 0.85) color = RED;
      }
      if (trigram(sx, sy)) color = BLACK;
      fs(vol, px + 0.25 + sx * Q, y0 + sy * Q, pz, color);
    }
  }
  // school flag: green with white centre emblem, below the 태극기
  for (let sy = 0; sy < 9; sy++) {
    for (let sx = 0; sx < 14; sx++) {
      const dx = sx - 6.5;
      const dy = sy - 4;
      const emblem = dx * dx + dy * dy < 5.5;
      fs(vol, px + 0.25 + sx * Q, y0 - 2.4 + sy * Q, pz, emblem ? WHITE : 0x1e7a3a);
    }
  }
}

function trigram(sx, sy) {
  const spots = [
    [1, 9, [1, 1, 1]],
    [1, 0, [1, 0, 1]],
    [16, 9, [0, 1, 0]],
    [16, 0, [0, 0, 0]],
  ];
  for (let i = 0; i < spots.length; i++) {
    const x0 = spots[i][0];
    const y0 = spots[i][1];
    const pat = spots[i][2];
    const lx = sx - x0;
    const ly = sy - y0;
    if (lx < 0 || lx > 4 || ly < 0 || ly > 4 || ly % 2 === 1) continue;
    const bar = 2 - ly / 2;
    if (pat[bar]) return true;
    if (lx !== 2) return true;
  }
  return false;
}

function buildBenches(vol) {
  const spots = [
    [-70, -22, 0], [-58, -22, 0], [-48, -12, 0],
    [-20, 14.5, 0], [-32, 14.5, 0], [30, 14.5, 0],
    [50, 52, 1], [74, 50.5, 1],
  ];
  for (const [x, z, rot] of spots) {
    const w = 1.8;
    const along = rot === 0 ? 'x' : 'z';
    const seat = (a0, a1, b0, b1, col, y0, y1) => {
      if (along === 'x') fb(vol, x + a0, y0, z + b0, x + a1, y1, z + b1, col);
      else fb(vol, x + b0, y0, z + a0, x + b1, y1, z + a1, col);
    };
    seat(0, w, 0.35, 0.5, C.benchLeg, 2, 2.45);
    seat(0, 0.15, 0.1, 0.5, C.benchLeg, 2, 2.45);
    seat(w - 0.15, w, 0.1, 0.5, C.benchLeg, 2, 2.45);
    seat(0, w, 0, 0.5, C.bench, 2.45, 2.55);
    seat(0, w, -0.05, 0.05, C.bench, 2.55, 3.15);
  }
}

function buildBikeRacks(vol) {
  const racks = [
    [-66, -18],
    [58, 52.5],
  ];
  for (const [rx, rz] of racks) {
    // rack U-bars
    for (let i = 0; i < 4; i++) {
      const x = rx + i * 1;
      fb(vol, x, 2, rz, x + 0.12, 2.8, rz + 0.12, C.steel);
      fb(vol, x, 2, rz + 0.7, x + 0.12, 2.8, rz + 0.82, C.steel);
      fb(vol, x, 2.7, rz, x + 0.12, 2.82, rz + 0.82, C.steel);
    }
    // a few simple bikes between the bars
    for (let b = 0; b < 3; b++) {
      const x = rx + 0.55 + b * 1;
      const frame = b % 2 ? C.stripeRed : C.stripeBlue;
      // wheels: thin dark discs
      for (const wz of [rz + 0.15, rz + 0.9]) {
        for (let dy = 0; dy < 4; dy++) {
          for (let dz = 0; dz < 4; dz++) {
            const dy2 = dy - 1.5;
            const dz2 = dz - 1.5;
            const r = Math.sqrt(dy2 * dy2 + dz2 * dz2);
            if (r > 1.15 && r < 1.85) fs(vol, x, 2 + dy * 0.18, wz + dz * 0.18, C.iron);
          }
        }
      }
      fb(vol, x - 0.03, 2.5, rz + 0.3, x + 0.03, 2.6, rz + 0.85, frame);
      fb(vol, x - 0.03, 2.85, rz + 0.78, x + 0.03, 2.95, rz + 0.95, C.iron);
    }
  }
}

function buildLamps(vol) {
  const spots = [
    [-80, -10.5], [-66, -10.5], [-52, -10.5], [-46, -10.5],
    [-20, 14], [18, 14], [44, 14],
    [-84, -34], [-30, -34], [-50, -34],
    [34, -40], [-4, -48], [52, 20],
  ];
  for (const [x, z] of spots) {
    fb(vol, x - 0.1, 2, z - 0.1, x + 0.1, 7, z + 0.1, C.flagPole);
    fb(vol, x - 0.1, 6.9, z - 0.1, x + 0.9, 7.1, z + 0.1, C.flagPole);
    fb(vol, x + 0.55, 6.65, z - 0.3, x + 1.05, 6.9, z + 0.3, C.lampGlow);
  }
}

function buildStone(vol) {
  // school-name rock (교석) just inside the gate
  const sx = -78;
  const sz = -18;
  area(vol, sx, 2, sz, sx + 4, 3.6, sz + 1.6, (x, y, z) => {
    const dx = x - (sx + 2);
    const dy = y - 2.6;
    const dz = z - (sz + 0.8);
    if ((dx / 2.1) ** 2 + (dy / 1.1) ** 2 + (dz / 0.95) ** 2 > 1) return 0;
    return hash3(Math.round(x * 2), Math.round(y * 2), Math.round(z * 2)) % 4 === 0 ? C.stoneDark : C.stone;
  });
}

function buildHedges(vol) {
  // clipped hedge along the field's north edge (with gap at the portal walk)
  for (let x = -40; x < 44; x += 0.5) {
    if (x > -10 && x < 14) continue;
    const col = hash3(Math.round(x), 0, 3) % 3 === 0 ? C.hedge2 : C.hedge;
    fb(vol, x, 2, 14, x + 0.5, 3.1, 15.5, col);
  }
  // hedge squares flanking the gate walk
  fb(vol, -52, 2, -12, -46, 3, -10.5, C.hedge);
  fb(vol, -52, 2, -24, -46, 3, -22.5, C.hedge2);
}

// ============================================================ TREES
function buildTrees(vol, isAvoid) {
  // Trees live in their own 0.5 m volume. Crowns are solid (no interior holes,
  // which only add hidden faces) with a lumpy silhouette from per-column radius
  // wobble, and colours change in horizontal bands so greedy meshing can merge
  // whole layers. ~10x fewer triangles than per-cell random 0.25 m leaves.
  const T = 0.5;
  const tc = (m) => Math.floor(m / T + 1e-6);
  const tbox = (x0, y0, z0, x1, y1, z1, col) => vol.fill(tc(x0), tc(y0), tc(z0), Math.max(tc(x0) + 1, tc(x1)), Math.max(tc(y0) + 1, tc(y1)), Math.max(tc(z0) + 1, tc(z1)), col);
  const rand = mulberry32(20261008);
  const placed = [];
  const tooClose = (x, z, d) => placed.some((t) => Math.abs(t.x - x) + Math.abs(t.z - z) < d);
  const tryPlace = (x, z, d) => {
    if (isAvoid(x, z) || tooClose(x, z, d ?? 5)) return false;
    placed.push({ x, z });
    return true;
  };
  // crown: ellipsoid centred (x, cy, z), radii rx/ry, colour by height band
  function crown(x, cy, z, rx, ry, colFn, seed) {
    const X = tc(x);
    const Z = tc(z);
    const R = Math.ceil(rx / T) + 1;
    for (let iy = tc(cy - ry); iy <= tc(cy + ry); iy++) {
      const y = (iy + 0.5) * T;
      const t = (y - cy) / ry;
      if (Math.abs(t) > 1) continue;
      const rr = rx * Math.sqrt(Math.max(0, 1 - t * t));
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
          const wob = 1 + ((hash3((X + dx) >> 1, seed, (Z + dz) >> 1) % 7) - 3) * 0.07;
          const ex = dx * T;
          const ez = dz * T;
          if (ex * ex + ez * ez > rr * rr * wob * wob) continue;
          vol.set(X + dx, iy, Z + dz, colFn(y, t));
        }
      }
    }
  }

  function ginkgo(x, z) {
    tbox(x - 0.25, 2, z - 0.25, x + 0.25, 6.5, z + 0.25, C.trunk);
    crown(x, 8.6, z, 1.9, 3.9, (y, t) => (t < -0.75 ? C.ginkgoG : Math.floor(y / 1.5) % 2 ? C.ginkgo : C.ginkgo2), 3);
  }

  function pine(x, z) {
    let tx = x;
    for (let y = 2; y < 6; y += 0.5) {
      tbox(tx - 0.25, y, z - 0.25, tx + 0.25, y + 0.5, z + 0.25, C.bark);
      tx += 0.12 * Math.sin(y * 1.7 + x);
    }
    const layers = [
      [4.5, 2.3, 0, C.pine],
      [5.5, 1.8, 0.5, C.pine2],
      [6.5, 1.2, -0.5, C.pine],
    ];
    for (const [ly, lr, off, col] of layers) {
      crown(x + off, ly, z - off, lr, 0.5, () => col, 7);
    }
  }

  function deciduous(x, z) {
    tbox(x - 0.25, 2, z - 0.25, x + 0.25, 5.2, z + 0.25, C.trunk);
    crown(x, 6.6, z, 2.2, 2.5, (y, t) => (t > 0.45 ? C.leaf2 : C.leaf), 5);
  }

  // ginkgos along the road sidewalk (outside fence) and gate walk
  for (let z = -78; z <= 74; z += 9) {
    if (Math.abs(z + 19) < 7) continue; // clear of the gate
    ginkgo(-90.5, z);
    placed.push({ x: -90.5, z });
  }
  for (let x = -80; x <= -50; x += 8) {
    if (tryPlace(x, -27, 6)) ginkgo(x, -27);
    if (tryPlace(x, -8, 6)) ginkgo(x, -8);
  }
  // ginkgos along field east edge
  for (let z = 20; z <= 62; z += 10) {
    if (tryPlace(49, z, 6)) ginkgo(49, z);
  }
  // pine garden between the parking lot and the west fence/road side
  const pineSpots = [];
  for (let z = -72; z <= -40; z += 6) pineSpots.push([-84.5, z]);
  for (let z = -6; z <= 30; z += 6) pineSpots.push([-84.5, z]);
  pineSpots.push([-84, 36], [-84, 44]);
  for (const [x, z] of pineSpots) {
    if (tryPlace(x, z, 4)) pine(x, z);
  }
  // pines near the gym front
  for (const [x, z] of [[0, -58], [6, -58], [30, -58], [36, -58]]) {
    if (tryPlace(x, z, 4)) pine(x, z);
  }
  // scattered deciduous trees
  let guard = 0;
  while (placed.length < 95 && guard++ < 4000) {
    const x = -84 + rand() * 186;
    const z = -86 + rand() * 160;
    if (tryPlace(Math.round(x * 2) / 2, Math.round(z * 2) / 2, 6)) deciduous(Math.round(x * 2) / 2, Math.round(z * 2) / 2);
  }
}

// ============================================================ mountain + clouds (coarse 2 m)
function buildMountain(vol, mtn) {
  // Terrain-scale hills use 4 m voxels (mtn volume): ~4x fewer faces than 2 m.
  const hmap = new Map();
  raise(hmap, 2, -82, 32, 30);
  raise(hmap, -40, -86, 22, 14);
  raise(hmap, 48, -84, 20, 12);
  raise(hmap, 62, -30, 6, 8);
  raise(hmap, 62, -8, 7, 10);
  raise(hmap, 62, 14, 6, 8);
  raise(hmap, 62, 32, 5, 6);
  const hAt = (x, z) => hmap.get(`${x},${z}`) || 0;
  for (const [key, h] of hmap) {
    const [x, z] = key.split(',').map(Number);
    if (x >= 70) continue;
    if (x >= 56 && x < 68 && z >= -60 && z < -50) continue;
    if (z < -70 || z >= 70 || x < -70 || x >= 70) vol.set(x, 0, z, C.mtn2);
    for (let y = 1; y <= h; y++) {
      const exposed = y === h || hAt(x + 1, z) < y || hAt(x - 1, z) < y || hAt(x, z + 1) < y || hAt(x, z - 1) < y;
      if (!exposed) continue;
      // dark forest green with low-frequency tonal patches
      const tone = hash3(Math.floor(x / 6), Math.floor(y / 3), Math.floor(z / 6)) % 10;
      let color = C.mtn;
      if (y > 16) color = tone < 5 ? C.mtn3 : C.mtn2;
      else if (tone < 4) color = C.mtn2;
      else if (tone > 8) color = C.mtn3;
      mtn.set(x >> 1, y >> 1, z >> 1, color);
    }
  }
}

function raise(hmap, cx, cz, radius, peak) {
  for (let x = cx - radius; x <= cx + radius; x++) {
    for (let z = cz - radius; z <= cz + radius; z++) {
      const dx = (x - cx) / radius;
      const dz = (z - cz) / radius;
      const d = Math.hypot(dx, dz);
      if (d > 1) continue;
      const ridge = 0.06 * Math.sin(x * 0.41) + 0.04 * Math.cos(z * 0.27);
      const h = Math.max(0, Math.floor(Math.pow(1 - d, 1.4) * peak * (1 + ridge)));
      const k = `${x},${z}`;
      if (h > (hmap.get(k) || 0)) hmap.set(k, h);
    }
  }
}

function buildClouds(vol) {
  const rand = mulberry32(99);
  const seeds = [
    [-20, 30, -10], [18, 32, 8], [40, 29, -30], [-36, 31, 24],
    [8, 34, 36], [-8, 28, -40], [55, 33, 12], [-50, 30, -8],
  ];
  for (const [cx, cy, cz] of seeds) {
    const n = 6 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i++) {
      vol.set(cx + Math.floor(rand() * 5) - 2, cy + (rand() < 0.25 ? 1 : 0), cz + Math.floor(rand() * 4) - 1, C.cloud);
    }
  }
}

// Outside-the-fine-area grass ring (coarse), so the fine ground has a horizon.
function buildOuterGround(vol) {
  for (let x = -100; x < 100; x++) {
    for (let z = -100; z < 100; z++) {
      if (x >= -70 && x < 70 && z >= -70 && z < 70) continue;
      vol.set(x, 0, z, hash3(x >> 3, 0, z >> 3) % 3 === 0 ? C.grass2 : C.grass);
    }
  }
}

// Solid, never-visible interiors: removes all inward-facing faces of the hollow
// shells (inner wall sides, backs of window panes) from the mesh.
function buildInteriors(vol) {
  const INTERIOR = 0x2b2724;
  const boxes = [
    [-29.5, 2, -11.5, 39.5, 13.75, 1.5], // 본관
    [-37, 2, -11.5, -30, 17.75, 1.5], // 본관 west block (rounded corners kept clear)
    [-5.5, 6, -43.5, 7.5, 21.75, -12.5], // 신관 front (ground floor left open)
    [-7.5, 2, -45.5, -2.5, 25.75, -38.5], // stair tower
    [36.5, 2, -35.5, 95.5, 21.75, -20.5], // 신관 east block
    [-1.5, 2, -61.5, 11.5, 13.75, -44.5], // annex
    [4.5, 2, -83.5, 37.5, 17.75, -62.5], // 백운관
    [80.5, 2, -79.5, 93.5, 17.75, -44.5], // dorm
    [56.5, 2, 24.5, 69.5, 13.75, 47.5], // east1
    [80.5, 2, 32.5, 95.5, 13.75, 53.5], // east2
    [112.5, 2, -119.5, 135.5, 17.75, -100.5], // library
  ];
  for (const [x0, y0, z0, x1, y1, z1] of boxes) {
    vol.fillEmpty(cellOf(x0), cellOf(y0), cellOf(z0), cellOf(x1), cellOf(y1), cellOf(z1), INTERIOR);
  }
}

// ============================================================ entry point
export function buildDetail(ctx) {
  const { fine, ground, coarse, aabb, avoidRect, isAvoid } = ctx;
  paintGround(ground, fine);
  buildMain(fine, aabb, avoidRect);
  buildLink(fine, aabb, avoidRect);
  buildNew(fine, aabb, avoidRect);
  buildAnnex(fine, aabb, avoidRect);
  buildGym(fine, aabb, avoidRect);
  buildDorm(fine, aabb, avoidRect);
  buildSmall(fine, aabb, avoidRect, {
    x0: 56, z0: 24, x1: 70, z1: 48, floors: 3, top: 14, collideTop: 15.5,
    wall: C.brick, wallAlt: C.brickAlt, mortar: C.mortar, roof: 'flat',
    roofCol: C.greenRoof, parapet: C.brickDeep, seed: 71,
  });
  buildSmall(fine, aabb, avoidRect, {
    x0: 80, z0: 32, x1: 96, z1: 54, floors: 3, top: 14, collideTop: 18,
    wall: C.brick, wallAlt: C.brickAlt, mortar: C.mortar, roof: 'hip', seed: 72,
  });
  buildSmall(fine, aabb, avoidRect, {
    x0: 112, z0: -120, x1: 136, z1: -100, floors: 4, top: 18, collideTop: 20,
    wall: C.dormRoof, wallAlt: 0xaeb2b4, mortar: C.dormAlt, roof: 'flat',
    roofCol: C.pave, parapet: C.dormAlt, seed: 73, outside: true,
  });
  buildFence(fine, aabb);
  buildGate(fine, aabb);
  buildProps(fine, aabb, avoidRect);
  buildInteriors(fine);
  buildTrees(ctx.trees, isAvoid);
  buildOuterGround(coarse);
  buildMountain(coarse, ctx.mtn);
  buildClouds(coarse);
}
