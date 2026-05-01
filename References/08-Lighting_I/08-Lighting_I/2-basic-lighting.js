"use strict";

let gl;             // global variable for WebGL context
let cubeShader;     // cube shader program object
let lampShader;     // lamp shader program object
let cubeVAO;        // vertex array object for cube
let lampVAO;        // vertex array object for lamp

let attribLocs = {};   // attributes and uniform locations

const FLOAT_SIZE = Float32Array.BYTES_PER_ELEMENT;

const vertexShaderSource = `#version 300 es
    in vec3 aPos;
    in vec3 aNormal;

    uniform mat4 model;
    uniform mat4 view;
    uniform mat4 projection;
    out vec3 FragPos;
    out vec3 Normal;

    void main()
    {
        FragPos = vec3(model * vec4(aPos, 1.0)); 
        Normal = aNormal;
        gl_Position = projection * view * vec4(FragPos, 1.0);
    }`;

const cubeFragmentShaderSource = `#version 300 es
    precision mediump float;
    in vec3 Normal;
    in vec3 FragPos;

    uniform vec3 objectColor; 
    uniform vec3 lightColor;
    uniform vec3 lightPos;
    uniform vec3 viewPos;

    out vec4 FragColor;

    void main()
    {
        // ambient
        float ambientStrength = 0.1;
        vec3 ambient = ambientStrength * lightColor;

        // diffuse
        vec3 norm = normalize(Normal);
        vec3 lightDir = normalize(lightPos - FragPos);
        float diff = max(dot(norm, lightDir), 0.0); 
        vec3 diffuse = diff * lightColor;

        // specular
        float specularStrength = 0.5;
        vec3 viewDir = normalize(viewPos - FragPos); 
        vec3 reflectDir = reflect(-lightDir, norm);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0); 
        vec3 specular = specularStrength * spec * lightColor;

        // combine results
        vec3 result = (ambient+diffuse+specular) * objectColor;
        FragColor = vec4(result, 1.0);
    }`;

const lampFragmentShaderSource = `#version 300 es
    precision mediump float;
    out vec4 FragColor;
    void main()
    {
        FragColor = vec4(1.0); // set all 4 vector values to 1.0
    }`;

function initBuffers() {
    // set up vertex data (and buffer(s)) and configure vertex attributes
    const vertices = new Float32Array([
        -0.5,  -0.5,  -0.5,   0.0,   0.0,  -1.0,
         0.5,  -0.5,  -0.5,   0.0,   0.0,  -1.0,
         0.5,   0.5,  -0.5,   0.0,   0.0,  -1.0,
         0.5,   0.5,  -0.5,   0.0,   0.0,  -1.0,
        -0.5,   0.5,  -0.5,   0.0,   0.0,  -1.0,
        -0.5,  -0.5,  -0.5,   0.0,   0.0,  -1.0,
        -0.5,  -0.5,   0.5,   0.0,   0.0,   1.0,
         0.5,  -0.5,   0.5,   0.0,   0.0,   1.0,
         0.5,   0.5,   0.5,   0.0,   0.0,   1.0,
         0.5,   0.5,   0.5,   0.0,   0.0,   1.0,
        -0.5,   0.5,   0.5,   0.0,   0.0,   1.0,
        -0.5,  -0.5,   0.5,   0.0,   0.0,   1.0,
        -0.5,   0.5,   0.5,  -1.0,   0.0,   0.0,
        -0.5,   0.5,  -0.5,  -1.0,   0.0,   0.0,
        -0.5,  -0.5,  -0.5,  -1.0,   0.0,   0.0,
        -0.5,  -0.5,  -0.5,  -1.0,   0.0,   0.0,
        -0.5,  -0.5,   0.5,  -1.0,   0.0,   0.0,
        -0.5,   0.5,   0.5,  -1.0,   0.0,   0.0,
         0.5,   0.5,   0.5,   1.0,   0.0,   0.0,
         0.5,   0.5,  -0.5,   1.0,   0.0,   0.0,
         0.5,  -0.5,  -0.5,   1.0,   0.0,   0.0,
         0.5,  -0.5,  -0.5,   1.0,   0.0,   0.0,
         0.5,  -0.5,   0.5,   1.0,   0.0,   0.0,
         0.5,   0.5,   0.5,   1.0,   0.0,   0.0,
        -0.5,  -0.5,  -0.5,   0.0,  -1.0,   0.0,
         0.5,  -0.5,  -0.5,   0.0,  -1.0,   0.0,
         0.5,  -0.5,   0.5,   0.0,  -1.0,   0.0,
         0.5,  -0.5,   0.5,   0.0,  -1.0,   0.0,
        -0.5,  -0.5,   0.5,   0.0,  -1.0,   0.0,
        -0.5,  -0.5,  -0.5,   0.0,  -1.0,   0.0,
        -0.5,   0.5,  -0.5,   0.0,   1.0,   0.0,
         0.5,   0.5,  -0.5,   0.0,   1.0,   0.0,
         0.5,   0.5,   0.5,   0.0,   1.0,   0.0,
         0.5,   0.5,   0.5,   0.0,   1.0,   0.0,
        -0.5,   0.5,   0.5,   0.0,   1.0,   0.0,
        -0.5,   0.5,  -0.5,   0.0,   1.0,   0.0
    ]);

// create vertex array object (vao) for cube and bind it
    cubeVAO = gl.createVertexArray();
    gl.bindVertexArray(cubeVAO);

    // create and bind vertex buffer object (vbo)
    const VBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // linking vertex attributes for cube shader program
    gl.vertexAttribPointer(attribLocs.aPosCube, 3, gl.FLOAT, false, 6 * FLOAT_SIZE, 0);
    gl.enableVertexAttribArray(attribLocs.aPosCube);
    gl.vertexAttribPointer(attribLocs.aNormal, 3, gl.FLOAT, false, 6 * FLOAT_SIZE, 3 * FLOAT_SIZE);
    gl.enableVertexAttribArray(attribLocs.aNormal);

    // create vertex array object (vao) for lamp and bind it
    lampVAO = gl.createVertexArray();
    gl.bindVertexArray(lampVAO);

    // we only need to bind to the VBO, the container's VBO's data already
    // contains the correct data.
    gl.bindBuffer(gl.ARRAY_BUFFER, VBO);

    // set the vertex attributes (only position data for our lamp)
    gl.vertexAttribPointer(attribLocs.aPosLamp, 3, gl.FLOAT, false, 6 * FLOAT_SIZE, 0);
    gl.enableVertexAttribArray(attribLocs.aPosLamp);
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
    lampShader = initShaderProgram(vertexShaderSource, lampFragmentShaderSource);
    cubeShader = initShaderProgram(vertexShaderSource, cubeFragmentShaderSource);

    // initialize uniform locations
    gl.useProgram(cubeShader);
    attribLocs = {
        aPosCube:       gl.getAttribLocation(cubeShader, "aPos"),
        aNormal:        gl.getAttribLocation(cubeShader, "aNormal"),
        objectColor:    gl.getUniformLocation(cubeShader, "objectColor"),
        lightColor:     gl.getUniformLocation(cubeShader, "lightColor"),
        lightPos:       gl.getUniformLocation(cubeShader, "lightPos"),
        viewPos:        gl.getUniformLocation(cubeShader, "viewPos"),
        modelCube:      gl.getUniformLocation(cubeShader, "model"),
        viewCube:       gl.getUniformLocation(cubeShader, "view"),
        projectionCube: gl.getUniformLocation(cubeShader, "projection"),
    };
    gl.useProgram(lampShader);
    Object.assign(attribLocs, {
        aPosLamp:       gl.getAttribLocation(lampShader, "aPos"),
        modelLamp:      gl.getUniformLocation(lampShader, "model"),
        viewLamp:       gl.getUniformLocation(lampShader, "view"),
        projectionLamp: gl.getUniformLocation(lampShader, "projection"),
    });

    // initialize vertex data and configure cube and lamp vertex attributes
    // needs attributes locations, so we have to do this after initializing shader programs and attribute locations
    initBuffers();

    // setting up camera and light positions
    const lightPos = glMatrix.vec3.fromValues(1.2, 1, 2.2);
    const viewPos = glMatrix.vec3.fromValues(3, 3, 3);
    const camera = new Camera({ 
        position: viewPos, 
        up: glMatrix.vec3.fromValues(0, 1, 0), 
        yaw: -135, 
        pitch: -35, 
    });

    // setting up uniforms for cube shader program (we only need to do this once since we won't be updating them in the render loop)
    gl.useProgram(cubeShader);
    gl.uniform3f(attribLocs.objectColor, 1.0, 0.5, 0.31);
    gl.uniform3f(attribLocs.lightColor, 1.0, 1.0, 1.0);
    gl.uniform3fv(attribLocs.lightPos, lightPos);
    gl.uniform3fv(attribLocs.viewPos, viewPos);

    const cubeTransform = {
        model: glMatrix.mat4.create(), 
        view: camera.getViewMatrix(), 
        projection: glMatrix.mat4.create(),
    };
    glMatrix.mat4.perspective(cubeTransform.projection,
        glMatrix.glMatrix.toRadian(45.0),          // 45° field of view
        canvas.clientWidth / canvas.clientHeight,  // aspect ratio (800/600)
        0.1,                                       // near plane
        100.0                                      // far plane
    );    
    gl.uniformMatrix4fv(attribLocs.modelCube, false, cubeTransform.model);
    gl.uniformMatrix4fv(attribLocs.viewCube, false, cubeTransform.view);
    gl.uniformMatrix4fv(attribLocs.projectionCube, false, cubeTransform.projection);

    // setting up lamp shader uniforms
    gl.useProgram(lampShader);
    const lampTransform = {
        model: glMatrix.mat4.create(), 
        view: cubeTransform.view, 
        projection: cubeTransform.projection, 
    };
    glMatrix.mat4.translate(lampTransform.model, lampTransform.model, lightPos);
    glMatrix.mat4.scale(lampTransform.model, lampTransform.model, glMatrix.vec3.fromValues(0.2, 0.2, 0.2)); // a smaller cube
    gl.uniformMatrix4fv(attribLocs.modelLamp, false, lampTransform.model);
    gl.uniformMatrix4fv(attribLocs.viewLamp, false, lampTransform.view);
    gl.uniformMatrix4fv(attribLocs.projectionLamp, false, lampTransform.projection);

    // render loop
    requestAnimationFrame(render);
};


function render(timestamp) {
    // clear color and depth buffers
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // activate the cube shader program and cube VAO to draw the cube
    gl.useProgram(cubeShader);
    gl.bindVertexArray(cubeVAO);

    // draw the cube
    gl.drawArrays(gl.TRIANGLES, 0, 36);

    // activate the lamp shader program and lamp VAO to draw the lamp
    gl.useProgram(lampShader);
    gl.bindVertexArray(lampVAO);

    // draw the lamp
    gl.drawArrays(gl.TRIANGLES, 0, 36);

    requestAnimationFrame(render);
}

