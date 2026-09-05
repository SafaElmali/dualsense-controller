import { Quaternion, Vector3 } from './vendor/three/three.module.min.js';

// DualSense/SDL: X right, Y out of the button face, Z toward the handles.
// Our front-facing mesh: X right, Y toward the USB port, Z out of the face.
// Rotate the sensor basis +90° about X: (x, y, z) -> (x, -z, y).
export class GyroOrientation {
  constructor() {
    this.rotation = new Quaternion();
    this.up = new Vector3(0, 1, 0);
    this.axis = new Vector3(); this.gravity = new Vector3();
    this.delta = new Quaternion(); this.correction = new Quaternion();
    this.reset();
  }

  reset() { this.rotation.identity(); this.realign(); }
  realign() { this.needsTilt = true; }

  update({ pitch, yaw, roll, acceleration, dt }) {
    if (![pitch, yaw, roll, dt].every(Number.isFinite) || dt <= 0 || dt > .1) return this.rotation.toArray();
    this.axis.set(pitch, -roll, yaw);
    const speed = this.axis.length();
    if (speed) {
      this.delta.setFromAxisAngle(this.axis.multiplyScalar(1 / speed), speed * Math.PI / 180 * dt);
      this.rotation.multiply(this.delta).normalize();
    }

    if (acceleration?.length === 3 && acceleration.every(Number.isFinite)) {
      this.gravity.set(acceleration[0], -acceleration[2], acceleration[1]);
      const magnitude = this.gravity.length();
      // Gravity establishes tilt, never compass heading. Ignore strong linear
      // acceleration; gently correct tilt only during slow/stationary motion.
      if (magnitude > .9 && magnitude < 1.1 && (this.needsTilt || speed < 20)) {
        this.gravity.multiplyScalar(1 / magnitude).applyQuaternion(this.rotation);
        this.delta.setFromUnitVectors(this.gravity, this.up);
        this.correction.identity().slerp(this.delta, this.needsTilt ? 1 : 1 - Math.exp(-1.5 * dt));
        this.rotation.premultiply(this.correction).normalize();
        this.needsTilt = false;
      }
    }
    return this.rotation.toArray();
  }
}
