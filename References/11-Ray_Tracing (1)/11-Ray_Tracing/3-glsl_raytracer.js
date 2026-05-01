"use strict";
const FLOAT_SIZE = Float32Array.BYTES_PER_ELEMENT;

// Main Application Class
class MainApp {
    constructor() {
        this.canvas = document.getElementById('glCanvas');
        this.gl = this.canvas.getContext('webgl2');
        
        if (!this.gl) {
            alert('WebGL2 not supported!');
            return;
        }
        
        this.initWebGL()
            .then(() => requestAnimationFrame((now) => this.render(now)))
            .catch(err => console.error('Initialization failed:', err));    
    }

    async initWebGL() {
        const gl = this.gl;
        
        try {
            const [vsResp, fsResp] = await Promise.all([
                fetch('3-vs.glsl'),
                fetch('3-fs.glsl'),
            ]);

            if (!vsResp.ok) throw new Error(`VS fetch failed: ${vsResp.status}`);
            if (!fsResp.ok) throw new Error(`FS fetch failed: ${fsResp.status}`);

            const [vsSource, fsSource] = await Promise.all([
                vsResp.text(), fsResp.text()
            ]);
            this.shader = new Shader(gl, vsSource, fsSource);
        } catch (err) {
            console.error('Failed to load shader file:', err.message);
            throw err;
        }        
        
        this.initRectangle();
        this.initUniforms();
                
        gl.clearColor(0.1, 0.1, 0.1, 1.0);
        gl.viewport(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    }

    // Full-screen quad: two triangles covering clip space [-1,1]x[-1,1]
    initRectangle() {        
        const gl = this.gl;

        // aPos is vec2 in the vertex shader
        const vertices = new Float32Array([
            // Triangle 1
            -1.0, -1.0,
             1.0, -1.0,
             1.0,  1.0,
            // Triangle 2
            -1.0, -1.0,
             1.0,  1.0,
            -1.0,  1.0
        ]);
        this.vertexCount = vertices.length / 2;  // 6 vertices, 2 floats each

        this.VAO = gl.createVertexArray();
        gl.bindVertexArray(this.VAO);

        const VBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const aPos = gl.getAttribLocation(this.shader.ID, "aPos");
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(aPos);

        gl.bindVertexArray(null);
    }

    initUniforms() {
        const gl = this.gl;
        this.shader.use();

        // --- Resolution and camera ---
        this.shader.setVec2('resolution',
            this.canvas.clientWidth,
            this.canvas.clientHeight
        );
        this.shader.setVec3('cameraPos', 0.0, 0.0, 0.0);

        // --- Spheres ---
        // Each sphere: center, radius, diffuse, specular, shininess, reflectivity
        // Matches the JS raytracer scene exactly.
        const spheres = [
            // 0 — Red diffuse sphere (centre)
            {
                center: [0, 0, -5], radius: 1,
                diffuse:  [1.0, 0.2,  0.2 ],
                specular: [0.5, 0.5,  0.5 ],
                shininess: 16, reflectivity: 0.0
            },
            // 1 — Blue mirror sphere (right)
            {
                center: [2, 0, -6], radius: 1,
                diffuse:  [0.2,  0.2,  0.8],
                specular: [1.0,  1.0,  1.0],
                shininess: 128, reflectivity: 0.7
            },
            // 2 — Bronze mirror sphere (left)
            {
                center: [-2, 0, -6], radius: 1,
                diffuse:  [0.8,  0.6,  0.3 ],
                specular: [1.0,  0.9,  0.7 ],
                shininess: 64, reflectivity: 0.5
            },
            // 3 — Ground plane (giant sphere)
            {
                center: [0, -1001, -5], radius: 1000,
                diffuse:  [0.8,  0.8,  0.8 ],
                specular: [0.2,  0.2,  0.2 ],
                shininess: 8, reflectivity: 0.1
            },
            // 4 — Back wall sphere
            {
                center: [0, 0, -20], radius: 10,
                diffuse:  [0.5,  0.5,  0.5 ],
                specular: [0.3,  0.3,  0.3 ],
                shininess: 32, reflectivity: 0.95
            },
        ];

        for (let i = 0; i < spheres.length; i++) {
            const s = spheres[i];
            const p = `spheres[${i}]`;
            this.shader.setVec3(`${p}.center`,     ...s.center);
            this.shader.setFloat(`${p}.radius`,    s.radius);
            this.shader.setVec3(`${p}.diffuse`,    ...s.diffuse);
            this.shader.setVec3(`${p}.specular`,   ...s.specular);
            this.shader.setFloat(`${p}.shininess`, s.shininess);
            this.shader.setFloat(`${p}.reflectivity`, s.reflectivity);
        }

        // --- Lights ---
        const lights = [
            // Key light — bright white, upper-right, gentle quadratic falloff
            {
                position: [5, 5, 0],
                diffuse:  [1.0, 1.0, 1.0],
                specular: [1.0, 1.0, 1.0],
                Kc: 1.0, Kl: 0.0, Kq: 0.01
            },
            // Fill light — cooler, dimmer, no falloff
            {
                position: [-5, 3, 2],
                diffuse:  [0.4,  0.4,  0.6],
                specular: [0.3,  0.3,  0.5],
                Kc: 1.0, Kl: 0.0, Kq: 0.0
            },
        ];

        for (let i = 0; i < lights.length; i++) {
            const l = lights[i];
            const p = `lights[${i}]`;
            this.shader.setVec3(`${p}.position`, ...l.position);
            this.shader.setVec3(`${p}.diffuse`,  ...l.diffuse);
            this.shader.setVec3(`${p}.specular`, ...l.specular);
            this.shader.setFloat(`${p}.Kc`, l.Kc);
            this.shader.setFloat(`${p}.Kl`, l.Kl);
            this.shader.setFloat(`${p}.Kq`, l.Kq);
        }

        this.shader.setVec3(`globalAmbient`, 0.05, 0.05, 0.05);

    }

    render(timestamp) {
        const gl = this.gl;
        
        gl.clear(gl.COLOR_BUFFER_BIT);

        this.shader.use();
        gl.bindVertexArray(this.VAO);
        gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
        gl.bindVertexArray(null);
        
        requestAnimationFrame((now) => this.render(now));
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new MainApp();
});

