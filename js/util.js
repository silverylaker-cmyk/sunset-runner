export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeIn = (a, b, p) => a + (b - a) * p * p;
export const easeOut = (a, b, p) => a + (b - a) * (1 - Math.pow(1 - p, 2));
export const easeInOut = (a, b, p) => a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5);

// deterministic RNG so the track is identical every run
export function mulberry32(seed) {
  let a = seed >>> 0;
  const r = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(r.range(lo, hi + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}

export function overlap(x1, w1, x2, w2, percent = 1) {
  const half = percent / 2;
  const min1 = x1 - w1 * half, max1 = x1 + w1 * half;
  const min2 = x2 - w2 * half, max2 = x2 + w2 * half;
  return !(max1 < min2 || min1 > max2);
}

export function increase(start, inc, max) {
  let r = start + inc;
  while (r >= max) r -= max;
  while (r < 0) r += max;
  return r;
}

export const accelerate = (v, accel, dt) => v + accel * dt;
export const wrapDeg = (d) => ((d + 540) % 360) - 180;
