"use strict";
var gl; // global variable for WebGL context
var shaderProgram; // shader program object
var VAO;  // vertex array object
var texture0, texture1; // texture objects
var modelLoc, viewLoc, projectionLoc;  // uniform locations for transformations
var cameraPos, cameraFront, cameraUp;  // camera parameters for movement
var keys = {};         // object to track which keys are currently pressed
let deltaTime = 0.0;   // time between current frame and last frame, used for consistent movement speed
let lastFrame = 0.0;   // timestamp of last frame, used to calculate deltaTime

// camera orientation parameters
let yaw        = -90.0;  // facing -Z by default
let pitch      =   0.0;
let fov = 45.0;  // default fov in degrees

window.onload = function init() {
    var canvas = document.getElementById("gl-canvas");

    gl = canvas.getContext("webgl2");
    if (!gl) {
      alert("WebGL 2.0 isn't available");
    }

    // load and compile vertex shader
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
        }`
    var vertexShader = gl.createShader(gl.VERTEX_SHADER); 
    gl.shaderSource(vertexShader, vertexShaderSource); 
    gl.compileShader(vertexShader);
    var success = gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS);
    if (!success) {
        console.log(gl.getShaderInfoLog(vertexShader));
    }

    // load and compile fragment shader
    var fragmentShaderSource = `#version 300 es 
        precision mediump float;
        out vec4 FragColor;

        in vec2 TexCoord;

        // texture sampler
        uniform sampler2D ourTexture0; 
        uniform sampler2D ourTexture1; 
        void main()
        {
            FragColor = mix(texture(ourTexture0, TexCoord), texture(ourTexture1, TexCoord), 0.25);
        }`

    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER); 
    gl.shaderSource(fragmentShader, fragmentShaderSource); 
    gl.compileShader(fragmentShader);
    // check for shader compile errors 
    var success = gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS);
    if (!success) {
        console.log(gl.getShaderInfoLog(fragmentShader));
    }

    // attach shaders to program and link 
    shaderProgram = gl.createProgram(); 
    gl.attachShader(shaderProgram, vertexShader); 
    gl.attachShader(shaderProgram, fragmentShader); 
    gl.linkProgram(shaderProgram);
    var success = gl.getProgramParameter(shaderProgram, gl.LINK_STATUS);
    if (!success) {
        console.log(gl.getProgramInfoLog(shaderProgram));
    }

    // delete once linked
    gl.deleteShader(vertexShader); 
    gl.deleteShader(fragmentShader);


    // set up vertex data (and buffer(s)) and configure vertex attributes
    var vertices = new Float32Array([
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

    // linking vertx attributes
    const FLOAT_SIZE = Float32Array.BYTES_PER_ELEMENT;
    var aPos = gl.getAttribLocation(shaderProgram, "aPos");
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 5 * FLOAT_SIZE, 0);
    gl.enableVertexAttribArray(aPos);

    var aTexCoord = gl.getAttribLocation(shaderProgram, "aTexCoord");
    gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 5 * FLOAT_SIZE, 3 * FLOAT_SIZE);
    gl.enableVertexAttribArray(aTexCoord);

    // activate the program object
    gl.useProgram(shaderProgram);

    // create first texture
    texture0 = setupTexture(gl, gl.TEXTURE0, "bricks.png", true, [0, 255, 0, 255]);

    // Create second texture
    texture1 = setupTexture(gl, gl.TEXTURE1, "smileys.png", true, [255, 0, 0, 255]);

    // which texture unit each shader sampler belongs to 
    var ourTexture0Loc = gl.getUniformLocation(shaderProgram, "ourTexture0");
    var ourTexture1Loc = gl.getUniformLocation(shaderProgram, "ourTexture1");
    gl.uniform1i(ourTexture0Loc, 0); // texture unit 0
    gl.uniform1i(ourTexture1Loc, 1); // texture unit 1

    // get uniform locations for transformations
    modelLoc = gl.getUniformLocation(shaderProgram, "model");
    viewLoc = gl.getUniformLocation(shaderProgram, "view");
    projectionLoc = gl.getUniformLocation(shaderProgram, "projection");

    // set clear color 
    gl.clearColor(0.2, 0.3, 0.3, 1.0);

    // enable depth testing
    gl.enable(gl.DEPTH_TEST);

    // set up keyboard input handling
    window.addEventListener('keydown', e => keys[e.key] = true);
    window.addEventListener('keyup',   e => keys[e.key] = false);

    // Request pointer lock on click (browser requires user gesture first)
    canvas.addEventListener('click', () => { canvas.requestPointerLock(); });

    // set up mouse wheel handling for zooming
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    // camera parameters
    cameraPos = glMatrix.vec3.fromValues(0.0, 0.0, 3.0);
    cameraFront = glMatrix.vec3.fromValues(0.0, 0.0, -1.0);
    cameraUp = glMatrix.vec3.fromValues(0.0, 1.0, 0.0);

    // render loop
    requestAnimationFrame(render);
};

function render(timestamp) {
    // calculate delta time for consistent movement speed
    const currentFrame = timestamp / 1000.0; // convert to seconds
    deltaTime = currentFrame - lastFrame;
    lastFrame = currentFrame;

    // process keyboard input
    processInput();

    // clear color and depth buffers
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // activate the program object
    gl.useProgram(shaderProgram);

    // bind the VAO
    gl.bindVertexArray(VAO); 
    
    // bind the textures on corresponding texture units
    gl.activeTexture(gl.TEXTURE0); 
    gl.bindTexture(gl.TEXTURE_2D, texture0);
    gl.activeTexture(gl.TEXTURE1); 
    gl.bindTexture(gl.TEXTURE_2D, texture1);

    // view transformation
    var target = glMatrix.vec3.create();
    glMatrix.vec3.add(target, cameraPos, cameraFront);
    var view = glMatrix.mat4.create();
    glMatrix.mat4.lookAt(view, cameraPos, target, cameraUp);
    gl.uniformMatrix4fv(viewLoc, false, view);

    // projection transformation
    var projection = glMatrix.mat4.create();
    const fovR = fov * (Math.PI / 180.0);  // convert to radians
    const displayWidth  = gl.canvas.clientWidth;
    const displayHeight = gl.canvas.clientHeight;
    glMatrix.mat4.perspective(projection, fovR, displayWidth / displayHeight, 0.1, 100.0);    
    gl.uniformMatrix4fv(projectionLoc, false, projection);
    

    // draw the cubes
    const cubePositions = [
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
    for (let i = 0; i < cubePositions.length; i++) {
        // model transformation
        var model = glMatrix.mat4.create();
        glMatrix.mat4.translate(model, model, cubePositions[i]);
        glMatrix.mat4.rotate(model, model, glMatrix.glMatrix.toRadian(20.0 * i), [1.0, 0.3, 0.5]);
        gl.uniformMatrix4fv(modelLoc, false, model);

        // render the cube
        gl.drawArrays(gl.TRIANGLES, 0, 36);
    }

    requestAnimationFrame(render);
}

// handle mouse wheel for zooming
function handleWheel(e) {
    e.preventDefault();  // prevent page scrolling

    fov -= e.deltaY * 0.015;  // multiply by a small factor to make zooming less sensitive

    if (fov <  1.0) fov =  1.0;
    if (fov > 45.0) fov = 45.0;
};

// handle mouse movement for camera rotation
document.addEventListener('mousemove', (e) => {
    // Skip if pointer is not locked
    if (document.pointerLockElement !== gl.canvas) return;

    // e.movementX,e.movementY give the change in mouse position since last event
    // sensitivity controls how much the camera rotates in response to mouse movement
    const sensitivity = 0.1;
    yaw   += e.movementX * sensitivity; 
    pitch -= e.movementY * sensitivity;  

    // Clamp pitch to avoid gimbal flip
    if (pitch >  89.0) pitch =  89.0;
    if (pitch < -89.0) pitch = -89.0;

    const yawR   = yaw   * (Math.PI / 180.0);
    const pitchR = pitch * (Math.PI / 180.0);

    const front = glMatrix.vec3.fromValues(
        Math.cos(yawR) * Math.cos(pitchR),
        Math.sin(pitchR),
        Math.sin(yawR) * Math.cos(pitchR)
    );
    glMatrix.vec3.normalize(cameraFront, front);
});


function processInput() {
    const cameraSpeed = 2.5 * deltaTime; // adjust speed based on delta time
    const temp = glMatrix.vec3.create();

    // W - move forward
    if (keys['w'] || keys['W']) {
        glMatrix.vec3.scaleAndAdd(cameraPos, cameraPos, cameraFront, cameraSpeed);
    }

    // S - move backward
    if (keys['s'] || keys['S']) {
        glMatrix.vec3.scaleAndAdd(cameraPos, cameraPos, cameraFront, -cameraSpeed);
    }

    // A - strafe left
    if (keys['a'] || keys['A']) {
        glMatrix.vec3.cross(temp, cameraFront, cameraUp);
        glMatrix.vec3.normalize(temp, temp);
        glMatrix.vec3.scaleAndAdd(cameraPos, cameraPos, temp, -cameraSpeed);
    }

    // D - strafe right
    if (keys['d'] || keys['D']) {
        glMatrix.vec3.cross(temp, cameraFront, cameraUp);
        glMatrix.vec3.normalize(temp, temp);
        glMatrix.vec3.scaleAndAdd(cameraPos, cameraPos, temp, cameraSpeed);
    }
}

function setupTexture(gl, textureUnit, imgSrc, flipY=true, placeholderColor = [0, 0, 0, 255], minFilter = gl.NEAREST_MIPMAP_LINEAR, magFilter = gl.LINEAR, wrapS = gl.REPEAT, wrapT = gl.REPEAT) {
    // create texture
    var texture = gl.createTexture();
    gl.activeTexture(textureUnit); 
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Set texture filtering parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);

    // Fill the texture with a 1x1 pixel of the specified placeholder color
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                new Uint8Array(placeholderColor));

    // Set texture wrapping parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);

    // Asynchronously load an image
    var img = new Image();
    img.src = imgSrc;
    img.addEventListener('load', function() {
        // Once image loads, copy it to the texture
        gl.activeTexture(textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY); 
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
    });
   
    return texture;
}


