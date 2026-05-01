class FlightCamera {
    static DEG_TO_RAD = Math.PI / 180;
    MovementSpeed = 2.5;
    MouseSensitivity = 0.05;
    ScrollSensitivity = 0.015;
    Zoom = 45;

    constructor({ position = glMatrix.vec3.fromValues(0, 0, 0), up = glMatrix.vec3.fromValues(0, 1, 0), yaw = -90, pitch = 0 } = {}) {
        this.Position  = glMatrix.vec3.clone(position);
        this.WorldUp   = glMatrix.vec3.clone(up);
        this.Yaw       = yaw;
        this.Pitch     = pitch;
        this.Roll      = 0;      // degrees, constrained to (-89, 89)
        this.Speed     = 0;      // world units/sec, constrained to [0, MaxSpeed]
        this.MaxSpeed  = 8;
        this.InitYaw   = yaw;    // used to constrain Yaw to (InitYaw-89, InitYaw+89)
        this.Front = glMatrix.vec3.fromValues(0, 0, -1);
        this.Up    = glMatrix.vec3.create();
        this.Right = glMatrix.vec3.create();
        this.updateCameraVectors();
    }

    getViewMatrix() {
        const target = glMatrix.vec3.create();
        glMatrix.vec3.add(target, this.Position, this.Front);
        const view = glMatrix.mat4.create();
        glMatrix.mat4.lookAt(view, this.Position, target, this.Up);
        return view;
    }

    updateCameraVectors() {
        const yawR   = this.Yaw   * FlightCamera.DEG_TO_RAD;
        const pitchR = this.Pitch * FlightCamera.DEG_TO_RAD;

        const front = glMatrix.vec3.fromValues(
            Math.cos(yawR) * Math.cos(pitchR),
            Math.sin(pitchR),
            Math.sin(yawR) * Math.cos(pitchR)
        );
        glMatrix.vec3.normalize(this.Front, front);
        glMatrix.vec3.cross(this.Right, this.Front, this.WorldUp);
        glMatrix.vec3.normalize(this.Right, this.Right);
        glMatrix.vec3.cross(this.Up, this.Right, this.Front);
        glMatrix.vec3.normalize(this.Up, this.Up);

        // Apply roll: rotate Up and Right around Front axis
        const rollR = this.Roll * FlightCamera.DEG_TO_RAD;
        const cos = Math.cos(rollR);
        const sin = Math.sin(rollR);

        const newUp    = glMatrix.vec3.scaleAndAdd(glMatrix.vec3.create(), glMatrix.vec3.scale(glMatrix.vec3.create(), this.Up, cos),    this.Right, -sin);
        const newRight = glMatrix.vec3.scaleAndAdd(glMatrix.vec3.create(), glMatrix.vec3.scale(glMatrix.vec3.create(), this.Right, cos), this.Up,    sin);

        glMatrix.vec3.copy(this.Up,    newUp);
        glMatrix.vec3.copy(this.Right, newRight);
    }

    update(dt) {
        // Advance position along the look direction at current speed
        glMatrix.vec3.scaleAndAdd(this.Position, this.Position, this.Front, this.Speed * dt);
        // Clamp altitude
        this.Position[1] = Math.min(5.5, Math.max(3.0, this.Position[1]));
    }
}
