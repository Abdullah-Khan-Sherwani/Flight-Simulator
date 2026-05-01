"use strict";
var gl;
var shaderProgram;
var VAO;
var texture0, texture1;

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
        // positions      // texture coords
        5.0,   5.0, 10.0, 1.0, 1.0, // top right
        5.0,  10.0, 10.0, 1.0, 0.0, // bottom right 
        10.0, 10.0, 10.0, 0.0, 0.0, // bottom left
        10.0,  5.0, 10.0, 0.0, 1.0  // top left
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

    var model = glMatrix.mat4.create(); 
    glMatrix.mat4.rotate(model, model, glMatrix.glMatrix.toRadian(-30.0), [1.0, 0.0, 0.0]);
    glMatrix.mat4.scale(model, model, [5.0, 5.0, 5.0]);
    glMatrix.mat4.translate(model, model, [-7.5, -7.5, -10.0]);

    var view = glMatrix.mat4.create(); 
    const r1 = [1, 0, 0, 0];
    const r2 = [0, 0, 1, 0];
    const r3 = [0, 1, 0, 0];
    const r4 = [0, 0, 0, 1];
    glMatrix.mat4.set(view,
        r1[0], r1[1], r1[2], r1[3],
        r2[0], r2[1], r2[2], r2[3],
        r3[0], r3[1], r3[2], r3[3],
        r4[0], r4[1], r4[2], r4[3]
    );

    var projection = glMatrix.mat4.create();
    glMatrix.mat4.ortho(projection, -15.0, 15.0, -10.0, 10.0, -12.0, 12.0);

    const modelLoc = gl.getUniformLocation(shaderProgram, "model");
    const viewLoc = gl.getUniformLocation(shaderProgram, "view");
    const projLoc = gl.getUniformLocation(shaderProgram, "projection");

    gl.uniformMatrix4fv(modelLoc, false, model);
    gl.uniformMatrix4fv(viewLoc, false, view);
    gl.uniformMatrix4fv(projLoc, false, projection);

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
    
    // bind the textures on corresponding texture units
    gl.activeTexture(gl.TEXTURE0); 
    gl.bindTexture(gl.TEXTURE_2D, texture0);
    gl.activeTexture(gl.TEXTURE1); 
    gl.bindTexture(gl.TEXTURE_2D, texture1);

    // draw the triangle
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0);

    requestAnimationFrame(render);
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