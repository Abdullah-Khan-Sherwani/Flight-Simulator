#version 300 es
precision mediump float;
out vec4 fColor; 
void main()
{
vec4 color=vec4(1.0,1.0,1.0,1.0);
vec2 uv = gl_FragCoord.xy;

vec2 uv_mod = mod(uv - vec2(50.0), vec2(100.0));
if (length(uv_mod - vec2(50.0)) < 30.0)
   	color.rgb=vec3(0.2,0.3,0.5);

fColor = color;
}