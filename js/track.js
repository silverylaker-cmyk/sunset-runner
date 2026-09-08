import { mulberry32, easeIn, easeOut, easeInOut } from './util.js';

export const SEG_LEN = 200;        // length of one road segment (world units)
export const ROAD_W = 2000;        // half width of the road
export const RUMBLE_LEN = 3;       // segments per rumble stripe
export const LANES = 3;

// world-unit sizes for procedural sprites (w = full width, h = height)
export const SPRITES = {
  palm:     { w: 700,  h: 1700, solid: true },
  pine:     { w: 600,  h: 1500, solid: true },
  bush:     { w: 500,  h: 400,  solid: true },
  rock:     { w: 600,  h: 450,  solid: true },
  cactus:   { w: 350,  h: 900,  solid: true },
  lamp:     { w: 120,  h: 1300, solid: true },
  sign:     { w: 900,  h: 900,  solid: true },
  building: { w: 1400, h: 2600, solid: true },
  gate:     { w: 5200, h: 1300, solid: false, kind: 'CHECK' },
  goal:     { w: 5200, h: 1300, solid: false, kind: 'GOAL' },
};
export const CAR_W = 460;   // traffic car width (world units)
export const CAR_H = 250;
export const PLAYER_W = 480;

// Stage themes: five stages, OutRun-like variety
export const STAGES = [
  { name: 'COCONUT BEACH', segs: 1500, bonus: 50,
    sky: ['#1a4fd6', '#7ec8ff', '#ffe9a8'], sun: '#fff5c0', hills: ['#4a7fc0', '#2f5fa0'],
    grass: ['#3fbf4f', '#33a843'], road: ['#6b6b6b', '#646464'], rumble: ['#ffffff', '#e03030'],
    lane: '#ffffff', fog: '#7ec8ff', sprites: ['palm', 'palm', 'bush'], signEvery: 60, traffic: 40,
    curveMax: 4, hillMax: 20 },
  { name: 'MOUNTAIN PASS', segs: 1900, bonus: 60,
    sky: ['#3f628f', '#9fb8d0', '#e6eef5'], sun: '#ffffff', hills: ['#4a6b52', '#2c4438'],
    grass: ['#4d7a3a', '#437034'], road: ['#5a5a5a', '#535353'], rumble: ['#ffffff', '#c0392b'],
    lane: '#ffffff', fog: '#9fb8d0', sprites: ['pine', 'rock', 'pine', 'bush', 'rock'], signEvery: 90, traffic: 30,
    curveMax: 6, hillMax: 60, hairpins: 5 },
  { name: 'DESERT CANYON', segs: 1600, bonus: 50,
    sky: ['#ff7a3d', '#ffb15c', '#fff0b0'], sun: '#fff', hills: ['#c05a30', '#8f3a20'],
    grass: ['#dcb46a', '#d0a85e'], road: ['#707070', '#686868'], rumble: ['#ffffff', '#c0392b'],
    lane: '#ffffff', fog: '#ffb15c', sprites: ['cactus', 'rock', 'rock', 'bush'], signEvery: 70, traffic: 45,
    curveMax: 4, hillMax: 40 },
  { name: 'ALPINE PASS', segs: 1700, bonus: 50,
    sky: ['#2b6fb8', '#9fd3ff', '#ffffff'], sun: '#ffffff', hills: ['#cfe8ff', '#5f8fb0'],
    grass: ['#2f8f4f', '#287f45'], road: ['#5c5c5c', '#565656'], rumble: ['#ffffff', '#3060c0'],
    lane: '#ffffff', fog: '#cfe8ff', sprites: ['pine', 'pine', 'pine', 'rock'], signEvery: 80, traffic: 50,
    curveMax: 6, hillMax: 60 },
  { name: 'NEON CITY', segs: 1800, bonus: 50,
    sky: ['#2a0a4a', '#8a2f8f', '#ff6f91'], sun: '#ffb3c6', hills: ['#3a1560', '#24093f'],
    grass: ['#3b3b4f', '#343446'], road: ['#4a4a5a', '#444454'], rumble: ['#ffffff', '#ff2d95'],
    lane: '#ffe066', fog: '#8a2f8f', sprites: ['building', 'lamp', 'building', 'sign'], signEvery: 50, traffic: 60,
    curveMax: 6, hillMax: 40 },
  { name: 'MIDNIGHT COAST', segs: 1900, bonus: 50,
    sky: ['#03031a', '#0d1b4a', '#243c7a'], sun: '#dfe8ff', hills: ['#101a3a', '#0a1028'], stars: true,
    grass: ['#1d4d2a', '#194424'], road: ['#3a3a44', '#34343e'], rumble: ['#dddddd', '#8a2020'],
    lane: '#dddddd', fog: '#0d1b4a', sprites: ['palm', 'lamp', 'palm', 'bush'], signEvery: 60, traffic: 65,
    curveMax: 6, hillMax: 60 },
];

export const START_TIME = 75;
export const RUNOFF_SEGS = 400;

export function buildTrack(seed = 1986) {
  const rng = mulberry32(seed);
  const segments = [];
  const stageStarts = [];   // segment index where each stage begins
  const cars = [];

  const lastY = () => (segments.length === 0 ? 0 : segments[segments.length - 1].p2.world.y);

  function addSegment(curve, y, stage) {
    const n = segments.length;
    segments.push({
      index: n, stage,
      p1: { world: { y: lastY(), z: n * SEG_LEN }, camera: {}, screen: {} },
      p2: { world: { y, z: (n + 1) * SEG_LEN }, camera: {}, screen: {} },
      curve, sprites: [], cars: [],
      alt: Math.floor(n / RUMBLE_LEN) % 2 === 0,
    });
  }

  function addRoad(enter, hold, leave, curve, y, stage) {
    const startY = lastY();
    const endY = startY + y * SEG_LEN;
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++) addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total), stage);
    for (let n = 0; n < hold; n++) addSegment(curve, easeInOut(startY, endY, (enter + n) / total), stage);
    for (let n = 0; n < leave; n++) addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total), stage);
  }

  const L = { short: 25, med: 50, long: 100 };
  const C = { none: 0, easy: 2, med: 4, hard: 6, hairpin: 12 };
  const H = { none: 0, low: 20, med: 40, high: 60 };

  const warnSigns = [];   // segment indices that get a SLOW! sign

  // a hairpin: long, hard bend (about 150 degrees of heading change) that climbs or drops
  function addHairpin(s, dir, height) {
    warnSigns.push({ index: segments.length + 5, side: -dir });
    addRoad(L.short, L.short, L.short, 0, 0, s);                    // lead-in straight
    addRoad(30, 95, 30, C.hairpin * dir, height, s);
    addRoad(L.short, L.short, L.short, 0, 0, s);
  }

  function pieces(stageIdx, target) {
    const s = stageIdx;
    const st = STAGES[s];
    const start = segments.length;
    const curveMax = st.curveMax ?? C.med;
    const hillMax = st.hillMax ?? H.med;
    let hairpinsDone = 0;
    while (segments.length - start < target) {
      if (st.hairpins && hairpinsDone < st.hairpins &&
          segments.length - start >= hairpinsDone * target / st.hairpins) {
        const dir = hairpinsDone % 2 === 0 ? 1 : -1;
        addHairpin(s, dir, rng.range(4, 12) * (hairpinsDone < st.hairpins / 2 ? 1 : -1));
        hairpinsDone++;
        continue;
      }
      const kind = rng.pick(['straight', 'curve', 'curve', 'hill', 'scurve', 'curvehill', 'rolling']);
      const len = rng.pick([L.short, L.med, L.med, L.long]);
      const dir = rng.chance(0.5) ? 1 : -1;
      const curve = rng.range(C.easy, curveMax) * dir;
      const height = rng.range(-hillMax, hillMax);
      switch (kind) {
        case 'straight': addRoad(len, len, len, 0, 0, s); break;
        case 'curve': addRoad(len, len, len, curve, 0, s); break;
        case 'hill': addRoad(len, len, len, 0, height, s); break;
        case 'curvehill': addRoad(len, len, len, curve, height, s); break;
        case 'scurve':
          addRoad(L.med, L.med, L.med, curve, 0, s);
          addRoad(L.med, L.med, L.med, -curve, 0, s);
          break;
        case 'rolling': {
          const n = rng.int(2, 4);
          for (let i = 0; i < n; i++) addRoad(L.short, L.short, L.short, 0, rng.range(-H.low, H.low) * (i % 2 ? -1 : 1), s);
          break;
        }
      }
    }
    // bring the road back down to y=0 for a clean checkpoint
    const yDrop = -lastY() / SEG_LEN;
    addRoad(L.med, L.med, L.med, 0, yDrop, s);
  }

  STAGES.forEach((st, i) => {
    stageStarts.push(segments.length);
    if (i === 0) addRoad(L.med, L.med, L.med, 0, 0, i); // gentle opening straight
    pieces(i, st.segs);
  });
  const goalSeg = segments.length;
  // run-off after the goal
  for (let n = 0; n < RUNOFF_SEGS; n++) addSegment(0, lastY(), STAGES.length - 1);

  // ---- roadside sprites ----
  STAGES.forEach((st, i) => {
    const from = stageStarts[i] + (i === 0 ? 30 : 12);
    const to = i + 1 < STAGES.length ? stageStarts[i + 1] : goalSeg;
    for (let n = from; n < to; n += rng.int(2, 6)) {
      const seg = segments[n];
      const dense = st.sprites[0] === 'building';
      if (rng.chance(dense ? 0.9 : 0.55)) {
        seg.sprites.push({ type: rng.pick(st.sprites), offset: -rng.range(1.25, 2.6), flip: rng.chance(0.5) });
      }
      if (rng.chance(dense ? 0.9 : 0.55)) {
        seg.sprites.push({ type: rng.pick(st.sprites), offset: rng.range(1.25, 2.6), flip: rng.chance(0.5) });
      }
    }
    for (let n = from + 20; n < to; n += st.signEvery) {
      const side = rng.chance(0.5) ? -1 : 1;
      segments[n].sprites.push({ type: 'sign', offset: side * 1.35, variant: rng.int(0, 3) });
    }
    if (i > 0) segments[stageStarts[i]].sprites.push({ type: 'gate', offset: 0 });
  });
  for (const w of warnSigns) {
    const seg = segments[w.index];
    seg.sprites = seg.sprites.filter((sp) => sp.type !== 'sign');
    seg.sprites.push({ type: 'sign', offset: w.side * 1.35, variant: 4 });
  }
  segments[goalSeg].sprites.push({ type: 'goal', offset: 0 });
  // lamp posts lining the run-off
  for (let n = goalSeg + 10; n < segments.length; n += 12) {
    segments[n].sprites.push({ type: 'lamp', offset: -1.3 });
    segments[n].sprites.push({ type: 'lamp', offset: 1.3 });
  }

  // ---- traffic ----
  const CAR_COLORS = ['#e8e8e8', '#3b7dff', '#ffd23f', '#2fbf71', '#ff7f3f', '#9b5de5', '#111111'];
  STAGES.forEach((st, i) => {
    const from = stageStarts[i] + 40;
    const to = i + 1 < STAGES.length ? stageStarts[i + 1] : goalSeg;
    for (let k = 0; k < st.traffic; k++) {
      const segIdx = rng.int(from, to - 1);
      const lane = rng.pick([-0.66, 0, 0.66]) + rng.range(-0.08, 0.08);
      const car = {
        offset: lane,
        z: segIdx * SEG_LEN + rng.range(0, SEG_LEN),
        speed: SEG_LEN * 60 * rng.range(0.22 + i * 0.03, 0.55 + i * 0.03),
        color: rng.pick(CAR_COLORS),
        truck: rng.chance(0.15),
        w: CAR_W,
      };
      cars.push(car);
      segments[segIdx].cars.push(car);
    }
  });

  return {
    segments, stageStarts, cars,
    goalZ: goalSeg * SEG_LEN,
    length: segments.length * SEG_LEN,
    stageStartZ: stageStarts.map((s) => s * SEG_LEN),
  };
}
