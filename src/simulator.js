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
    if (y <= 0.0) return vec3(0.22, 0.60, 0.12);
    if (y <  0.6) return mix(vec3(0.22,0.60,0.12), vec3(0.22,0.60,0.12), y/0.6);
    if (y <  1.3) return mix(vec3(0.22,0.60,0.12), vec3(0.50,0.32,0.10), (y-0.6)/0.7);
    if (y <  1.8) return mix(vec3(0.50,0.32,0.10), vec3(0.75,0.70,0.68), (y-1.3)/0.5);
    return mix(vec3(0.75,0.70,0.68), vec3(1.0,1.0,1.0), clamp((y-1.8)/0.2,0.0,1.0));
}

void main() {
    gl_PointSize = 4.0;
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
    if (uIsWater) { FragColor = vec4(0.08, 0.38, 0.72, 1.0); return; }
    if (uShadeMode == 0) {
        vec3 dx   = dFdx(vFragPos);
        vec3 dy   = dFdy(vFragPos);
        vec3 norm = normalize(cross(dx, dy));
        float diff = max(dot(norm, normalize(uLightPos - vFragPos)), 0.0);
        FragColor  = vec4(vFlatColor * (0.08 + 0.92*diff), 1.0);
    } else if (uShadeMode == 1) {
        vec3 norm  = normalize(vNormal);
        float diff = max(dot(norm, normalize(uLightPos - vFragPos)), 0.0);
        FragColor  = vec4(vColor * (0.08 + 0.92*diff), 1.0);
    } else {
        vec3 norm     = normalize(vNormal);
        vec3 lightDir = normalize(uLightPos - vFragPos);
        vec3 viewDir  = normalize(uViewPos  - vFragPos);
        vec3 reflDir  = reflect(-lightDir, norm);
        float diff    = max(dot(norm, lightDir), 0.0);
        float fill    = max(dot(norm, -lightDir), 0.0) * 0.12;
        float spec    = pow(max(dot(viewDir, reflDir), 0.0), 64.0);
        FragColor     = vec4(vColor*(0.08 + 0.85*diff + fill) + vec3(0.15)*spec, 1.0);
    }
}`;

// Terrain configuration
const PATCH = 40;   // world units per patch
const N     = 32;   // grid divisions per patch
const GRID  = 2;    // ±GRID cells around camera (5x5 = 25 slots)
const POOL  = (GRID*2+1) * (GRID*2+1);  // 25

let canvas, gl, shader, cam, waterVao;
let patchPool, patchMap;
let lastCx = 0, lastCz = 0;
let renderMode = 2;
let shadeMode  = 0;
let frustum = { left:-1, right:1, bottom:-0.5625, top:0.5625, near:1, far:300 };
const STEP = 0.1;
const keys = new Set();

function hashNoise(x, z) {
    const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
}

// Large-scale height at world position (x,z) — sine ridges give mountains + plains
function baseHeight(wx, wz) {
    return  Math.sin(wx * 0.18) * Math.cos(wz * 0.15) * 1.4
          + Math.sin(wx * 0.13 + wz * 0.09) * 0.8
          + Math.cos(wx * 0.08 - wz * 0.11) * 0.5;
}

// JS mirror of the GLSL terrainColor — used to compute per-triangle average flat color
function terrainColorJS(y) {
    const mix = (a, b, t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
    if (y <= 0.6) return [0.22, 0.60, 0.12];
    if (y <  1.3) return mix([0.22,0.60,0.12], [0.50,0.32,0.10], (y-0.6)/0.7);
    if (y <  1.8) return mix([0.50,0.32,0.10], [0.75,0.70,0.68], (y-1.3)/0.5);
    return mix([0.75,0.70,0.68], [1.0,1.0,1.0], Math.min((y-1.8)/0.2, 1.0));
}

function get_patch(xmin, xmax, zmin, zmax) {
    const verts = (N+1)*(N+1);
    const vertices   = new Float32Array(verts * 9);  // pos(3) + normal(3) + flatColor(3)
    const triIndices  = new Uint16Array(N*N*6);
    const lineIndices = new Uint16Array(N*N*2*3*2);

    for (let iz = 0; iz <= N; iz++) {
        for (let ix = 0; ix <= N; ix++) {
            const idx = (iz*(N+1)+ix)*9;
            const wx  = xmin + (xmax-xmin)*(ix/N);
            const wz  = zmin + (zmax-zmin)*(iz/N);
            const h   = baseHeight(wx, wz) + hashNoise(Math.round(wx*5), Math.round(wz*5)) * 0.4;
            vertices[idx+0] = wx;
            vertices[idx+1] = Math.max(-2, Math.min(2, h));
            vertices[idx+2] = wz;
            vertices[idx+3] = 0; vertices[idx+4] = 1; vertices[idx+5] = 0;
            // flatColor slots (6,7,8) filled after triangles are built
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
        const ai=triIndices[i]*9, bi=triIndices[i+1]*9, ci=triIndices[i+2]*9;
        const ax=vertices[ai],ay=vertices[ai+1],az=vertices[ai+2];
        const bx=vertices[bi],by=vertices[bi+1],bz=vertices[bi+2];
        const cx=vertices[ci],cy=vertices[ci+1],cz=vertices[ci+2];
        const ex=bx-ax,ey=by-ay,ez=bz-az, fx=cx-ax,fy=cy-ay,fz=cz-az;
        const nx=ey*fz-ez*fy, ny=ez*fx-ex*fz, nz=ex*fy-ey*fx;
        for (const vi of [triIndices[i],triIndices[i+1],triIndices[i+2]]) {
            normals[vi*3+0]+=nx; normals[vi*3+1]+=ny; normals[vi*3+2]+=nz;
        }
        // Average color of 3 vertices — spec requirement for flat shading
        const avgY = (ay + by + cy) / 3;
        const [r,g,b] = terrainColorJS(avgY);
        for (const vi of [triIndices[i],triIndices[i+1],triIndices[i+2]]) {
            vertices[vi*9+6]=r; vertices[vi*9+7]=g; vertices[vi*9+8]=b;
        }
    }
    for (let v = 0; v < verts; v++) {
        const nx=normals[v*3],ny=normals[v*3+1],nz=normals[v*3+2];
        const len=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
        vertices[v*9+3]=nx/len; vertices[v*9+4]=ny/len; vertices[v*9+5]=nz/len;
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

function uploadPatch(slotIdx, patchData, cx, cz) {
    const slot = patchPool[slotIdx];
    gl.bindVertexArray(slot.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, slot.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, patchData.vertices, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, slot.eboTri);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, patchData.triIndices, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, slot.eboLine);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, patchData.lineIndices, gl.DYNAMIC_DRAW);
    slot.triCount  = patchData.triCount;
    slot.lineCount = patchData.lineCount;
    slot.cx = cx; slot.cz = cz;
    patchMap.set(`${cx},${cz}`, slotIdx);
}

function updatePatches() {
    const cx = Math.floor(cam.Position[0] / PATCH);
    const cz = Math.floor(cam.Position[2] / PATCH);
    if (cx === lastCx && cz === lastCz) return;

    const neededKeys = new Set();
    for (let dx = -GRID; dx <= GRID; dx++)
        for (let dz = -GRID; dz <= GRID; dz++)
            neededKeys.add(`${cx+dx},${cz+dz}`);

    for (let dx = -GRID; dx <= GRID; dx++) {
        for (let dz = -GRID; dz <= GRID; dz++) {
            const key = `${cx+dx},${cz+dz}`;
            if (!patchMap.has(key)) {
                let slotIdx = -1, maxDist = -1;
                for (let i = 0; i < patchPool.length; i++) {
                    const s = patchPool[i];
                    if (neededKeys.has(`${s.cx},${s.cz}`)) continue;
                    const dist = Math.abs(s.cx-cx)+Math.abs(s.cz-cz);
                    if (dist > maxDist) { maxDist = dist; slotIdx = i; }
                }
                if (slotIdx === -1) continue;
                patchMap.delete(`${patchPool[slotIdx].cx},${patchPool[slotIdx].cz}`);
                const pcx = cx+dx, pcz = cz+dz;
                uploadPatch(slotIdx, get_patch(pcx*PATCH,(pcx+1)*PATCH,pcz*PATCH,(pcz+1)*PATCH), pcx, pcz);
            }
        }
    }

    lastCx = cx; lastCz = cz;
}

function initGL() {
    canvas = document.getElementById('gl-canvas');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    gl = canvas.getContext('webgl2');
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.53, 0.81, 0.92, 1.0);

    shader = new Shader(gl, VS, FS);

    patchPool = [];
    for (let i = 0; i < POOL; i++) {
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, null, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
        const eboTri = gl.createBuffer(), eboLine = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eboTri);
        gl.bindVertexArray(null);
        patchPool.push({ vao, vbo, eboTri, eboLine, triCount:0, lineCount:0, cx:null, cz:null });
    }

    cam = new FlightCamera({ position: glMatrix.vec3.fromValues(0, 3, 0), yaw:-90, pitch:0 });

    patchMap = new Map();
    let slot = 0;
    for (let dx = -GRID; dx <= GRID; dx++)
        for (let dz = -GRID; dz <= GRID; dz++)
            uploadPatch(slot++, get_patch(dx*PATCH,(dx+1)*PATCH,dz*PATCH,(dz+1)*PATCH), dx, dz);

    // Water: large flat quad at y=0
    const wv = new Float32Array([-5000,0,-5000, 0,1,0,  5000,0,-5000, 0,1,0,
                                  -5000,0, 5000, 0,1,0,  5000,0, 5000, 0,1,0]);
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

    shader.use();
    shader.setVec3('uLightPos', 200, 400, 150);
    shader.setInt('uShadeMode', 0);
    shader.setBool('uIsWater', false);
}

document.addEventListener('keydown', e => {
    keys.add(e.key);
    const prev = {...frustum};
    switch(e.key) {
        case 'v': case 'V': renderMode = (renderMode+1)%3; break;
        case 'c': case 'C': shadeMode = (shadeMode+1)%3; shader.use(); shader.setInt('uShadeMode',shadeMode); break;
        case 'Escape': document.body.innerHTML=''; break;
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
        case '6': frustum.far    = Math.min(frustum.far + 20, 600); break;
        case '^': frustum.far    -= 20; break;
    }
    if (frustum.left>=frustum.right || frustum.bottom>=frustum.top || frustum.near<=0.01 || frustum.far<=frustum.near+1)
        Object.assign(frustum, prev);
});
document.addEventListener('keyup', e => keys.delete(e.key));

function processInput(dt) {
    const ROT = 45 * dt;
    const clamp = (v,lo,hi) => Math.max(lo, Math.min(hi, v));

    if (keys.has('w')||keys.has('W')) cam.Pitch = clamp(cam.Pitch+ROT, -89, 89);
    if (keys.has('s')||keys.has('S')) cam.Pitch = clamp(cam.Pitch-ROT, -89, 89);
    if (keys.has('a')||keys.has('A')) cam.Yaw   = clamp(cam.Yaw-ROT, cam.InitYaw-89, cam.InitYaw+89);
    if (keys.has('d')||keys.has('D')) cam.Yaw   = clamp(cam.Yaw+ROT, cam.InitYaw-89, cam.InitYaw+89);
    if (keys.has('q')||keys.has('Q')) cam.Roll  = clamp(cam.Roll+ROT, -89, 89);
    if (keys.has('e')||keys.has('E')) cam.Roll  = clamp(cam.Roll-ROT, -89, 89);
    if (keys.has('ArrowUp'))   cam.Speed = clamp(cam.Speed+3*dt, 0, cam.MaxSpeed);
    if (keys.has('ArrowDown')) cam.Speed = clamp(cam.Speed-3*dt, 0, cam.MaxSpeed);

    cam.updateCameraVectors();
    cam.update(dt);
}

let lastTime = 0;
function render(ts) {
    const dt = Math.min((ts - lastTime)/1000, 0.1);
    lastTime = ts;

    processInput(dt);
    updatePatches();

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    shader.use();
    shader.setMat4('uView', cam.getViewMatrix());
    const proj = glMatrix.mat4.create();
    glMatrix.mat4.frustum(proj, frustum.left, frustum.right, frustum.bottom, frustum.top, frustum.near, frustum.far);
    shader.setMat4('uProjection', proj);
    shader.setVec3('uViewPos', cam.Position[0], cam.Position[1], cam.Position[2]);

    shader.setBool('uIsWater', true);
    gl.bindVertexArray(waterVao);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    shader.setBool('uIsWater', false);

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

    requestAnimationFrame(render);
}

initGL();
requestAnimationFrame(render);
