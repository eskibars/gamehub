const GRID = 22;
const HIGH_KEY = "gamehub-snake-high";
const SPEED_KEY = "gamehub-snake-speed";

const canvas = document.querySelector("#board");
const ctx = canvas.getContext("2d");
const els = {
  score: document.querySelector("#score"),
  high: document.querySelector("#high"),
  overlay: document.querySelector("#overlay"),
  overlayTitle: document.querySelector("#overlayTitle"),
  overlaySub: document.querySelector("#overlaySub"),
  playAgain: document.querySelector("#playAgain"),
  pause: document.querySelector("#pauseButton"),
  speedRow: document.querySelector("#speedRow"),
};

const state = {
  snake: [],
  direction: { x: 1, y: 0 },
  queued: [],
  food: null,
  score: 0,
  high: Number(localStorage.getItem(HIGH_KEY) || 0),
  stepMs: Number(localStorage.getItem(SPEED_KEY) || 100),
  alive: false,
  paused: false,
  timer: null,
  foodPulse: 0,
};

els.high.textContent = state.high;

function cell() {
  return canvas.width / GRID;
}

function startGame() {
  state.snake = [
    { x: 10, y: 11 },
    { x: 9, y: 11 },
    { x: 8, y: 11 },
  ];
  state.direction = { x: 1, y: 0 };
  state.queued = [];
  state.score = 0;
  state.alive = true;
  state.paused = false;
  state.food = spawnFood();
  els.score.textContent = "0";
  els.overlay.hidden = true;
  els.pause.textContent = "Pause";
  draw();
  loop();
}

function loop() {
  clearInterval(state.timer);
  state.timer = setInterval(step, state.stepMs);
}

function spawnFood() {
  let next;
  do {
    next = {
      x: Math.floor(Math.random() * GRID),
      y: Math.floor(Math.random() * GRID),
    };
  } while (state.snake.some((part) => part.x === next.x && part.y === next.y));
  return next;
}

function step() {
  if (!state.alive || state.paused) {
    draw();
    return;
  }
  const next = state.queued.shift();
  if (next) state.direction = next;

  const head = state.snake[0];
  const moved = { x: head.x + state.direction.x, y: head.y + state.direction.y };

  const hitWall = moved.x < 0 || moved.y < 0 || moved.x >= GRID || moved.y >= GRID;
  const hitSelf = state.snake.some((part, index) => index < state.snake.length - 1 && part.x === moved.x && part.y === moved.y);
  if (hitWall || hitSelf) return die();

  state.snake.unshift(moved);
  if (moved.x === state.food.x && moved.y === state.food.y) {
    state.score += 1;
    els.score.textContent = state.score;
    state.food = spawnFood();
    if (state.score > state.high) {
      state.high = state.score;
      localStorage.setItem(HIGH_KEY, String(state.high));
      els.high.textContent = state.high;
    }
  } else {
    state.snake.pop();
  }
  draw();
}

function die() {
  state.alive = false;
  clearInterval(state.timer);
  draw();
  els.overlayTitle.textContent = "Game over";
  els.overlaySub.textContent = `You ate ${state.score} ${state.score === 1 ? "apple" : "apples"}`;
  els.overlay.hidden = false;
  window.GameHubProfile?.award("snake", state.score, `${state.score} apples`, state.score);
}

function draw() {
  const size = cell();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Subtle checkerboard so the grid reads at a glance.
  ctx.fillStyle = "rgba(32, 35, 31, 0.045)";
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      if ((x + y) % 2 === 0) ctx.fillRect(x * size, y * size, size, size);
    }
  }

  // Apple with a gentle pulse, drawn with shapes so it renders everywhere.
  state.foodPulse += 0.08;
  const pulse = 1 + Math.sin(state.foodPulse) * 0.08;
  const fx = state.food.x * size + size / 2;
  const fy = state.food.y * size + size / 2;
  const radius = size * 0.32 * pulse;
  ctx.fillStyle = "#c0392b";
  ctx.beginPath();
  ctx.arc(fx, fy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8bc34a";
  ctx.beginPath();
  ctx.ellipse(fx + radius * 0.5, fy - radius * 0.9, radius * 0.38, radius * 0.2, -0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#6d4c2f";
  ctx.lineWidth = Math.max(1.5, size * 0.06);
  ctx.beginPath();
  ctx.moveTo(fx, fy - radius * 0.8);
  ctx.lineTo(fx, fy - radius * 1.25);
  ctx.stroke();

  state.snake.forEach((part, index) => {
    const t = 1 - index / (state.snake.length + 4);
    ctx.fillStyle = index === 0 ? "#1a4a3e" : `rgba(35, 108, 90, ${0.55 + t * 0.45})`;
    const pad = size * 0.08;
    roundRect(part.x * size + pad, part.y * size + pad, size - pad * 2, size - pad * 2, size * 0.28);
    ctx.fill();
  });
  // Eyes on the head give it a little character.
  if (state.snake.length) {
    const head = state.snake[0];
    const cx = head.x * size + size / 2;
    const cy = head.y * size + size / 2;
    ctx.fillStyle = "#fff";
    const offset = size * 0.18;
    const fx = state.direction.x;
    const fy = state.direction.y;
    ctx.beginPath();
    ctx.arc(cx + (fx ? fx * offset : -offset), cy + (fy ? fy * offset : -offset * 0.5), size * 0.09, 0, Math.PI * 2);
    ctx.arc(cx + (fx ? fx * offset : offset), cy + (fy ? fy * offset : offset * 0.5), size * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  if (state.paused && state.alive) {
    ctx.fillStyle = "rgba(246, 241, 230, 0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#20231f";
    ctx.font = "900 34px Inter, sans-serif";
    ctx.fillText("Paused", canvas.width / 2, canvas.height / 2);
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function steer(x, y) {
  const last = state.queued.length ? state.queued[state.queued.length - 1] : state.direction;
  if (last.x === -x && last.y === -y) return;
  if (last.x === x && last.y === y) return;
  if (state.queued.length < 3) state.queued.push({ x, y });
}

function bindInput() {
  const keys = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  };
  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === " ") {
      event.preventDefault();
      togglePause();
      return;
    }
    const dir = keys[event.key];
    if (!dir) return;
    event.preventDefault();
    steer(dir[0], dir[1]);
  });

  let start = null;
  document.addEventListener("touchstart", (event) => {
    start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  document.addEventListener("touchend", (event) => {
    if (!start) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) steer(dx > 0 ? 1 : -1, 0);
    else steer(0, dy > 0 ? 1 : -1);
  });

  els.playAgain.addEventListener("click", startGame);
  els.pause.addEventListener("click", togglePause);
  els.speedRow.addEventListener("change", (event) => {
    state.stepMs = Number(event.target.value);
    localStorage.setItem(SPEED_KEY, event.target.value);
    if (state.alive) loop();
  });
}

function togglePause() {
  if (!state.alive) return;
  state.paused = !state.paused;
  els.pause.textContent = state.paused ? "Resume" : "Pause";
  draw();
}

const savedSpeed = localStorage.getItem(SPEED_KEY);
if (savedSpeed) {
  const radio = document.querySelector(`input[name="speed"][value="${savedSpeed}"]`);
  if (radio) {
    radio.checked = true;
    state.stepMs = Number(savedSpeed);
  }
}

// Static preview behind the initial overlay.
state.snake = [
  { x: 10, y: 11 },
  { x: 9, y: 11 },
  { x: 8, y: 11 },
];
state.food = { x: 15, y: 11 };
draw();
els.overlayTitle.textContent = "Ready?";
els.overlaySub.textContent = "Steer with arrows, WASD, or swipe";
els.playAgain.textContent = "Start";
els.overlay.hidden = false;
els.playAgain.addEventListener("click", () => {
  els.playAgain.textContent = "Play Again";
}, { once: true });

bindInput();
