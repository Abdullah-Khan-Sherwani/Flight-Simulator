"use strict";

let gl;             // global variable for WebGL context
let cubeShader;     // cube shader program object
let lampShader;     // lamp shader program object
let cubeVAO;        // vertex array object for cube
let lampVAO;        // vertex array object for lamp

let attribLocs = {};   // attributes and uniform locations

const keys = {};         // object to track which keys are currently pressed
let deltaTime = 0.0;   // time between current frame and last frame, used for consistent movement speed
let lastFrame = 0.0;   // timestamp of last frame, used to calculate deltaTime

let lightPos;
const lampTransform = {};

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

    struct Material { 
        vec3 ambient; 
        vec3 diffuse; 
        vec3 specular; 
        float shininess;
    };
    uniform Material material;
    
    struct Light {
        vec3 position;
        vec3 ambient; 
        vec3 diffuse; 
        vec3 specular;
    };
    uniform Light light;

    uniform vec3 viewPos;

    out vec4 FragColor;

    void main() {
        // ambient
        vec3 ambient = light.ambient * material.ambient;

        // diffuse
        vec3 norm = normalize(Normal);
        vec3 lightDir = normalize(light.position - FragPos); 
        float diff = max(dot(norm, lightDir), 0.0);
        vec3 diffuse = light.diffuse * (diff * material.diffuse); 

        // specular
        vec3 viewDir = normalize(viewPos - FragPos); 
        vec3 reflectDir = reflect(-lightDir, norm);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), material.shininess);
        vec3 specular = light.specular * (spec * material.specular);

        // result
        vec3 result = ambient + diffuse + specular; 
        FragColor = vec4(result, 1.0);
    }`;

const lampFragmentShaderSource = `#version 300 es
    precision mediump float;
    uniform vec3 lightColor;
    out vec4 FragColor;
    void main()
    {
        FragColor = vec4(lightColor, 1.0); 
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
        viewPos:        gl.getUniformLocation(cubeShader, "viewPos"),
        modelCube:      gl.getUniformLocation(cubeShader, "model"),
        viewCube:       gl.getUniformLocation(cubeShader, "view"),
        projectionCube: gl.getUniformLocation(cubeShader, "projection"),
        lightPos:       gl.getUniformLocation(cubeShader, "light.position"),
        lightAmbient:   gl.getUniformLocation(cubeShader, 'light.ambient'),
        lightDiffuse:   gl.getUniformLocation(cubeShader, 'light.diffuse'),
        lightSpecular:  gl.getUniformLocation(cubeShader, 'light.specular'),
        materialAmbient:   gl.getUniformLocation(cubeShader, 'material.ambient'),
        materialDiffuse:   gl.getUniformLocation(cubeShader, 'material.diffuse'),
        materialSpecular:  gl.getUniformLocation(cubeShader, 'material.specular'),
        materialShininess: gl.getUniformLocation(cubeShader, 'material.shininess'),
    };
    gl.useProgram(lampShader);
    Object.assign(attribLocs, {
        aPosLamp:       gl.getAttribLocation(lampShader, "aPos"),
        lightColor:     gl.getUniformLocation(lampShader, "lightColor"),
        modelLamp:      gl.getUniformLocation(lampShader, "model"),
        viewLamp:       gl.getUniformLocation(lampShader, "view"),
        projectionLamp: gl.getUniformLocation(lampShader, "projection"),
    });

    // initialize vertex data and configure cube and lamp vertex attributes
    // needs attributes locations, so we have to do this after initializing shader programs and attribute locations
    initBuffers();

    // setting up camera and light positions
    lightPos = glMatrix.vec3.fromValues(1.2, 1, 2.2);
    const viewPos = glMatrix.vec3.fromValues(3, 3, 3);
    const camera = new Camera({ 
        position: viewPos, 
        up: glMatrix.vec3.fromValues(0, 1, 0), 
        yaw: -135, 
        pitch: -35, 
    });

    // setting up uniforms for cube shader program (we only need to do this once since we won't be updating them in the render loop)
    gl.useProgram(cubeShader);
    gl.uniform3fv(attribLocs.viewPos, viewPos);
    gl.uniform3f(attribLocs.lightSpecular, 1.0, 1.0, 1.0);
    gl.uniform3f(attribLocs.materialAmbient,   1.0, 0.5, 0.31);
    gl.uniform3f(attribLocs.materialDiffuse,   1.0, 0.5, 0.31);
    gl.uniform3f(attribLocs.materialSpecular,  0.5, 0.5, 0.5);
    gl.uniform1f(attribLocs.materialShininess, 32.0);

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

    // setting up lamp transform (we'll update the model matrix in the render loop since the lamp will be moving)
    lampTransform.view = cubeTransform.view;
    lampTransform.projection = cubeTransform.projection;

    // set up event listener fors moving lamp position 
    window.addEventListener('keydown', e => keys[e.key] = true);
    window.addEventListener('keyup',   e => keys[e.key] = false);

    // render loop
    requestAnimationFrame(render);
};


function render(timestamp) {
    // calculate delta time for consistent movement speed
    const currentFrame = timestamp / 1000.0; // convert to seconds
    deltaTime = currentFrame - lastFrame;
    lastFrame = currentFrame;

    // handle input for moving light position
    const speed = 2.5 * deltaTime; // adjust speed based on delta time
    if (keys['q'] || keys['Q']) // Q - move +x direction
        glMatrix.vec3.scaleAndAdd(lightPos, lightPos, glMatrix.vec3.fromValues(1, 0, 0), speed);    
    if (keys['w'] || keys['W']) // W - move -x direction
        glMatrix.vec3.scaleAndAdd(lightPos, lightPos, glMatrix.vec3.fromValues(1, 0, 0), -speed);
    if (keys['a'] || keys['A']) // A - move +y direction
        glMatrix.vec3.scaleAndAdd(lightPos, lightPos, glMatrix.vec3.fromValues(0, 1, 0), speed);
    if (keys['s'] || keys['S']) // S - move -y direction
        glMatrix.vec3.scaleAndAdd(lightPos, lightPos, glMatrix.vec3.fromValues(0, 1, 0), -speed);
    if (keys['z'] || keys['Z']) // Z - move +z direction
        glMatrix.vec3.scaleAndAdd(lightPos, lightPos, glMatrix.vec3.fromValues(0, 0, 1), speed);
    if (keys['x'] || keys['X']) // X - move -z direction
        glMatrix.vec3.scaleAndAdd(lightPos, lightPos, glMatrix.vec3.fromValues(0, 0, 1), -speed);

    // clear color and depth buffers
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // activate the cube shader program and cube VAO to draw the cube
    gl.useProgram(cubeShader);
    gl.bindVertexArray(cubeVAO);

    // update uniforms for cube shader program
    gl.uniform3fv(attribLocs.lightPos, lightPos);
    const lightColor = glMatrix.vec3.fromValues(
        Math.sin(currentFrame * 2.0),
        Math.sin(currentFrame * 0.7),
        Math.sin(currentFrame * 1.3)
    );
    const diffuseColor = glMatrix.vec3.create();
    glMatrix.vec3.scale(diffuseColor, lightColor, 0.5);
    const ambientColor = glMatrix.vec3.create();
    glMatrix.vec3.scale(ambientColor, diffuseColor, 0.2);
    
    gl.uniform3fv(attribLocs.lightAmbient, ambientColor);
    gl.uniform3fv(attribLocs.lightDiffuse, diffuseColor);

    // draw the cube
    gl.drawArrays(gl.TRIANGLES, 0, 36);

    // activate the lamp shader program and lamp VAO to draw the lamp
    gl.useProgram(lampShader);
    gl.bindVertexArray(lampVAO);

    // setting up lamp shader uniforms
    gl.uniform3fv(attribLocs.lightColor, lightColor);
    lampTransform.model = glMatrix.mat4.create();
    glMatrix.mat4.translate(lampTransform.model, lampTransform.model, lightPos);
    glMatrix.mat4.scale(lampTransform.model, lampTransform.model, glMatrix.vec3.fromValues(0.2, 0.2, 0.2)); // a smaller cube
    gl.uniformMatrix4fv(attribLocs.modelLamp, false, lampTransform.model);
    gl.uniformMatrix4fv(attribLocs.viewLamp, false, lampTransform.view);
    gl.uniformMatrix4fv(attribLocs.projectionLamp, false, lampTransform.projection);

    // draw the lamp
    gl.drawArrays(gl.TRIANGLES, 0, 36);

    requestAnimationFrame(render);
}

