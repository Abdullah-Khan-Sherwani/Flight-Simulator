"use strict";

var gl;
var points;
var colorLoc;
var transformLoc;

const vertexShaderSource = `#version 300 es
    in  vec3 aPos;
    in  vec3 aColor;
    out vec3 ourColor;
    uniform mat4 transform;
    void main()
    {
        gl_Position = transform * vec4(aPos, 1.0); 
        ourColor = aColor;
    }`

const fragmentShaderSource = `#version 300 es
    precision mediump float; 
    in  vec3 ourColor;
    out vec4 fColor;
    void main()
    {
        fColor = vec4(ourColor, 1.0);
    }`

window.onload = function init() {
    var canvas = document.getElementById("gl-canvas");

    gl = canvas.getContext("webgl2");
    if (!gl) {
        alert("WebGL 2.0 isn't available");
    }

    const h = Math.sqrt(3) / 2;
    points = new Float32Array([
        // position       // colors
         0.5, -h/3,  0.0,  1.0, 0.0, 0.0,  // bottom right
        -0.5, -h/3,  0.0,  0.0, 1.0, 0.0,  // bottom left
         0.0, 2*h/3, 0.0,  0.0, 0.0, 1.0   // top 
    ]);

    //  Configure WebGL
    //
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1.0, 1.0, 1.0, 1.0);

    //  Load shaders and initialize attribute buffers
    var program = initShaders(gl, vertexShaderSource, fragmentShaderSource);
    gl.useProgram(program);

    // Load the data into the GPU
    var bufferId = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
    gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);

    // Associate out shader variables with our data buffer
    const FLOAT_SIZE = Float32Array.BYTES_PER_ELEMENT;
    var aPos = gl.getAttribLocation(program, "aPos");
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 6 * FLOAT_SIZE, 0);
    gl.enableVertexAttribArray(aPos);

    var aColor = gl.getAttribLocation(program, "aColor");
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 6 * FLOAT_SIZE, 3 * FLOAT_SIZE);
    gl.enableVertexAttribArray(aColor);

    transformLoc = gl.getUniformLocation(program, "transform");


    render();
};

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT);

    var trans = glMatrix.mat4.create();
    const angle = performance.now() * Math.PI / 1000.0;  // 180 degrees per second
    glMatrix.mat4.rotate(trans, trans, angle, [0.0, 0.0, 1.0]);
    // glMatrix.mat4.scale(trans, trans, [0.5, 0.5, 0.5]);
    glMatrix.mat4.translate(trans, trans, [0.75, 0.75, 0.0]);

    gl.uniformMatrix4fv(transformLoc, false, trans);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    requestAnimationFrame(render);
}

function initShaders(gl, vertexShaderSource, fragmentShaderSource) {
    var vertShdr;
    var fragShdr;

    vertShdr = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertShdr, vertexShaderSource);
    gl.compileShader(vertShdr);
    if (!gl.getShaderParameter(vertShdr, gl.COMPILE_STATUS)) {
        var msg = "Vertex shader failed to compile.  The error log is:\n\n"
            + gl.getShaderInfoLog(vertShdr);
        alert(msg);
        return -1;
    }

    fragShdr = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragShdr, fragmentShaderSource);
    gl.compileShader(fragShdr);
    if (!gl.getShaderParameter(fragShdr, gl.COMPILE_STATUS)) {
        var msg = "Fragment shader failed to compile.  The error log is:\n\n"
            + gl.getShaderInfoLog(fragShdr);
        alert(msg);
        return -1;
    }

    var program = gl.createProgram();
    gl.attachShader(program, vertShdr);
    gl.attachShader(program, fragShdr);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        var msg = "Shader program failed to link.  The error log is:\n\n"
            + gl.getProgramInfoLog(program);
        alert(msg);
        return -1;
    }

    return program;
}
