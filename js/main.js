import { Input } from './input.js';
import { Sound } from './audio.js';
import { Game } from './game.js';
import { STAGES } from './track.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const input = new Input(canvas);
const sound = new Sound();

let lastTime = null, lastSpeed = null, lastPed = '';
const ui = {
  debugOn: false,
  showTitle(best) {
    document.body.className = 'title';
    $('title').hidden = false; $('gameover').hidden = true; $('hud').hidden = true;
    $('best').textContent = best ? `BEST ${best.score.toLocaleString()}  ·  ${best.distanceKm.toFixed(1)} km  ·  ${best.goal ? 'GOAL' : 'STAGE ' + best.stage}` : '';
  },
  showHud() {
    document.body.className = 'race';
    $('title').hidden = true; $('gameover').hidden = true; $('hud').hidden = false;
    $('msg').textContent = ''; $('msg').classList.remove('show');
  },
  showGameOver(r) {
    document.body.className = 'gameover';
    const t = $('go-title');
    t.textContent = r.goal ? 'GOAL!' : 'TIME UP';
    t.classList.toggle('goal', r.goal);
    const m = Math.floor(r.elapsed / 60), s = (r.elapsed % 60).toFixed(2).padStart(5, '0');
    $('go-stats').textContent =
      `SCORE ${r.score.toLocaleString()}${r.newBest ? '  ★ NEW BEST' : ''}\n` +
      `${r.distanceKm.toFixed(2)} km  ·  ${r.goal ? `ALL ${STAGES.length} STAGES` : 'STAGE ' + r.stage}\n` +
      `TIME ${m}:${s}` + (r.goal ? `  ·  BONUS +${Math.floor(r.timeLeft)}s` : '');
    $('gameover').hidden = false;
  },
  setStage(i) { $('stage').textContent = `STAGE ${i + 1}  ${STAGES[i].name}`; },
  setTime(t) {
    const v = Math.max(0, Math.ceil(t));
    if (v !== lastTime) { lastTime = v; $('time').textContent = v; $('time').classList.toggle('low', v <= 10); }
  },
  setSpeed(kmh) {
    const v = Math.round(kmh);
    if (v !== lastSpeed) { lastSpeed = v; $('speed').innerHTML = `${v} <small>km/h</small>`; }
  },
  msg(text) {
    const el = $('msg');
    if (text) { el.textContent = text; el.classList.add('show'); } else el.classList.remove('show');
  },
  pedals(accel, brake) {
    const k = `${accel}${brake}`;
    if (k === lastPed) return; lastPed = k;
    $('accel').classList.toggle('on', accel); $('brake').classList.toggle('on', brake);
  },
  debug(text) { $('debug').textContent = text; },
};

const game = new Game(canvas, input, sound, ui);

// internal resolution: fixed height, width follows the viewport aspect
function resize() {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const H = 360, W = Math.max(360, Math.min(1100, Math.round(H * aspect)));
  game.renderer.resize(W, H);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

let wakeLock = null;
async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* not available */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wakeLock) keepAwake(); });

function tryFullscreen() {
  const el = document.documentElement;
  const fs = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!fs || document.fullscreenElement) return;
  try {
    const p = fs.call(el, { navigationUI: 'hide' });
    if (p && p.then) p.then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  } catch { /* ignore */ }
}

function begin() {
  // everything that needs a user gesture happens here, synchronously
  const perm = input.requestPermission();
  sound.init();
  tryFullscreen();
  keepAwake();
  game.state === 'title' ? game.start() : game.restart();
  perm.then(() => setTimeout(() => input.calibrate(), 300));
}

$('title').addEventListener('pointerup', (e) => { e.preventDefault(); begin(); });
$('gameover').addEventListener('pointerup', (e) => { e.preventDefault(); begin(); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (game.state === 'title' || game.state === 'result')) begin();
});

$('calib').addEventListener('click', () => { input.calibrate(); ui.msg('보정 완료'); setTimeout(() => ui.msg(''), 700); });
$('invert').addEventListener('click', () => { input.invert = !input.invert; $('invert').classList.toggle('on', input.invert); ui.msg(input.invert ? '조향 반전 ON' : '조향 반전 OFF'); setTimeout(() => ui.msg(''), 700); });
$('mute').addEventListener('click', () => { $('mute').textContent = sound.toggleMute() ? '🔇' : '🔊'; });
$('dbg').addEventListener('click', () => { ui.debugOn = !ui.debugOn; $('debug').hidden = !ui.debugOn; });

window.__game = game; // debugging handle
