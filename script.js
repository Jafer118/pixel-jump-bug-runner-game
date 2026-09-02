/* 
   PIXEL JUMP: DE BUG-RUNNER
   Volledige game-logica in vanilla JS + Canvas 2D.
   */

//    Canvas setup 
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const CW = canvas.width;   // 1000
const CH = canvas.height;  // 480
const GROUND_Y = CH - 90;

//      HUD elements 
const scoreEl = document.getElementById('score');
const highscoreEl = document.getElementById('highscore');
const livesEl = document.getElementById('lives');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScoreEl = document.getElementById('finalScore');
const newHighscoreMsg = document.getElementById('newHighscoreMsg');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');

//  Game state 
const MAX_LIVES = 2; // hartje + koffiebeker
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
  invulnerable: 0
};

//    Player (student met afstudeerhoedje) 
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

//   Obstacles (rode bugs) 
let obstacles = [];

//    Background layers (parallax) 
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


// LIVES UI

function renderLives() {
  livesEl.innerHTML = '';
  const icons = ['heart', 'coffee']; // rechts = hartje, dan koffie (volgorde als screenshot: coffee, heart)
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


// INPUT

function jump() {
  if (!state.running) return;
  if (player.grounded) {
    player.vy = player.jumpForce;
    player.grounded = false;
  }
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (!state.running && !state.gameOver) startGame();
    else jump();
  }
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

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);


// GAME FLOW

function startGame() {
  state.running = true;
  state.gameOver = false;
  state.score = 0;
  state.speed = state.baseSpeed;
  state.lives = MAX_LIVES;
  state.frame = 0;
  state.nextObstacleIn = 70;
  state.invulnerable = 0;
  obstacles = [];
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
    saveScoreToServer(state.score); // zie backend-stub onderaan
  } else {
    newHighscoreMsg.textContent = '';
  }

  finalScoreEl.textContent = state.score;
  highscoreEl.textContent = state.highscore;
  gameOverScreen.classList.remove('hidden');
}


// SPAWN & DIFFICULTY

function spawnObstacle() {
  const size = 46 + Math.random() * 20;
  obstacles.push({
    x: CW + 20,
    y: GROUND_Y + player.h - size,
    w: size,
    h: size,
    passed: false
  });
}

// Volledige sprong (op + neer) duurt ~31 frames bij de huidige zwaartekracht/
// sprongkracht. De tijd tussen twee obstakels (in frames, ONAFHANKELIJK van
// snelheid, want beide bewegen even snel) moet daar ruim boven blijven,
// anders is een obstakel er nog voor je geland en weer kan springen.
const JUMP_AIRTIME_FRAMES = (2 * 15.5) / 1.0; // ≈ 31

function updateDifficulty() {
  // moeilijkheidsgraad stijgt geleidelijk met score, met een lager plafond
  state.speed = state.baseSpeed + Math.min(state.score / 130, 6);
}

// UPDATE

function update() {
  state.frame++;

  // score loopt op met tijd
  if (state.frame % 6 === 0) {
    state.score += 1;
    scoreEl.textContent = state.score;
    updateDifficulty();
  }

  // speler fysica
  player.vy += player.gravity;
  player.y += player.vy;
  if (player.y >= GROUND_Y) {
    player.y = GROUND_Y;
    player.vy = 0;
    player.grounded = true;
  }
  if (player.grounded) player.runFrame += 1;

  // obstakels spawnen
  state.nextObstacleIn--;
  if (state.nextObstacleIn <= 0) {
    spawnObstacle();
    // Altijd minstens sprongtijd + reactiebuffer tussen twee obstakels,
    // ook bij hoge snelheid — anders is een sprong niet af te maken.
    const minGap = Math.max(JUMP_AIRTIME_FRAMES + 20 - state.speed * 0.5, JUMP_AIRTIME_FRAMES + 12);
    state.nextObstacleIn = minGap + Math.random() * 35;
  }

  // obstakels bewegen + botsing checken
  if (state.invulnerable > 0) state.invulnerable--;

  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.x -= state.speed;

    if (o.x + o.w < -20) {
      obstacles.splice(i, 1);
      continue;
    }

    const hit =
      state.invulnerable === 0 &&
      player.x + 6 < o.x + o.w - 14 &&
      player.x + player.w - 14 > o.x + 6 &&
      player.y + 4 < o.y + o.h - 12 &&
      player.y + player.h - 12 > o.y + 4;

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

  // parallax achtergrond
  buildings.forEach(b => {
    b.x -= b.speed * (state.speed / state.baseSpeed);
    if (b.x + b.w < 0) b.x = CW + Math.random() * 40;
  });
}


// DRAW

function drawBackground() {
  // lucht gradient
  const sky = ctx.createLinearGradient(0, 0, 0, CH);
  sky.addColorStop(0, '#1b1e2b');
  sky.addColorStop(1, '#2b2f42');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CW, CH);

  // maan
  ctx.fillStyle = '#c9d0da';
  ctx.beginPath();
  ctx.arc(moon.x, moon.y, moon.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(150,158,172,0.5)';
  ctx.beginPath();
  ctx.arc(moon.x - 12, moon.y + 8, 7, 0, Math.PI * 2);
  ctx.arc(moon.x + 14, moon.y - 4, 5, 0, Math.PI * 2);
  ctx.fill();

  // gebouwen silhouetten
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

  // grond
  ctx.fillStyle = '#4a5066';
  ctx.fillRect(0, GROUND_Y + player.h, CW, 6);
  ctx.fillStyle = '#33384a';
  ctx.fillRect(0, GROUND_Y + player.h + 6, CW, CH - (GROUND_Y + player.h + 6));

  // grond tegels
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

  // schaduw
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(px + player.w / 2, GROUND_Y + player.h + 4, 20, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // benen
  ctx.fillStyle = '#1c6b52';
  const legOffset = player.grounded ? Math.sin(player.runFrame * 0.5) * 8 : 0;
  ctx.fillRect(px + 8, py + 40, 10, 18 - legOffset);
  ctx.fillRect(px + 24, py + 40, 10, 18 + legOffset);

  // hoodie / lijf
  ctx.fillStyle = '#2ecc9a';
  ctx.fillRect(px + 4, py + 16, 36, 28);

  // rits
  ctx.fillStyle = '#1c6b52';
  ctx.fillRect(px + 20, py + 18, 4, 24);

  // armen
  ctx.fillStyle = '#2ecc9a';
  ctx.fillRect(px - 4, py + 18, 8, 18);
  ctx.fillRect(px + 40, py + 18, 8, 18);

  // hoofd
  ctx.fillStyle = '#4be3d4';
  ctx.fillRect(px + 8, py, 28, 20);

  // gezicht
  ctx.fillStyle = '#12141c';
  ctx.fillRect(px + 14, py + 8, 3, 3);
  ctx.fillRect(px + 26, py + 8, 3, 3);
  ctx.fillRect(px + 16, py + 15, 12, 2);

  // afstudeerhoedje
  ctx.fillStyle = '#1a1d29';
  ctx.fillRect(px + 4, py - 6, 36, 6);
  ctx.fillRect(px + 14, py - 12, 16, 8);
  ctx.fillStyle = '#ffcc33';
  ctx.fillRect(px + 32, py - 10, 2, 10);
  ctx.fillRect(px + 30, py - 2, 6, 4);

  ctx.restore();
}

function drawObstacle(o) {
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;

  // lichaam
  ctx.fillStyle = '#e8283f';
  ctx.beginPath();
  ctx.ellipse(cx, cy, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // pootjes
  ctx.strokeStyle = '#a3121f';
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

  // ogen
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

  // 404 label boven de bug
  ctx.fillStyle = '#ff3b3b';
  ctx.font = 'bold 13px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('404', cx, o.y - 10);
}

function draw() {
  drawBackground();
  obstacles.forEach(drawObstacle);
  if (state.invulnerable === 0 || Math.floor(state.invulnerable / 4) % 2 === 0) {
    drawPlayer();
  }
}


// LOOP

function loop() {
  if (!state.running) return;
  update();
  if (!state.running) { draw(); return; } // laatste frame na botsing tonen
  draw();
  requestAnimationFrame(loop);
}


// INIT

highscoreEl.textContent = state.highscore;
renderLives();
draw();


// BACKEND-STUB (PHP/MySQL)

// Deze functie stuurt de score naar een PHP-endpoint dat de
// score wegschrijft in de `scores`-tabel (zie db_schema.sql).
// Lokaal getest zonder backend? Dan faalt de fetch geruisloos
// en blijft de highscore gewoon in localStorage staan.
// ==========================================================
async function saveScoreToServer(score) {
  try {
    await fetch('save_score.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        score: score,
        // user_id: haal dit op uit een sessie/login-systeem
        // skin_id: koppel dit aan de gekozen skin uit de `skins`-tabel
      })
    });
  } catch (err) {
    // Backend niet beschikbaar (bv. lokaal zonder PHP-server) -> negeren
    console.info('Kon score niet naar server sturen (backend niet actief):', err.message);
  }
}
