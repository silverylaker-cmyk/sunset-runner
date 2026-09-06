import { clamp, wrapDeg } from './util.js';

// Steering from the phone's gravity vector projected onto the screen plane.
// Works for both landscape orientations; the neutral angle is calibrated on start,
// which also cancels the iOS/Android sign difference of accelerationIncludingGravity.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.steer = 0;          // -1 .. 1
    this.accel = false;
    this.brake = false;
    this.keys = new Set();
    this.rawAngle = 0;       // degrees, uncalibrated wheel angle
    this.neutral = 0;
    this.calibSamples = null;
    this.sensorSource = 'none';
    this.lastSensorAt = 0;
    this.gravity = { x: 0, y: 0, z: 0 };
    this.orientAngle = 0;
    this.pointers = new Map(); // pointerId -> zone
    this.dragSteer = null;
    this.invert = false;
    this.sensitivityDeg = 28; // degrees of wheel rotation for full lock
    this.deadzoneDeg = 1.5;
    this.smooth = 0.35;

    this._bindKeys();
    this._bindPointers();
    this._bindSensors();
    this._updateOrientation();
    (screen.orientation || window).addEventListener('change', () => this._updateOrientation());
    window.addEventListener('orientationchange', () => this._updateOrientation());
  }

  // must be called inside a user gesture (iOS 13+)
  async requestPermission() {
    const asks = [];
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      asks.push(DeviceMotionEvent.requestPermission().catch(() => 'denied'));
    }
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      asks.push(DeviceOrientationEvent.requestPermission().catch(() => 'denied'));
    }
    const results = await Promise.all(asks);
    this.permission = results.length === 0 ? 'not-needed' : results.join('/');
    return this.permission;
  }

  calibrate() { this.calibSamples = []; }

  get hasSensor() { return performance.now() - this.lastSensorAt < 1500; }

  _updateOrientation() {
    const a = (screen.orientation && typeof screen.orientation.angle === 'number')
      ? screen.orientation.angle
      : (typeof window.orientation === 'number' ? window.orientation : 0);
    this.orientAngle = ((a % 360) + 360) % 360;
  }

  _bindSensors() {
    let motionSeen = false;
    window.addEventListener('devicemotion', (e) => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null) return;
      motionSeen = true;
      this.gravity = { x: g.x, y: g.y, z: g.z };
      this.sensorSource = 'motion';
      this._sensorUpdate();
    });
    window.addEventListener('deviceorientation', (e) => {
      if (motionSeen || e.beta == null) return;
      const b = e.beta * Math.PI / 180, g = e.gamma * Math.PI / 180;
      // gravity direction in device frame derived from beta/gamma
      this.gravity = { x: Math.sin(g) * Math.cos(b), y: -Math.sin(b), z: -Math.cos(g) * Math.cos(b) };
      this.sensorSource = 'orientation';
      this._sensorUpdate();
    });
  }

  _sensorUpdate() {
    const { x, y } = this.gravity;
    // screen-right / screen-up axes expressed in device coordinates
    let r, u;
    switch (this.orientAngle) {
      case 90:  r = -y; u = x;  break;   // top of device points left
      case 270: r = y;  u = -x; break;   // top of device points right
      case 180: r = -x; u = -y; break;
      default:  r = x;  u = y;  break;   // portrait
    }
    const angle = Math.atan2(r, -u) * 180 / Math.PI;
    this.rawAngle = angle;
    this.lastSensorAt = performance.now();
    if (this.calibSamples) {
      this.calibSamples.push(angle);
      if (this.calibSamples.length >= 8) {
        // average on the unit circle to avoid wrap problems
        let sx = 0, sy = 0;
        for (const a of this.calibSamples) { sx += Math.cos(a * Math.PI / 180); sy += Math.sin(a * Math.PI / 180); }
        this.neutral = Math.atan2(sy, sx) * 180 / Math.PI;
        this.calibSamples = null;
      }
    }
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
      this.keys.add(e.key);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _bindPointers() {
    const zoneOf = (x) => {
      const w = window.innerWidth;
      if (x < w * 0.22) return 'brake';
      if (x > w * 0.78) return 'accel';
      return 'mid';
    };
    const down = (e) => {
      if (e.target.closest && e.target.closest('button, .overlay')) return;
      e.preventDefault();
      const zone = zoneOf(e.clientX);
      this.pointers.set(e.pointerId, zone);
      if (zone === 'mid' && !this.hasSensor) this.dragSteer = { id: e.pointerId, x: e.clientX };
    };
    const move = (e) => {
      if (this.dragSteer && this.dragSteer.id === e.pointerId) this.dragSteer.x = e.clientX;
    };
    const up = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.dragSteer && this.dragSteer.id === e.pointerId) this.dragSteer = null;
    };
    document.addEventListener('pointerdown', down, { passive: false });
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  update() {
    // pedals
    let accel = false, brake = false;
    for (const z of this.pointers.values()) { if (z === 'accel') accel = true; if (z === 'brake') brake = true; }
    if (this.keys.has('ArrowUp') || this.keys.has(' ') || this.keys.has('w')) accel = true;
    if (this.keys.has('ArrowDown') || this.keys.has('s')) brake = true;
    this.accel = accel; this.brake = brake;

    // steering target
    let target = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('a')) target -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('d')) target += 1;
    if (target === 0 && this.dragSteer && !this.hasSensor) {
      target = clamp((this.dragSteer.x - window.innerWidth / 2) / (window.innerWidth * 0.2), -1, 1);
    } else if (target === 0 && this.hasSensor) {
      let d = wrapDeg(this.rawAngle - this.neutral);
      if (Math.abs(d) < this.deadzoneDeg) d = 0;
      else d -= Math.sign(d) * this.deadzoneDeg;
      target = clamp(d / this.sensitivityDeg, -1, 1);
      // gentle expo curve so small corrections are precise
      target = Math.sign(target) * Math.pow(Math.abs(target), 1.3);
      if (this.invert) target = -target;
    }
    const k = this.hasSensor && !this.dragSteer ? this.smooth : 0.5;
    this.steer += (target - this.steer) * k;
    if (Math.abs(this.steer) < 0.002) this.steer = 0;
  }

  debugText() {
    const g = this.gravity;
    return `src:${this.sensorSource} perm:${this.permission || '-'} orient:${this.orientAngle}\n` +
      `g: ${g.x.toFixed(2)} ${g.y.toFixed(2)} ${g.z.toFixed(2)}\n` +
      `raw:${this.rawAngle.toFixed(1)} neutral:${this.neutral.toFixed(1)} steer:${this.steer.toFixed(2)}`;
  }
}
