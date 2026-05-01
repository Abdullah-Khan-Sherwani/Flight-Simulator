'use strict';

const assert = require('assert');

// ─── glMatrix mock (real math, not stubs) ────────────────────────────────────
global.glMatrix = {
    vec3: {
        fromValues: (x, y, z) => new Float32Array([x, y, z]),
        clone: v => new Float32Array(v),
        create: () => new Float32Array(3),
        copy: (out, a) => { out[0]=a[0]; out[1]=a[1]; out[2]=a[2]; return out; },
        add: (out, a, b) => { out[0]=a[0]+b[0]; out[1]=a[1]+b[1]; out[2]=a[2]+b[2]; return out; },
        cross: (out, a, b) => {
            out[0] = a[1]*b[2] - a[2]*b[1];
            out[1] = a[2]*b[0] - a[0]*b[2];
            out[2] = a[0]*b[1] - a[1]*b[0];
            return out;
        },
        normalize: (out, a) => {
            const len = Math.sqrt(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]) || 1;
            out[0]=a[0]/len; out[1]=a[1]/len; out[2]=a[2]/len;
            return out;
        },
        scale: (out, a, s) => { out[0]=a[0]*s; out[1]=a[1]*s; out[2]=a[2]*s; return out; },
        scaleAndAdd: (out, a, b, s) => {
            out[0]=a[0]+b[0]*s; out[1]=a[1]+b[1]*s; out[2]=a[2]+b[2]*s;
            return out;
        },
        dot: (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2],
        len: a => Math.sqrt(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]),
    },
    mat4: {
        create: () => new Float32Array(16),
        lookAt: (out, eye, center, up) => {
            out.fill(0); out[0]=1; out[5]=1; out[10]=1; out[15]=1;
            return out;
        },
    }
};

// ─── Inlined functions under test ─────────────────────────────────────────────

function get_patch(xmin, xmax, zmin, zmax) {
    const N = 24;
    const verts = (N+1)*(N+1);
    const vertices   = new Float32Array(verts * 6);
    const triIndices  = new Uint16Array(N*N*6);
    const lineIndices = new Uint16Array(N*N*2*3*2);

    for (let iz = 0; iz <= N; iz++) {
        for (let ix = 0; ix <= N; ix++) {
            const idx = (iz*(N+1)+ix)*6;
            vertices[idx+0] = xmin + (xmax-xmin)*(ix/N);
            vertices[idx+1] = (Math.random()*2-1)*2;
            vertices[idx+2] = zmin + (zmax-zmin)*(iz/N);
            vertices[idx+3] = 0; vertices[idx+4] = 1; vertices[idx+5] = 0;
        }
    }
    let ti = 0, li = 0;
    for (let iz = 0; iz < N; iz++) {
        for (let ix = 0; ix < N; ix++) {
            const A = iz*(N+1)+ix, B = A+1, C = A+(N+1), D = C+1;
            triIndices[ti++]=A; triIndices[ti++]=C; triIndices[ti++]=B;
            triIndices[ti++]=B; triIndices[ti++]=C; triIndices[ti++]=D;
        }
    }
    const normals = new Float32Array(verts*3);
    for (let i = 0; i < triIndices.length; i += 3) {
        const ai=triIndices[i]*6, bi=triIndices[i+1]*6, ci=triIndices[i+2]*6;
        const ax=vertices[ai],ay=vertices[ai+1],az=vertices[ai+2];
        const bx=vertices[bi],by=vertices[bi+1],bz=vertices[bi+2];
        const cx=vertices[ci],cy=vertices[ci+1],cz=vertices[ci+2];
        const ex=bx-ax,ey=by-ay,ez=bz-az;
        const fx=cx-ax,fy=cy-ay,fz=cz-az;
        const nx=ey*fz-ez*fy, ny=ez*fx-ex*fz, nz=ex*fy-ey*fx;
        for (const vi of [triIndices[i],triIndices[i+1],triIndices[i+2]]) {
            normals[vi*3+0]+=nx; normals[vi*3+1]+=ny; normals[vi*3+2]+=nz;
        }
    }
    for (let v = 0; v < verts; v++) {
        const nx=normals[v*3],ny=normals[v*3+1],nz=normals[v*3+2];
        const len=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
        vertices[v*6+3]=nx/len; vertices[v*6+4]=ny/len; vertices[v*6+5]=nz/len;
    }
    for (let i = 0; i < triIndices.length; i += 3) {
        const a=triIndices[i],b=triIndices[i+1],c=triIndices[i+2];
        lineIndices[li++]=a; lineIndices[li++]=b;
        lineIndices[li++]=b; lineIndices[li++]=c;
        lineIndices[li++]=c; lineIndices[li++]=a;
    }
    return { vertices, triIndices, lineIndices,
             triCount: triIndices.length, lineCount: lineIndices.length };
}

function terrainColor(y) {
    if (y < 0)
        return [0.1 + (0.0-0.1)*Math.min(-y/2,1), 0.3 + (0.2-0.3)*Math.min(-y/2,1), 0.8 + (0.6-0.8)*Math.min(-y/2,1)];
    else if (y < 0.5)
        return [0.20, 0.55, 0.10];
    else if (y < 1.5)
        return [0.20+(0.45-0.20)*(y-0.5), 0.55+(0.28-0.55)*(y-0.5), 0.10+(0.08-0.10)*(y-0.5)];
    else {
        const t = Math.min((y-1.5)/0.5, 1);
        return [0.45+(1-0.45)*t, 0.28+(1-0.28)*t, 0.08+(1-0.08)*t];
    }
}

class FlightCamera {
    static DEG_TO_RAD = Math.PI / 180;
    MovementSpeed = 2.5;
    MouseSensitivity = 0.05;
    ScrollSensitivity = 0.015;
    Zoom = 45;

    constructor({ position = glMatrix.vec3.fromValues(0, 0, 0), up = glMatrix.vec3.fromValues(0, 1, 0), yaw = -90, pitch = 0 } = {}) {
        this.Position  = glMatrix.vec3.clone(position);
        this.WorldUp   = glMatrix.vec3.clone(up);
        this.Yaw       = yaw;
        this.Pitch     = pitch;
        this.Roll      = 0;
        this.Speed     = 0;
        this.MaxSpeed  = 8;
        this.InitYaw   = yaw;
        this.Front = glMatrix.vec3.fromValues(0, 0, -1);
        this.Up    = glMatrix.vec3.create();
        this.Right = glMatrix.vec3.create();
        this.updateCameraVectors();
    }

    getViewMatrix() {
        const target = glMatrix.vec3.create();
        glMatrix.vec3.add(target, this.Position, this.Front);
        const view = glMatrix.mat4.create();
        glMatrix.mat4.lookAt(view, this.Position, target, this.Up);
        return view;
    }

    updateCameraVectors() {
        const yawR   = this.Yaw   * FlightCamera.DEG_TO_RAD;
        const pitchR = this.Pitch * FlightCamera.DEG_TO_RAD;

        const front = glMatrix.vec3.fromValues(
            Math.cos(yawR) * Math.cos(pitchR),
            Math.sin(pitchR),
            Math.sin(yawR) * Math.cos(pitchR)
        );
        glMatrix.vec3.normalize(this.Front, front);
        glMatrix.vec3.cross(this.Right, this.Front, this.WorldUp);
        glMatrix.vec3.normalize(this.Right, this.Right);
        glMatrix.vec3.cross(this.Up, this.Right, this.Front);
        glMatrix.vec3.normalize(this.Up, this.Up);

        const rollR = this.Roll * FlightCamera.DEG_TO_RAD;
        const cos = Math.cos(rollR);
        const sin = Math.sin(rollR);

        const newUp    = glMatrix.vec3.scaleAndAdd(glMatrix.vec3.create(), glMatrix.vec3.scale(glMatrix.vec3.create(), this.Up, cos),    this.Right, -sin);
        const newRight = glMatrix.vec3.scaleAndAdd(glMatrix.vec3.create(), glMatrix.vec3.scale(glMatrix.vec3.create(), this.Right, cos), this.Up,    sin);

        glMatrix.vec3.copy(this.Up,    newUp);
        glMatrix.vec3.copy(this.Right, newRight);
    }

    update(dt) {
        glMatrix.vec3.scaleAndAdd(this.Position, this.Position, this.Front, this.Speed * dt);
        this.Position[1] = Math.min(3.5, Math.max(2.5, this.Position[1]));
    }
}

function validateFrustum(frustum, prev) {
    if (frustum.left >= frustum.right || frustum.bottom >= frustum.top ||
        frustum.near <= 0.01 || frustum.far <= frustum.near + 1)
        Object.assign(frustum, prev);
}

function findFarthestSlot(patchPool, neededKeys, cx, cz) {
    let slotIdx = -1, maxDist = -1;
    for (let i = 0; i < patchPool.length; i++) {
        const s = patchPool[i];
        if (neededKeys.has(`${s.cx},${s.cz}`)) continue;
        const dist = Math.abs(s.cx - cx) + Math.abs(s.cz - cz);
        if (dist > maxDist) { maxDist = dist; slotIdx = i; }
    }
    return slotIdx;
}

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(label, fn) {
    try {
        fn();
        console.log(`  ${label} PASS`);
        passed++;
    } catch (e) {
        console.log(`  ${label} FAIL: ${e.message}`);
        failed++;
    }
}

function vecLen(v) {
    return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
}

function vecDot(a, b) {
    return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
}

// ─── TEST GROUP: get_patch geometry ──────────────────────────────────────────
console.log('\nTEST GROUP: get_patch geometry');
{
    const N = 24;
    const patch = get_patch(-10, 10, -10, 10);

    test('vertex array length = (N+1)*(N+1)*6 = 3750', () => {
        const expected = (N+1)*(N+1)*6;
        if (patch.vertices.length !== expected)
            throw new Error(`expected ${expected}, got ${patch.vertices.length}`);
    });

    test('triIndices length = N*N*6 = 3456', () => {
        const expected = N*N*6;
        if (patch.triIndices.length !== expected)
            throw new Error(`expected ${expected}, got ${patch.triIndices.length}`);
    });

    test('lineIndices length = N*N*2*3*2 = 6912', () => {
        const expected = N*N*2*3*2;
        if (patch.lineIndices.length !== expected)
            throw new Error(`expected ${expected}, got ${patch.lineIndices.length}`);
    });

    test('triCount === triIndices.length', () => {
        if (patch.triCount !== patch.triIndices.length)
            throw new Error(`triCount ${patch.triCount} !== triIndices.length ${patch.triIndices.length}`);
    });

    test('lineCount === lineIndices.length', () => {
        if (patch.lineCount !== patch.lineIndices.length)
            throw new Error(`lineCount ${patch.lineCount} !== lineIndices.length ${patch.lineIndices.length}`);
    });

    test('all y values strictly within (-2.0, 2.0)', () => {
        const verts = (N+1)*(N+1);
        for (let idx = 0; idx < verts; idx++) {
            const y = patch.vertices[idx*6 + 1];
            if (y <= -2.0 || y >= 2.0)
                throw new Error(`vertex ${idx} y=${y} out of range (-2.0, 2.0)`);
        }
    });

    test('all x values within [xmin, xmax]', () => {
        const verts = (N+1)*(N+1);
        for (let idx = 0; idx < verts; idx++) {
            const x = patch.vertices[idx*6 + 0];
            if (x < -10 - 1e-5 || x > 10 + 1e-5)
                throw new Error(`vertex ${idx} x=${x} out of range [-10, 10]`);
        }
    });

    test('all z values within [zmin, zmax]', () => {
        const verts = (N+1)*(N+1);
        for (let idx = 0; idx < verts; idx++) {
            const z = patch.vertices[idx*6 + 2];
            if (z < -10 - 1e-5 || z > 10 + 1e-5)
                throw new Error(`vertex ${idx} z=${z} out of range [-10, 10]`);
        }
    });
}

// ─── TEST GROUP: get_patch normals ────────────────────────────────────────────
console.log('\nTEST GROUP: get_patch normals');
{
    const N = 24;
    const patch = get_patch(-5, 5, -5, 5);

    test('all normals have length within [0.99, 1.01]', () => {
        const verts = (N+1)*(N+1);
        for (let v = 0; v < verts; v++) {
            const nx = patch.vertices[v*6+3];
            const ny = patch.vertices[v*6+4];
            const nz = patch.vertices[v*6+5];
            const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
            if (len < 0.99 || len > 1.01)
                throw new Error(`vertex ${v} normal length=${len} outside [0.99, 1.01]`);
        }
    });

    test('no NaN in vertex array', () => {
        for (let i = 0; i < patch.vertices.length; i++) {
            if (isNaN(patch.vertices[i]))
                throw new Error(`NaN found at index ${i}`);
        }
    });
}

// ─── TEST GROUP: terrainColor ─────────────────────────────────────────────────
console.log('\nTEST GROUP: terrainColor');
{
    test('terrainColor(-1): blue dominant (b > 0.5, b > r, b > g)', () => {
        const [r, g, b] = terrainColor(-1);
        if (b <= 0.5) throw new Error(`expected b > 0.5, got ${b}`);
        if (b <= r)   throw new Error(`expected b > r, got b=${b} r=${r}`);
        if (b <= g)   throw new Error(`expected b > g, got b=${b} g=${g}`);
    });

    test('terrainColor(0): green dominant (g > r, g > b)', () => {
        const [r, g, b] = terrainColor(0);
        if (g <= r) throw new Error(`expected g > r, got g=${g} r=${r}`);
        if (g <= b) throw new Error(`expected g > b, got g=${g} b=${b}`);
    });

    test('terrainColor(2): all components > 0.8 (near white)', () => {
        const [r, g, b] = terrainColor(2);
        if (r <= 0.8) throw new Error(`expected r > 0.8, got ${r}`);
        if (g <= 0.8) throw new Error(`expected g > 0.8, got ${g}`);
        if (b <= 0.8) throw new Error(`expected b > 0.8, got ${b}`);
    });

    test('terrainColor(-0.01): blue dominant', () => {
        const [r, g, b] = terrainColor(-0.01);
        if (b <= r) throw new Error(`expected b > r, got b=${b} r=${r}`);
        if (b <= g) throw new Error(`expected b > g, got b=${b} g=${g}`);
    });

    test('terrainColor(0.3): green (exactly [0.20, 0.55, 0.10])', () => {
        const [r, g, b] = terrainColor(0.3);
        const eps = 1e-6;
        if (Math.abs(r - 0.20) > eps) throw new Error(`expected r=0.20, got ${r}`);
        if (Math.abs(g - 0.55) > eps) throw new Error(`expected g=0.55, got ${g}`);
        if (Math.abs(b - 0.10) > eps) throw new Error(`expected b=0.10, got ${b}`);
    });
}

// ─── TEST GROUP: FlightCamera construction ────────────────────────────────────
console.log('\nTEST GROUP: FlightCamera construction');
{
    const cam = new FlightCamera();

    test('cam.Roll === 0', () => {
        if (cam.Roll !== 0) throw new Error(`expected Roll=0, got ${cam.Roll}`);
    });

    test('cam.Speed === 0', () => {
        if (cam.Speed !== 0) throw new Error(`expected Speed=0, got ${cam.Speed}`);
    });

    test('cam.MaxSpeed === 8', () => {
        if (cam.MaxSpeed !== 8) throw new Error(`expected MaxSpeed=8, got ${cam.MaxSpeed}`);
    });

    test('cam.InitYaw === -90 (default)', () => {
        if (cam.InitYaw !== -90) throw new Error(`expected InitYaw=-90, got ${cam.InitYaw}`);
    });

    test('cam.Front is populated (non-zero)', () => {
        const len = vecLen(cam.Front);
        if (len < 0.5) throw new Error(`Front vector near-zero, len=${len}`);
    });

    test('cam.Up is populated (non-zero)', () => {
        const len = vecLen(cam.Up);
        if (len < 0.5) throw new Error(`Up vector near-zero, len=${len}`);
    });

    test('cam.Right is populated (non-zero)', () => {
        const len = vecLen(cam.Right);
        if (len < 0.5) throw new Error(`Right vector near-zero, len=${len}`);
    });

    test('getViewMatrix() returns Float32Array of length 16', () => {
        const view = cam.getViewMatrix();
        if (!(view instanceof Float32Array))
            throw new Error(`expected Float32Array, got ${view.constructor.name}`);
        if (view.length !== 16)
            throw new Error(`expected length 16, got ${view.length}`);
    });
}

// ─── TEST GROUP: FlightCamera altitude clamp ──────────────────────────────────
console.log('\nTEST GROUP: FlightCamera altitude clamp');
{
    test('cam at y=10, update(0.01) with Speed=0 → Position[1] clamped to 3.5', () => {
        const cam = new FlightCamera({ position: glMatrix.vec3.fromValues(0, 10, 0) });
        cam.Speed = 0;
        cam.update(0.01);
        const y = cam.Position[1];
        if (Math.abs(y - 3.5) > 1e-5)
            throw new Error(`expected Position[1]=3.5, got ${y}`);
    });

    test('cam at y=0, update(0.01) with Speed=0 → Position[1] clamped to 2.5', () => {
        const cam = new FlightCamera({ position: glMatrix.vec3.fromValues(0, 0, 0) });
        cam.Speed = 0;
        cam.update(0.01);
        const y = cam.Position[1];
        if (Math.abs(y - 2.5) > 1e-5)
            throw new Error(`expected Position[1]=2.5, got ${y}`);
    });

    test('cam at y=3, update(0.01) with Speed=0 → Position[1] stays at 3', () => {
        const cam = new FlightCamera({ position: glMatrix.vec3.fromValues(0, 3, 0) });
        cam.Speed = 0;
        cam.update(0.01);
        const y = cam.Position[1];
        if (Math.abs(y - 3.0) > 1e-5)
            throw new Error(`expected Position[1]=3.0, got ${y}`);
    });
}

// ─── TEST GROUP: FlightCamera roll orthonormality ─────────────────────────────
console.log('\nTEST GROUP: FlightCamera roll orthonormality');
{
    const cam = new FlightCamera();
    cam.Roll = 45;
    cam.updateCameraVectors();

    const eps = 0.001;

    test('|Front| ≈ 1.0 (within 0.001)', () => {
        const len = vecLen(cam.Front);
        if (Math.abs(len - 1.0) > eps)
            throw new Error(`|Front|=${len}, expected ~1.0`);
    });

    test('|Up| ≈ 1.0 (within 0.001)', () => {
        const len = vecLen(cam.Up);
        if (Math.abs(len - 1.0) > eps)
            throw new Error(`|Up|=${len}, expected ~1.0`);
    });

    test('|Right| ≈ 1.0 (within 0.001)', () => {
        const len = vecLen(cam.Right);
        if (Math.abs(len - 1.0) > eps)
            throw new Error(`|Right|=${len}, expected ~1.0`);
    });

    test('dot(Front, Up) ≈ 0 (within 0.001)', () => {
        const d = vecDot(cam.Front, cam.Up);
        if (Math.abs(d) > eps)
            throw new Error(`dot(Front,Up)=${d}, expected ~0`);
    });

    test('dot(Front, Right) ≈ 0 (within 0.001)', () => {
        const d = vecDot(cam.Front, cam.Right);
        if (Math.abs(d) > eps)
            throw new Error(`dot(Front,Right)=${d}, expected ~0`);
    });
}

// ─── TEST GROUP: validateFrustum ─────────────────────────────────────────────
console.log('\nTEST GROUP: validateFrustum');
{
    test('valid frustum (left=1, right=2) → no revert', () => {
        const prev = { left: 0, right: 3, bottom: -1, top: 1, near: 0.1, far: 100 };
        const f    = { left: 1, right: 2, bottom: -1, top: 1, near: 0.1, far: 100 };
        validateFrustum(f, prev);
        if (f.left !== 1 || f.right !== 2)
            throw new Error(`frustum was incorrectly reverted: left=${f.left} right=${f.right}`);
    });

    test('invalid frustum (left=2, right=1) → revert to prev', () => {
        const prev = { left: 0, right: 3, bottom: -1, top: 1, near: 0.1, far: 100 };
        const f    = { left: 2, right: 1, bottom: -1, top: 1, near: 0.1, far: 100 };
        validateFrustum(f, prev);
        if (f.left !== 0 || f.right !== 3)
            throw new Error(`frustum was not reverted: left=${f.left} right=${f.right}`);
    });

    test('invalid frustum (bottom=top) → revert', () => {
        const prev = { left: -1, right: 1, bottom: -1, top: 1, near: 0.1, far: 100 };
        const f    = { left: -1, right: 1, bottom: 0,  top: 0, near: 0.1, far: 100 };
        validateFrustum(f, prev);
        if (f.bottom !== -1 || f.top !== 1)
            throw new Error(`frustum was not reverted: bottom=${f.bottom} top=${f.top}`);
    });

    test('invalid frustum (near=0.001 ≤ 0.01) → revert', () => {
        const prev = { left: -1, right: 1, bottom: -1, top: 1, near: 0.1,   far: 100 };
        const f    = { left: -1, right: 1, bottom: -1, top: 1, near: 0.001, far: 100 };
        validateFrustum(f, prev);
        if (f.near !== 0.1)
            throw new Error(`frustum was not reverted: near=${f.near}`);
    });

    test('invalid frustum (far=near+0.5 ≤ near+1) → revert', () => {
        const prev = { left: -1, right: 1, bottom: -1, top: 1, near: 0.1, far: 100 };
        const f    = { left: -1, right: 1, bottom: -1, top: 1, near: 0.1, far: 0.6 };
        validateFrustum(f, prev);
        if (f.far !== 100)
            throw new Error(`frustum was not reverted: far=${f.far}`);
    });

    test('valid frustum unchanged after validateFrustum', () => {
        const prev = { left: 0, right: 5, bottom: -2, top: 2, near: 0.5, far: 200 };
        const f    = { left: -1, right: 1, bottom: -1, top: 1, near: 0.5, far: 200 };
        validateFrustum(f, prev);
        if (f.left !== -1 || f.right !== 1 || f.near !== 0.5 || f.far !== 200)
            throw new Error(`valid frustum was incorrectly reverted`);
    });
}

// ─── TEST GROUP: findFarthestSlot eviction ────────────────────────────────────
console.log('\nTEST GROUP: findFarthestSlot eviction');
{
    // 3x3 grid of slots at positions (-1,-1) to (1,1)
    function makePool() {
        const pool = [];
        for (let cz = -1; cz <= 1; cz++)
            for (let cx = -1; cx <= 1; cx++)
                pool.push({ cx, cz });
        return pool;
    }

    test('farthest from (1,1) not in needed = slot at (-1,-1) (dist=4)', () => {
        const pool = makePool();
        // neededKeys = 3x3 around (1,1): x in [0..2], z in [0..2]
        // but our pool only has -1..1, so the overlap with pool is x in [0,1], z in [0,1]
        // needed keys that are present in pool: (0,0),(1,0),(0,1),(1,1)
        const neededKeys = new Set();
        for (let cz = 0; cz <= 2; cz++)
            for (let cx = 0; cx <= 2; cx++)
                neededKeys.add(`${cx},${cz}`);

        const idx = findFarthestSlot(pool, neededKeys, 1, 1);
        if (idx === -1)
            throw new Error(`expected a valid slot index, got -1`);
        const slot = pool[idx];
        const dist = Math.abs(slot.cx - 1) + Math.abs(slot.cz - 1);
        // slot at (-1,-1) has dist=4, which is maximum among non-needed slots
        if (dist !== 4)
            throw new Error(`expected dist=4 (slot at -1,-1), got dist=${dist} at (${slot.cx},${slot.cz})`);
        if (slot.cx !== -1 || slot.cz !== -1)
            throw new Error(`expected slot (-1,-1), got (${slot.cx},${slot.cz})`);
    });

    test('pool of 9, all needed → returns -1', () => {
        const pool = makePool();
        const neededKeys = new Set();
        for (let cz = -1; cz <= 1; cz++)
            for (let cx = -1; cx <= 1; cx++)
                neededKeys.add(`${cx},${cz}`);
        const idx = findFarthestSlot(pool, neededKeys, 0, 0);
        if (idx !== -1)
            throw new Error(`expected -1 when all slots are needed, got ${idx}`);
    });
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
process.exit(failed > 0 ? 1 : 0);
