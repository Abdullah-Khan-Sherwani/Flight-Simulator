#version 300 es

in vec2 aPos;

void main() {
    // Pass through clip-space coordinates
    gl_Position = vec4(aPos, 0.0, 1.0);
}