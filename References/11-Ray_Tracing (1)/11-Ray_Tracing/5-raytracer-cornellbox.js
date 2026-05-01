// ============================================================
// raytracer.js  —  A minimal CPU ray tracer in JavaScript
//
// Pipeline overview:
//   For each pixel on the canvas:
//     1. Camera generates a primary ray through that pixel
//     2. trace() finds the closest scene intersection
//     3. shade() accumulates direct illumination via light.radianceAt()
//     4. trace() recurses for each secondary ray (e.g. reflections)
//     5. The final colour is written into an ImageData buffer
// ============================================================

"use strict"
// EPSILON: numerical guard against division-by-zero in dot products, etc.
// SURFACE_OFFSET: geometric offset to lift bounce rays off the surface and
//   prevent self-intersection.
const EPSILON        = 1e-6;
const SURFACE_OFFSET = 1e-4;
const MAX_DEPTH = 5;

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

// ============================================================
// Transform Utilities
// ============================================================
function transformPoint(matrix, point) {
    const p   = glMatrix.vec4.fromValues(point[0], point[1], point[2], 1.0);
    const out = glMatrix.vec4.create();
    glMatrix.vec4.transformMat4(out, p, matrix);
    return glMatrix.vec3.fromValues(out[0] / out[3], out[1] / out[3], out[2] / out[3]);
}

function transformVector(matrix, vec) {
    const v   = glMatrix.vec4.fromValues(vec[0], vec[1], vec[2], 0.0);
    const out = glMatrix.vec4.create();
    glMatrix.vec4.transformMat4(out, v, matrix);
    return glMatrix.vec3.fromValues(out[0], out[1], out[2]);
}

function transformNormal(invMatrix, normal) {
    const invT = glMatrix.mat4.create();
    glMatrix.mat4.transpose(invT, invMatrix);   // already inverted, just transpose
    const result = transformVector(invT, normal);
    glMatrix.vec3.normalize(result, result);
    return result;
}


// ============================================================
// Transformable Object
// ============================================================
class TransformableObject {
    constructor(material) {
        this.material       = material;
        this.modelMatrix    = glMatrix.mat4.create();
        this.invModelMatrix = glMatrix.mat4.create();
    }

    setModelMatrix(m) {
        glMatrix.mat4.copy(this.modelMatrix, m);
        glMatrix.mat4.invert(this.invModelMatrix, m);
    }

    transformRayToLocal(ray) {
        // Transform origin as a point (w=1) and direction as a vector (w=0).
        // We do NOT normalize the local direction: its length encodes the
        // world-to-local scale, so t values in local space correctly map
        // back to world-space positions via toWorldPoint(origin + t*dir).
        const o = transformPoint(this.invModelMatrix, ray.origin);
        const d = transformVector(this.invModelMatrix, ray.dir);
        return new Ray(o, d);
    }

    toWorldPoint(p)  { return transformPoint(this.modelMatrix, p); }
    toWorldNormal(n) { return transformNormal(this.invModelMatrix, n); }
}

// ============================================================
// Geometry: Rect (also used as area light)
// Local space: unit square in the XZ plane, [-0.5, 0.5] on X and Z.
// ============================================================
class Rect extends TransformableObject {
    constructor(material) {
        super(material);
        this.normal = glMatrix.vec3.fromValues(0, 1, 0); // canonical +Y normal
    }

    intersect(ray) {
        const r     = this.transformRayToLocal(ray);
        const denom = glMatrix.vec3.dot(r.dir, this.normal);
        if (Math.abs(denom) < EPSILON) return null; // ray parallel to plane

        const t = -r.origin[1] / denom;
        if (t < 0) return null; // hit behind ray origin

        const p = glMatrix.vec3.create();
        glMatrix.vec3.scaleAndAdd(p, r.origin, r.dir, t);
        if (Math.abs(p[0]) > 0.5 || Math.abs(p[2]) > 0.5) return null; // outside unit square

        // t is the local-space ray parameter. We store it in Hit so findIntersection
        // can compare hits by distance. 
        const worldPoint = this.toWorldPoint(p);
        const worldDist = glMatrix.vec3.distance(ray.origin, worldPoint);
        return new Hit(worldDist, worldPoint, this.toWorldNormal(this.normal), this);
    }
}

// ============================================================
// Geometry: Box
// Local space: unit cube centered at origin, [-0.5, 0.5] on all axes.
// ============================================================
class Box extends TransformableObject {
    intersect(ray) {
        const r = this.transformRayToLocal(ray);

        // Ray–slab test: intersect the ray against three pairs of axis-aligned planes.
        // tmin is the entry point, tmax is the exit point.
        let tmin = -Infinity, tmax = Infinity;

        for (let i = 0; i < 3; i++) {
            if (Math.abs(r.dir[i]) < EPSILON) {
                // Ray is parallel to this slab. If origin is outside, no hit.
                if (r.origin[i] < -0.5 || r.origin[i] > 0.5) return null;
            } else {
                const invD = 1 / r.dir[i];
                const t1   = (-0.5 - r.origin[i]) * invD;
                const t2   = ( 0.5 - r.origin[i]) * invD;
                tmin = Math.max(tmin, Math.min(t1, t2));
                tmax = Math.min(tmax, Math.max(t1, t2));
            }
        }

        if (tmax < 0 || tmin > tmax) return null;
        const t = tmin > 0 ? tmin : tmax;

        // Find the hit point in local space and determine which face was hit
        // by finding which axis the point is closest to ±0.5 on.
        const p       = glMatrix.vec3.create();
        glMatrix.vec3.scaleAndAdd(p, r.origin, r.dir, t);
        const dist    = [
            Math.abs(Math.abs(p[0]) - 0.5),
            Math.abs(Math.abs(p[1]) - 0.5),
            Math.abs(Math.abs(p[2]) - 0.5),
        ];
        const minAxis = dist.indexOf(Math.min(...dist));
        const nLocal  = [0, 0, 0];
        nLocal[minAxis] = Math.sign(p[minAxis]);

        // t is the local-space ray parameter. We store it in Hit so findIntersection
        // can compare hits by distance (t order is preserved under uniform transforms).
        const worldPoint = this.toWorldPoint(p);
        const worldDist = glMatrix.vec3.distance(ray.origin, worldPoint);
        return new Hit(worldDist, worldPoint, this.toWorldNormal(glMatrix.vec3.fromValues(...nLocal)), this);
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
 * Describes the full Phong optical properties of a surface.
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
    constructor(diffuse, specular, shininess = 32, reflectivity = 0) {
        this.diffuse      = diffuse;
        this.specular     = specular;
        this.shininess    = shininess;
        this.reflectivity = reflectivity;
    }

    /**
     * Returns secondary rays to spawn at a hit point.
     *
     * Currently supports mirror reflection only:
     *   R = I − 2(I·N)N
     * where I is the incident ray direction and N is the surface normal.
     *
     * The origin is offset by 1e-4 along the normal to avoid
     * self-intersection ("shadow acne").
     *
     * @param  {vec3} incidentDir - Incoming ray direction.
     * @param  {vec3} hit         - World-space point of intersection.
     * @returns {Array} Array of { ray, weight } — empty if reflectivity is 0.
     */
    generateSecondaryRays(incidentDir, hit) {
        if (this.reflectivity <= 0) return [];

        const reflectedDir = glMatrix.vec3.create();
        reflect(reflectedDir, incidentDir, hit.normal);

        // Offset origin to avoid self-intersection
        const origin = glMatrix.vec3.create();
        glMatrix.vec3.scaleAndAdd(origin, hit.point, hit.normal, SURFACE_OFFSET);

        return [{ ray: new Ray(origin, reflectedDir), weight: this.reflectivity }];
    }
}


// ------------------------
// Camera
// ------------------------

class Camera {
    constructor(width, height, eye, target, up, fovY = 60) {
        this.eye        = glMatrix.vec3.fromValues(...eye);
        this.width      = width;          
        this.height     = height;
        const tanHalf   = Math.tan((fovY * Math.PI / 180) / 2);
        this.scaleX     = tanHalf * (width / height);   // tanHalf * aspect
        this.scaleY     = tanHalf;

        this.forward = glMatrix.vec3.create();
        glMatrix.vec3.sub(this.forward, glMatrix.vec3.fromValues(...target), this.eye);
        glMatrix.vec3.normalize(this.forward, this.forward);

        this.right = glMatrix.vec3.create();
        glMatrix.vec3.cross(this.right, this.forward, glMatrix.vec3.fromValues(...up));
        glMatrix.vec3.normalize(this.right, this.right);

        this.up = glMatrix.vec3.create();
        glMatrix.vec3.cross(this.up, this.right, this.forward);
    }

    generatePrimaryRay(x, y) {
        const ndcX =  (2 * x / this.width  - 1) * this.scaleX;
        const ndcY = -(2 * y / this.height - 1) * this.scaleY;

        const dir = glMatrix.vec3.create();
        glMatrix.vec3.scaleAndAdd(dir, dir, this.right,   ndcX);
        glMatrix.vec3.scaleAndAdd(dir, dir, this.up,      ndcY);
        glMatrix.vec3.scaleAndAdd(dir, dir, this.forward, 1.0);
        glMatrix.vec3.normalize(dir, dir);

        return new Ray(this.eye, dir);
    }
}



// ------------------------
// Core Functions
// ------------------------

/**
 * Main render loop.
 *
 * Iterates over every pixel, generates a primary ray, calls trace(),
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
            const color = trace(scene, ray);  // returns vec3 in [0, 1]

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
 * Traces a ray through the scene recursively and returns its colour.
 *
 * Follows the outline:
 *   1. Find the closest intersection.
 *   2. If nothing hit, return background colour (black).
 *   3. Otherwise, shade the hit point (direct illumination).
 *   4. For each secondary ray (e.g. reflection), recurse and blend.
 *
 * Recursion depth is capped at MAX_DEPTH to prevent infinite mirror loops.
 *
 * @param  {Object} scene
 * @param  {Ray}    ray
 * @param  {number} depth - Current recursion depth (0 = primary ray).
 * @returns {vec3}  RGB colour in [0, 1].
 */
function trace(scene, ray, depth = 0) {
    if (depth > MAX_DEPTH) return glMatrix.vec3.fromValues(0, 0, 0);

    const hit = findIntersection(scene, ray);
    if (!hit) return glMatrix.vec3.fromValues(0, 0, 0);  // background colour

    let color = shade(scene, ray, hit);

    // Secondary rays (reflections, refractions, …)
    // weight is the reflectivity blend coefficient
    for (const sec of hit.object.material.generateSecondaryRays(ray.dir, hit)) {
        const irradiance = trace(scene, sec.ray, depth + 1);
        // color = color * (1 - weight) + irradiance * weight
        glMatrix.vec3.scale(color, color, 1 - sec.weight);
        glMatrix.vec3.scaleAndAdd(color, color, irradiance, sec.weight);
        // Clamp to [0,1]
        clampColor(color);
    }

    return color;
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
        if (hit && hit.t > SURFACE_OFFSET && hit.t < minDist) {
            minDist = hit.t;
            bestHit = hit;
        }
    }

    return bestHit;
}


/**
 * Computes direct illumination at a surface point.
 *
 *   color = globalAmbience
 *   foreach light:
 *       cast shadow ray
 *       if light visible:  color += light.radianceAt(hit, viewDir)
 *
 * light.radianceAt() owns all Phong computation (ambient + diffuse + specular)
 * and distance attenuation.  shade() only decides whether to call it.
 *
 * @param  {Object} scene
 * @param  {Ray}    ray   - The incoming (view) ray; used to derive viewDir.
 * @param  {Hit} hit   - Full hit record.
 * @returns {vec3}  Accumulated RGB colour from direct illumination.
 */
function shade(scene, ray, hit) {
    // View direction: from hit point toward the camera (negate incoming ray)
    const viewDir = glMatrix.vec3.create();
    glMatrix.vec3.scale(viewDir, ray.dir, -1);
    glMatrix.vec3.normalize(viewDir, viewDir);

    // global ambience 
    const color = glMatrix.vec3.create();
    glMatrix.vec3.multiply(color, scene.globalAmbient, hit.object.material.diffuse);

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

// Perfect mirror reflection: R = I − 2(I·N)N
function reflect(out, v, n) {
    const dot = glMatrix.vec3.dot(v, n);
    glMatrix.vec3.scaleAndAdd(out, v, n, -2 * dot);
    glMatrix.vec3.normalize(out, out);
}


function clampColor(color) {
    color[0] = Math.min(1.0, Math.max(0.0, color[0]));
    color[1] = Math.min(1.0, Math.max(0.0, color[1]));
    color[2] = Math.min(1.0, Math.max(0.0, color[2]));
}

// ============================================================
// Scene Helpers
// ============================================================

// Creates a Rect centered at `center` with given world-space `normal`.
// w and h are the extents along the two tangent axes.
function createRect(center, w, h, normal, material) {
    const rect = new Rect(material);
    const m    = glMatrix.mat4.create();
    glMatrix.mat4.identity(m);
    glMatrix.mat4.translate(m, m, center);

    // Rotate the canonical +Y normal to the desired normal.
    const canonical = glMatrix.vec3.fromValues(0, 1, 0);
    const axis      = glMatrix.vec3.create();
    glMatrix.vec3.cross(axis, canonical, normal);
    const dot = glMatrix.vec3.dot(canonical, normal);

    if (glMatrix.vec3.length(axis) > EPSILON) {
        glMatrix.vec3.normalize(axis, axis);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        glMatrix.mat4.rotate(m, m, angle, axis);
    } else if (dot < 0) {
        glMatrix.mat4.rotate(m, m, Math.PI, glMatrix.vec3.fromValues(1, 0, 0));
    }

    glMatrix.mat4.scale(m, m, glMatrix.vec3.fromValues(w, 1, h));
    rect.setModelMatrix(m);
    return rect;
}

// Creates a Box centered at `center` with dimensions (sx, sy, sz)
// and rotation `rotY` degrees around the Y axis.
function createBox(center, sx, sy, sz, rotY, material) {
    const box = new Box(material);
    const m   = glMatrix.mat4.create();
    glMatrix.mat4.identity(m);
    glMatrix.mat4.translate(m, m, center);
    if (rotY) glMatrix.mat4.rotateY(m, m, rotY * Math.PI / 180);
    glMatrix.mat4.scale(m, m, glMatrix.vec3.fromValues(sx, sy, sz));
    box.setModelMatrix(m);
    return box;
}

// ============================================================
// Scene Setup — Cornell Box in canonical cm coordinates
// Reference: https://www.graphics.cornell.edu/online/box/data.html
//   Room:   556 x 549 x 559 cm
//   Light:  130 x 105 cm, centered at (278, 548.7, 279.5)
//   Camera: eye=(278, 273, -800), target=(278, 273, 0), fovY=39.3°
// ============================================================
const W = 556, H = 549, D = 559;

const white = new Material(
    glMatrix.vec3.fromValues(0.73, 0.73, 0.73),
    glMatrix.vec3.fromValues(0.3, 0.3, 0.3),
    32,
    0       // matte walls — no reflection
);
const red = new Material(
    glMatrix.vec3.fromValues(0.65, 0.05, 0.05),
    glMatrix.vec3.fromValues(0.3, 0.3, 0.3),
    16,
    0
);
const green = new Material(
    glMatrix.vec3.fromValues(0.12, 0.45, 0.15),
    glMatrix.vec3.fromValues(0.3, 0.3, 0.3),
    16,
    0
);

// Tall block — polished, mirror-like
const mirror = new Material(
    glMatrix.vec3.fromValues(0.8, 0.8, 0.8),
    glMatrix.vec3.fromValues(1.0, 1.0, 1.0),
    128,
    0.7       // 70% reflective
);

// Short block — slightly glossy
const glossy = new Material(
    glMatrix.vec3.fromValues(0.4, 0.2, 0.1),   // warm brown
    glMatrix.vec3.fromValues(0.8, 0.8, 0.8),
    64,
    0.2       // 20% reflective
);


let scene = {
    objects: [
        // Floor (y=0, normal +Y)
        createRect(glMatrix.vec3.fromValues(W/2,   0, D/2), W, D, [0,  1, 0], white),
        // Ceiling (y=H, normal -Y)
        createRect(glMatrix.vec3.fromValues(W/2,   H, D/2), W, D, [0, -1, 0], white),
        // Back wall (z=D, normal -Z toward camera)
        createRect(glMatrix.vec3.fromValues(W/2, H/2,   D), W, H, [0,  0, -1], white),
        
        // left/right from camera point of view, in world coordinates there are inverted
        // Left wall — red (x=W, normal -X) 
        createRect(glMatrix.vec3.fromValues(  W, H/2, D/2), D, H, [-1,  0,  0], red),
        // Right wall — green (x=0, normal +X)
        createRect(glMatrix.vec3.fromValues(  0, H/2, D/2), D, H, [ 1,  0,  0], green),
        
        // Tall block: 165x330x165, rotated -15°
        createBox(glMatrix.vec3.fromValues(368, 330/2, 352), 165, 330, 165, -15, mirror),
        // Short block: 165x165x165, rotated +18°
        createBox(glMatrix.vec3.fromValues(185, 165/2, 169), 165, 165, 165,  18, glossy),
    ],

    globalAmbient : glMatrix.vec3.fromValues(0.05, 0.05, 0.05),

    lights: [
        new Light(
            glMatrix.vec3.fromValues(W/2, H-1, D/2),  // Center of ceiling light
            glMatrix.vec3.fromValues(6, 6, 6),     
            glMatrix.vec3.fromValues(0.5, 0.5, 0.5),
            1.0, 0.0,
            4 / Math.pow(Math.max(W, H, D), 2)      // slight quadratic falloff
        ),
        // new Light(
        //     glMatrix.vec3.fromValues(W/2, H/2, -100),  // in front of the scene, at camera height
        //     glMatrix.vec3.fromValues(3, 3, 3),
        //     glMatrix.vec3.fromValues(1, 1, 1),
        //     1.0, 0.0,
        //     4 / Math.pow(Math.max(W, H, D), 2)
        // )

    ]
};


// ============================================================
// Run
// ============================================================
const camera = new Camera(
    512, 512,
    [278, 273, -800],  // eye
    [278, 273,    0],  // target
    [0, 1, 0],         // up
    39.3               // fov
);

render(camera, scene);
