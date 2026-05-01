// ============================================================
// raycaster.js  —  A minimal CPU ray caster in JavaScript
//
// Pipeline overview:
//   For each pixel on the canvas:
//     1. Camera generates a primary ray through that pixel
//     2. castRay() finds the closest scene intersection
//     3. shade() computes local Phong illumination
//     4. The final colour is written into an ImageData buffer
// ============================================================

"use strict"
const SURFACE_OFFSET = 1e-4;

// ------------------------
// Ray
// ------------------------

/**
 * A ray is defined as:   P(t) = origin + t * dir
 *
 * @param {vec3} origin  - The starting point of the ray (world-space).
 * @param {vec3} dir     - The unit (or non-unit) direction vector.
 *
 * Primary rays travel from the camera through each pixel.
 * Shadow rays travel from a surface point toward each light.
 * Reflection rays travel from a surface point in the mirror direction.
 */
class Ray {
    constructor(origin, dir) {
        this.origin = origin;
        this.dir = dir;
    }
}

class Hit {
    constructor(t, point, normal, object) {
        this.t      = t;
        this.point  = point;
        this.normal = normal;
        this.object = object;
    }
}

// ------------------------
// Sphere
// ------------------------

/**
 * An implicit sphere: ||P - center||² = radius²
 *
 * @param {vec3}   center    - World-space centre of the sphere.
 * @param {number} radius    - Sphere radius.
 * @param {Material} material - Surface material (Phong colours, shininess).
 */
class Sphere {
    constructor(center, radius, material) {
        this.center = center;
        this.radius = radius;
        this.material = material;
    }

    /**
     * Ray–sphere intersection via the quadratic formula.
     *
     * Substituting P(t) = O + t*D into ||P - C||² = r²  gives:
     *   (D·D)t²  +  2(OC·D)t  +  (OC·OC - r²) = 0
     * where OC = O - C.
     *
     * Discriminant  disc = b² - 4ac
     *   disc < 0  → no intersection (ray misses the sphere)
     *   disc ≥ 0  → one or two intersections; we take the smaller
     *               positive t (nearest hit in front of the ray origin)
     *
     * @param  {Ray} ray
     * @returns {Hit|null}  new Hit(t, hitPoint, normal, this)
     *                         or null if no valid intersection.
     */
    intersect(ray) {
        // OC = ray origin − sphere centre
        let oc = glMatrix.vec3.create();
        glMatrix.vec3.sub(oc, ray.origin, this.center);

        // Coefficients of the quadratic  at² + bt + c = 0
        const a = 1;                                    // D·D  (= 1 if dir is normalised)
        const b = 2 * glMatrix.vec3.dot(oc, ray.dir);   // 2(OC·D)
        const c = glMatrix.vec3.dot(oc, oc) - this.radius * this.radius;  // |OC|² - r²

        const disc = b * b - 4 * a * c;
        if (disc < 0) return null;  // Ray misses the sphere entirely

        // Nearest root in front of the ray origin (t > 0)
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t < 0) return null;     // Intersection is behind the ray origin

        // Compute the hit point:  P = O + t*D
        let hitPoint = glMatrix.vec3.create();
        glMatrix.vec3.scaleAndAdd(hitPoint, ray.origin, ray.dir, t);

        // Outward surface normal at the hit point (points away from centre)
        let normal = glMatrix.vec3.create();
        glMatrix.vec3.sub(normal, hitPoint, this.center);
        glMatrix.vec3.normalize(normal, normal);

        // Return a hit record used by castRay() and shade()
        return new Hit(t, hitPoint, normal, this);
    }
}


// ------------------------
// Light
// ------------------------

/**
 * A point light source with separate Phong colour channels (except ambient)
 * and realistic distance attenuation.
 *
 * Attenuation models how light intensity falls off with distance d:
 *
 *   attenuation = 1 / (Kc  +  Kl * d  +  Kq * d²)
 *
 *   Kc  (constant)  — baseline; prevents division-by-zero at d = 0.
 *   Kl  (linear)    — gentle linear falloff; useful for small/medium ranges.
 *   Kq  (quadratic) — physically correct inverse-square falloff; dominates
 *                     at larger distances. Real-world lights follow 1/d².
 *
 * Typical OpenGL-style presets:
 *   No falloff:    Kc=1, Kl=0,    Kq=0
 *   Gentle:        Kc=1, Kl=0.09, Kq=0.032
 *   Strong:        Kc=1, Kl=0.35, Kq=0.44
 *
 * Having separate ambient/diffuse/specular colours lets a single light
 * produce a dim ambient fill with a bright specular highlight — common
 * in stylised rendering.
 *
 * @param {vec3}   position  - World-space position of the light.
 * @param {vec3}   diffuse   - Diffuse  intensity (main colour of the light).
 * @param {vec3}   specular  - Specular intensity (often white or same as diffuse).
 * @param {number} Kc        - Constant  attenuation coefficient (default 1).
 * @param {number} Kl        - Linear    attenuation coefficient (default 0).
 * @param {number} Kq        - Quadratic attenuation coefficient (default 0).
 */
class Light {
    constructor(
        position,
        diffuse,
        specular,
        Kc = 1.0,
        Kl = 0.0,
        Kq = 0.0
    ) {
        this.position = position;
        this.diffuse  = diffuse;
        this.specular = specular;
        this.Kc = Kc;
        this.Kl = Kl;
        this.Kq = Kq;
    }

    /**
     * Computes the scalar attenuation factor for a surface point at
     * distance d from this light.
     *
     *   attenuation = 1 / (Kc + Kl*d + Kq*d²)
     *
     * Result is always ≤ 1 (for Kc ≥ 1) and decreases with distance.
     *
     * @param  {number} dist - Distance from the light to the surface point.
     * @returns {number} Attenuation factor in (0, 1].
     */
    attenuationAt(dist) {
        return 1.0 / (this.Kc + this.Kl * dist + this.Kq * dist * dist);
    }

    /**
     * Computes the full Phong radiance delivered to a surface point,
     * combining attenuation with diffuse all three Phong lighting terms.
     *
     *   radiance = attenuation * (diffuse + specular)
     *
     *   diffuse  = Kd * Ld * max(0, N·L)
     *   specular = Ks * Ls * max(0, V·R)^shininess
     *
     * @param  {Object}   hit     - Hit record 
     * @param  {vec3}     viewDir - Unit vector from hit point toward the viewer.
     * @returns {vec3}  RGB radiance in [0, ∞).
     */
    radianceAt(hit, viewDir) {
        // Direction and distance from surface point to this light
        const toLight = glMatrix.vec3.create();
        glMatrix.vec3.sub(toLight, this.position, hit.point);
        const dist = glMatrix.vec3.length(toLight);
        glMatrix.vec3.normalize(toLight, toLight);

        const mat = hit.object.material;
        const att = this.attenuationAt(dist);
        const NdotL = Math.max(0, glMatrix.vec3.dot(hit.normal, toLight));

        const color = glMatrix.vec3.create();

        if (NdotL > 0) {
            // Diffuse
            const diffuse = glMatrix.vec3.create();
            glMatrix.vec3.multiply(diffuse, mat.diffuse, this.diffuse);
            glMatrix.vec3.scaleAndAdd(color, color, diffuse, NdotL);

            // Specular
            const toSurface = glMatrix.vec3.create();
            glMatrix.vec3.scale(toSurface, toLight, -1);   // -L: from light toward surface
            const reflectDir = glMatrix.vec3.create();
            reflect(reflectDir, toSurface, hit.normal);    // R = -L + 2(L·N)N

            const VdotR = Math.max(0, glMatrix.vec3.dot(viewDir, reflectDir));
            const specFactor = Math.pow(VdotR, mat.shininess);
            
            const specular = glMatrix.vec3.create();
            glMatrix.vec3.multiply(specular, mat.specular, this.specular);
            glMatrix.vec3.scaleAndAdd(color, color, specular, specFactor);
        }

        // Apply attenuation
        glMatrix.vec3.scale(color, color, att);

        return color;
    }
}


// ------------------------
// Material
// ------------------------

/**
 * Describes the full Phong (except ambience) optical properties of a surface.
 *
 * The Phong illumination model decomposes reflected light into three
 * independent colour components, each controlled by its own RGB colour:
 *
 *   diffuse  — view-independent Lambertian scattering; brightens surfaces
 *              facing the light proportionally to cos(θ) = N·L.
 *              Formula:  Kd * lightDiffuse * max(0, N·L)
 *
 *   specular — view-dependent glossy highlight; strongest when the viewer is
 *              aligned with the mirror-reflection direction.
 *              Formula:  Ks * lightSpecular * max(0, V·R)^shininess
 *
 * Having separate RGB colours for each component allows effects like:
 *   • a dark-red diffuse surface with a bright white specular highlight
 *   • a metallic surface where specular tint matches the diffuse colour
 *   • a surface with strong ambient (glows even in shadow)
 *
 * @param {vec3}   diffuse      - Diffuse  colour  Kd,  each channel [0,1].
 * @param {vec3}   specular     - Specular colour  Ks,  each channel [0,1].
 * @param {number} shininess    - Phong exponent (e.g. 8–256). Higher values
 *                                produce smaller, sharper highlights.
 */
class Material {
    constructor(diffuse, specular, shininess = 32) {
        this.diffuse     = diffuse;
        this.specular    = specular;
        this.shininess   = shininess;
    }

    /**
     * Returns secondary rays to spawn at a hit point (e.g. reflections, refractions).
     * This first example uses only primary rays + direct illumination, so no
     * secondary rays are generated. See the second example for mirror reflections.
     *
     * @returns {Array} Empty array — no secondary rays.
     */
    generateSecondaryRays(incidentDir, hit) {
        return [];
    }
}


// ------------------------
// Camera
// ------------------------

/**
 * A simple pinhole camera looking down the −Z axis.
 *
 * The virtual film plane sits at z = −1.  Each pixel maps to a point
 * on this plane through a linear remap:
 *   screen x  [0, width]  →  NDC x  [−aspect, +aspect]
 *   screen y  [0, height] →  NDC y  [−1, +1]   (y flipped so +y = up)
 *
 * Field of view is implicitly ~90° horizontal (because the film plane is
 * 2 units wide at distance 1).  To change FOV, scale nx/ny by tan(fov/2).
 *
 * @param {number} width  - Canvas width in pixels.
 * @param {number} height - Canvas height in pixels.
 */
class Camera {
    constructor(width, height) {
        this.width = width;
        this.height = height;
    }

    /**
     * Generates a primary ray through pixel (x, y).
     *
     * Step 1 – Normalised Device Coordinates (NDC):
     *   nx = (x / width)  * 2 − 1   →  maps [0, width]  to [−1, +1]
     *   ny = (y / height) * 2 − 1   →  maps [0, height] to [−1, +1]
     *
     * Step 2 – Correct for aspect ratio so pixels are square:
     *   nx *= (width / height)
     *
     * Step 3 – Negate ny because canvas y increases downward,
     *           but we want world-space y to increase upward.
     *
     * Step 4 – Ray direction = (nx, −ny, −1), then normalised.
     *
     * @param  {number} x - Pixel column  (0 … width-1)
     * @param  {number} y - Pixel row     (0 … height-1)
     * @returns {Ray}
     */
    generatePrimaryRay(x, y) {
        let aspect = this.width / this.height;

        // Map pixel coordinates to [−1, +1] NDC
        let nx = (x / this.width)  * 2 - 1;
        let ny = 1 - (y / this.height) * 2;

        // Correct for non-square pixels
        nx *= aspect;

        // Build direction: camera looks down −Z; y is negated to flip canvas convention
        let dir = glMatrix.vec3.fromValues(nx, ny, -1);
        glMatrix.vec3.normalize(dir, dir);

        // Camera sits at the world origin (0, 0, 0)
        return new Ray(glMatrix.vec3.fromValues(0, 0, 0), dir);
    }
}


// ------------------------
// Core Functions
// ------------------------

/**
 * Main render loop.
 *
 * Iterates over every pixel, generates a primary ray, calls castRay(),
 * and writes the resulting colour into an ImageData buffer.
 * Writing all pixels into ImageData first and calling putImageData once
 * is much faster than drawing individual pixels via fillRect().
 *
 * @param {Camera} camera
 * @param {Object} scene  - { objects: [], lights: [] }
 */
function render(camera, scene) {
    const canvas = document.getElementById("canvas");
    canvas.width  = camera.width;
    canvas.height = camera.height;

    const ctx = canvas.getContext("2d");
    // ImageData is a flat RGBA byte array: 4 bytes per pixel
    const imageData = ctx.createImageData(camera.width, camera.height);

    let index = 0;  // current byte position in imageData.data
    for (let y = 0; y < camera.height; y++) {
        for (let x = 0; x < camera.width; x++) {
            const ray   = camera.generatePrimaryRay(x, y);
            const color = castRay(scene, ray);  // returns vec3 in [0, 1]

            // Scale from [0,1] to [0,255] and clamp to avoid overflow
            imageData.data[index++] = Math.min(255, color[0] * 255);  // R
            imageData.data[index++] = Math.min(255, color[1] * 255);  // G
            imageData.data[index++] = Math.min(255, color[2] * 255);  // B
            imageData.data[index++] = 255;                             // A (fully opaque)
        }
    }

    // Blit the entire buffer to the canvas in one call
    ctx.putImageData(imageData, 0, 0);
}


/**
 * Casts a single ray through the scene and returns its colour.
 *
 * This first example uses only direct illumination — no recursive
 * secondary rays. The pipeline is simply:
 *   1. Find the closest intersection.
 *   2. If nothing hit, return background colour (black).
 *   3. Otherwise, evaluate Phong shading at the hit point.
 *
 * @param  {Object} scene
 * @param  {Ray}    ray
 * @returns {vec3}  RGB colour in [0, 1].
 */
function castRay(scene, ray) {
    let hit = findIntersection(scene, ray);
    if (!hit) return glMatrix.vec3.fromValues(0, 0, 0);  // background colour

    return shade(scene, ray, hit);
}


/**
 * Finds the nearest ray–object intersection across all scene objects.
 *
 * Iterates over the scene's object list and returns the hit record with
 * the smallest positive t (i.e., closest to the ray origin).
 *
 * @param  {Object} scene
 * @param  {Ray}    ray
 * @returns {Object|null}  Closest hit record, or null if nothing was hit.
 */
function findIntersection(scene, ray) {
    let bestHit = null;
    let minDist = Infinity;

    for (let obj of scene.objects) {
        let hit = obj.intersect(ray);
        if (hit && hit.t < minDist) {
            minDist = hit.t;
            bestHit = hit;
        }
    }

    return bestHit;
}


/**
 * Computes direct illumination at a surface point.
 *
 *   color = material.emission
 *   foreach light:
 *       cast shadow ray
 *       if light visible:  color += light.radianceAt(hit, material, viewDir)
 *
 * light.radianceAt() owns all Phong computation (ambient + diffuse + specular)
 * and distance attenuation.  shade() only decides whether to call it.
 *
 * @param  {Object} scene
 * @param  {Ray}    ray   - The incoming (view) ray; used to derive viewDir.
 * @param  {vec3}   coord - World-space hit point.
 * @param  {Object} hit   - Full hit record { dist, coord, normal, obj }.
 * @returns {vec3}  Accumulated RGB colour from direct illumination.
 */
function shade(scene, ray, hit) {
    // View direction: from hit point toward the camera (negate incoming ray)
    const viewDir = glMatrix.vec3.create();
    glMatrix.vec3.scale(viewDir, ray.dir, -1);
    glMatrix.vec3.normalize(viewDir, viewDir);

    const color = glMatrix.vec3.clone(scene.globalAmbient);

    for (const light of scene.lights) {
        // Build shadow ray toward the light
        const toLight = glMatrix.vec3.create();
        glMatrix.vec3.sub(toLight, light.position, hit.point);
        const dist = glMatrix.vec3.length(toLight);
        glMatrix.vec3.normalize(toLight, toLight);

        // Offset origin along the normal to prevent self-intersection
        const shadowOrigin = glMatrix.vec3.create();
        glMatrix.vec3.scaleAndAdd(shadowOrigin, hit.point, hit.normal, SURFACE_OFFSET);
        const shadowRay = new Ray(shadowOrigin, toLight);

        if (isLightVisible(scene, shadowRay, dist)) {
            // light.radianceAt() computes full Phong + attenuation
            const radiance = light.radianceAt(hit, viewDir);
            glMatrix.vec3.add(color, color, radiance);
        }
    }

    return color;
}


/**
 * Determines whether a surface point has an unobstructed line of sight
 * to a light source.
 *
 * Casts `ray` (a shadow ray) and checks whether any object intersects it
 * closer than `maxDist` (the distance to the light).
 * Objects beyond the light don't cast shadows on this point.
 *
 * @param  {Object} scene
 * @param  {Ray}    ray      - Shadow ray originating at the surface point.
 * @param  {number} maxDist  - Distance to the light source.
 * @returns {boolean}  true if the light is visible (no occluder in the way).
 */
function isLightVisible(scene, ray, maxDist) {
    let hit = findIntersection(scene, ray);
    return !hit || hit.t > maxDist;
}


// reflect v around n
function reflect(out, v, n) {
    const dot = glMatrix.vec3.dot(v, n);
    glMatrix.vec3.scaleAndAdd(out, v, n, -2 * dot);
    glMatrix.vec3.normalize(out, out);
}


// ------------------------
// Scene Setup
// ------------------------

/**
 * Describes the virtual world: a list of objects and a list of lights.
 *
 * Each Material takes (ambient, diffuse, specular, shininess).
 * Each Light takes (position, ambient, diffuse, specular, Kc, Kl, Kq).
 *
 * Scene contents:
 *   • Red sphere          (centre)
 *   • Blue sphere         (right)
 *   • Bronze sphere       (left)
 *   • Large ground sphere (radius 1000 ≈ flat floor)
 *   • Back wall sphere    (behind the scene)
 *   • Key light           (bright white, gentle quadratic falloff)
 *   • Fill light          (dimmer, no falloff — approximates bounce light)
 */
let scene = {
    objects: [
        // Red sphere
        new Sphere(
            glMatrix.vec3.fromValues(0, 0, -5),
            1,
            new Material(
                glMatrix.vec3.fromValues(1.0, 0.2,  0.2 ),   // diffuse  (bright red)
                glMatrix.vec3.fromValues(0.5, 0.5,  0.5 ),   // specular (grey highlight)
                16                                            // shininess — broad highlight
            )
        ),

        // Blue sphere
        new Sphere(
            glMatrix.vec3.fromValues(2, 0, -6),
            1,
            new Material(
                glMatrix.vec3.fromValues(0.2,  0.2,  0.8 ),  // diffuse  (blue)
                glMatrix.vec3.fromValues(1.0,  1.0,  1.0 ),  // specular (white)
                128                                           // shininess — tight highlight
            )
        ),

        // Bronze sphere
        new Sphere(
            glMatrix.vec3.fromValues(-2, 0, -6),
            1,
            new Material(
                glMatrix.vec3.fromValues(0.8,  0.6,  0.3 ),  // diffuse  (bronze)
                glMatrix.vec3.fromValues(1.0,  0.9,  0.7 ),  // specular (warm white)
                64                                            // shininess
            )
        ),

        // Ground plane (giant sphere, r = 1000)
        new Sphere(
            glMatrix.vec3.fromValues(0, -1001, -5),
            1000,
            new Material(
                glMatrix.vec3.fromValues(0.8,  0.8,  0.8 ),  // diffuse  (grey)
                glMatrix.vec3.fromValues(0.2,  0.2,  0.2 ),  // specular (dim)
                8                                             // shininess — broad highlight
            )
        ),

        // Back wall
        new Sphere(
            glMatrix.vec3.fromValues(0, 0, -20),
            10,
            new Material(
                glMatrix.vec3.fromValues(0.5,  0.5,  0.5 ),  // diffuse  (mid grey)
                glMatrix.vec3.fromValues(0.3,  0.3,  0.3 ),  // specular
                32                                            // shininess
            )
        )
    ],

    globalAmbient : glMatrix.vec3.fromValues(0.05, 0.05, 0.05),

    lights: [
        // Key light — bright white, upper-right, gentle quadratic falloff.
        // Kq = 0.01 means at distance 10 attenuation ≈ 0.5 (half intensity).
        new Light(
            glMatrix.vec3.fromValues(5, 5, 0),
            glMatrix.vec3.fromValues(1.0, 1.0, 1.0),   // diffuse  (white)
            glMatrix.vec3.fromValues(1.0, 1.0, 1.0),   // specular (white)
            1.0,   // Kc  constant
            0.0,   // Kl  linear
            0.01   // Kq  quadratic  — gentle real-world-ish falloff
        ),

        // Fill light — cooler, dimmer, no falloff.
        // No attenuation (Kc=1, Kl=0, Kq=0) approximates distant bounce light.
        new Light(
            glMatrix.vec3.fromValues(-5, 3, 2),
            glMatrix.vec3.fromValues(0.4,  0.4,  0.6 ),  // diffuse  (cool fill)
            glMatrix.vec3.fromValues(0.3,  0.3,  0.5 ),  // specular
            1.0, 0.0, 0.0  // no attenuation
        )
    ]
};


// ------------------------
// Run
// ------------------------

// Instantiate a camera and kick off the synchronous render.
// For large resolutions, consider rendering in chunks with setTimeout
// or moving the pixel loop to a Web Worker to keep the UI responsive.
const camera = new Camera(800, 600);
render(camera, scene);

