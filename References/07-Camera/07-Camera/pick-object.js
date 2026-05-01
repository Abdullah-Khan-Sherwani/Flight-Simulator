"use strict";
let gl;            // global variable for WebGL context
let shaderProgram; // shader program object
let VAO;           // vertex array object

let texture0, texture1; // texture objects
let uniformLocs = {};   // uniform locations for transformations

let camera;

const keys = {}; // object to track key states

let deltaTime = 0;     // time between current frame and last frame, used for consistent movement speed
let lastFrame = 0;     // timestamp of last frame, used to calculate deltaTime

// Click object state
let clickObject    = true; // true = click to select object, false = free look
let nearestObjectId = -1;


const CUBE_POSITIONS = [
    [ 0,  0,   0],
    [ 2,  5, -15],
    [-1.5, -2.2,  -2.5],
    [-3.8, -2.0, -12.3],
    [ 2.4, -0.4,  -3.5],
    [-1.7,  3.0,  -7.5],
    [ 1.3, -2.0,  -2.5],
    [ 1.5,  2.0,  -2.5],
    [ 1.5,  0.2,  -1.5],
    [-1.3,  1.0,  -1.5]
];

const vertexShaderSource = `#version 300 es
    in  vec3 aPos; 
    in  vec2 aTexCoord; 
    out vec2 TexCoord;

    uniform mat4 model; 
    uniform mat4 view; 
    uniform mat4 projection;

    void main()
    {
        gl_Position = projection * view * model * vec4(aPos, 1.0);
        TexCoord = vec2(aTexCoord.x, aTexCoord.y);
    }`;

const fragmentShaderSource = `#version 300 es 
    precision mediump float;
    out vec4 FragColor;

    in vec2 TexCoord;
    
    // texture sampler
    uniform sampler2D ourTexture0; 
    uniform sampler2D ourTexture1; 

    uniform int numCube;

    void main()
    {
        FragColor = mix(texture(ourTexture0, TexCoord), texture(ourTexture1, TexCoord), 0.25);
        if(numCube==1)  FragColor.r=1.0;
    }`;

function initBuffers() {
    // set up vertex data (and buffer(s)) and configure vertex attributes
    const vertices = new Float32Array([
    -0.5, -0.5, -0.5, 0.0, 0.0,
     0.5, -0.5, -0.5, 1.0, 0.0,
     0.5,  0.5, -0.5, 1.0, 1.0,
     0.5,  0.5, -0.5, 1.0, 1.0,
    -0.5,  0.5, -0.5, 0.0, 1.0,
    -0.5, -0.5, -0.5, 0.0, 0.0,

    -0.5, -0.5,  0.5, 0.0, 0.0,
     0.5, -0.5,  0.5, 1.0, 0.0,
     0.5,  0.5,  0.5, 1.0, 1.0,
     0.5,  0.5,  0.5, 1.0, 1.0,
    -0.5,  0.5,  0.5, 0.0, 1.0,
    -0.5, -0.5,  0.5, 0.0, 0.0,

    -0.5,  0.5,  0.5, 1.0, 0.0,
    -0.5,  0.5, -0.5, 1.0, 1.0,
    -0.5, -0.5, -0.5, 0.0, 1.0,
    -0.5, -0.5, -0.5, 0.0, 1.0,
    -0.5, -0.5,  0.5, 0.0, 0.0,
    -0.5,  0.5,  0.5, 1.0, 0.0,

     0.5,  0.5,  0.5, 1.0, 0.0,
     0.5,  0.5, -0.5, 1.0, 1.0,
     0.5, -0.5, -0.5, 0.0, 1.0,
     0.5, -0.5, -0.5, 0.0, 1.0,
     0.5, -0.5,  0.5, 0.0, 0.0,
     0.5,  0.5,  0.5, 1.0, 0.0,

    -0.5, -0.5, -0.5, 0.0, 1.0,
     0.5, -0.5, -0.5, 1.0, 1.0,
     0.5, -0.5,  0.5, 1.0, 0.0,
     0.5, -0.5,  0.5, 1.0, 0.0,
    -0.5, -0.5,  0.5, 0.0, 0.0,
    -0.5, -0.5, -0.5, 0.0, 1.0,

    -0.5, 0.5, -0.5, 0.0, 1.0,
     0.5, 0.5, -0.5, 1.0, 1.0,
     0.5, 0.5,  0.5, 1.0, 0.0,
     0.5, 0.5,  0.5, 1.0, 0.0,
    -0.5, 0.5,  0.5, 0.0, 0.0,
    -0.5, 0.5, -0.5, 0.0, 1.0
    ]);

    // create vertex array object (vao)
    VAO = gl.createVertexArray();
    gl.bindVertexArray(VAO);

    // create and bind vertex buffer object (vbo)
    const VBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // linking vertex attributes
    const FLOAT_SIZE = Float32Array.BYTES_PER_ELEMENT;
    const aPos = gl.getAttribLocation(shaderProgram, "aPos");
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 5 * FLOAT_SIZE, 0);
    gl.enableVertexAttribArray(aPos);

    const aTexCoord = gl.getAttribLocation(shaderProgram, "aTexCoord");
    gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 5 * FLOAT_SIZE, 3 * FLOAT_SIZE);
    gl.enableVertexAttribArray(aTexCoord);
}


window.onload = function init() {
    const canvas = document.getElementById("gl-canvas");

    gl = canvas.getContext("webgl2");
    if (!gl) {
        alert("WebGL 2.0 isn't available");
    }

    // set clear color
    gl.clearColor(0.2, 0.3, 0.3, 1.0);

    // set viewport size to match canvas dimensions
    gl.viewport(0, 0, canvas.clientWidth, canvas.clientHeight);

    // enable depth testing
    gl.enable(gl.DEPTH_TEST);

    // initialize shaders and shader program
    shaderProgram = initShaderProgram(vertexShaderSource, fragmentShaderSource);

    // initialize vertex data and configure vertex attributes
    initBuffers();

    // activate the program object (for setting up shader uniforms)
    gl.useProgram(shaderProgram);

    // set up textures
    const textureDefs = [
        { unit: gl.TEXTURE0, src: "bricks.png",  placeholder: [0, 255, 0, 255], uniform: "ourTexture0", index: 0 },
        { unit: gl.TEXTURE1, src: "smileys.png", placeholder: [255, 0, 0, 255], uniform: "ourTexture1", index: 1 },
    ];
    [texture0, texture1] = textureDefs.map(({ unit, src, placeholder, uniform, index }) => {
        const tex = setupTexture(gl, unit, src, true, placeholder);
        gl.uniform1i(gl.getUniformLocation(shaderProgram, uniform), index);
        return tex;
    });

    // get uniform locations for transformations
    uniformLocs = {
        model:      gl.getUniformLocation(shaderProgram, "model"),
        view:       gl.getUniformLocation(shaderProgram, "view"),
        projection: gl.getUniformLocation(shaderProgram, "projection"),
        numCube:    gl.getUniformLocation(shaderProgram, 'numCube'),
    };

    // create camera
    camera = new Camera({ position: glMatrix.vec3.fromValues(0, 0, 3) });

    // set up keyboard input handling
    window.addEventListener('keydown', (e) => {
        keys[e.key] = true;
        if (e.key === 'c' || e.key === 'C') {
            clickObject = !clickObject;
            if (clickObject)  document.exitPointerLock();
            else              canvas.requestPointerLock();
        }
    });
    window.addEventListener('keyup',   e => keys[e.key] = false);

    // ---- Mouse move — only rotate camera when not in click mode ----
    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement !== canvas) return;

        if (!clickObject)
            camera.processMouseMovement(e.movementX, -e.movementY);
    });    

    // set up mouse wheel handling for zooming
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        camera.processMouseScroll(e.deltaY);
    }, { passive: false });

    // ---- Mouse button callback ----
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0 && clickObject) {  // 0 = left button
            // Subtract the canvas's top-left corner from the mouse's client coordinates.
            const rect = canvas.getBoundingClientRect();
            const xpos = e.clientX - rect.left;
            const ypos = e.clientY - rect.top;
            // xpos and ypos are now in canvas coordinates, where (0,0) is the top-left corner of the canvas and (canvas.width, canvas.height) is the bottom-right corner.
            handleClick(xpos, ypos);
        }
    });
        

    // render loop
    requestAnimationFrame(render);
};

function handleClick(xpos, ypos) {
    // Convert to NDC (Normalized Device Coordinates)
    const x =  (2.0 * xpos) / gl.canvas.clientWidth  - 1.0;
    const y =  1.0 - (2.0 * ypos) / gl.canvas.clientHeight;
    const z = -1.0;

    const p_prime     = glMatrix.vec4.fromValues(x, y, z, 1.0);
    const aspectRatio = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const fovR = camera.Zoom * (Math.PI / 180);
    const projection = glMatrix.mat4.create();
    glMatrix.mat4.perspective(projection, fovR, aspectRatio, 0.1, 100);
    const invProjMat  = glMatrix.mat4.create();
    glMatrix.mat4.invert(invProjMat, projection);

    const ViewModelp  = glMatrix.vec4.create();
    glMatrix.vec4.transformMat4(ViewModelp, p_prime, invProjMat);

    const invViewMat  = glMatrix.mat4.create();
    glMatrix.mat4.invert(invViewMat, camera.getViewMatrix());

    // Ray direction (w=0 means direction not position)
    ViewModelp[3] = 0;
    const Modelp  = glMatrix.vec4.create();
    glMatrix.vec4.transformMat4(Modelp, ViewModelp, invViewMat);

    const ray = glMatrix.vec3.fromValues(Modelp[0], Modelp[1], Modelp[2]);
    glMatrix.vec3.normalize(ray, ray);


    // Find nearest object
    let dist = 0;
    for (let i = 0; i < CUBE_POSITIONS.length; i++) {
        const diff = glMatrix.vec3.create();
        glMatrix.vec3.subtract(diff, CUBE_POSITIONS[i], camera.Position);

        const cross = glMatrix.vec3.create();
        glMatrix.vec3.cross(cross, diff, ray);

        const currentDist = glMatrix.vec3.length(cross);

        if (i === 0 || dist > currentDist) {
            dist            = currentDist;
            nearestObjectId = i;
        }
    }
}


function render(timestamp) {
    // calculate deltaTime for consistent movement speed
    const currentFrame = timestamp / 1000; // convert to seconds
    deltaTime = currentFrame - lastFrame;
    lastFrame = currentFrame;

    // process keyboard input for camera movement
    if (keys['w'] || keys['W']) camera.processKeyboard('FORWARD', deltaTime);
    if (keys['s'] || keys['S']) camera.processKeyboard('BACKWARD', deltaTime);
    if (keys['a'] || keys['A']) camera.processKeyboard('LEFT', deltaTime);
    if (keys['d'] || keys['D']) camera.processKeyboard('RIGHT', deltaTime);

    // clear color and depth buffers
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // activate the program object
    gl.useProgram(shaderProgram);

    // bind the VAO
    gl.bindVertexArray(VAO);

    // bind the textures on corresponding texture units
    bindTextureToUnit(gl.TEXTURE0, texture0);
    bindTextureToUnit(gl.TEXTURE1, texture1);

    // view and projection transformation
    setupViewTransformations();
    setupProjectionTransformations();

    // draw the cubes
    for (let i = 0; i < CUBE_POSITIONS.length; i++) {
        setupModelTransformations(i, CUBE_POSITIONS[i]);

        // Highlight nearest object 
        gl.uniform1i(uniformLocs.numCube, i === nearestObjectId ? 1 : -1);

        gl.drawArrays(gl.TRIANGLES, 0, 36);
    }

    requestAnimationFrame(render);
}


function setupViewTransformations() {
    gl.uniformMatrix4fv(uniformLocs.view, false, camera.getViewMatrix());
}

function setupProjectionTransformations() {
    const aspectRatio = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const fovR = camera.Zoom * (Math.PI / 180);
    const projection = glMatrix.mat4.create();
    glMatrix.mat4.perspective(projection, fovR, aspectRatio, 0.1, 100);
    gl.uniformMatrix4fv(uniformLocs.projection, false, projection);
}

function setupModelTransformations(i, pos) {
    const model = glMatrix.mat4.create();
    glMatrix.mat4.translate(model, model, pos);
    glMatrix.mat4.rotate(model, model, glMatrix.glMatrix.toRadian(20 * i), [1.0, 0.3, 0.5]);
    gl.uniformMatrix4fv(uniformLocs.model, false, model);
}
