"use strict";
var gl;
var shaderProgram;
var VAO;
const numPoints = 200;

window.onload = function init() {
    var canvas = document.getElementById("gl-canvas");

    gl = canvas.getContext("webgl2");
    if (!gl) {
      alert("WebGL 2.0 isn't available");
    }

    // load and compile vertex shader
    var vertexShaderSource = `#version 300 es
    in float xPos;
    in float yPos;
    void main() 
    {
        gl_Position = vec4(xPos, yPos, 0.0, 1.0);
    }`;
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
    	FragColor = vec4(1.0f,gl_FragCoord.y/600.0f, 0.2f, 1.0f); 
    }`;
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
    var verticesX = new Float32Array(2*numPoints);
    var verticesY = new Float32Array(2*numPoints);
    for (let i = 0; i < numPoints; i++) {
        let t = i / (numPoints - 1) * 2 - 1;
        t = t * 3.14159;
        verticesX[i] = 0.75 * Math.cos(3 * t);
        verticesY[i] = 0.75 * Math.sin(2 * t);
    }
    // create vertex array object (vao)
    VAO = gl.createVertexArray();

    // create and bind vertex buffer object (vbo)
    var VBO = gl.createBuffer();
    var VBO2 = gl.createBuffer();

    gl.bindVertexArray(VAO);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
    gl.bufferData(gl.ARRAY_BUFFER, verticesX, gl.STATIC_DRAW);
    var xPos = gl.getAttribLocation(shaderProgram, "xPos");
    gl.vertexAttribPointer(xPos, 1, gl.FLOAT, false, 4, 0);
    gl.enableVertexAttribArray(xPos);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO2);
    gl.bufferData(gl.ARRAY_BUFFER, verticesY, gl.STATIC_DRAW);
    var yPos = gl.getAttribLocation(shaderProgram, "yPos");
    gl.vertexAttribPointer(yPos, 1, gl.FLOAT, false, 4, 0);
    gl.enableVertexAttribArray(yPos);

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
    gl.drawArrays(gl.LINE_STRIP, 0, numPoints);
}


