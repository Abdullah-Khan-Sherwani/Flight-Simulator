"use strict";
var gl;
var shaderProgram;
var VAO;
var texture;
var timeLoc;

window.onload = function init() {
    var canvas = document.getElementById("gl-canvas");

    gl = canvas.getContext("webgl2");
    if (!gl) {
      alert("WebGL 2.0 isn't available");
    }

    // load and compile vertex shader
    const vertexShaderSource = `#version 300 es
        in vec3 aPos;
        in vec2 aTexCoord;

        out vec2 TexCoord;
        uniform float time; 

        void main()
        {
            float t=sin(time/3.0)*0.5+0.5; 
            vec2 dir=vec2(0.0)-aPos.xy;

            gl_Position=vec4(aPos.xy+t*dir, aPos.z, 1.0);
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
        uniform sampler2D ourTexture; 
        void main()
        {
            FragColor = texture(ourTexture, TexCoord);
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
        // position      // texture coords
         0.5,  0.5, 0.0, 1.0, 1.0, // top right
         0.5, -0.5, 0.0, 1.0, 0.0, // bottom right
        -0.5, -0.5, 0.0, 0.0, 0.0, // bottom left
        -0.5,  0.5, 0.0, 0.0, 1.0  // top left
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

    // create texture mipmaps
    texture = setupTextureMipMaps(gl, gl.TEXTURE0, ["ln1.png", "ln2.png", "ln3.png", "ln4.png"] , false, [0, 255, 0, 255], gl.LINEAR_MIPMAP_NEAREST, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);

    // which texture unit each shader sampler belongs to 
    var ourTextureLoc = gl.getUniformLocation(shaderProgram, "ourTexture");
    gl.uniform1i(ourTextureLoc, 0); // texture unit 0

    timeLoc = gl.getUniformLocation(shaderProgram, "time");

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
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // update the uniform time variable
    var time = performance.now() / 1000; // time in seconds
    gl.uniform1f(timeLoc, time);

    // draw the triangle
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0);

    requestAnimationFrame(render);
}


function setupTextureMipMaps(gl, textureUnit, 
    imgsSrcList, flipY=true, placeholderColor = [0, 0, 0, 255], 
    minFilter = gl.NEAREST_MIPMAP_LINEAR, magFilter = gl.LINEAR, 
    wrapS = gl.REPEAT, wrapT = gl.REPEAT) {
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

    var imagesLoaded = 0;
    var imgList = new Array(imgsSrcList.length);
    // Asynchronously load images
    for (let i = 0; i < imgsSrcList.length; i++) {
        imgList[i] = new Image();
        imgList[i].src = imgsSrcList[i];
        imgList[i].addEventListener('load', function() {
            imagesLoaded++;
            if (imagesLoaded === imgsSrcList.length) {
                console.log("All images loaded");
                gl.activeTexture(textureUnit);
                gl.bindTexture(gl.TEXTURE_2D, texture);
                // set pyramid level (no. of images - 1) 
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, imgsSrcList.length - 1);

                for (let j = 0; j < imgList.length; j++) {
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY); 
                    gl.texImage2D(gl.TEXTURE_2D, j, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgList[j]);
                }
            }
        });
    }   
    return texture;
}

