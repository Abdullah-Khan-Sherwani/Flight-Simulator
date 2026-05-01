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

        this.cubePositions = [
            [ 0.0,  0.0,   0.0],
            [ 2.0,  5.0, -15.0],
            [-1.5, -2.2,  -2.5],
            [-3.8, -2.0, -12.3],
            [ 2.4, -0.4,  -3.5],
            [-1.7,  3.0,  -7.5],
            [ 1.3, -2.0,  -2.5],
            [ 1.5,  2.0,  -2.5],
            [ 1.5,  0.2,  -1.5],
            [-1.3,  1.0,  -1.5]
        ];

        this.pointLightPositions = [
            [0.7,  0.2,   2.0],
            [2.3, -3.3,  -4.0],
            [-4.0,  2.0, -12.0],
            [0.0,  0.0,  -3.0]
        ];

        this.keys = {}; // object to keep track of pressed keys
        this.previousTime = 0; // for calculating delta time in render loop
        
        // setting up camera and light properties
        const viewPos = glMatrix.vec3.fromValues(-1.5, 0, 5);
        this.camera = new Camera({ 
            position: viewPos, 
            up: glMatrix.vec3.fromValues(0, 1, 0), 
            yaw: -60,
            pitch: 0,
        });

        // transformations for cube and lamp
        this.MVPtransforms = {
                modelCube: glMatrix.mat4.create(),
                modelLamp: glMatrix.mat4.create(),
                view: glMatrix.mat4.create(),
                projection: glMatrix.mat4.create(),
        };

        this.setupEventListeners();
        
        this.initWebGL()
            .then(() => requestAnimationFrame((now) => this.render(now)))
            .catch(err => console.error('Initialization failed:', err));    
    }

    async initWebGL() {
        const gl = this.gl;
        
        try {
            const [vsResp, cubeFsResp, lampFsResp] = await Promise.all([
                fetch('6-vs.glsl'),
                fetch('6-cube_fs.glsl'),
                fetch('6-lamp_fs.glsl')
            ]);

            if (!vsResp.ok)     throw new Error(`VS fetch failed: ${vsResp.status}`);
            if (!cubeFsResp.ok) throw new Error(`Cube FS fetch failed: ${cubeFsResp.status}`);
            if (!lampFsResp.ok) throw new Error(`Lamp FS fetch failed: ${lampFsResp.status}`);

            const [vsSource, cubefsSource, lampfsSource] = await Promise.all([
                vsResp.text(), cubeFsResp.text(), lampFsResp.text()
            ]);
            this.lampShader = new Shader(gl, vsSource, lampfsSource);
            this.cubeShader = new Shader(gl, vsSource, cubefsSource);
        } catch (err) {
            console.error('Failed to load shader file:', err.message);
            throw err; // stop further initialization
        }        
        
        this.initCube(); // Initialize cube geometry
        this.initTextures(); // Load textures 
        this.initUniforms(); // Set up shader uniforms that won't change in the render loop
                
        gl.enable(gl.DEPTH_TEST); // Enable depth testing
        gl.clearColor(0.1, 0.1, 0.1, 1.0); // Set clear color
        gl.viewport(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    }

    initCube() {        
        // set up vertex data (and buffer(s)) and configure vertex attributes
        const vertices = new Float32Array([
            // positions       // normals        // texture coords
            -0.5, -0.5, -0.5,  0.0,  0.0, -1.0,  0.0,  0.0,
             0.5, -0.5, -0.5,  0.0,  0.0, -1.0,  1.0,  0.0,
             0.5,  0.5, -0.5,  0.0,  0.0, -1.0,  1.0,  1.0,
             0.5,  0.5, -0.5,  0.0,  0.0, -1.0,  1.0,  1.0,
            -0.5,  0.5, -0.5,  0.0,  0.0, -1.0,  0.0,  1.0,
            -0.5, -0.5, -0.5,  0.0,  0.0, -1.0,  0.0,  0.0,

            -0.5, -0.5,  0.5,  0.0,  0.0,  1.0,  0.0,  0.0,
             0.5, -0.5,  0.5,  0.0,  0.0,  1.0,  1.0,  0.0,
             0.5,  0.5,  0.5,  0.0,  0.0,  1.0,  1.0,  1.0,
             0.5,  0.5,  0.5,  0.0,  0.0,  1.0,  1.0,  1.0,
            -0.5,  0.5,  0.5,  0.0,  0.0,  1.0,  0.0,  1.0,
            -0.5, -0.5,  0.5,  0.0,  0.0,  1.0,  0.0,  0.0,

            -0.5,  0.5,  0.5, -1.0,  0.0,  0.0,  1.0,  0.0,
            -0.5,  0.5, -0.5, -1.0,  0.0,  0.0,  1.0,  1.0,
            -0.5, -0.5, -0.5, -1.0,  0.0,  0.0,  0.0,  1.0,
            -0.5, -0.5, -0.5, -1.0,  0.0,  0.0,  0.0,  1.0,
            -0.5, -0.5,  0.5, -1.0,  0.0,  0.0,  0.0,  0.0,
            -0.5,  0.5,  0.5, -1.0,  0.0,  0.0,  1.0,  0.0,

             0.5,  0.5,  0.5,  1.0,  0.0,  0.0,  1.0,  0.0,
             0.5,  0.5, -0.5,  1.0,  0.0,  0.0,  1.0,  1.0,
             0.5, -0.5, -0.5,  1.0,  0.0,  0.0,  0.0,  1.0,
             0.5, -0.5, -0.5,  1.0,  0.0,  0.0,  0.0,  1.0,
             0.5, -0.5,  0.5,  1.0,  0.0,  0.0,  0.0,  0.0,
             0.5,  0.5,  0.5,  1.0,  0.0,  0.0,  1.0,  0.0,

            -0.5, -0.5, -0.5,  0.0, -1.0,  0.0,  0.0,  1.0,
             0.5, -0.5, -0.5,  0.0, -1.0,  0.0,  1.0,  1.0,
             0.5, -0.5,  0.5,  0.0, -1.0,  0.0,  1.0,  0.0,
             0.5, -0.5,  0.5,  0.0, -1.0,  0.0,  1.0,  0.0,
            -0.5, -0.5,  0.5,  0.0, -1.0,  0.0,  0.0,  0.0,
            -0.5, -0.5, -0.5,  0.0, -1.0,  0.0,  0.0,  1.0,

            -0.5,  0.5, -0.5,  0.0,  1.0,  0.0,  0.0,  1.0,
             0.5,  0.5, -0.5,  0.0,  1.0,  0.0,  1.0,  1.0,
             0.5,  0.5,  0.5,  0.0,  1.0,  0.0,  1.0,  0.0,
             0.5,  0.5,  0.5,  0.0,  1.0,  0.0,  1.0,  0.0,
            -0.5,  0.5,  0.5,  0.0,  1.0,  0.0,  0.0,  0.0,
            -0.5,  0.5, -0.5,  0.0,  1.0,  0.0,  0.0,  1.0
        ]);
        this.cubeVertexCount = vertices.length / 8; // 8 floats per vertex (position, normal, texcoords)

        const gl = this.gl;

        // create vertex array object (vao) for cube and bind it
        this.cubeVAO = gl.createVertexArray();
        gl.bindVertexArray(this.cubeVAO);

        // create and bind vertex buffer object (vbo)
        const VBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        // linking vertex attributes for cube shader program
        const aPosCube = gl.getAttribLocation(this.cubeShader.ID, "aPos");
        gl.vertexAttribPointer(aPosCube, 3, gl.FLOAT, false, 8 * FLOAT_SIZE, 0);
        gl.enableVertexAttribArray(aPosCube);
        const aNormal =  gl.getAttribLocation(this.cubeShader.ID, "aNormal");
        gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 8 * FLOAT_SIZE, 3 * FLOAT_SIZE);
        gl.enableVertexAttribArray(aNormal);
        const aTexCoords = gl.getAttribLocation(this.cubeShader.ID, "aTexCoords");
        gl.vertexAttribPointer(aTexCoords, 2, gl.FLOAT, false, 8 * FLOAT_SIZE, 6 * FLOAT_SIZE);
        gl.enableVertexAttribArray(aTexCoords);

        // create vertex array object (vao) for lamp and bind it
        this.lampVAO = gl.createVertexArray();
        gl.bindVertexArray(this.lampVAO);

        // we only need to bind to the VBO, the container's VBO's data already
        // contains the correct data.
        gl.bindBuffer(gl.ARRAY_BUFFER, VBO);

        // set the vertex attributes (only position data for our lamp)
        const aPosLamp = gl.getAttribLocation(this.lampShader.ID, "aPos");
        gl.vertexAttribPointer(aPosLamp, 3, gl.FLOAT, false, 8 * FLOAT_SIZE, 0);
        gl.enableVertexAttribArray(aPosLamp);
                
        gl.bindVertexArray(null);
    }

    initTextures() {
        const gl = this.gl;
        // setting up texture 
        this.cubeShader.use();
        this.diffuseMap =  new  Texture(gl, gl.TEXTURE0, "container2.png", {placeholderColor: [0, 255, 0, 255] });
        this.diffuseMap.setSamplerUniform(this.cubeShader, 'material.diffuse');
        this.specularMap = new Texture(gl, gl.TEXTURE1, "container2_specular.png", {placeholderColor: [255, 0, 0, 255] });
        this.specularMap.setSamplerUniform(this.cubeShader, 'material.specular');
    }

    initUniforms() {
        // and uniforms for cube shader program that won't change in the render loop
        this.cubeShader.use();
        this.cubeShader.setFloat('material.shininess', 64.0);
        this.cubeShader.setVec3('dirLight.direction', -0.2, -1.0, -0.3);
        this.cubeShader.setVec3('dirLight.ambient', 0.05, 0.05, 0.05);
        this.cubeShader.setVec3('dirLight.diffuse', 0.4, 0.4, 0.4);
        this.cubeShader.setVec3('dirLight.specular', 0.5, 0.5, 0.5);
        for (let i = 0; i < this.pointLightPositions.length; i++) {
            const pos = this.pointLightPositions[i];
            this.cubeShader.setVec3(`pointLights[${i}].position`, pos[0], pos[1], pos[2]);
            this.cubeShader.setVec3(`pointLights[${i}].ambient`, 0.05, 0.05, 0.05);
            this.cubeShader.setVec3(`pointLights[${i}].diffuse`, 0.8, 0.8, 0.8);
            this.cubeShader.setVec3(`pointLights[${i}].specular`, 1.0, 1.0, 1.0);
            this.cubeShader.setFloat(`pointLights[${i}].constant`, 1.0);
            this.cubeShader.setFloat(`pointLights[${i}].linear`, 0.09);
            this.cubeShader.setFloat(`pointLights[${i}].quadratic`, 0.032);
        }
        this.cubeShader.setVec3('spotLight.ambient', 0.0, 0.0, 0.0);
        this.cubeShader.setVec3('spotLight.diffuse', 1.0, 1.0, 1.0);
        this.cubeShader.setVec3('spotLight.specular', 1.0, 1.0, 1.0);
        this.cubeShader.setFloat('spotLight.constant', 1.0);
        this.cubeShader.setFloat('spotLight.linear', 0.09);
        this.cubeShader.setFloat('spotLight.quadratic', 0.032);
        const toRad = glMatrix.glMatrix.toRadian;
        this.cubeShader.setFloat('spotLight.cutOff', Math.cos(toRad(12.5)));
        this.cubeShader.setFloat('spotLight.outerCutOff', Math.cos(toRad(15)));
    }

    render(timestamp) {
        const gl = this.gl;
        
        // calculate delta time for consistent movement speed
        const currentTime = timestamp / 1000.0; // convert to seconds
        const deltaTime = currentTime - this.previousTime;
        this.previousTime = currentTime;

        // process keyboard input for camera movement
        if (this.keys['w']) this.camera.processKeyboard('FORWARD', deltaTime); 
        if (this.keys['s']) this.camera.processKeyboard('BACKWARD', deltaTime); 
        if (this.keys['a']) this.camera.processKeyboard('LEFT', deltaTime); 
        if (this.keys['d']) this.camera.processKeyboard('RIGHT', deltaTime); 

        // clear color and depth buffers
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // activate the cube shader program and cube VAO to draw the cube
        this.cubeShader.use();
        gl.bindVertexArray(this.cubeVAO);

        // bind the texture maps to correspondint texture units
        this.diffuseMap.bind();
        this.specularMap.bind();

        // update uniforms for cube shader program
        glMatrix.mat4.perspective(this.MVPtransforms.projection,
            glMatrix.glMatrix.toRadian(this.camera.Zoom),          // 45° field of view
            gl.canvas.clientWidth / gl.canvas.clientHeight,  // aspect ratio (800/600)
            0.1,                                       // near plane
            100.0                                      // far plane
        );    
        this.camera.getViewMatrix(this.MVPtransforms.view);
        this.cubeShader.setMat4('view', this.MVPtransforms.view);
        this.cubeShader.setMat4('projection', this.MVPtransforms.projection);

        this.cubeShader.setVec3('spotLight.position', this.camera.Position[0], this.camera.Position[1], this.camera.Position[2]);
        this.cubeShader.setVec3('spotLight.direction', this.camera.Front[0], this.camera.Front[1], this.camera.Front[2]);
        this.cubeShader.setVec3('viewPos', this.camera.Position[0], this.camera.Position[1], this.camera.Position[2]);

        // draw the cubes
        for (let i = 0; i < this.cubePositions.length; i++) {
            glMatrix.mat4.fromTranslation(this.MVPtransforms.modelCube, this.cubePositions[i]);
            glMatrix.mat4.rotate(this.MVPtransforms.modelCube, this.MVPtransforms.modelCube, glMatrix.glMatrix.toRadian(20.0 * i), [1.0, 0.3, 0.5]);
            this.cubeShader.setMat4('model', this.MVPtransforms.modelCube);
            gl.drawArrays(gl.TRIANGLES, 0, this.cubeVertexCount);
        }

        // activate the lamp shader program and lamp VAO to draw the lamp
        this.lampShader.use();
        gl.bindVertexArray(this.lampVAO);

        // setting up lamp shader uniforms
        this.lampShader.setMat4('view', this.MVPtransforms.view);
        this.lampShader.setMat4('projection', this.MVPtransforms.projection);

        // draw the lamps
        for (let i = 0; i < this.pointLightPositions.length; i++) {
            glMatrix.mat4.fromTranslation(this.MVPtransforms.modelLamp, this.pointLightPositions[i]);
            glMatrix.mat4.scale(this.MVPtransforms.modelLamp, this.MVPtransforms.modelLamp, glMatrix.vec3.fromValues(0.2, 0.2, 0.2)); // a smaller cube
            this.lampShader.setMat4('model', this.MVPtransforms.modelLamp);

            // draw the lamp
            gl.drawArrays(gl.TRIANGLES, 0, this.cubeVertexCount);
        }

        gl.bindVertexArray(null);
        
        requestAnimationFrame((now) => this.render(now));
    }

    setupEventListeners() {
        window.addEventListener('keydown', e => this.keys[e.key] = true);
        window.addEventListener('keyup',   e => this.keys[e.key] = false);

        // Request pointer lock on click 
        this.canvas.addEventListener('click', () => { this.canvas.requestPointerLock(); });    
        // ---- Mouse move handling for camera rotation ----
        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement !== this.canvas) return;
            this.camera.processMouseMovement(e.movementX, -e.movementY);
        });    

        // set up mouse wheel handling for zooming
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.camera.processMouseScroll(e.deltaY);
        }, { passive: false });
    }

}

// Initialize the application when the page loads
window.addEventListener('DOMContentLoaded', () => {
    new MainApp();
});


