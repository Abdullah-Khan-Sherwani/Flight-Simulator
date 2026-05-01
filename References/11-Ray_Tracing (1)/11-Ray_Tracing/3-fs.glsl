#version 300 es
precision highp float;

#define MAX_BOUNCES 5
#define NUM_SPHERES 5
#define NUM_LIGHTS 2

// Ray structure
struct Ray {
    vec3 origin;
    vec3 dir;
};

struct Hit {
    vec3 coord; // hit point
    vec3 normal;// hit normal
    int Id;     // sphere index
    float t;    // ray parameter
};

struct Light {
    vec3 position;
    vec3 diffuse;
    vec3 specular;
    float Kc;  // constant attenuation
    float Kl;  // linear attenuation
    float Kq;  // quadratic attenuation
};

struct Sphere {
    vec3 center;
    float radius;
    vec3 diffuse;
    vec3 specular;
    float shininess;
    float reflectivity;
};

uniform vec3 globalAmbient;
uniform vec2 resolution;
uniform vec3 cameraPos;
uniform Sphere spheres[NUM_SPHERES];
uniform Light lights[NUM_LIGHTS];

out vec4 fragColor;

// Ray-sphere intersection: solves quadratic, returns nearest positive t and outward normal
bool intersectSphere(Ray ray, int s, out Hit hit) {
    vec3 oc = ray.origin - spheres[s].center;
    
    float a = dot(ray.dir, ray.dir);
    float b = 2.0 * dot(oc, ray.dir);
    float c = dot(oc, oc) - spheres[s].radius * spheres[s].radius;
    
    float disc = b * b - 4.0 * a * c;
    if (disc < 0.0) return false;
    
    float sqrtDisc = sqrt(disc);
    float t1 = (-b - sqrtDisc) / (2.0 * a);
    float t2 = (-b + sqrtDisc) / (2.0 * a);
    
    // Find nearest positive t
    if (t1 > 0.0 && t2 > 0.0) {
        hit.t = min(t1, t2);
    } else if (t1 > 0.0) {
        hit.t = t1;
    } else if (t2 > 0.0) {
        hit.t = t2;
    } else {
        return false;
    }
    
    // Compute hit point and outward normal
    hit.Id = s;
    hit.coord = ray.origin + ray.dir * hit.t;
    hit.normal = normalize(hit.coord - spheres[s].center);
    
    return true;
}

// Find closest intersection among all spheres
bool findIntersection(Ray ray, out Hit hit) {
    hit.Id = -1;
    hit.t = 1e20;
    hit.coord = vec3(0.0);
    hit.normal = vec3(0.0);
    
    for (int i = 0; i < NUM_SPHERES; i++) {
        Hit curHit;   // out parameter
        if (intersectSphere(ray, i, curHit)) {
            if (curHit.t < hit.t && curHit.t > 0.001) {  // epsilon to avoid self-intersection
                hit = curHit;
            }
        }
    }
    return hit.Id != -1;
}

// Casts shadow ray, returns false if any sphere occludes before distToLight
bool isLightVisible(Hit hit, vec3 lightPos, float distToLight) {
    // Offset origin along normal to avoid self-intersection (shadow acne)
    // In reflectRay() and isLightVisible():
    vec3 shadowOrigin = hit.coord + hit.normal * 1e-4;
    vec3 toLight = normalize(lightPos - shadowOrigin);
    Ray shadowRay = Ray(shadowOrigin, toLight);
    
    for (int i = 0; i < NUM_SPHERES; i++) {
        Hit hit;
        if (intersectSphere(shadowRay, i, hit)) {
            if (hit.t > 0.001 && hit.t < distToLight) {
                return false;  // occluded
            }
        }
    }
    return true;  // light is visible
}

// Computes attenuation factor: 1 / (Kc + Kl*d + Kq*d²)
float attenuationAt(int l, float dist) {
    return 1.0 / (lights[l].Kc + lights[l].Kl * dist + lights[l].Kq * dist * dist);
}

// Full Phong computation for a single light (diffuse + specular + attenuation)
vec3 radianceAt(int l, Hit hit, vec3 viewDir) {
    // Direction from hit point to light
    vec3 toLight = lights[l].position - hit.coord;
    float dist = length(toLight);
    toLight = normalize(toLight);
    
    float att = attenuationAt(l, dist);
        
    // Diffuse: Kd * Ld * max(0, N·L)
    float NdotL = max(0.0, dot(hit.normal, toLight));
    vec3 diffuse = spheres[hit.Id].diffuse * lights[l].diffuse * NdotL;
    
    // Specular: Ks * Ls * max(0, V·R)^shininess
    // R = reflect(-L, N)
    vec3 reflectDir = reflect(-toLight, hit.normal);
    float VdotR = max(0.0, dot(viewDir, reflectDir));
    float spec = pow(VdotR, spheres[hit.Id].shininess);
    vec3 specular = spheres[hit.Id].specular * lights[l].specular * spec;
    
    // Sum and attenuate
    return (diffuse + specular) * att;
}

// Direct illumination: loops over lights, shadow-tests each, calls radianceAt() if visible
vec3 shade(Hit hit, vec3 viewDir) {
    // global ambience
    vec3 color = spheres[hit.Id].diffuse * globalAmbient;
    
    for (int i = 0; i < NUM_LIGHTS; i++) {
        vec3 toLight = lights[i].position - hit.coord;
        float distToLight = length(toLight);
        
        // Shadow test
        if (isLightVisible(hit, lights[i].position, distToLight)) {
            color += radianceAt(i, hit, viewDir);
        }
    }
    
    return color;
}

// Generate reflection ray (uses GLSL's built-in reflect)
Ray reflectRay(Ray ray, Hit hit) {
    vec3 reflectedDir = reflect(ray.dir, hit.normal);
    vec3 origin = hit.coord + hit.normal * 1e-4;  // offset to avoid self-intersection
    return Ray(origin, reflectedDir);
}

// Trace ray with proper shading and reflection blending
vec3 trace(Ray ray) {    
    vec3 color = vec3(0.0);
    float weight = 1.0;
    Ray currentRay = ray;

    for (int bounce = 0; bounce < MAX_BOUNCES; bounce++) {
        Hit hit;

        if (!findIntersection(currentRay, hit)) break;

        vec3 viewDir = normalize(-currentRay.dir);

        vec3 directColor = shade(hit, viewDir);

        float refl = spheres[hit.Id].reflectivity;

        // Correct energy split
        color += weight * (1.0 - refl) * directColor;

        // Update weight for next bounce
        weight *= refl;

        if (weight < 0.01) break;

        currentRay = reflectRay(currentRay, hit);
    }
    
    color = clamp(color, 0.0, 1.0);
    return color;
}

void main() {
    // Get current pixel coordinates (0 to width, 0 to height)
    vec2 uv = gl_FragCoord.xy / resolution;
    
    // Convert to NDC: [0,1] → [-1, 1] with aspect correction
    float aspect = resolution.x / resolution.y;
    float nx = (uv.x * 2.0 - 1.0) * aspect;
    float ny =  uv.y * 2.0 - 1.0;
    
    // Ray direction (camera looks down -Z)
    vec3 rayDir = normalize(vec3(nx, ny, -1.0));
    
    // Create primary ray
    Ray ray = Ray(cameraPos, rayDir);
    
    // Trace ray (max MAX_BOUNCES bounces for reflections)
    vec3 color = trace(ray);
    
    // Output final color
    fragColor = vec4(color, 1.0);
}



