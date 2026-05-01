"use strict";

let gl;             // global variable for WebGL context
let shaderProgram;  // shader program object
let VAO;            // vertex array object 
let indices;        // indices for gl.drawElements

let attribLocs = {};   // attributes and uniform locations

const FLOAT_SIZE = Float32Array.BYTES_PER_ELEMENT;

const vertexShaderSource = `#version 300 es
    in vec3 aPos;

    out vec3 FragPos;
    out vec3 Normal;

    uniform mat4 model; 
    uniform mat4 view; 
    uniform mat4 projection;
    
    uniform float timer;

    void main() {
        float x=aPos.x; 
        float y=aPos.y;
        //float z=cos(2.0 * sqrt(x * x + y * y));
        float z=cos(2.0*sqrt(x * x + y * y) + 2.0 * timer);

        FragPos = vec3(model * vec4(x, y, z, 1.0)); 
        gl_Position = projection * view * vec4(FragPos, 1.0);

        //float derive_x = -2.0 * x / sqrt(x * x + y * y) * sin(2.0 * sqrt(x * x + y * y)); 
        //float derive_y = -2.0 * y / sqrt(x * x + y * y) * sin(2.0 * sqrt(x * x + y * y));
        float derive_x = -2.0 * x / sqrt(x * x + y * y) * sin(2.0 * sqrt(x * x + y * y) + 2.0 * timer);
        float derive_y = -2.0 * y / sqrt(x * x + y * y) * sin(2.0 * sqrt(x * x + y * y) + 2.0 * timer);

        vec3 t1 = vec3(1.0, 0.0, derive_x); 
        vec3 t2 = vec3(0.0, 1.0, derive_y); 
        vec3 normal = normalize(cross(t1, t2));

        Normal = transpose(inverse(mat3(model))) * normal;
    }`;

const fragmentShaderSource = `#version 300 es
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

function initBuffers() {
    // set up vertex data (and buffer(s)) and configure vertex attributes
    const numPoints_x = 100;
    const numPoints_y = 100;

    const vertices = new Float32Array(3 * numPoints_x * numPoints_y);
    for (let i = 0; i < numPoints_x; i++) {
        for (let j = 0; j < numPoints_y; j++) {
            let x = 10 * (i / (numPoints_x - 1) - 0.5); // x in [-5,5]
            let y = 10 * (j / (numPoints_y - 1) - 0.5); // y in [-5,5]
            vertices[3 * (i * numPoints_y + j) + 0] = x;
            vertices[3 * (i * numPoints_y + j) + 1] = y;
            vertices[3 * (i * numPoints_y + j) + 2] = 0.0;
        }
    }

    indices = new Uint32Array(3 * (numPoints_x - 1) * (numPoints_y - 1) * 2);
    for (let i = 0; i < numPoints_x - 1; i++) {
        for (let j = 0; j < numPoints_y - 1; j++) {
            const curIndex = 6 * (i * (numPoints_y - 1) + j);
            indices[curIndex + 0] = i * numPoints_y + j;
            indices[curIndex + 1] = i * numPoints_y + j + 1;
            indices[curIndex + 2] = (i + 1) * numPoints_y + j + 1;
            indices[curIndex + 3] = i * numPoints_y + j;
            indices[curIndex + 4] = (i + 1) * numPoints_y + j;
            indices[curIndex + 5] = (i + 1) * numPoints_y + j + 1;
        }
    }

    // create vertex array object (vao) and bind it
    VAO = gl.createVertexArray();
    gl.bindVertexArray(VAO);

    // create and bind VBO and EBO (vertex data and indices data)
    const VBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const EBO = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, EBO);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // linking vertex attributes for cube shader program
    gl.vertexAttribPointer(attribLocs.aPos, 3, gl.FLOAT, false, 3 * FLOAT_SIZE, 0);
    gl.enableVertexAttribArray(attribLocs.aPos);
}


window.onload = function init() {
    const canvas = document.getElementById("gl-canvas");

    gl = canvas.getContext("webgl2");
    if (!gl) {
        alert("WebGL 2.0 isn't available");
    }

    // set clear color
    gl.clearColor(0.15, 0.15, 0.15, 1.0);

    // set viewport size to match canvas dimensions
    gl.viewport(0, 0, canvas.clientWidth, canvas.clientHeight);

    // enable depth testing
    gl.enable(gl.DEPTH_TEST);

    // initialize shaders and shader program
    shaderProgram = initShaderProgram(vertexShaderSource, fragmentShaderSource);

    // initialize uniform locations
    gl.useProgram(shaderProgram);
    attribLocs = {
        aPos:       gl.getAttribLocation(shaderProgram, "aPos"),
        aNormal:        gl.getAttribLocation(shaderProgram, "aNormal"),
        viewPos:        gl.getUniformLocation(shaderProgram, "viewPos"),
        timer:          gl.getUniformLocation(shaderProgram, "timer"),
        modelCube:      gl.getUniformLocation(shaderProgram, "model"),
        viewCube:       gl.getUniformLocation(shaderProgram, "view"),
        projectionCube: gl.getUniformLocation(shaderProgram, "projection"),
        lightPos:       gl.getUniformLocation(shaderProgram, "light.position"),
        lightAmbient:   gl.getUniformLocation(shaderProgram, 'light.ambient'),
        lightDiffuse:   gl.getUniformLocation(shaderProgram, 'light.diffuse'),
        lightSpecular:  gl.getUniformLocation(shaderProgram, 'light.specular'),
        materialAmbient:   gl.getUniformLocation(shaderProgram, 'material.ambient'),
        materialDiffuse:   gl.getUniformLocation(shaderProgram, 'material.diffuse'),
        materialSpecular:  gl.getUniformLocation(shaderProgram, 'material.specular'),
        materialShininess: gl.getUniformLocation(shaderProgram, 'material.shininess'),
    };

    // initialize vertex data and configure cube and lamp vertex attributes
    // needs attributes locations, so we have to do this after initializing shader programs and attribute locations
    initBuffers();

    // setting up camera and light positions
    const lightPos = glMatrix.vec3.fromValues(1.5, 5, 5);
    const viewPos = glMatrix.vec3.fromValues(8, 8, 8);
    const camera = new Camera({ 
        position: viewPos, 
        up: glMatrix.vec3.fromValues(0, 1, 0), 
        yaw: -135, 
        pitch: -35, 
    });

    // setting up uniforms 
    gl.useProgram(shaderProgram);
    gl.uniform3fv(attribLocs.viewPos, viewPos);
    gl.uniform3f(attribLocs.materialAmbient,   1.0, 0.5, 0.31);
    gl.uniform3f(attribLocs.materialDiffuse,   1.0, 0.5, 0.31);
    gl.uniform3f(attribLocs.materialSpecular,  0.5, 0.5, 0.5);
    gl.uniform1f(attribLocs.materialShininess, 32.0);
    const lightColor = glMatrix.vec3.fromValues(2.0, 0.5, 0.5);
    const diffuseColor = glMatrix.vec3.create();
    glMatrix.vec3.scale(diffuseColor, lightColor, 0.5);
    const ambientColor = glMatrix.vec3.create();
    glMatrix.vec3.scale(ambientColor, diffuseColor, 0.2);
    gl.uniform3fv(attribLocs.lightAmbient, ambientColor);
    gl.uniform3fv(attribLocs.lightDiffuse, diffuseColor);
    gl.uniform3f(attribLocs.lightSpecular, 1.0, 1.0, 1.0);

    const Transforms = {
        model: glMatrix.mat4.create(), 
        view: camera.getViewMatrix(), 
        projection: glMatrix.mat4.create(),
    };
    glMatrix.mat4.rotateX(Transforms.model, Transforms.model, glMatrix.glMatrix.toRadian(-90.0));
    glMatrix.mat4.perspective(Transforms.projection,
        glMatrix.glMatrix.toRadian(45.0),          // 45° field of view
        canvas.clientWidth / canvas.clientHeight,  // aspect ratio (800/600)
        0.1,                                       // near plane
        100.0                                      // far plane
    );    
    gl.uniformMatrix4fv(attribLocs.modelCube, false,Transforms.model);
    gl.uniformMatrix4fv(attribLocs.viewCube, false, Transforms.view);
    gl.uniformMatrix4fv(attribLocs.projectionCube, false, Transforms.projection);
    gl.uniform3fv(attribLocs.lightPos, lightPos);

    // render loop
    requestAnimationFrame(render);
};


function render(timestamp) {
    // clear color and depth buffers
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // activate the cube shader program and cube VAO to draw the cube
    gl.useProgram(shaderProgram);
    gl.bindVertexArray(VAO);

    gl.uniform1f(attribLocs.timer, timestamp / 1000.0);
    
    // draw
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0);

    requestAnimationFrame(render);
}

