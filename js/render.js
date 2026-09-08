import { SEG_LEN, ROAD_W, LANES, SPRITES, CAR_H, PLAYER_W, STAGES } from './track.js';
import { lerp, clamp } from './util.js';

const exponentialFog = (dist, density) => 1 / Math.exp(dist * dist * density);

function hash(n) { let x = (n * 374761393 + 668265263) | 0; x = (x ^ (x >>> 13)) * 1274126177; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; }

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.w = canvas.width; this.h = canvas.height;
    this.stars = Array.from({ length: 90 }, (_, i) => ({ x: hash(i * 3), y: hash(i * 3 + 1) * 0.45, s: hash(i * 3 + 2) }));
  }

  resize(w, h) {
    this.canvas.width = this.w = w; this.canvas.height = this.h = h;
    this.ctx.imageSmoothingEnabled = false;
  }

  polygon(x1, y1, x2, y2, x3, y3, x4, y4, color) {
    const c = this.ctx;
    c.fillStyle = color; c.beginPath();
    c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.lineTo(x4, y4); c.closePath(); c.fill();
  }

  // ---------------- background ----------------
  background(theme, skyOffset, hillOffset, horizonY, nextTheme, blend) {
    const c = this.ctx, w = this.w, h = this.h;
    const col = (k, i) => theme[k][i];
    const grad = c.createLinearGradient(0, 0, 0, horizonY + 10);
    grad.addColorStop(0, col('sky', 0)); grad.addColorStop(0.75, col('sky', 1)); grad.addColorStop(1, col('sky', 2));
    c.fillStyle = grad; c.fillRect(0, 0, w, h);

    if (theme.stars) {
      c.fillStyle = '#fff';
      for (const s of this.stars) {
        const sx = ((s.x * w * 2 - skyOffset * 0.3) % (w * 2) + w * 2) % (w * 2) - w * 0.5;
        if (sx < 0 || sx > w) continue;
        const sz = s.s > 0.85 ? 2 : 1;
        c.globalAlpha = 0.5 + 0.5 * s.s; c.fillRect(sx | 0, (s.y * horizonY) | 0, sz, sz);
      }
      c.globalAlpha = 1;
    }

    // striped sun
    const sunR = h * 0.17;
    const sunX = w * 0.62 - skyOffset * 0.25, sunY = horizonY - sunR * 0.55;
    c.save(); c.beginPath(); c.arc(sunX, sunY, sunR, 0, Math.PI * 2); c.clip();
    const sg = c.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
    sg.addColorStop(0, theme.sun); sg.addColorStop(1, col('sky', 2));
    c.fillStyle = sg; c.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);
    c.fillStyle = col('sky', 1);
    for (let i = 0; i < 6; i++) { const yy = sunY + sunR * (0.05 + i * 0.16); c.fillRect(sunX - sunR, yy, sunR * 2, 1 + i * 0.8); }
    c.restore();

    // clouds
    c.fillStyle = theme.stars ? '#ffffff22' : '#ffffff99';
    for (let i = 0; i < 7; i++) {
      const cx = ((hash(i * 7) * w * 2 - skyOffset * 0.5) % (w * 2) + w * 2) % (w * 2) - w * 0.5;
      const cy = horizonY * (0.2 + hash(i * 7 + 1) * 0.45), cw = w * (0.08 + hash(i * 7 + 2) * 0.1), ch = h * 0.02;
      c.fillRect(cx, cy, cw, ch); c.fillRect(cx + cw * 0.2, cy - ch, cw * 0.5, ch);
    }

    // two parallax hill layers
    for (let layer = 0; layer < 2; layer++) {
      const amp = h * (layer === 0 ? 0.13 : 0.08), base = horizonY + (layer === 0 ? 2 : 6);
      const off = hillOffset * (layer === 0 ? 0.6 : 1.1);
      c.fillStyle = theme.hills[layer];
      c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) {
        const t = (x + off) * 0.011 + layer * 9;
        const y = base - amp * (0.55 + 0.45 * Math.sin(t) * Math.sin(t * 0.37 + 1) + 0.25 * Math.sin(t * 2.3));
        c.lineTo(x, y);
      }
      c.lineTo(w, h); c.closePath(); c.fill();
    }
    c.fillStyle = theme.grass[0]; c.fillRect(0, horizonY, w, h - horizonY);
  }

  // ---------------- road ----------------
  segment(x1, y1, w1, x2, y2, w2, fog, colors, fogColor, alt) {
    const c = this.ctx, w = this.w;
    const r1 = w1 / 6, r2 = w2 / 6, l1 = w1 / 32, l2 = w2 / 32;
    c.fillStyle = colors.grass; c.fillRect(0, y2, w, y1 - y2 + 1);
    this.polygon(x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, colors.rumble);
    this.polygon(x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, colors.rumble);
    this.polygon(x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, colors.road);
    if (alt) {
      const lw1 = w1 * 2 / LANES, lw2 = w2 * 2 / LANES;
      let lx1 = x1 - w1 + lw1, lx2 = x2 - w2 + lw2;
      for (let l = 1; l < LANES; l++, lx1 += lw1, lx2 += lw2) {
        this.polygon(lx1 - l1 / 2, y1, lx1 + l1 / 2, y1, lx2 + l2 / 2, y2, lx2 - l2 / 2, y2, colors.lane);
      }
    }
    if (fog < 1) {
      c.globalAlpha = 1 - fog; c.fillStyle = fogColor; c.fillRect(0, y2, w, y1 - y2 + 1); c.globalAlpha = 1;
    }
  }

  // ---------------- sprites ----------------
  drawSprite(type, x, y, scale, clipY, sprite, segIndex) {
    const def = SPRITES[type]; if (!def) return;
    const dw = def.w * scale * this.w / 2, dh = def.h * scale * this.w / 2;
    if (dw < 1) return;
    const c = this.ctx;
    c.save();
    c.beginPath(); c.rect(0, 0, this.w, clipY); c.clip();
    c.translate(x, y);
    if (sprite && sprite.flip && type !== 'sign') c.scale(-1, 1);
    this.shapes[type](c, dw, dh, sprite, segIndex);
    c.restore();
  }

  get shapes() {
    return this._shapes || (this._shapes = {
      palm(c, w, h) {
        c.fillStyle = '#7a4a2a'; c.fillRect(-w * 0.06, -h * 0.62, w * 0.12, h * 0.62);
        c.fillStyle = '#5c3a1e'; c.fillRect(-w * 0.06, -h * 0.62, w * 0.04, h * 0.62);
        c.fillStyle = '#2f9e44';
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i - 2.5) * 0.55;
          c.beginPath(); c.ellipse(Math.cos(a) * w * 0.28, -h * 0.65 + Math.sin(a) * h * 0.2, w * 0.34, h * 0.07, a, 0, Math.PI * 2); c.fill();
        }
        c.fillStyle = '#8a5a2a'; c.beginPath(); c.arc(0, -h * 0.62, w * 0.08, 0, Math.PI * 2); c.fill();
      },
      pine(c, w, h) {
        c.fillStyle = '#5a3a1e'; c.fillRect(-w * 0.07, -h * 0.25, w * 0.14, h * 0.25);
        const cols = ['#1f6b34', '#25803e', '#2c9448'];
        for (let i = 0; i < 3; i++) {
          const top = -h * (1 - i * 0.22), bot = -h * (0.55 - i * 0.17), ww = w * (0.28 + i * 0.12);
          c.fillStyle = cols[i]; c.beginPath(); c.moveTo(0, top); c.lineTo(ww, bot); c.lineTo(-ww, bot); c.closePath(); c.fill();
        }
      },
      bush(c, w, h) {
        c.fillStyle = '#2b8a3e';
        c.beginPath(); c.arc(-w * 0.25, -h * 0.35, h * 0.4, 0, Math.PI * 2); c.arc(w * 0.22, -h * 0.4, h * 0.45, 0, Math.PI * 2); c.arc(0, -h * 0.55, h * 0.4, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#40c057'; c.beginPath(); c.arc(w * 0.1, -h * 0.65, h * 0.2, 0, Math.PI * 2); c.fill();
      },
      rock(c, w, h) {
        c.fillStyle = '#8d8d8d'; c.beginPath(); c.moveTo(-w * 0.5, 0); c.lineTo(-w * 0.35, -h * 0.7); c.lineTo(-w * 0.05, -h); c.lineTo(w * 0.3, -h * 0.8); c.lineTo(w * 0.5, 0); c.closePath(); c.fill();
        c.fillStyle = '#b5b5b5'; c.beginPath(); c.moveTo(-w * 0.35, -h * 0.7); c.lineTo(-w * 0.05, -h); c.lineTo(w * 0.1, -h * 0.55); c.closePath(); c.fill();
      },
      cactus(c, w, h) {
        c.fillStyle = '#2f9e44';
        c.fillRect(-w * 0.18, -h, w * 0.36, h);
        c.fillRect(-w * 0.5, -h * 0.7, w * 0.16, h * 0.35); c.fillRect(-w * 0.5, -h * 0.4, w * 0.4, h * 0.12);
        c.fillRect(w * 0.34, -h * 0.85, w * 0.16, h * 0.4); c.fillRect(w * 0.1, -h * 0.5, w * 0.4, h * 0.12);
      },
      lamp(c, w, h) {
        c.fillStyle = '#9aa0a6'; c.fillRect(-w * 0.5, -h, w, h);
        c.fillRect(-w * 0.5, -h, w * 2.6, w * 0.7);
        c.fillStyle = '#fff3a0'; c.fillRect(w * 1.2, -h + w * 0.7, w * 0.9, w * 0.8);
      },
      sign(c, w, h, s) {
        const v = (s && s.variant) || 0;
        c.fillStyle = '#6b4c2a'; c.fillRect(-w * 0.06, -h * 0.55, w * 0.12, h * 0.55);
        const cols = [['#ffd23f', '#d6336c'], ['#3b7dff', '#fff'], ['#ff7f3f', '#222'], ['#2fbf71', '#fff'], ['#e03131', '#fff']];
        c.fillStyle = cols[v][0]; c.fillRect(-w * 0.5, -h, w, h * 0.48);
        c.fillStyle = cols[v][1];
        c.font = `bold ${Math.max(4, h * 0.2)}px monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(['SUNSET', 'RUNNER', 'TURBO', 'COAST', 'SLOW!'][v], 0, -h * 0.76);
      },
      building(c, w, h, s, idx) {
        const k = hash(idx * 11 + 5);
        const hh = h * (0.6 + k * 0.4);
        c.fillStyle = ['#3d2a5c', '#2a3d5c', '#4a2a4a', '#2d2d3d'][Math.floor(k * 4)];
        c.fillRect(-w * 0.5, -hh, w, hh);
        c.fillStyle = '#ffe28a';
        const cols = 4, rows = Math.max(2, Math.floor(hh / (w * 0.22)));
        for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
          if (hash(idx * 131 + r * 17 + q) < 0.55) c.fillRect(-w * 0.42 + q * w * 0.22, -hh + w * 0.1 + r * w * 0.22, w * 0.12, w * 0.12);
        }
        c.fillStyle = '#ff2d95'; c.fillRect(-w * 0.5, -hh - h * 0.03, w, h * 0.03);
      },
      gate(c, w, h, s) { this.banner(c, w, h, 'CHECKPOINT', '#ffd23f', '#d6336c'); },
      goal(c, w, h, s) { this.banner(c, w, h, 'GOAL', '#fff', '#111'); },
      banner(c, w, h, text, bg, fg) {
        c.fillStyle = '#ddd'; c.fillRect(-w * 0.5, -h, w * 0.03, h); c.fillRect(w * 0.47, -h, w * 0.03, h);
        c.fillStyle = bg; c.fillRect(-w * 0.5, -h, w, h * 0.28);
        c.fillStyle = fg;
        const n = 10, cw = w / n;
        for (let i = 0; i < n; i++) if (i % 2 === 0) { c.fillRect(-w * 0.5 + i * cw, -h, cw, h * 0.05); c.fillRect(-w * 0.5 + i * cw, -h * 0.77, cw, h * 0.05); }
        c.font = `bold ${Math.max(4, h * 0.16)}px monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(text, 0, -h * 0.86);
      },
    });
  }

  car(x, y, w, h, color, tilt = 0, truck = false, player = false, brakeOn = false) {
    const c = this.ctx;
    if (w < 2) return;
    c.save(); c.translate(x, y); c.rotate(tilt);
    // shadow
    c.fillStyle = '#00000055'; c.fillRect(-w * 0.52, -h * 0.06, w * 1.04, h * 0.12);
    // wheels
    c.fillStyle = '#111'; c.fillRect(-w * 0.5, -h * 0.38, w * 0.2, h * 0.38); c.fillRect(w * 0.3, -h * 0.38, w * 0.2, h * 0.38);
    if (truck) {
      c.fillStyle = color; c.fillRect(-w * 0.48, -h * 1.7, w * 0.96, h * 1.55);
      c.fillStyle = '#00000033'; c.fillRect(-w * 0.48, -h * 1.7, w * 0.96, h * 0.1);
      c.fillStyle = '#333'; c.fillRect(-w * 0.48, -h * 0.35, w * 0.96, h * 0.2);
    } else {
      // body
      c.fillStyle = color; c.fillRect(-w * 0.48, -h * 0.62, w * 0.96, h * 0.5);
      c.fillStyle = '#00000033'; c.fillRect(-w * 0.48, -h * 0.25, w * 0.96, h * 0.13);
      // roof + rear window
      const dark = '#00000044';
      c.fillStyle = color; c.beginPath(); c.moveTo(-w * 0.34, -h * 0.62); c.lineTo(-w * 0.26, -h); c.lineTo(w * 0.26, -h); c.lineTo(w * 0.34, -h * 0.62); c.closePath(); c.fill();
      c.fillStyle = dark; c.beginPath(); c.moveTo(-w * 0.34, -h * 0.62); c.lineTo(-w * 0.26, -h); c.lineTo(w * 0.26, -h); c.lineTo(w * 0.34, -h * 0.62); c.closePath(); c.fill();
      c.fillStyle = '#1b2a4a'; c.beginPath(); c.moveTo(-w * 0.3, -h * 0.66); c.lineTo(-w * 0.23, -h * 0.94); c.lineTo(w * 0.23, -h * 0.94); c.lineTo(w * 0.3, -h * 0.66); c.closePath(); c.fill();
      if (player) {
        c.fillStyle = '#ffd6a5'; c.fillRect(-w * 0.15, -h * 0.9, w * 0.08, h * 0.1); c.fillRect(w * 0.02, -h * 0.9, w * 0.08, h * 0.1);
        c.fillStyle = '#222'; c.fillRect(-w * 0.16, -h * 0.94, w * 0.1, h * 0.05); c.fillRect(w * 0.01, -h * 0.94, w * 0.1, h * 0.05);
      }
    }
    // tail lights
    c.fillStyle = brakeOn ? '#ff3b3b' : '#c0202a';
    c.fillRect(-w * 0.46, -h * 0.5, w * 0.16, h * 0.1); c.fillRect(w * 0.3, -h * 0.5, w * 0.16, h * 0.1);
    if (brakeOn) { c.fillStyle = '#ff000055'; c.fillRect(-w * 0.5, -h * 0.55, w * 0.24, h * 0.2); c.fillRect(w * 0.26, -h * 0.55, w * 0.24, h * 0.2); }
    // plate
    c.fillStyle = '#eee'; c.fillRect(-w * 0.1, -h * 0.4, w * 0.2, h * 0.08);
    c.restore();
  }

  // ---------------- main ----------------
  render(g) {
    const { segments, position, playerX, playerZ, cameraHeight, cameraDepth, drawDistance, trackLength } = g;
    const w = this.w, h = this.h, c = this.ctx;
    const theme = STAGES[g.stageIndex];

    const baseSegment = g.findSegment(position);
    const basePercent = (position % SEG_LEN) / SEG_LEN;
    const playerSegment = g.findSegment(position + playerZ);
    const playerPercent = ((position + playerZ) % SEG_LEN) / SEG_LEN;
    const playerY = lerp(playerSegment.p1.world.y, playerSegment.p2.world.y, playerPercent);

    // the horizon moves with the player's altitude (hills tilt the view)
    const horizonY = Math.round(h / 2 - clamp(playerSegment.curve * 0, -1, 1));
    this.background(theme, g.skyOffset, g.hillOffset, horizonY + Math.round(g.pitch * h * 0.1));

    let maxy = h, x = 0, dx = -(baseSegment.curve * basePercent);
    const fogColor = theme.fog;
    let playerDrawn = false;

    for (let n = 0; n < drawDistance; n++) {
      const seg = segments[(baseSegment.index + n) % segments.length];
      seg.looped = seg.index < baseSegment.index;
      seg.fog = exponentialFog(n / drawDistance, g.fogDensity);
      seg.clip = maxy;
      const camZ = position - (seg.looped ? trackLength : 0);
      this.project(seg.p1, playerX * ROAD_W - x, playerY + cameraHeight, camZ, cameraDepth);
      this.project(seg.p2, playerX * ROAD_W - x - dx, playerY + cameraHeight, camZ, cameraDepth);
      x += dx; dx += seg.curve;
      if (seg.p1.camera.z <= cameraDepth || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;
      const st = STAGES[seg.stage];
      const colors = seg.alt
        ? { grass: st.grass[0], road: st.road[0], rumble: st.rumble[0], lane: st.lane }
        : { grass: st.grass[1], road: st.road[1], rumble: st.rumble[1], lane: st.lane };
      this.segment(seg.p1.screen.x, seg.p1.screen.y, seg.p1.screen.w, seg.p2.screen.x, seg.p2.screen.y, seg.p2.screen.w, seg.fog, colors, fogColor, seg.alt);
      maxy = seg.p1.screen.y;
    }

    // sprites and cars, far to near
    for (let n = drawDistance - 1; n >= 0; n--) {
      const seg = segments[(baseSegment.index + n) % segments.length];
      if (seg.p1.camera.z <= cameraDepth) continue;
      for (const car of seg.cars) {
        const scale = lerp(seg.p1.screen.scale, seg.p2.screen.scale, car.percent);
        const cx = lerp(seg.p1.screen.x, seg.p2.screen.x, car.percent) + scale * car.offset * ROAD_W * w / 2;
        const cy = lerp(seg.p1.screen.y, seg.p2.screen.y, car.percent);
        const cw = car.w * scale * w / 2, ch = CAR_H * scale * w / 2;
        c.save(); c.beginPath(); c.rect(0, 0, w, seg.clip); c.clip();
        this.car(cx, cy, cw, ch, car.color, 0, car.truck);
        c.restore();
      }
      for (const s of seg.sprites) {
        const scale = seg.p1.screen.scale;
        const sx = seg.p1.screen.x + scale * s.offset * ROAD_W * w / 2;
        this.drawSprite(s.type, sx, seg.p1.screen.y, scale, seg.clip, s, seg.index);
      }
      if (seg === playerSegment && !playerDrawn) { this.player(g, playerSegment, playerPercent); playerDrawn = true; }
    }
    if (!playerDrawn) this.player(g, playerSegment, playerPercent);

    if (g.flash > 0) { c.fillStyle = `rgba(255,255,255,${g.flash})`; c.fillRect(0, 0, w, h); }
    if (g.fade > 0) { c.fillStyle = `rgba(0,0,0,${g.fade})`; c.fillRect(0, 0, w, h); }
  }

  player(g, seg, percent) {
    const w = this.w, h = this.h;
    const scale = g.cameraDepth / g.playerZ;
    const bounce = (Math.random() * 2 - 1) * g.speedPct * 1.5;
    const camY = lerp(seg.p1.camera.y, seg.p2.camera.y, percent);
    const y = h / 2 - scale * camY * h / 2 + bounce - h * 0.02;
    const cw = PLAYER_W * scale * w / 2, ch = CAR_H * scale * w / 2;
    const tilt = g.steer * 0.08 + (g.spin || 0);
    this.car(w / 2 + g.steer * cw * 0.05, y, cw, ch, '#e8262b', tilt, false, true, g.brake && g.speedPct > 0.02);
  }

  project(p, cameraX, cameraY, cameraZ, cameraDepth) {
    p.camera.x = -cameraX;
    p.camera.y = p.world.y - cameraY;
    p.camera.z = p.world.z - cameraZ;
    const scale = p.screen.scale = cameraDepth / Math.max(p.camera.z, 1e-6);
    p.screen.x = Math.round(this.w / 2 + scale * p.camera.x * this.w / 2);
    p.screen.y = Math.round(this.h / 2 - scale * p.camera.y * this.h / 2);
    p.screen.w = Math.round(scale * ROAD_W * this.w / 2);
  }
}
