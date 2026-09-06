import { SEG_LEN, ROAD_W, PLAYER_W, SPRITES, STAGES, START_TIME, buildTrack } from './track.js';
import { Renderer } from './render.js';
import { clamp, overlap, increase, accelerate } from './util.js';

export const MAX_SPEED = SEG_LEN * 60;         // 12000 units/s  ≈ 300 km/h on the HUD
const ACCEL = MAX_SPEED / 4;
const BRAKE = -MAX_SPEED * 1.1;
const DECEL = -MAX_SPEED / 6;
const OFF_DECEL = -MAX_SPEED * 0.9;
const OFF_LIMIT = MAX_SPEED / 4;
const CENTRIFUGAL = 0.32;
const STEP = 1 / 60;
const BEST_KEY = 'sunset-runner-best';

export class Game {
  constructor(canvas, input, sound, ui) {
    this.renderer = new Renderer(canvas);
    this.input = input; this.sound = sound; this.ui = ui;
    this.track = buildTrack(1986);
    this.segments = this.track.segments;
    this.trackLength = this.track.length;
    for (const car of this.track.cars) { car.z0 = car.z; car.offset0 = car.offset; }

    this.fov = 100;
    this.cameraHeight = 1000;
    this.cameraDepth = 1 / Math.tan((this.fov / 2) * Math.PI / 180);
    this.playerZ = this.cameraHeight * this.cameraDepth;
    this.drawDistance = 220;
    this.fogDensity = 5;

    this.best = this.loadBest();
    this.state = 'title';
    this.reset();
    this.ui.showTitle(this.best);

    this.last = performance.now(); this.acc = 0;
    requestAnimationFrame((t) => this.frame(t));
  }

  loadBest() { try { return JSON.parse(localStorage.getItem(BEST_KEY)) || null; } catch { return null; } }
  saveBest(rec) { try { localStorage.setItem(BEST_KEY, JSON.stringify(rec)); } catch { /* ignore */ } }

  reset() {
    this.position = 0; this.playerX = 0; this.speed = 0; this.speedPct = 0;
    this.skyOffset = 0; this.hillOffset = 0; this.pitch = 0;
    this.time = START_TIME; this.stageIndex = 0;
    this.flash = 0; this.fade = 0; this.spin = 0; this.steer = 0; this.brake = false;
    this.countdown = 0; this.countStep = 4; this.finishTimer = 0;
    this.msgTimer = 0; this.elapsed = 0;
    for (const s of this.segments) s.cars.length = 0;
    for (const car of this.track.cars) {
      car.z = car.z0; car.offset = car.offset0; car.percent = (car.z % SEG_LEN) / SEG_LEN;
      this.findSegment(car.z).cars.push(car);
    }
  }

  findSegment(z) { return this.segments[Math.floor(z / SEG_LEN) % this.segments.length]; }

  start() {
    this.reset();
    this.state = 'countdown';
    this.countdown = 3.6;
    this.ui.showHud();
    this.ui.setStage(0);
    this.ui.setTime(this.time);
  }

  frame(t) {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t; this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 5) { this.update(STEP); this.acc -= STEP; steps++; }
    this.renderer.render(this);
    if (this.ui.debugOn) this.ui.debug(this.input.debugText() + `\nspd:${Math.round(this.speed)} x:${this.playerX.toFixed(2)} fps:${(1 / Math.max(dt, 1e-3)).toFixed(0)}`);
    requestAnimationFrame((tt) => this.frame(tt));
  }

  update(dt) {
    this.input.update();
    this.steer = this.input.steer;
    this.brake = this.input.brake;
    this.flash = Math.max(0, this.flash - dt * 2);
    this.spin *= 0.9;
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.ui.msg(''); }
    this.ui.pedals(this.input.accel, this.input.brake);

    switch (this.state) {
      case 'title': return;
      case 'countdown': {
        this.countdown -= dt;
        const step = Math.ceil(this.countdown);
        if (step !== this.countStep) {
          this.countStep = step;
          if (step > 0) { this.ui.msg(String(step)); this.sound.play('count'); }
        }
        if (this.countdown <= 0) {
          this.state = 'race';
          this.ui.msg('GO!'); this.msgTimer = 0.9; this.sound.play('go');
          this.input.calibrate();
        }
        this.physics(dt, false);
        break;
      }
      case 'race': {
        this.physics(dt, true);
        this.time -= dt; this.elapsed += dt;
        this.ui.setTime(this.time);
        const front = this.position + this.playerZ;
        const nextZ = this.track.stageStartZ[this.stageIndex + 1];
        if (nextZ !== undefined && front >= nextZ) {
          this.stageIndex++;
          const bonus = STAGES[this.stageIndex].bonus;
          this.time += bonus;
          this.ui.setStage(this.stageIndex);
          this.ui.msg(`CHECKPOINT  +${bonus}s`); this.msgTimer = 1.6; this.sound.play('checkpoint');
        }
        if (front >= this.track.goalZ) { this.finish(true); }
        else if (this.time <= 0) { this.time = 0; this.finish(false); }
        break;
      }
      case 'finished': {
        this.physics(dt, false, true);
        this.finishTimer -= dt;
        this.fade = clamp(1 - this.finishTimer / 0.8, 0, 0.6);
        if (this.finishTimer <= 0) { this.state = 'result'; this.showResult(); }
        break;
      }
      case 'result': return;
    }
    this.sound.setEngine(this.speedPct, this.input.accel && this.state === 'race', Math.abs(this.playerX) > 1.1 && this.speed > 0);
    this.ui.setSpeed(this.speed / 40);
  }

  physics(dt, controls, coast = false) {
    const playerSegment = this.findSegment(this.position + this.playerZ);
    const playerW = PLAYER_W / ROAD_W;
    const speedPct = this.speed / MAX_SPEED;
    const dx = dt * 2 * speedPct;
    const startPosition = this.position;

    this.updateCars(dt, playerSegment, playerW);

    this.position = increase(this.position, dt * this.speed, this.trackLength);

    if (controls || coast) {
      this.playerX -= dx * speedPct * playerSegment.curve * CENTRIFUGAL;
      this.playerX += dx * this.steer * 1.25;
    }

    if (controls) {
      if (this.input.accel) this.speed = accelerate(this.speed, ACCEL, dt);
      else if (this.input.brake) this.speed = accelerate(this.speed, BRAKE, dt);
      else this.speed = accelerate(this.speed, DECEL, dt);
    } else {
      this.speed = accelerate(this.speed, coast ? DECEL * 1.5 : DECEL, dt);
    }

    if (Math.abs(this.playerX) > 1.1) {
      if (this.speed > OFF_LIMIT) this.speed = accelerate(this.speed, OFF_DECEL, dt);
      for (const s of playerSegment.sprites) {
        const def = SPRITES[s.type];
        if (!def.solid) continue;
        const sw = def.w / ROAD_W;
        if (overlap(this.playerX, playerW, s.offset, sw)) {
          this.crash(MAX_SPEED / 5, increase(playerSegment.p1.world.z, -this.playerZ, this.trackLength));
          break;
        }
      }
    }

    for (const car of playerSegment.cars) {
      if (this.speed > car.speed && overlap(this.playerX, playerW, car.offset, car.w / ROAD_W, 0.8)) {
        this.crash(car.speed * (car.speed / this.speed), increase(car.z, -this.playerZ, this.trackLength));
        break;
      }
    }

    this.playerX = clamp(this.playerX, -2.6, 2.6);
    this.speed = clamp(this.speed, 0, MAX_SPEED);
    this.speedPct = this.speed / MAX_SPEED;

    this.skyOffset += 18 * playerSegment.curve * this.speedPct * dt;
    this.hillOffset += 45 * playerSegment.curve * this.speedPct * dt;
    const slope = (playerSegment.p2.world.y - playerSegment.p1.world.y) / SEG_LEN;
    this.pitch += (clamp(slope, -0.6, 0.6) - this.pitch) * 0.1;
    void startPosition;
  }

  crash(newSpeed, newPosition) {
    if (this.speed > MAX_SPEED * 0.15) { this.flash = 0.5; this.spin = (Math.random() > 0.5 ? 1 : -1) * 0.25; this.sound.play('crash'); }
    this.speed = newSpeed;
    this.position = newPosition;
  }

  updateCars(dt, playerSegment, playerW) {
    for (const car of this.track.cars) {
      const oldSeg = this.findSegment(car.z);
      car.offset += this.carOffset(car, oldSeg, playerSegment, playerW);
      car.z = increase(car.z, dt * car.speed, this.trackLength);
      car.percent = (car.z % SEG_LEN) / SEG_LEN;
      const newSeg = this.findSegment(car.z);
      if (oldSeg !== newSeg) {
        const i = oldSeg.cars.indexOf(car);
        if (i >= 0) oldSeg.cars.splice(i, 1);
        newSeg.cars.push(car);
      }
    }
  }

  carOffset(car, carSegment, playerSegment, playerW) {
    const lookahead = 20, carW = car.w / ROAD_W;
    if ((carSegment.index - playerSegment.index) > this.drawDistance) return 0;
    for (let i = 1; i < lookahead; i++) {
      const seg = this.segments[(carSegment.index + i) % this.segments.length];
      if (seg === playerSegment && car.speed > this.speed && overlap(this.playerX, playerW, car.offset, carW, 1.2)) {
        const dir = this.playerX > 0.5 ? -1 : this.playerX < -0.5 ? 1 : (car.offset > this.playerX ? 1 : -1);
        return dir / i * (car.speed - this.speed) / MAX_SPEED;
      }
      for (const other of seg.cars) {
        if (car.speed > other.speed && overlap(car.offset, carW, other.offset, other.w / ROAD_W, 1.2)) {
          const dir = other.offset > 0.5 ? -1 : other.offset < -0.5 ? 1 : (car.offset > other.offset ? 1 : -1);
          return dir / i * (car.speed - other.speed) / MAX_SPEED;
        }
      }
    }
    if (car.offset < -0.9) return 0.1;
    if (car.offset > 0.9) return -0.1;
    return 0;
  }

  finish(goal) {
    this.state = 'finished';
    this.goal = goal;
    this.finishTimer = goal ? 3.0 : 2.2;
    this.ui.msg(goal ? 'GOAL!' : 'TIME UP'); this.msgTimer = this.finishTimer;
    this.sound.play(goal ? 'goal' : 'timeup');
    this.sound.stopEngine();
    const distanceKm = this.position / 40000;   // 40 units = 1 m at the HUD scale
    const timeBonus = goal ? Math.floor(this.time) * 100 : 0;
    this.score = Math.floor(distanceKm * 1000) + timeBonus;
    this.result = { score: this.score, distanceKm, stage: this.stageIndex + 1, goal, elapsed: this.elapsed, timeLeft: this.time };
    if (!this.best || this.score > this.best.score) { this.best = { score: this.score, distanceKm, stage: this.stageIndex + 1, goal }; this.saveBest(this.best); this.result.newBest = true; }
  }

  showResult() {
    this.ui.msg('');
    this.ui.showGameOver(this.result);
  }

  restart() { this.fade = 0; this.start(); }
}
