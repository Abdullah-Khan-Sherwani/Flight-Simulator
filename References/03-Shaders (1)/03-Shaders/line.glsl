#version 300 es
precision mediump float;

out vec4 fColor;

float line(vec2 p, vec2 a, vec2 b)
{
    vec2 v = p - a;
    vec2 w = b - a;

    float lambda = dot(v, w) / dot(w, w);
    lambda = clamp(lambda, 0.0, 1.0);

    return length(lambda * w - v);
}

void main()
{
    vec4 color = vec4(1.0);
    vec2 uv = gl_FragCoord.xy;

    if (line(uv, vec2(150.0, 100.0), vec2(550.0, 400.0)) < 10.0)
        color.rgb = vec3(0.2, 0.3, 0.5);

    fColor = color;
}