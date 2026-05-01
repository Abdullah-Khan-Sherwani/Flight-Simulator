"use strict";

var gl = null;
var vertexShader = null;
var fragmentShader = null;
var program = null;

var vertexShaderSource = `#version 300 es
in  vec3 aPosition;
void main()
{
    gl_Position = vec4(aPosition, 1.0); 
}`

var fragmentShaderSource = `#version 300 es
precision mediump float; 
out vec4 fColor;
void main()
{
    fColor = vec4(1.0, 0.0, 0.0, 1.0);
}`
// Set default text
document.getElementById("shaderInput").value = fragmentShaderSource;

// Main function
window.onload = function init() {
  var canvas = document.getElementById("gl-canvas");

  gl = canvas.getContext("webgl2");
  if (!gl) {
    alert("WebGL 2.0 isn't available");
  }

  var vertices = new Float32Array([
     1.0,  1.0,  0.0, // top right
     1.0, -1.0,  0.0, // bottom right
    -1.0, -1.0,  0.0, // bottom left
    -1.0,  1.0,  0.0, // top left
  ]);
  var indices = new Uint16Array([
    // note that we start from 0!
    0, 1, 3, // first Triangle
    1, 2, 3, // second Triangle
  ]);

  //  Configure WebGL
  //
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(1.0, 1.0, 1.0, 1.0);

  //  Load shaders and initialize attribute buffers
  vertexShader = compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
  fragmentShader = compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
  program = createProgram(gl, vertexShader, fragmentShader);
  gl.useProgram(program);

  // Load the data into the GPU
  var vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  // Associate out shader variables with our data buffer
  var aPosition = gl.getAttribLocation(program, "aPosition");
  gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(aPosition);

  requestAnimationFrame(render);
};

function render() {
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

  requestAnimationFrame(render);  
}

// Update shader button event handler: Recompile and reload the fragment shader
document.getElementById("updateShaderBtn").onclick = function() {
    gl.detachShader(program, fragmentShader);
    gl.deleteShader(fragmentShader);
    const fragmentShaderSource = document.getElementById("shaderInput").value.trim();
    fragmentShader = compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
};

// Helper function to compile a shader.
function compileShader(gl, shaderSource, shaderType) {
  // Create the shader object
  var shader = gl.createShader(shaderType);

  // Set the shader source code.
  gl.shaderSource(shader, shaderSource);

  // Compile the shader
  gl.compileShader(shader);

  // Check if it compiled
  var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!success) {
    // Something went wrong during compilation; get the error
    throw "could not compile shader:" + gl.getShaderInfoLog(shader);
  }

  return shader;
}

// Helper function to create a program.
function createProgram(gl, vertexShader, fragmentShader) {
    // create a program.
    var program = gl.createProgram();
    
    // attach the shaders.
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    
    // link the program.
    gl.linkProgram(program);
    
    // Check if it linked.
    var success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!success) {
        // something went wrong with the link; get the error
        throw ("program failed to link:" + gl.getProgramInfoLog(program));
    }
    
    return program;
};

