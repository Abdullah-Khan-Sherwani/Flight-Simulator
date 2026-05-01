"use strict";
var gl;
var shaderProgram;
var VAO;
var texture;

window.onload = function init() {
    var canvas = document.getElementById("gl-canvas");

    gl = canvas.getContext("webgl2");
    if (!gl) {
      alert("WebGL 2.0 isn't available");
    }

    // load and compile vertex shader
const vertexShaderSource = `#version 300 es
    in vec3 aPos;
    in vec3 aColor;
    in vec2 aTexCoord;

    out vec3 ourColor;
    out vec2 TexCoord;

    void main()
    {
        gl_Position = vec4(aPos, 1.0); 
        ourColor = aColor;
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

        in vec3 ourColor; 
        in vec2 TexCoord;

        // texture sampler
        uniform sampler2D texture1;

        void main()
        {
            FragColor = texture(texture1, TexCoord)*vec4(ourColor, 1.0);
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
        // position      // colors      // texture coords
         0.5,  0.5, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, // top right
         0.5, -0.5, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, // bottom right
        -0.5, -0.5, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, // bottom left
        -0.5,  0.5, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0  // top left
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
    const FLOAT_SIZE = Float32Array.BYTES_PER_ELEMENT;
    var aPos = gl.getAttribLocation(shaderProgram, "aPos");
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 8 * FLOAT_SIZE, 0);
    gl.enableVertexAttribArray(aPos);

    var aColor = gl.getAttribLocation(shaderProgram, "aColor");
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 8 * FLOAT_SIZE, 3 * FLOAT_SIZE);
    gl.enableVertexAttribArray(aColor);

    var aTexCoord = gl.getAttribLocation(shaderProgram, "aTexCoord");
    gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 8 * FLOAT_SIZE, 6 * FLOAT_SIZE);
    gl.enableVertexAttribArray(aTexCoord);

    // Create a texture
    texture = gl.createTexture();
    //gl.activeTexture(gl.TEXTURE0); // no need to activate texture unit 0, it's the default
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Fill the texture with a 1x1 blue pixel (placeholder)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                new Uint8Array([0, 0, 255, 255]));

    // Asynchronously load an image
    var bricks = new Image();
    bricks.src = "bricks.png";
    bricks.addEventListener('load', function() {
        // Once image loads, copy it to the texture
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bricks);
        gl.generateMipmap(gl.TEXTURE_2D);
    });

    // set clear color 
    gl.clearColor(0.2, 0.3, 0.3, 1.0);

    render();
};

function render() {
    // clear the buffer  
    gl.clear(gl.COLOR_BUFFER_BIT);

    // activate the program object
    gl.useProgram(shaderProgram);

    // bind the VAO
    gl.bindVertexArray(VAO); 
    
    // bind the texture, automatically uses texture unit 0
    gl.bindTexture(gl.TEXTURE_2D, texture); 

    // draw the triangle
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0);

    requestAnimationFrame(render);
}


