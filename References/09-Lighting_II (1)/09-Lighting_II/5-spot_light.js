"use strict";

let gl;             // global variable for WebGL context
let cubeShader;     // cube shader program object
let lampShader;     // lamp shader program object
let cubeVAO;        // vertex array object for cube

let diffuseMap;     // texture object for diffuse map
let specularMap;    // texture object for specular map
const MVPtransforms = {}; // model, view and projection matrices for cube and lamp
let camera;         // camera object 
let uniforms = {};   // uniform locations

const keys = {};         // object to track which keys are currently pressed
let deltaTime = 0.0;   // time between current frame and last frame, used for consistent movement speed
let previousTime = 0.0;   // timestamp of last frame, used to calculate deltaTime

const FLOAT_SIZE = Float32Array.BYTES_PER_ELEMENT;

const cubePositions = [
    [ 0.0,  0.0,   0.0],
    [ 2.0,  5.0, -15.0],
    [-1.5, -2.2,  -2.5],
    [-3.8, -2.0, -12.3],
    [ 2.4, -0.4,  -3.5],
    [-1.7,  3.0,  -7.5],
    [ 1.3, -2.0,  -2.5],
    [ 1.5,  2.0,  -2.5],
    [ 1.5,  0.2,  -1.5],
    [-1.3,  1.0,  -1.5]
];

const vertexShaderSource = `#version 300 es
    in vec3 aPos;
    in vec3 aNormal;
    in vec2 aTexCoords;

    uniform mat4 model;
    uniform mat4 view;
    uniform mat4 projection;
    out vec3 FragPos;
    out vec3 Normal;
    out vec2 TexCoords;

    void main()
    {
        FragPos = vec3(model * vec4(aPos, 1.0)); 
        Normal = aNormal;
        TexCoords = aTexCoords;
        gl_Position = projection * view * vec4(FragPos, 1.0);
    }`;

const cubeFragmentShaderSource = `#version 300 es
    precision mediump float;
    in vec3 Normal;
    in vec3 FragPos;
    in vec2 TexCoords;

    struct Material { 
        sampler2D diffuse; 
        sampler2D specular; 
        float shininess;
    };
    uniform Material material;
    
    struct Light {
        vec3 position;
        vec3 direction; 
        float cutOff;
        float outerCutOff;

        vec3 ambient; 
        vec3 diffuse; 
        vec3 specular;
        
        float constant; 
        float linear; 
        float quadratic;
    };
    uniform Light light;

    uniform vec3 viewPos;

    out vec4 FragColor;

    void main() {
        vec3 lightDir = normalize(light.position - FragPos); 
        float theta = dot(lightDir, normalize(-light.direction));
        float intensity = clamp((theta - light.outerCutOff) / (light.cutOff - light.outerCutOff), 0.0, 1.0);

        float distance	= length(light.position - FragPos);
        float attenuation = 1.0 / (light.constant + light.linear * distance + light.quadratic * (distance * distance));

        // ambient
        vec3 ambient = light.ambient * texture(material.diffuse, TexCoords).rgb;
        ambient *= attenuation;

        // diffuse
        vec3 norm = normalize(Normal);
        float diff = max(dot(norm, lightDir), 0.0);
        vec3 diffuse = light.diffuse * diff * texture(material.diffuse, TexCoords).rgb;
        diffuse *= attenuation;
        diffuse	*= intensity;

        // specular
        vec3 viewDir = normalize(viewPos - FragPos); 
        vec3 reflectDir = reflect(-lightDir, norm);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), material.shininess);
        vec3 specular = light.specular * spec * vec3(texture(material.specular, TexCoords));
        specular *= attenuation;
        specular *= intensity;

        // result
        vec3 result = ambient + diffuse + specular; 
        FragColor = vec4(result, 1.0);
    }`;

function initBuffers() {
    // set up vertex data (and buffer(s)) and configure vertex attributes
    const vertices = new Float32Array([
        // positions       // normals        // texture coords
        -0.5, -0.5, -0.5,  0.0,  0.0, -1.0,  0.0,  0.0,
         0.5, -0.5, -0.5,  0.0,  0.0, -1.0,  1.0,  0.0,
         0.5,  0.5, -0.5,  0.0,  0.0, -1.0,  1.0,  1.0,
         0.5,  0.5, -0.5,  0.0,  0.0, -1.0,  1.0,  1.0,
        -0.5,  0.5, -0.5,  0.0,  0.0, -1.0,  0.0,  1.0,
        -0.5, -0.5, -0.5,  0.0,  0.0, -1.0,  0.0,  0.0,

        -0.5, -0.5,  0.5,  0.0,  0.0,  1.0,  0.0,  0.0,
         0.5, -0.5,  0.5,  0.0,  0.0,  1.0,  1.0,  0.0,
         0.5,  0.5,  0.5,  0.0,  0.0,  1.0,  1.0,  1.0,
         0.5,  0.5,  0.5,  0.0,  0.0,  1.0,  1.0,  1.0,
        -0.5,  0.5,  0.5,  0.0,  0.0,  1.0,  0.0,  1.0,
        -0.5, -0.5,  0.5,  0.0,  0.0,  1.0,  0.0,  0.0,

        -0.5,  0.5,  0.5, -1.0,  0.0,  0.0,  1.0,  0.0,
        -0.5,  0.5, -0.5, -1.0,  0.0,  0.0,  1.0,  1.0,
        -0.5, -0.5, -0.5, -1.0,  0.0,  0.0,  0.0,  1.0,
        -0.5, -0.5, -0.5, -1.0,  0.0,  0.0,  0.0,  1.0,
        -0.5, -0.5,  0.5, -1.0,  0.0,  0.0,  0.0,  0.0,
        -0.5,  0.5,  0.5, -1.0,  0.0,  0.0,  1.0,  0.0,

         0.5,  0.5,  0.5,  1.0,  0.0,  0.0,  1.0,  0.0,
         0.5,  0.5, -0.5,  1.0,  0.0,  0.0,  1.0,  1.0,
         0.5, -0.5, -0.5,  1.0,  0.0,  0.0,  0.0,  1.0,
         0.5, -0.5, -0.5,  1.0,  0.0,  0.0,  0.0,  1.0,
         0.5, -0.5,  0.5,  1.0,  0.0,  0.0,  0.0,  0.0,
         0.5,  0.5,  0.5,  1.0,  0.0,  0.0,  1.0,  0.0,

        -0.5, -0.5, -0.5,  0.0, -1.0,  0.0,  0.0,  1.0,
         0.5, -0.5, -0.5,  0.0, -1.0,  0.0,  1.0,  1.0,
         0.5, -0.5,  0.5,  0.0, -1.0,  0.0,  1.0,  0.0,
         0.5, -0.5,  0.5,  0.0, -1.0,  0.0,  1.0,  0.0,
        -0.5, -0.5,  0.5,  0.0, -1.0,  0.0,  0.0,  0.0,
        -0.5, -0.5, -0.5,  0.0, -1.0,  0.0,  0.0,  1.0,

        -0.5,  0.5, -0.5,  0.0,  1.0,  0.0,  0.0,  1.0,
         0.5,  0.5, -0.5,  0.0,  1.0,  0.0,  1.0,  1.0,
         0.5,  0.5,  0.5,  0.0,  1.0,  0.0,  1.0,  0.0,
         0.5,  0.5,  0.5,  0.0,  1.0,  0.0,  1.0,  0.0,
        -0.5,  0.5,  0.5,  0.0,  1.0,  0.0,  0.0,  0.0,
        -0.5,  0.5, -0.5,  0.0,  1.0,  0.0,  0.0,  1.0
    ]);

    // create vertex array object (vao) for cube and bind it
    cubeVAO = gl.createVertexArray();
    gl.bindVertexArray(cubeVAO);

    // create and bind vertex buffer object (vbo)
    const VBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // linking vertex attributes for cube shader program
    const aPosCube = gl.getAttribLocation(cubeShader, "aPos");
    gl.vertexAttribPointer(aPosCube, 3, gl.FLOAT, false, 8 * FLOAT_SIZE, 0);
    gl.enableVertexAttribArray(aPosCube);
    const aNormal =  gl.getAttribLocation(cubeShader, "aNormal");
    gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 8 * FLOAT_SIZE, 3 * FLOAT_SIZE);
    gl.enableVertexAttribArray(aNormal);
    const aTexCoords = gl.getAttribLocation(cubeShader, "aTexCoords");
    gl.vertexAttribPointer(aTexCoords, 2, gl.FLOAT, false, 8 * FLOAT_SIZE, 6 * FLOAT_SIZE);
    gl.enableVertexAttribArray(aTexCoords);
}


window.onload = function init() {
    const canvas = document.getElementById("gl-canvas");

    gl = canvas.getContext("webgl2");
    if (!gl) {
        alert("WebGL 2.0 isn't available");
    }

    // set clear color
    gl.clearColor(0.1, 0.1, 0.1, 1.0);

    // set viewport size to match canvas dimensions
    gl.viewport(0, 0, canvas.clientWidth, canvas.clientHeight);

    // enable depth testing
    gl.enable(gl.DEPTH_TEST);

    // initialize shaders and shader program
    cubeShader = initShaderProgram(vertexShaderSource, cubeFragmentShaderSource);

    // initialize uniform locations
    gl.useProgram(cubeShader);
    uniforms = {
        viewPos:        gl.getUniformLocation(cubeShader, "viewPos"),
        modelCube:      gl.getUniformLocation(cubeShader, "model"),
        viewCube:       gl.getUniformLocation(cubeShader, "view"),
        projectionCube: gl.getUniformLocation(cubeShader, "projection"),
        lightPosition:  gl.getUniformLocation(cubeShader, "light.position"),
        lightDirection: gl.getUniformLocation(cubeShader, "light.direction"),
        lightCutOff:    gl.getUniformLocation(cubeShader, "light.cutOff"),
        lightOuterCutOff: gl.getUniformLocation(cubeShader, 'light.outerCutOff'),
        lightAmbient:   gl.getUniformLocation(cubeShader, 'light.ambient'),
        lightDiffuse:   gl.getUniformLocation(cubeShader, 'light.diffuse'),
        lightSpecular:  gl.getUniformLocation(cubeShader, 'light.specular'),
        lightConstant:  gl.getUniformLocation(cubeShader, 'light.constant'),
        lightLinear:    gl.getUniformLocation(cubeShader, 'light.linear'),
        lightQuadratic: gl.getUniformLocation(cubeShader, 'light.quadratic'),
        materialDiffuse:   gl.getUniformLocation(cubeShader, 'material.diffuse'),
        materialSpecular:  gl.getUniformLocation(cubeShader, 'material.specular'),
        materialShininess: gl.getUniformLocation(cubeShader, 'material.shininess'),
    };

    // initialize vertex data and configure cube and lamp vertex attributes
    // needs attributes locations, so we have to do this after initializing shader programs and attribute locations
    initBuffers();

    // setting up camera and light properties
    const viewPos = glMatrix.vec3.fromValues(-1.5, 0, 5);
    camera = new Camera({ 
        position: viewPos, 
        up: glMatrix.vec3.fromValues(0, 1, 0), 
        yaw: -60,
        pitch: 0,
    });

    // init transformations for cube and lamp
    MVPtransforms.modelCube = glMatrix.mat4.create();
    MVPtransforms.view = glMatrix.mat4.create();
    MVPtransforms.projection = glMatrix.mat4.create();


    // setting up texture and uniforms for cube shader program that won't change in the render loop
    gl.useProgram(cubeShader);
    diffuseMap = setupTexture(gl, gl.TEXTURE0, "container2.png", true, [0, 255, 0, 255]);
    specularMap = setupTexture(gl, gl.TEXTURE1, "container2_specular.png", true, [0, 255, 0, 255]);
    gl.uniform1i(uniforms.materialDiffuse, 0);
    gl.uniform1i(uniforms.materialSpecular, 1);
    gl.uniform1f(uniforms.materialShininess, 64.0);
    gl.uniform1f(uniforms.lightCutOff, Math.cos(glMatrix.glMatrix.toRadian(12.5)));
    gl.uniform1f(uniforms.lightOuterCutOff, Math.cos(glMatrix.glMatrix.toRadian(17.5)));
    gl.uniform3f(uniforms.lightAmbient, 0.2, 0.2, 0.2);
    gl.uniform3f(uniforms.lightDiffuse, 0.5, 0.5, 0.5);
    gl.uniform3f(uniforms.lightSpecular, 1.0, 1.0, 1.0);
    gl.uniform1f(uniforms.lightConstant, 1.0);
    gl.uniform1f(uniforms.lightLinear, 0.09);
    gl.uniform1f(uniforms.lightQuadratic, 0.032);

    // set up event listener fors moving lamp/camera 
    window.addEventListener('keydown', e => keys[e.key] = true);
    window.addEventListener('keyup',   e => keys[e.key] = false);
    // Request pointer lock on click 
    canvas.addEventListener('click', () => { canvas.requestPointerLock(); });    
    // ---- Mouse move handling for camera rotation ----
    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement !== canvas) return;
        camera.processMouseMovement(e.movementX, -e.movementY);
    });    

    // set up mouse wheel handling for zooming
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        camera.processMouseScroll(e.deltaY);
    }, { passive: false });

    // render loop
    requestAnimationFrame(render);
};


function render(timestamp) {
    // calculate delta time for consistent movement speed
    const currentTime = timestamp / 1000.0; // convert to seconds
    deltaTime = currentTime - previousTime;
    previousTime = currentTime;

    // process keyboard input for camera movement
    if (keys['w']) camera.processKeyboard('FORWARD', deltaTime); 
    if (keys['s']) camera.processKeyboard('BACKWARD', deltaTime); 
    if (keys['a']) camera.processKeyboard('LEFT', deltaTime); 
    if (keys['d']) camera.processKeyboard('RIGHT', deltaTime); 


    // clear color and depth buffers
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // activate the cube shader program and cube VAO to draw the cube
    gl.useProgram(cubeShader);
    gl.bindVertexArray(cubeVAO);

    // bind the diffuse map to texture unit 0 
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, diffuseMap);

    // update uniforms for cube shader program
    glMatrix.mat4.perspective(MVPtransforms.projection,
        glMatrix.glMatrix.toRadian(camera.Zoom),          // 45° field of view
        gl.canvas.clientWidth / gl.canvas.clientHeight,  // aspect ratio (800/600)
        0.1,                                       // near plane
        100.0                                      // far plane
    );    
    camera.getViewMatrix(MVPtransforms.view);

    gl.uniformMatrix4fv(uniforms.viewCube, false, MVPtransforms.view);
    gl.uniformMatrix4fv(uniforms.projectionCube, false, MVPtransforms.projection);
    gl.uniform3fv(uniforms.viewPos, camera.Position);
    gl.uniform3fv(uniforms.lightPosition, camera.Position);
    gl.uniform3fv(uniforms.lightDirection, camera.Front);

    // draw the cubes
    for (let i = 0; i < cubePositions.length; i++) {
        glMatrix.mat4.fromTranslation(MVPtransforms.modelCube, cubePositions[i]);
        glMatrix.mat4.rotate(MVPtransforms.modelCube, MVPtransforms.modelCube, glMatrix.glMatrix.toRadian(20.0 * i), [1.0, 0.3, 0.5]);
        gl.uniformMatrix4fv(uniforms.modelCube, false, MVPtransforms.modelCube);
        gl.drawArrays(gl.TRIANGLES, 0, 36);
    }


    requestAnimationFrame(render);
}

