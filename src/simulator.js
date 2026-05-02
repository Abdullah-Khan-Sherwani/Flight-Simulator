// ── Shaders ──────────────────────────────────────────────────────────────────
const VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aFlatColor;
uniform mat4 uView;
uniform mat4 uProjection;
out vec3 vFragPos;
out vec3 vNormal;
out vec3 vFlatColor;
out vec3 vColor;

vec3 terrainColor(float y) {
    if (y <= 0.0) return vec3(0.20, 0.58, 0.10);
    if (y <  0.7) return mix(vec3(0.20,0.58,0.10), vec3(0.20,0.58,0.10), y/0.7);
    if (y <  1.4) return mix(vec3(0.20,0.58,0.10), vec3(0.48,0.30,0.09), (y-0.7)/0.7);
    if (y <  1.8) return mix(vec3(0.48,0.30,0.09), vec3(0.74,0.68,0.65), (y-1.4)/0.4);
    return mix(vec3(0.74,0.68,0.65), vec3(1.0,1.0,1.0), clamp((y-1.8)/0.2, 0.0, 1.0));
}

void main() {
    gl_PointSize = 5.0;
    vFragPos   = aPos;
    vNormal    = aNormal;
    vColor     = terrainColor(aPos.y);
    vFlatColor = aFlatColor;
    gl_Position = uProjection * uView * vec4(aPos, 1.0);
}`;

const FS = `#version 300 es
precision mediump float;
in vec3 vFragPos;
in vec3 vNormal;
in vec3 vFlatColor;
in vec3 vColor;
uniform int  uShadeMode;
uniform vec3 uLightPos;
uniform vec3 uViewPos;
uniform bool uIsWater;
out vec4 FragColor;

void main() {
    if (uIsWater) { FragColor = vec4(0.04, 0.28, 0.70, 1.0); return; }
    vec3 L = normalize(uLightPos - vFragPos);

    if (uShadeMode == 0) {
        // Flat: use derivative-reconstructed face normal + pre-averaged vertex color
        vec3 norm = normalize(cross(dFdx(vFragPos), dFdy(vFragPos)));
        float d   = max(dot(norm, L), 0.0);
        FragColor = vec4(vFlatColor * (0.12 + 0.88*d), 1.0);
    } else if (uShadeMode == 1) {
        // Smooth: interpolated per-vertex normal, diffuse only
        vec3 norm = normalize(vNormal);
        float d   = max(dot(norm, L), 0.0);
        FragColor = vec4(vColor * (0.12 + 0.88*d), 1.0);
    } else {
        // Phong: ambient + diffuse + fill + specular
        vec3 norm    = normalize(vNormal);
        vec3 V       = normalize(uViewPos - vFragPos);
        vec3 R       = reflect(-L, norm);
        float diff   = max(dot(norm, L), 0.0);
        float fill   = max(dot(norm, -L), 0.0) * 0.10;
        float spec   = pow(max(dot(V, R), 0.0), 48.0);
        FragColor    = vec4(vColor*(0.08 + 0.82*diff + fill) + vec3(0.18)*spec, 1.0);
    }
}`;

// ── Constants ─────────────────────────────────────────────────────────────────
const PATCH = 40;                          // world units per patch side
const N     = 32;                          // grid divisions per patch
const GRID  = 2;                           // camera surrounded by (2*GRID+1)^2 patches
const POOL  = (GRID*2+1) * (GRID*2+1);    // 25 pre-allocated VAO slots

// ── State ─────────────────────────────────────────────────────────────────────
let canvas, gl, shader, cam, waterVao, hud;
let patchPool, patchMap;
let lastCx = null, lastCz = null;
let renderMode = 2;   // 0=points  1=wireframe  2=faces
let shadeMode  = 0;   // 0=flat    1=smooth     2=Phong
let frustum = { left:-1, right:1, bottom:-0.5625, top:0.5625, near:1, far:300 };
const STEP = 0.1;
const keys = new Set();

// ── Height field ──────────────────────────────────────────────────────────────

// Deterministic pseudo-random perturbation keyed to grid position
function hashNoise(x, z) {
    const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    return (s - Math.floor(s)) * 2.0 - 1.0;
}

// Macro terrain: overlapping sine ridges produce mountains and flat plains
function heightAt(wx, wz) {
    const macro = Math.sin(wx * 0.18) * Math.cos(wz * 0.15) * 1.4
                + Math.sin(wx * 0.13 + wz * 0.09) * 0.8
                + Math.cos(wx * 0.08 - wz * 0.11) * 0.5;
    // Random perturbation: deterministic hash for smooth-normal consistency
    const perturb = hashNoise(Math.round(wx * 5), Math.round(wz * 5)) * 0.35;
    return Math.max(-2, Math.min(2, macro + perturb));
}

// ── Terrain color (JS mirror of GLSL terrainColor) ────────────────────────────
function terrainColorJS(y) {
    const mix = (a, b, t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
    if (y <= 0.7) return [0.20, 0.58, 0.10];
    if (y <  1.4) return mix([0.20,0.58,0.10], [0.48,0.30,0.09], (y-0.7)/0.7);
    if (y <  1.8) return mix([0.48,0.30,0.09], [0.74,0.68,0.65], (y-1.4)/0.4);
    return mix([0.74,0.68,0.65], [1.0,1.0,1.0], Math.min((y-1.8)/0.2, 1.0));
}

// ── Patch generation ──────────────────────────────────────────────────────────
function get_patch(xmin, xmax, zmin, zmax) {
    const G    = N + 1;
    const stepX = (xmax - xmin) / N;
    const stepZ = (zmax - zmin) / N;

    // Step 1 — sample height field with random perturbation per vertex
    const H = new Float32Array(G * G);
    for (let iz = 0; iz < G; iz++)
        for (let ix = 0; ix < G; ix++) {
            const wx = xmin + ix * stepX, wz = zmin + iz * stepZ;
            H[iz*G+ix] = heightAt(wx, wz) + (Math.random() * 2 - 1) * 0.08;
        }

    // Step 2 — finite-difference normals from the stored height grid
    //   gradient: dh/dx ≈ (H[right]-H[left]) / (2*stepX), same for z
    //   surface normal ∝ (-dh/dx, 1, -dh/dz)
    const smoothNorm = (ix, iz) => {
        const l = H[iz*G + Math.max(0, ix-1)];
        const r = H[iz*G + Math.min(N, ix+1)];
        const d = H[Math.max(0, iz-1)*G + ix];
        const u = H[Math.min(N, iz+1)*G + ix];
        const sx = (ix > 0 && ix < N) ? 2*stepX : stepX;
        const sz = (iz > 0 && iz < N) ? 2*stepZ : stepZ;
        const nx = -(r-l)/sx, ny = 1.0, nz = -(u-d)/sz;
        const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
        return [nx/len, ny/len, nz/len];
    };

    // Step 3 — pack vertex buffer: pos(3) + smoothNormal(3) + flatColor(3), stride=36
    const vertices   = new Float32Array(G * G * 9);
    const triIndices  = new Uint16Array(N * N * 6);
    const lineIndices = new Uint16Array(N * N * 6 * 2);

    for (let iz = 0; iz < G; iz++) {
        for (let ix = 0; ix < G; ix++) {
            const i  = iz*G + ix;
            const h  = H[i];
            const [nx, ny, nz] = smoothNorm(ix, iz);
            vertices[i*9+0] = xmin + ix*stepX;
            vertices[i*9+1] = h;
            vertices[i*9+2] = zmin + iz*stepZ;
            vertices[i*9+3] = nx; vertices[i*9+4] = ny; vertices[i*9+5] = nz;
            // flatColor (slots 6,7,8) filled in triangle pass below
        }
    }

    // Step 4 — triangle indices + flat color (average of 3 vertex colors per triangle)
    let ti = 0;
    for (let iz = 0; iz < N; iz++) {
        for (let ix = 0; ix < N; ix++) {
            const A = iz*G+ix, B = A+1, C = A+G, D = C+1;
            const tris = [[A,C,B],[B,C,D]];
            for (const [a,b,c] of tris) {
                triIndices[ti++]=a; triIndices[ti++]=b; triIndices[ti++]=c;
                const avgY = (vertices[a*9+1] + vertices[b*9+1] + vertices[c*9+1]) / 3;
                const [r,g,bl] = terrainColorJS(avgY);
                for (const vi of [a,b,c]) {
                    vertices[vi*9+6]=r; vertices[vi*9+7]=g; vertices[vi*9+8]=bl;
                }
            }
        }
    }

    // Step 5 — wireframe edge indices (3 edges per triangle)
    let li = 0;
    for (let i = 0; i < triIndices.length; i += 3) {
        const a=triIndices[i], b=triIndices[i+1], c=triIndices[i+2];
        lineIndices[li++]=a; lineIndices[li++]=b;
        lineIndices[li++]=b; lineIndices[li++]=c;
        lineIndices[li++]=c; lineIndices[li++]=a;
    }

    return { vertices, triIndices, lineIndices,
             triCount: triIndices.length, lineCount: lineIndices.length };
}

// ── GPU buffer management ─────────────────────────────────────────────────────

// Rewrite an existing pool slot with new patch data (no new allocations)
function uploadPatch(slotIdx, data, cx, cz) {
    const slot = patchPool[slotIdx];
    gl.bindVertexArray(slot.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, slot.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, slot.eboTri);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.triIndices, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    // eboLine lives outside the VAO so swapping it at draw time is valid
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, slot.eboLine);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.lineIndices, gl.DYNAMIC_DRAW);
    slot.triCount  = data.triCount;
    slot.lineCount = data.lineCount;
    slot.cx = cx; slot.cz = cz;
    patchMap.set(`${cx},${cz}`, slotIdx);
}

// Keep a 5×5 grid of patches centred on the camera cell.
// When the camera crosses a cell boundary, evict the farthest slot.
function updatePatches() {
    const cx = Math.floor(cam.Position[0] / PATCH);
    const cz = Math.floor(cam.Position[2] / PATCH);
    if (cx === lastCx && cz === lastCz) return;

    const needed = new Set();
    for (let dx = -GRID; dx <= GRID; dx++)
        for (let dz = -GRID; dz <= GRID; dz++)
            needed.add(`${cx+dx},${cz+dz}`);

    for (let dx = -GRID; dx <= GRID; dx++) {
        for (let dz = -GRID; dz <= GRID; dz++) {
            const key = `${cx+dx},${cz+dz}`;
            if (patchMap.has(key)) continue;

            // Evict the slot farthest (Manhattan) from the new camera cell
            let evict = -1, maxD = -1;
            for (let i = 0; i < POOL; i++) {
                const s = patchPool[i];
                if (needed.has(`${s.cx},${s.cz}`)) continue;
                const d = Math.abs(s.cx-cx) + Math.abs(s.cz-cz);
                if (d > maxD) { maxD = d; evict = i; }
            }
            if (evict === -1) continue;

            patchMap.delete(`${patchPool[evict].cx},${patchPool[evict].cz}`);
            const pcx = cx+dx, pcz = cz+dz;
            uploadPatch(evict,
                get_patch(pcx*PATCH, (pcx+1)*PATCH, pcz*PATCH, (pcz+1)*PATCH),
                pcx, pcz);
        }
    }

    lastCx = cx; lastCz = cz;
}

// ── Initialisation ────────────────────────────────────────────────────────────
function initGL() {
    canvas = document.getElementById('gl-canvas');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    gl = canvas.getContext('webgl2');
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.52, 0.78, 0.92, 1.0);

    shader = new Shader(gl, VS, FS);

    // Pre-allocate POOL VAO/VBO/EBO slots — buffers are rewritten, never recreated
    patchPool = [];
    for (let i = 0; i < POOL; i++) {
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, 1, gl.DYNAMIC_DRAW);
        // stride = 36 bytes (9 floats × 4)
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
        const eboTri  = gl.createBuffer();
        const eboLine = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eboTri);  // VAO owns eboTri
        gl.bindVertexArray(null);
        patchPool.push({ vao, vbo, eboTri, eboLine, triCount:0, lineCount:0, cx:null, cz:null });
    }

    // Camera starts at y=3, facing -Z
    cam = new FlightCamera({ position: glMatrix.vec3.fromValues(0, 3, 0), yaw:-90, pitch:0 });

    // Load initial 5×5 grid
    patchMap = new Map();
    let slot = 0;
    for (let dx = -GRID; dx <= GRID; dx++)
        for (let dz = -GRID; dz <= GRID; dz++)
            uploadPatch(slot++,
                get_patch(dx*PATCH, (dx+1)*PATCH, dz*PATCH, (dz+1)*PATCH), dx, dz);

    // Water: single large quad at y=0 — only surface visible, colored blue via uIsWater
    const wv = new Float32Array([
        -5000,0,-5000, 0,1,0,   5000,0,-5000, 0,1,0,
        -5000,0, 5000, 0,1,0,   5000,0, 5000, 0,1,0
    ]);
    waterVao = gl.createVertexArray();
    gl.bindVertexArray(waterVao);
    const wvbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, wvbo);
    gl.bufferData(gl.ARRAY_BUFFER, wv, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    const webo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, webo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0,2,1, 1,2,3]), gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    // Static uniforms
    shader.use();
    shader.setVec3('uLightPos', 200, 400, 150);
    shader.setInt('uShadeMode', shadeMode);
    shader.setBool('uIsWater', false);

    // HUD overlay
    hud = document.createElement('div');
    hud.style.cssText =
        'position:fixed;top:10px;left:10px;color:#fff;font:13px/1.6 monospace;' +
        'text-shadow:1px 1px 3px #000;pointer-events:none;white-space:pre;';
    document.body.appendChild(hud);
}

// ── Input ─────────────────────────────────────────────────────────────────────
const MODE_NAMES  = ['points','wireframe','faces'];
const SHADE_NAMES = ['flat','smooth','Phong'];

document.addEventListener('keydown', e => {
    keys.add(e.key);
    const prev = { ...frustum };

    switch (e.key) {
        case 'v': case 'V':
            renderMode = (renderMode + 1) % 3; break;
        case 'c': case 'C':
            shadeMode = (shadeMode + 1) % 3;
            shader.use(); shader.setInt('uShadeMode', shadeMode); break;
        case 'Escape':
            document.body.innerHTML = ''; break;
        // Frustum adjustments — invalid changes have no effect (validated below)
        case '1': frustum.left   -= STEP; break;
        case '!': frustum.left   += STEP; break;
        case '2': frustum.right  += STEP; break;
        case '@': frustum.right  -= STEP; break;
        case '3': frustum.top    += STEP; break;
        case '#': frustum.top    -= STEP; break;
        case '4': frustum.bottom -= STEP; break;
        case '$': frustum.bottom += STEP; break;
        case '5': frustum.near   += STEP; break;
        case '%': frustum.near   -= STEP; break;
        case '6': frustum.far = Math.min(frustum.far + 20, 600); break;
        case '^': frustum.far -= 20; break;
    }

    // Reject any change that would produce an invalid frustum
    if (frustum.left  >= frustum.right  ||
        frustum.bottom >= frustum.top   ||
        frustum.near   <= 0.01          ||
        frustum.far    <= frustum.near + 1)
        Object.assign(frustum, prev);
});
document.addEventListener('keyup',  e => keys.delete(e.key));
window.addEventListener('blur', () => keys.clear());

function processInput(dt) {
    const ROT   = 45 * dt;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    if (keys.has('w') || keys.has('W')) cam.Pitch = clamp(cam.Pitch + ROT, -89, 89);
    if (keys.has('s') || keys.has('S')) cam.Pitch = clamp(cam.Pitch - ROT, -89, 89);
    if (keys.has('a') || keys.has('A')) cam.Yaw   = clamp(cam.Yaw - ROT, cam.InitYaw-89, cam.InitYaw+89);
    if (keys.has('d') || keys.has('D')) cam.Yaw   = clamp(cam.Yaw + ROT, cam.InitYaw-89, cam.InitYaw+89);
    if (keys.has('q') || keys.has('Q')) cam.Roll  = clamp(cam.Roll + ROT, -89, 89);
    if (keys.has('e') || keys.has('E')) cam.Roll  = clamp(cam.Roll - ROT, -89, 89);
    if (keys.has('ArrowUp'))   cam.Speed = clamp(cam.Speed + 3*dt, 0, cam.MaxSpeed);
    if (keys.has('ArrowDown')) cam.Speed = clamp(cam.Speed - 3*dt, 0, cam.MaxSpeed);

    cam.updateCameraVectors();
    cam.update(dt);
}

function updateHUD() {
    hud.textContent =
        `view: ${MODE_NAMES[renderMode]}   shade: ${SHADE_NAMES[shadeMode]}\n` +
        `speed: ${cam.Speed.toFixed(1)} / ${cam.MaxSpeed}   alt: ${cam.Position[1].toFixed(2)}\n` +
        `pitch: ${cam.Pitch.toFixed(0)}°  yaw: ${cam.Yaw.toFixed(0)}°  roll: ${cam.Roll.toFixed(0)}°\n` +
        `L/R: ${frustum.left.toFixed(2)} / ${frustum.right.toFixed(2)}\n` +
        `B/T: ${frustum.bottom.toFixed(2)} / ${frustum.top.toFixed(2)}\n` +
        `near: ${frustum.near.toFixed(2)}   far: ${frustum.far.toFixed(0)}`;
}

// ── Render loop ───────────────────────────────────────────────────────────────
let lastTime = 0;
function render(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.1);
    lastTime = ts;

    processInput(dt);
    updatePatches();

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    shader.use();
    shader.setMat4('uView', cam.getViewMatrix());

    const proj = glMatrix.mat4.create();
    glMatrix.mat4.frustum(proj,
        frustum.left, frustum.right,
        frustum.bottom, frustum.top,
        frustum.near, frustum.far);
    shader.setMat4('uProjection', proj);
    shader.setVec3('uViewPos', cam.Position[0], cam.Position[1], cam.Position[2]);

    // Draw terrain first so water covers submerged vertices via depth test
    for (const slot of patchPool) {
        if (slot.cx === null) continue;
        gl.bindVertexArray(slot.vao);
        if (renderMode === 0) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, slot.eboTri);
            gl.drawElements(gl.POINTS, slot.triCount, gl.UNSIGNED_SHORT, 0);
        } else if (renderMode === 1) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, slot.eboLine);
            gl.drawElements(gl.LINES, slot.lineCount, gl.UNSIGNED_SHORT, 0);
        } else {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, slot.eboTri);
            gl.drawElements(gl.TRIANGLES, slot.triCount, gl.UNSIGNED_SHORT, 0);
        }
    }

    // Draw water last so it covers submerged terrain
    shader.setBool('uIsWater', true);
    gl.bindVertexArray(waterVao);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    shader.setBool('uIsWater', false);

    updateHUD();
    requestAnimationFrame(render);
}

initGL();
requestAnimationFrame(render);
