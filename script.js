/* ==========================================================
   PIXEL JUMP: DE BUG-RUNNER
   Volledige game-logica in vanilla JS + Canvas 2D.
   ========================================================== */

// ---------- Canvas setup ----------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const CW = canvas.width;   // 1000
const CH = canvas.height;  // 480
const GROUND_Y = CH - 90;

// ---------- HUD elements ----------
const scoreEl = document.getElementById('score');
const highscoreEl = document.getElementById('highscore');
const distanceEl = document.getElementById('distance');
const livesEl = document.getElementById('lives');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScoreEl = document.getElementById('finalScore');
const newHighscoreMsg = document.getElementById('newHighscoreMsg');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const shootBtn = document.getElementById('shootBtn');

// ---------- Tuning constants ----------
const MAX_LIVES = 2; // hartje + koffiebeker
const SHOOT_COOLDOWN_FRAMES = 20; // ~0.33s bij 60fps
const FLIGHT_SHOOT_COOLDOWN_FRAMES = 6;

// Afstand: 1 "meter" = state.speed * DISTANCE_PER_FRAME per frame.
// Met deze factor duurt het ongeveer 45-60 seconden spelen voor je de
// eerste 10.000m (en dus de eerste boss) bereikt.
const DISTANCE_PER_FRAME = 0.35;
const BOSS_TRIGGER_METERS = 5000;
const FLIGHT_INTERVAL_METERS = 10000;
const FLIGHT_DURATION_METERS = 5000;
const FIRST_FLIGHT_DISTANCE = 15000;
const FLIGHT_BUG_SPEED_MULTIPLIER = 0.45;

const BOSS_BASE_HP = 180;
const BOSS_HP_INCREMENT = 50;      // elke volgende boss is iets taaier
const BOSS_DAMAGE_PER_HIT = 12;
const SLAM_TELEGRAPH_FRAMES = 50;  // waarschuwingstijd voor een grondslag
const SLAM_WAVE_SPEED = 15;
const SLAM_COOLDOWN_BASE = 150;    // frames tussen twee grondslagen
const BOSS_MINION_MIN = 150;
const BOSS_MINION_MAX = 230;
const BOSS_DEFEAT_FRAMES = 90;

// ---------- Game state ----------
let state = {
  running: false,
  gameOver: false,
  score: 0,
  highscore: Number(localStorage.getItem('pixelJumpHighscore')) || 0,
  speed: 6,
  baseSpeed: 6,
  lives: MAX_LIVES,
  frame: 0,
  nextObstacleIn: 60,
  obstacleCount: 0,
  invulnerable: 0,
  shootCooldown: 0,
  muzzleFlash: 0,
  shotTrail: null, // { y, endX, life }
  shake: 0,

  // Boss / afstand
  phase: 'run', // 'run' | 'flight' | 'boss_intro' | 'boss_fight' | 'boss_defeat'
  distance: 0,
  nextBossDistance: BOSS_TRIGGER_METERS,
  nextFlightDistance: FIRST_FLIGHT_DISTANCE,
  bossEncounter: 0,
  bossDefeatTimer: 0
};

// ---------- Player (student met afstudeerhoedje + shotgun) ----------
const player = {
  x: 90,
  y: GROUND_Y,
  w: 44,
  h: 58,
  vy: 0,
  gravity: 1.0,
  jumpForce: -15.5,
  grounded: true,
  runFrame: 0
};

const flightKeys = { up: false, down: false };

// ---------- Obstakel-typen (allemaal bewegend, verschillende patronen) ----------
const BUG_TYPES = {
  crawler: { key: 'crawler', sizeMin: 48, sizeMax: 66, speedMult: 1.0, hop: false, color: '#e8283f', dark: '#a3121f', weight: 0.5 },
  runner:  { key: 'runner',  sizeMin: 32, sizeMax: 44, speedMult: 1.55, hop: false, color: '#ff7a3d', dark: '#b3400f', weight: 0.28 },
  hopper:  { key: 'hopper',  sizeMin: 42, sizeMax: 56, speedMult: 0.9, hop: true, hopAmp: 32, hopFreq: 0.11, color: '#c026d3', dark: '#6b1078', weight: 0.22 }
};

function pickBugType() {
  const r = Math.random();
  let acc = 0;
  for (const key in BUG_TYPES) {
    acc += BUG_TYPES[key].weight;
    if (r <= acc) return BUG_TYPES[key];
  }
  return BUG_TYPES.crawler;
}

// ---------- Obstacles / particles / score-popups ----------
let obstacles = [];
let particles = [];
let popups = [];
let bossWaves = [];
let boss = null;

// ---------- Background layers (parallax) ----------
const buildings = [];
for (let i = 0; i < 10; i++) {
  buildings.push({
    x: i * 130 + Math.random() * 40,
    w: 60 + Math.random() * 50,
    h: 80 + Math.random() * 140,
    speed: 0.4
  });
}
const moon = { x: CW - 190, y: 70, r: 40 };
const groundTiles = [];
for (let i = 0; i < Math.ceil(CW / 40) + 2; i++) {
  groundTiles.push(i * 40);
}

// ==========================================================
// AUDIO (synthetisch, geen externe bestanden nodig)
// ==========================================================
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playShotgunSound(hit) {
  const ac = getAudioCtx();
  if (!ac) return;
  const now = ac.currentTime;

  const bufferSize = ac.sampleRate * 0.25;
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2.2);
  }
  const noise = ac.createBufferSource();
  noise.buffer = buffer;

  const noiseFilter = ac.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.setValueAtTime(2600, now);
  noiseFilter.frequency.exponentialRampToValueAtTime(400, now + 0.2);

  const noiseGain = ac.createGain();
  noiseGain.gain.setValueAtTime(0.9, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  noise.connect(noiseFilter).connect(noiseGain).connect(ac.destination);
  noise.start(now);
  noise.stop(now + 0.25);

  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
  const oscGain = ac.createGain();
  oscGain.gain.setValueAtTime(0.6, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  osc.connect(oscGain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.2);

  if (hit) {
    const ping = ac.createOscillator();
    ping.type = 'square';
    ping.frequency.setValueAtTime(880, now + 0.03);
    ping.frequency.exponentialRampToValueAtTime(220, now + 0.13);
    const pingGain = ac.createGain();
    pingGain.gain.setValueAtTime(0.25, now + 0.03);
    pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    ping.connect(pingGain).connect(ac.destination);
    ping.start(now + 0.03);
    ping.stop(now + 0.16);
  }
}

function playSlamSound() {
  const ac = getAudioCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(90, now);
  osc.frequency.exponentialRampToValueAtTime(25, now + 0.35);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(1, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.4);

  const bufferSize = ac.sampleRate * 0.3;
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
  }
  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(500, now);
  const ng = ac.createGain();
  ng.gain.setValueAtTime(0.5, now);
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  noise.connect(filter).connect(ng).connect(ac.destination);
  noise.start(now);
  noise.stop(now + 0.3);
}

// ==========================================================
// LIVES UI
// ==========================================================
function renderLives() {
  livesEl.innerHTML = '';
  const order = ['coffee', 'heart'];
  for (let i = 0; i < MAX_LIVES; i++) {
    const lost = i >= state.lives;
    const span = document.createElement('div');
    span.className = 'life-icon' + (lost ? ' lost' : '');
    span.innerHTML = order[i] === 'coffee' ? coffeeSVG() : heartSVG();
    livesEl.appendChild(span);
  }
}

function heartSVG() {
  return `<svg viewBox="0 0 24 24" width="100%" height="100%">
    <path fill="#ff3b5c" stroke="#7a0f22" stroke-width="1.5"
    d="M12 21s-7.5-4.6-10-9.3C0.3 8.4 2.2 4 6.2 4c2.1 0 3.7 1.2 4.8 2.9C12.1 5.2 13.7 4 15.8 4c4 0 5.9 4.4 4.2 7.7C19.5 16.4 12 21 12 21z"/>
  </svg>`;
}
function coffeeSVG() {
  return `<svg viewBox="0 0 24 24" width="100%" height="100%">
    <rect x="4" y="9" width="12" height="10" rx="1.5" fill="#f4f4f4" stroke="#6b4a2b" stroke-width="1.4"/>
    <path d="M16 11h2a2.5 2.5 0 0 1 0 5h-2" fill="none" stroke="#6b4a2b" stroke-width="1.4"/>
    <path d="M7 4c0 1.4 1.4 1.4 1.4 2.8" stroke="#c8c8c8" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <path d="M11 4c0 1.4 1.4 1.4 1.4 2.8" stroke="#c8c8c8" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  </svg>`;
}

// ==========================================================
// INPUT
// ==========================================================
function jump() {
  if (!state.running) return;
  if (player.grounded) {
    player.vy = player.jumpForce;
    player.grounded = false;
  }
}

function shoot() {
  if (!state.running) return;
  if (state.shootCooldown > 0) return;
  state.shootCooldown = state.phase === 'flight' ? FLIGHT_SHOOT_COOLDOWN_FRAMES : SHOOT_COOLDOWN_FRAMES;
  state.muzzleFlash = 6;

  const gunX = state.phase === 'flight' ? 300 : player.x + player.w + 6;
  const gunY = state.phase === 'flight' ? player.y + player.h - 3 : player.y + 22;

  let target = null;
  let isBoss = false;

  for (const o of obstacles) {
    if (o.type.key === 'rack') continue;
    const top = o.currentY;
    const bottom = o.currentY + o.h;
    if (o.x > gunX - 10 && gunY > top - 6 && gunY < bottom + 6) {
      if (!target || o.x < target.x) target = o;
    }
  }

  if (boss && state.phase === 'boss_fight') {
    const bTop = boss.y;
    const bBottom = boss.y + boss.h;
    if (boss.x > gunX - 10 && gunY > bTop - 6 && gunY < bBottom + 6) {
      if (!target || boss.x < target.x) { target = boss; isBoss = true; }
    }
  }

  if (target && isBoss) {
    boss.hp = Math.max(boss.hp - BOSS_DAMAGE_PER_HIT, 0);
    boss.hitFlash = 8;
    const hitX = boss.x + 30 + Math.random() * (boss.w - 60);
    const hitY = boss.y + 40 + Math.random() * (boss.h - 80);
    spawnExplosion(hitX, hitY, '#ff6a3d');
    popups.push({ x: hitX, y: hitY - 10, text: '-' + BOSS_DAMAGE_PER_HIT, life: 35, maxLife: 35 });
    state.shotTrail = { y: gunY, endX: hitX, life: 10 };
    playShotgunSound(true);
  } else if (target) {
    const hitX = target.x + target.w / 2;
    const hitY = target.currentY + target.h / 2;
    spawnExplosion(hitX, hitY, target.type.color);
    obstacles = obstacles.filter(o => o !== target);
    state.score += 15;
    scoreEl.textContent = state.score;
    popups.push({ x: hitX, y: hitY - 20, text: '+15', life: 40, maxLife: 40 });
    state.shotTrail = { y: gunY, endX: hitX, life: 10 };
    playShotgunSound(true);
  } else {
    state.shotTrail = { y: gunY, endX: CW - 6, life: 10 };
    playShotgunSound(false);
  }
}

document.addEventListener('keydown', (e) => {
  if (state.phase === 'flight') {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      flightKeys.up = true;
    }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      flightKeys.down = true;
    }
  }
  if (e.code === 'Space') {
    e.preventDefault();
    if (!state.running && !state.gameOver) startGame();
    else jump();
  }
  if (e.code === 'KeyF' || e.code === 'KeyX') {
    e.preventDefault();
    shoot();
  }
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowUp' || e.code === 'KeyW') flightKeys.up = false;
  if (e.code === 'ArrowDown' || e.code === 'KeyS') flightKeys.down = false;
});
canvas.addEventListener('mousedown', () => {
  if (!state.running && !state.gameOver) startGame();
  else jump();
});
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (!state.running && !state.gameOver) startGame();
  else jump();
}, { passive: false });

shootBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  shoot();
});
shootBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  e.stopPropagation();
  shoot();
}, { passive: false });

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

// ==========================================================
// GAME FLOW
// ==========================================================
function startGame() {
  state.running = true;
  state.gameOver = false;
  state.score = 0;
  state.speed = state.baseSpeed;
  state.lives = MAX_LIVES;
  state.frame = 0;
  state.nextObstacleIn = 70;
  state.obstacleCount = 0;
  state.invulnerable = 0;
  state.shootCooldown = 0;
  state.muzzleFlash = 0;
  state.shotTrail = null;
  state.shake = 0;
  state.phase = 'run';
  state.distance = 0;
  state.nextBossDistance = BOSS_TRIGGER_METERS;
  state.nextFlightDistance = FIRST_FLIGHT_DISTANCE;
  state.bossEncounter = 0;
  state.bossDefeatTimer = 0;

  obstacles = [];
  particles = [];
  popups = [];
  bossWaves = [];
  boss = null;

  player.y = GROUND_Y;
  player.vy = 0;
  player.grounded = true;

  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  renderLives();
  requestAnimationFrame(loop);
}

function endGame() {
  state.running = false;
  state.gameOver = true;

  if (state.score > state.highscore) {
    state.highscore = state.score;
    localStorage.setItem('pixelJumpHighscore', String(state.highscore));
    newHighscoreMsg.textContent = 'NIEUWE HIGHSCORE!';
    saveScoreToServer(state.score);
  } else {
    newHighscoreMsg.textContent = '';
  }

  finalScoreEl.textContent = state.score;
  highscoreEl.textContent = state.highscore;
  gameOverScreen.classList.remove('hidden');
}

// ==========================================================
// SPAWN & DIFFICULTY (normale run-fase)
// ==========================================================
function spawnObstacle() {
  state.obstacleCount++;
  if (state.phase === 'run' && state.obstacleCount % 3 === 0) {
    const rackWidth = 72;
    const rackHeight = 58;
    const rackY = GROUND_Y + player.h - rackHeight;
    obstacles.push({
      x: CW + 20,
      w: rackWidth,
      h: rackHeight,
      baseY: rackY,
      currentY: rackY,
      type: { key: 'rack', color: '#ffd166', dark: '#8f5f20', speedMult: 1, hop: false },
      hopPhase: 0,
      armPhase: 0
    });
    return;
  }

  const type = pickBugType();
  const size = type.sizeMin + Math.random() * (type.sizeMax - type.sizeMin);
  const baseY = GROUND_Y + player.h - size;
  obstacles.push({
    x: CW + 20,
    w: size,
    h: size,
    baseY: baseY,
    currentY: baseY,
    type: type,
    hopPhase: Math.random() * Math.PI * 2,
    armPhase: Math.random() * Math.PI * 2
  });
}

function spawnFlightBug() {
  const type = pickBugType();
  const size = type.sizeMin + Math.random() * (type.sizeMax - type.sizeMin);
  const y = 90 + Math.random() * 220;
  obstacles.push({
    x: CW + 20,
    w: size,
    h: size,
    baseY: y,
    currentY: y,
    type: type,
    hopPhase: Math.random() * Math.PI * 2,
    armPhase: Math.random() * Math.PI * 2,
    flightPhase: Math.random() * Math.PI * 2
  });
}

function triggerFlight() {
  state.phase = 'flight';
  state.nextObstacleIn = 45;
  obstacles = [];
  boss = null;
  bossWaves = [];
  player.y = 220;
  player.vy = 0;
  player.grounded = false;
}

function updateDifficulty() {
  state.speed = state.baseSpeed + Math.min(state.score / 130, 6);
}

// ==========================================================
// BOSS
// ==========================================================
function createBoss() {
  const hp = BOSS_BASE_HP + state.bossEncounter * BOSS_HP_INCREMENT;
  const h = 220 + Math.min(state.bossEncounter * 8, 40);
  return {
    x: CW + 80,
    targetX: CW - 260,
    w: 180,
    h: h,
    y: GROUND_Y + player.h - h,
    hp: hp,
    maxHp: hp,
    state: 'entering', // entering | idle | telegraph | recover
    timer: 40,
    armPhase: 0,
    hitFlash: 0,
    minionTimer: 160
  };
}

function triggerBossIntro() {
  state.phase = 'boss_intro';
  boss = createBoss();
  obstacles = [];
  bossWaves = [];
}

function updateBossAI() {
  boss.armPhase += 0.08;
  if (boss.hitFlash > 0) boss.hitFlash--;
  boss.timer--;

  if (boss.state === 'idle') {
    if (boss.timer <= 0) {
      boss.state = 'telegraph';
      boss.timer = SLAM_TELEGRAPH_FRAMES;
    }
  } else if (boss.state === 'telegraph') {
    if (boss.timer <= 0) {
      bossWaves.push({ x: boss.x, w: 30, h: 44, speed: SLAM_WAVE_SPEED });
      state.shake = 12;
      playSlamSound();
      boss.state = 'recover';
      boss.timer = 24;
    }
  } else if (boss.state === 'recover') {
    if (boss.timer <= 0) {
      boss.state = 'idle';
      boss.timer = Math.max(SLAM_COOLDOWN_BASE - state.bossEncounter * 10, 90);
    }
  }

  // minion-bugs blijven komen tijdens het gevecht
  boss.minionTimer--;
  if (boss.minionTimer <= 0) {
    spawnObstacle();
    boss.minionTimer = BOSS_MINION_MIN + Math.random() * (BOSS_MINION_MAX - BOSS_MINION_MIN);
  }
}

function updateBossWaves() {
  for (let i = bossWaves.length - 1; i >= 0; i--) {
    const w = bossWaves[i];
    w.x -= w.speed;
    const waveTop = GROUND_Y + player.h - w.h;

    if (w.x < -60) {
      bossWaves.splice(i, 1);
      continue;
    }

    const hit =
      state.invulnerable === 0 &&
      player.x + 6 < w.x + w.w - 2 &&
      player.x + player.w - 6 > w.x + 2 &&
      player.y + player.h - 6 > waveTop;

    if (hit) {
      bossWaves.splice(i, 1);
      state.lives--;
      state.invulnerable = 60;
      renderLives();
      if (state.lives <= 0) {
        endGame();
        return true;
      }
    }
  }
  return false;
}

// ==========================================================
// PARTICLES & POPUPS
// ==========================================================
function spawnExplosion(x, y, color) {
  for (let i = 0; i < 16; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      life: 24 + Math.random() * 16,
      maxLife: 40,
      size: 3 + Math.random() * 3,
      color: color
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.18;
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = popups.length - 1; i >= 0; i--) {
    const pu = popups[i];
    pu.y -= 0.6;
    pu.life--;
    if (pu.life <= 0) popups.splice(i, 1);
  }
}

function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(p.life / p.maxLife, 0);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  });
  ctx.globalAlpha = 1;

  popups.forEach(pu => {
    ctx.globalAlpha = Math.max(pu.life / pu.maxLife, 0);
    ctx.fillStyle = '#ffcc33';
    ctx.font = 'bold 13px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(pu.text, pu.x, pu.y);
  });
  ctx.globalAlpha = 1;
}

// ==========================================================
// UPDATE
// ==========================================================
function update() {
  state.frame++;

  if (state.shootCooldown > 0) state.shootCooldown--;
  shootBtn.disabled = state.shootCooldown > 0;
  if (state.muzzleFlash > 0) state.muzzleFlash--;
  if (state.shotTrail) {
    state.shotTrail.life--;
    if (state.shotTrail.life <= 0) state.shotTrail = null;
  }
  if (state.shake > 0) state.shake--;

  // Tijdens de vlucht blijft de speler op het vliegtuig staan.
  if (state.phase === 'flight') {
    if (flightKeys.up) player.y -= 4;
    if (flightKeys.down) player.y += 4;
    player.y = Math.max(82, Math.min(GROUND_Y - 105, player.y));
    player.vy = 0;
    player.grounded = false;
  } else {
    player.vy += player.gravity;
    player.y += player.vy;
    if (player.y >= GROUND_Y) {
      player.y = GROUND_Y;
      player.vy = 0;
      player.grounded = true;
    }
    if (player.grounded) player.runFrame += 1;
  }

  if (state.invulnerable > 0) state.invulnerable--;

  // obstakels (normale bugs + boss-minions delen dezelfde lijst/logica)
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    const movementSpeed = state.phase === 'flight'
      ? state.speed * FLIGHT_BUG_SPEED_MULTIPLIER
      : state.speed;
    o.x -= movementSpeed * o.type.speedMult;

    if (state.phase === 'flight') {
      o.flightPhase += 0.08;
      o.currentY = o.baseY + Math.sin(o.flightPhase) * 18;
    } else if (o.type.hop) {
      o.hopPhase += o.type.hopFreq;
      const bounce = Math.max(Math.sin(o.hopPhase), 0) * o.type.hopAmp;
      o.currentY = o.baseY - bounce;
    } else {
      o.currentY = o.baseY;
    }
    o.armPhase += 0.15;

    if (o.x + o.w < -20) {
      obstacles.splice(i, 1);
      continue;
    }

    const hit =
      state.invulnerable === 0 &&
      player.x + 6 < o.x + o.w - 14 &&
      player.x + player.w - 14 > o.x + 6 &&
      player.y + 4 < o.currentY + o.h - 12 &&
      player.y + player.h - 12 > o.currentY + 4;

    if (hit) {
      obstacles.splice(i, 1);
      state.lives--;
      state.invulnerable = 60;
      renderLives();
      if (state.lives <= 0) {
        endGame();
        return;
      }
    }
  }

  // ---------- fase-specifieke logica ----------
  if (state.phase === 'run') {
    if (state.frame % 6 === 0) {
      state.score += 1;
      scoreEl.textContent = state.score;
      updateDifficulty();
    }

    state.nextObstacleIn--;
    if (state.nextObstacleIn <= 0) {
      spawnObstacle();
      const JUMP_AIRTIME_FRAMES = (2 * 15.5) / 1.0;
      const minGap = Math.max(JUMP_AIRTIME_FRAMES + 20 - state.speed * 0.5, JUMP_AIRTIME_FRAMES + 12);
      state.nextObstacleIn = minGap + Math.random() * 35;
    }

    state.distance += state.speed * DISTANCE_PER_FRAME;
    if (distanceEl && state.frame % 6 === 0) distanceEl.textContent = Math.floor(state.distance);

    if (state.distance >= state.nextFlightDistance) {
      triggerFlight();
    } else if (state.distance >= state.nextBossDistance) {
      triggerBossIntro();
    }
  } else if (state.phase === 'flight') {
    if (state.frame % 6 === 0) {
      state.score += 2;
      scoreEl.textContent = state.score;
    }

    state.nextObstacleIn--;
    if (state.nextObstacleIn <= 0) {
      spawnFlightBug();
      state.nextObstacleIn = 30 + Math.random() * 28;
    }

    state.distance += state.speed * DISTANCE_PER_FRAME;
    if (distanceEl && state.frame % 6 === 0) distanceEl.textContent = Math.floor(state.distance);

    if (state.distance >= state.nextFlightDistance + FLIGHT_DURATION_METERS) {
      state.phase = 'run';
      state.nextFlightDistance += FLIGHT_INTERVAL_METERS;
      state.nextBossDistance = state.distance + BOSS_TRIGGER_METERS;
      state.nextObstacleIn = 75;
      flightKeys.up = false;
      flightKeys.down = false;
      player.y = GROUND_Y;
      player.vy = 0;
      player.grounded = true;
      obstacles = [];
    }
  } else if (state.phase === 'boss_intro') {
    boss.x += (boss.targetX - boss.x) * 0.06;
    if (Math.abs(boss.x - boss.targetX) < 2) {
      boss.x = boss.targetX;
      boss.state = 'idle';
      boss.timer = 70;
      state.phase = 'boss_fight';
    }
  } else if (state.phase === 'boss_fight') {
    updateBossAI();
    const playerDied = updateBossWaves();
    if (playerDied) return;

    if (boss.hp <= 0) {
      state.phase = 'boss_defeat';
      state.bossDefeatTimer = BOSS_DEFEAT_FRAMES;
      spawnExplosion(boss.x + boss.w / 2, boss.y + boss.h / 2, '#ff6a3d');
      state.score += 500;
      scoreEl.textContent = state.score;
      popups.push({ x: boss.x + boss.w / 2, y: boss.y + boss.h / 2, text: '+500', life: 60, maxLife: 60 });
      state.shake = 16;
    }
  } else if (state.phase === 'boss_defeat') {
    state.bossDefeatTimer--;
    if (state.frame % 5 === 0) {
      spawnExplosion(
        boss.x + Math.random() * boss.w,
        boss.y + Math.random() * boss.h,
        Math.random() > 0.5 ? '#ff6a3d' : '#ffcc33'
      );
    }
    if (state.bossDefeatTimer <= 0) {
      state.bossEncounter++;
      state.nextBossDistance = state.distance + BOSS_TRIGGER_METERS;
      boss = null;
      bossWaves = [];
      state.phase = 'run';
      state.nextObstacleIn = 60;
    }
  }

  updateParticles();

  buildings.forEach(b => {
    b.x -= b.speed * (state.speed / state.baseSpeed);
    if (b.x + b.w < 0) b.x = CW + Math.random() * 40;
  });
}

// ==========================================================
// DRAW
// ==========================================================
function drawBackground() {
  const flightPhase = state.phase === 'flight';
  const bossPhase = state.phase === 'boss_intro' || state.phase === 'boss_fight' || state.phase === 'boss_defeat';
  const sky = ctx.createLinearGradient(0, 0, 0, CH);
  sky.addColorStop(0, flightPhase ? '#21658c' : bossPhase ? '#220f1d' : '#111827');
  sky.addColorStop(1, flightPhase ? '#8ed0d2' : bossPhase ? '#411d2a' : '#293247');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CW, CH);

  if (flightPhase) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    for (let i = 0; i < 5; i++) {
      const cloudX = ((i * 230) - state.frame * 0.45) % (CW + 180) - 90;
      const cloudY = 70 + (i % 3) * 62;
      ctx.beginPath();
      ctx.arc(cloudX, cloudY, 18, 0, Math.PI * 2);
      ctx.arc(cloudX + 22, cloudY - 9, 24, 0, Math.PI * 2);
      ctx.arc(cloudX + 50, cloudY, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (bossPhase) {
    ctx.fillStyle = 'rgba(255, 77, 95, 0.07)';
    ctx.fillRect(0, 0, CW, CH);
    ctx.strokeStyle = 'rgba(255, 122, 96, 0.12)';
    ctx.lineWidth = 1;
    for (let x = -CH; x < CW + CH; x += 42) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + CH, CH);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(85, 230, 210, 0.08)';
    for (let y = 16; y < GROUND_Y; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CW, y);
      ctx.stroke();
    }
  }

  ctx.fillStyle = '#c9d0da';
  ctx.beginPath();
  ctx.arc(moon.x, moon.y, moon.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(150,158,172,0.5)';
  ctx.beginPath();
  ctx.arc(moon.x - 12, moon.y + 8, 7, 0, Math.PI * 2);
  ctx.arc(moon.x + 14, moon.y - 4, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#242838';
  buildings.forEach(b => {
    const by = GROUND_Y - b.h + 20;
    ctx.fillRect(b.x, by, b.w, b.h);
    ctx.fillStyle = '#33384c';
    for (let wx = 6; wx < b.w - 10; wx += 16) {
      for (let wy = 10; wy < b.h - 10; wy += 20) {
        if (Math.random() > 0.7) continue;
        ctx.fillRect(b.x + wx, by + wy, 6, 8);
      }
    }
    ctx.fillStyle = '#242838';
  });

  ctx.fillStyle = '#4a5066';
  ctx.fillRect(0, GROUND_Y + player.h, CW, 6);
  ctx.fillStyle = '#33384a';
  ctx.fillRect(0, GROUND_Y + player.h + 6, CW, CH - (GROUND_Y + player.h + 6));

  if (bossPhase) {
    ctx.fillStyle = 'rgba(255, 77, 95, 0.18)';
    ctx.fillRect(0, GROUND_Y + player.h, CW, 6);
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.22)';
    ctx.lineWidth = 2;
    for (let x = -40; x < CW + 40; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + player.h + 6);
      ctx.lineTo(x + 34, GROUND_Y + player.h + 46);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = '#232636';
  ctx.lineWidth = 2;
  for (let i = 0; i < groundTiles.length; i++) {
    groundTiles[i] -= state.running ? state.speed : 0;
    if (groundTiles[i] < -40) groundTiles[i] += Math.ceil(CW / 40 + 2) * 40;
    ctx.strokeRect(groundTiles[i], GROUND_Y + player.h + 10, 40, 40);
  }
}

function drawPlayer() {
  const px = player.x;
  const py = player.y;
  const bob = player.grounded ? Math.sin(player.runFrame * 0.5) * 2 : 0;

  ctx.save();
  ctx.translate(0, bob);

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(px + player.w / 2, GROUND_Y + player.h + 4, 20, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1c6b52';
  const legOffset = player.grounded ? Math.sin(player.runFrame * 0.5) * 8 : 0;
  ctx.fillRect(px + 8, py + 40, 10, 18 - legOffset);
  ctx.fillRect(px + 24, py + 40, 10, 18 + legOffset);

  ctx.fillStyle = '#2ecc9a';
  ctx.fillRect(px + 4, py + 16, 36, 28);

  ctx.fillStyle = '#1c6b52';
  ctx.fillRect(px + 20, py + 18, 4, 24);

  ctx.fillStyle = '#2ecc9a';
  ctx.fillRect(px - 4, py + 18, 8, 18);

  ctx.fillStyle = '#4be3d4';
  ctx.fillRect(px + 8, py, 28, 20);

  ctx.fillStyle = '#12141c';
  ctx.fillRect(px + 14, py + 8, 3, 3);
  ctx.fillRect(px + 26, py + 8, 3, 3);
  ctx.fillRect(px + 16, py + 15, 12, 2);

  ctx.fillStyle = '#1a1d29';
  ctx.fillRect(px + 4, py - 6, 36, 6);
  ctx.fillRect(px + 14, py - 12, 16, 8);
  ctx.fillStyle = '#ffcc33';
  ctx.fillRect(px + 32, py - 10, 2, 10);
  ctx.fillRect(px + 30, py - 2, 6, 4);

  ctx.fillStyle = '#2ecc9a';
  ctx.fillRect(px + 38, py + 20, 8, 14);

  ctx.save();
  ctx.translate(px + 44, py + 26);
  ctx.fillStyle = '#5c4326';
  ctx.fillRect(-6, -3, 10, 8);
  ctx.fillStyle = '#3a3f4c';
  ctx.fillRect(2, -2, 24, 5);
  ctx.fillStyle = '#1a1d29';
  ctx.fillRect(24, -3, 5, 7);
  ctx.restore();

  ctx.restore();
}

function drawMuzzleAndTrail() {
  const gunTipX = state.phase === 'flight' ? 327 : player.x + 44 + 29;
  const gunTipY = state.phase === 'flight' ? player.y + player.h - 3 : player.y + 26 + (player.grounded ? Math.sin(player.runFrame * 0.5) * 2 : 0);

  if (state.shotTrail && state.shotTrail.life > 0) {
    const t = state.shotTrail;
    ctx.save();
    ctx.globalAlpha = Math.max(t.life / 10, 0) * 0.8;
    ctx.strokeStyle = '#ffe27a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(gunTipX, t.y);
    ctx.lineTo(t.endX, t.y);
    ctx.stroke();
    ctx.restore();
  }

  if (state.muzzleFlash > 0) {
    ctx.save();
    ctx.globalAlpha = state.muzzleFlash / 6;
    ctx.fillStyle = '#ffdd55';
    ctx.beginPath();
    const r = 10 + Math.random() * 6;
    ctx.moveTo(gunTipX, gunTipY);
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      const rad = i % 2 === 0 ? r : r * 0.4;
      ctx.lineTo(gunTipX + Math.cos(a) * rad, gunTipY + Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawObstacle(o) {
  if (o.type.key === 'rack') {
    drawParkourRack(o);
    return;
  }

  const cx = o.x + o.w / 2;
  const cy = o.currentY + o.h / 2;
  const type = o.type;

  if (state.phase === 'flight') {
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(o.x + o.w, cy);
    ctx.lineTo(o.x + o.w + 24, cy);
    ctx.stroke();
  }

  ctx.fillStyle = type.color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = type.dark;
  ctx.lineWidth = 3;
  for (let i = -1; i <= 1; i += 2) {
    for (let j = 0; j < 3; j++) {
      const legY = cy - o.h / 4 + j * (o.h / 4);
      ctx.beginPath();
      ctx.moveTo(cx + i * (o.w / 2 - 4), legY);
      ctx.lineTo(cx + i * (o.w / 2 + 8), legY - 6);
      ctx.stroke();
    }
  }

  const armReach = o.w / 2 + 14 + Math.sin(o.armPhase) * 4;
  const armY = cy + o.h * 0.1;
  ctx.strokeStyle = type.dark;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - o.w / 2 + 2, armY);
  ctx.lineTo(cx - armReach, armY - 4);
  ctx.stroke();
  ctx.fillStyle = type.dark;
  ctx.beginPath();
  ctx.arc(cx - armReach, armY - 4, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1a1d29';
  ctx.beginPath();
  ctx.moveTo(cx - o.w * 0.22, cy - o.h * 0.12);
  ctx.lineTo(cx - o.w * 0.05, cy - o.h * 0.02);
  ctx.lineTo(cx - o.w * 0.22, cy + o.h * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + o.w * 0.22, cy - o.h * 0.12);
  ctx.lineTo(cx + o.w * 0.05, cy - o.h * 0.02);
  ctx.lineTo(cx + o.w * 0.22, cy + o.h * 0.05);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = type.color;
  ctx.font = 'bold 12px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('404', cx, o.currentY - 10);
}

function drawParkourRack(o) {
  const x = o.x;
  const y = o.currentY;
  const ground = GROUND_Y + player.h;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#202b3a';
  ctx.fillRect(x + 5, y + 8, o.w - 10, o.h - 8);
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(x, y, 8, o.h);
  ctx.fillRect(x + o.w - 8, y, 8, o.h);
  ctx.fillRect(x, y, o.w, 8);
  ctx.fillRect(x, y + o.h * 0.42, o.w, 7);
  ctx.fillRect(x, y + o.h - 8, o.w, 8);

  ctx.strokeStyle = '#8f5f20';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 13, y + 7);
  ctx.lineTo(x + o.w - 13, ground);
  ctx.moveTo(x + o.w - 13, y + 7);
  ctx.lineTo(x + 13, ground);
  ctx.stroke();

  ctx.fillStyle = '#f4f7f5';
  ctx.font = 'bold 9px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('JUMP', x + o.w / 2, y - 10);
  ctx.restore();
}

function drawPlane() {
  if (state.phase !== 'flight') return;
  const planeY = player.y + player.h - 15;
  ctx.save();
  ctx.shadowColor = 'rgba(12, 50, 72, 0.45)';
  ctx.shadowBlur = 0;

  // Rond blauw vliegtuig met witte vleugels en neus.
  ctx.fillStyle = '#1788bd';
  ctx.beginPath();
  ctx.moveTo(42, planeY + 9);
  ctx.lineTo(270, planeY + 9);
  ctx.quadraticCurveTo(304, planeY + 9, 324, planeY + 22);
  ctx.quadraticCurveTo(302, planeY + 34, 270, planeY + 34);
  ctx.lineTo(70, planeY + 34);
  ctx.quadraticCurveTo(48, planeY + 30, 42, planeY + 9);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f4f7f5';
  ctx.beginPath();
  ctx.moveTo(116, planeY + 28);
  ctx.lineTo(178, planeY + 60);
  ctx.lineTo(214, planeY + 60);
  ctx.lineTo(196, planeY + 28);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#dbe8ed';
  ctx.beginPath();
  ctx.moveTo(72, planeY + 12);
  ctx.lineTo(42, planeY - 12);
  ctx.lineTo(52, planeY - 14);
  ctx.lineTo(94, planeY + 12);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f4f7f5';
  ctx.beginPath();
  ctx.arc(319, planeY + 21, 18, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(319, planeY + 21);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#54c8ed';
  ctx.fillRect(104, planeY + 14, 22, 8);
  ctx.fillRect(145, planeY + 14, 22, 8);
  ctx.fillRect(186, planeY + 14, 22, 8);

  ctx.fillStyle = '#263746';
  ctx.beginPath();
  ctx.arc(142, planeY + 47, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#dbe8ed';
  ctx.beginPath();
  ctx.arc(142, planeY + 47, 4, 0, Math.PI * 2);
  ctx.fill();

  // Gemonteerde minigun voor op de neus van het vliegtuig.
  ctx.fillStyle = '#263746';
  ctx.fillRect(270, planeY + 14, 22, 8);
  ctx.fillStyle = '#101b25';
  ctx.fillRect(288, planeY + 10, 26, 5);
  ctx.fillRect(288, planeY + 19, 26, 5);
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(312, planeY + 11, 7, 3);
  ctx.fillRect(312, planeY + 20, 7, 3);
  ctx.restore();
}

function drawBossWaves() {
  bossWaves.forEach(w => {
    const top = GROUND_Y + player.h - w.h;
    ctx.fillStyle = '#ff9a3d';
    for (let s = 0; s < 3; s++) {
      const sx = w.x + s * 12;
      ctx.beginPath();
      ctx.moveTo(sx, GROUND_Y + player.h);
      ctx.lineTo(sx + 6, top);
      ctx.lineTo(sx + 12, GROUND_Y + player.h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,154,61,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(w.x - 4, top - 4, w.w + 8, w.h + 4);
  });
}

function drawBoss() {
  if (!boss) return;
  const bx = boss.x;
  const by = boss.y;
  const armsUp = boss.state === 'telegraph' || boss.state === 'recover';
  const flashOn = boss.hitFlash > 0 && Math.floor(boss.hitFlash / 2) % 2 === 0;

  ctx.save();
  ctx.shadowColor = boss.state === 'telegraph' ? '#ff4d5f' : '#ff8a5b';
  ctx.shadowBlur = boss.state === 'telegraph' ? 28 : 16;

  // schaduw
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(bx + boss.w / 2, GROUND_Y + player.h + 6, boss.w * 0.4, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // benen
  ctx.fillStyle = '#2a0a10';
  ctx.fillRect(bx + boss.w * 0.18, by + boss.h - 40, 34, 40);
  ctx.fillRect(bx + boss.w * 0.62, by + boss.h - 40, 34, 40);

  // torso
  ctx.fillStyle = flashOn ? '#ffffff' : '#7a0f1c';
  ctx.fillRect(bx + boss.w * 0.08, by + boss.h * 0.28, boss.w * 0.84, boss.h * 0.55);

  // gloeiende kern (zwak punt, visueel — heel het lijf is raakbaar)
  const pulse = 4 + Math.sin(state.frame * 0.15) * 2;
  const coreGrad = ctx.createRadialGradient(
    bx + boss.w / 2, by + boss.h * 0.5, 2,
    bx + boss.w / 2, by + boss.h * 0.5, 22 + pulse
  );
  coreGrad.addColorStop(0, 'rgba(255,220,120,0.95)');
  coreGrad.addColorStop(1, 'rgba(255,60,60,0)');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(bx + boss.w / 2, by + boss.h * 0.5, 22 + pulse, 0, Math.PI * 2);
  ctx.fill();

  // armen
  ctx.fillStyle = '#5c0d16';
  if (armsUp) {
    ctx.fillRect(bx - 10, by + boss.h * 0.05, 26, 60);
    ctx.fillRect(bx + boss.w - 16, by + boss.h * 0.05, 26, 60);
    ctx.fillStyle = '#2a0a10';
    ctx.beginPath(); ctx.arc(bx + 3, by + boss.h * 0.05, 16, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx + boss.w - 3, by + boss.h * 0.05, 16, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillRect(bx - 14, by + boss.h * 0.32, 22, 50);
    ctx.fillRect(bx + boss.w - 8, by + boss.h * 0.32, 22, 50);
  }

  // hoofd
  ctx.fillStyle = '#8a1622';
  ctx.fillRect(bx + boss.w * 0.28, by + boss.h * 0.06, boss.w * 0.44, boss.h * 0.24);
  // ogen
  ctx.fillStyle = '#ffe27a';
  ctx.fillRect(bx + boss.w * 0.36, by + boss.h * 0.14, 10, 8);
  ctx.fillRect(bx + boss.w * 0.56, by + boss.h * 0.14, 10, 8);

  // label
  ctx.fillStyle = '#ff3b3b';
  ctx.font = 'bold 14px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ERROR 500', bx + boss.w / 2, by - 14);

  // telegraph-indicator
  if (boss.state === 'telegraph' && Math.floor(state.frame / 6) % 2 === 0) {
    ctx.fillStyle = '#ffcc33';
    ctx.font = 'bold 22px "Press Start 2P", monospace';
    ctx.fillText('!', bx + boss.w / 2, by - 34);
  }
  ctx.restore();
}

function drawBossUI() {
  if (!boss) return;
  if (state.phase !== 'boss_intro' && state.phase !== 'boss_fight' && state.phase !== 'boss_defeat') return;

  const barW = 480;
  const barH = 22;
  const barX = CW / 2 - barW / 2;
  const barY = 24;

  ctx.fillStyle = 'rgba(5,8,14,0.92)';
  ctx.fillRect(barX - 9, barY - 9, barW + 18, barH + 18);
  ctx.strokeStyle = 'rgba(85,230,210,0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(barX - 9, barY - 9, barW + 18, barH + 18);
  ctx.fillStyle = '#202b3a';
  ctx.fillRect(barX, barY, barW, barH);

  const pct = Math.max(boss.hp / boss.maxHp, 0);
  const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  grad.addColorStop(0, '#ff4d5f');
  grad.addColorStop(1, '#ffb347');
  ctx.fillStyle = grad;
  ctx.fillRect(barX, barY, barW * pct, barH);

  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(barX, barY, barW * pct, 3);

  ctx.strokeStyle = '#12141c';
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY, barW, barH);

  ctx.fillStyle = '#f4f4f4';
  ctx.font = 'bold 11px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('BOSS: ERROR 500', CW / 2, barY - 10);

  if (state.phase === 'boss_intro' && Math.floor(state.frame / 8) % 2 === 0) {
    ctx.fillStyle = '#ffcc33';
    ctx.font = 'bold 26px "Press Start 2P", monospace';
    ctx.fillText('BOSS NADERT!', CW / 2, CH / 2 - 60);
  }
  if (state.phase === 'boss_defeat') {
    ctx.fillStyle = '#2ecc9a';
    ctx.font = 'bold 22px "Press Start 2P", monospace';
    ctx.fillText('BOSS VERSLAGEN!', CW / 2, CH / 2 - 60);
  }
}

function drawBossWarning() {
  if (state.phase !== 'run') return;
  const remaining = state.nextBossDistance - state.distance;
  if (remaining > 0 && remaining < 1500 && Math.floor(state.frame / 20) % 2 === 0) {
    ctx.fillStyle = '#ff3b3b';
    ctx.font = 'bold 11px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('\u26A0 BOSS NADERT', CW / 2, 30);
  }
}

function drawFlightUI() {
  if (state.phase !== 'flight') return;
  ctx.fillStyle = 'rgba(7, 32, 49, 0.78)';
  ctx.fillRect(CW / 2 - 140, 20, 280, 38);
  ctx.strokeStyle = '#55e6d2';
  ctx.lineWidth = 2;
  ctx.strokeRect(CW / 2 - 140, 20, 280, 38);
  ctx.fillStyle = '#f4f7f5';
  ctx.font = 'bold 13px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('FLIGHT ZONE', CW / 2, 36);
  ctx.fillStyle = '#ffd166';
  ctx.font = '10px "Press Start 2P", monospace';
  ctx.fillText('ELKE 10.000 M | DUUR 5.000 M', CW / 2, 51);
  ctx.fillStyle = '#f4f7f5';
  ctx.font = '9px "Press Start 2P", monospace';
  ctx.fillText('W/S OF PIJLTJES = BEWEGEN', CW / 2, 68);
}

function draw() {
  ctx.save();
  if (state.shake > 0) {
    const sx = (Math.random() - 0.5) * state.shake;
    const sy = (Math.random() - 0.5) * state.shake;
    ctx.translate(sx, sy);
  }

  drawBackground();
  obstacles.forEach(drawObstacle);
  drawBossWaves();
  drawBoss();
  drawParticles();
  drawPlane();
  if (state.invulnerable === 0 || Math.floor(state.invulnerable / 4) % 2 === 0) {
    drawPlayer();
  }
  drawMuzzleAndTrail();

  ctx.restore();

  drawBossUI();
  drawBossWarning();
  drawFlightUI();
}

// ==========================================================
// LOOP
// ==========================================================
function loop() {
  if (!state.running) return;
  update();
  if (!state.running) { draw(); return; }
  draw();
  requestAnimationFrame(loop);
}

// ==========================================================
// INIT
// ==========================================================
highscoreEl.textContent = state.highscore;
if (distanceEl) distanceEl.textContent = 0;
renderLives();
draw();

// ==========================================================
// BACKEND-STUB (PHP/MySQL)
// ==========================================================
async function saveScoreToServer(score) {
  try {
    await fetch('save_score.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: score })
    });
  } catch (err) {
    console.info('Kon score niet naar server sturen (backend niet actief):', err.message);
  }
}
