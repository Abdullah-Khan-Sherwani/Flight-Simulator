"use strict";
var gl;
var shaderProgram;
var VAO;

window.onload = function init() {
    var canvas = document.getElementById("gl-canvas");

    gl = canvas.getContext("webgl2");
    if (!gl) {
      alert("WebGL 2.0 isn't available");
    }

    // load and compile vertex shader
    var vertexShaderSource = `#version 300 es
    in vec3 aPos;
    void main() 
    {
      gl_Position = vec4(aPos.x, aPos.y, aPos.z, 1.0);
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
    void main()
    {
        FragColor = vec4(1.0f, 0.5f, 0.2f, 1.0f);
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
        0.5,  0.5, 0.0, // top right
        0.5, -0.5, 0.0, // bottom right
        -0.5, -0.5, 0.0, // bottom left
        -0.5,  0.5, 0.0  // top left
    ]);
    var indices = new Uint32Array([
        0, 1, 3, // first Triangle
        1, 2, 3  // second Triangle
    ]);

    // create vertex array object (vao)
    VAO = gl.createVertexArray();
    gl.bindVertexArray(VAO);

    // create and bind vertex buffer object (vbo)
    const VBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // create and bind element buffer object (ebo)
    const EBO = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, EBO);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // linking vertx attributes
    var aPosition = gl.getAttribLocation(shaderProgram, "aPos");
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(aPosition);

    render();
};

function render() {
    // set clear color and clear the buffer  
    gl.clearColor(0.2, 0.3, 0.3, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // activate the program object
    gl.useProgram(shaderProgram);

    // bind the VAO
    gl.bindVertexArray(VAO); 

    // draw the triangle
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0);
}
