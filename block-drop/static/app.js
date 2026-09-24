/*
 * Block Drop — a falling-block game for Game Hub.
 * Vanilla JS + canvas, fully offline. SRS rotation with wall kicks,
 * 7-bag randomizer, hold, ghost piece, guideline-ish scoring and gravity.
 */

const COLS = 10;
const ROWS = 20;
const LOCK_DELAY_MS = 500;
const MAX_LOCK_RESETS = 15;
const DAS_DELAY_MS = 170;
const DAS_REPEAT_MS = 50;
const CLEAR_FLASH_MS = 300;
const SOFT_DROP_SPEEDUP = 20;
const QUEUE_MIN = 7;
const NEXT_COUNT = 3;
const HIGH_SCORE_KEY = "blockdrop-high";
const HIGH_LINES_KEY = "blockdrop-high-lines";
const MINI_CELL = 20;
const SWIPE_STEP_PX = 22;
const FLICK_PX_PER_MS = 0.7;

const PIECES = ["I", "O", "T", "S", "Z", "J", "L"];

/* Every piece: four rotation states (spawn, CW, 180, CCW) as [x, y] cells
 * inside the standard SRS bounding box (4x4 for I, 3x3 for the rest). */
const SHAPES = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
};

const COLORS = {
  I: "#3fb7c9",
  O: "#dfb44e",
  T: "#9b6dc9",
  S: "#6cbf5a",
  Z: "#d9604f",
  J: "#4f7fd9",
  L: "#e08a3c",
};

/* SRS wall-kick tables in screen coordinates (canvas y grows downward, so
 * the signs are flipped relative to the guideline's y-up tables).
 * Keys are "<fromState><toState>". */
const KICKS_JLSTZ = {
  "01": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "10": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "12": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "21": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "23": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "32": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "30": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "03": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

const KICKS_I = {
  "01": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "10": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "12": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  "21": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "23": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "32": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "30": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "03": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

/* ---------- pure game rules (exercised headlessly via the test hook) ---------- */

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

/* A shuffled set of all 7 piece indices — the 7-bag randomizer. */
function makeBag() {
  return shuffle([0, 1, 2, 3, 4, 5, 6]);
}

function emptyBoard() {
  const board = [];
  for (let y = 0; y < ROWS; y += 1) board.push(Array(COLS).fill(null));
  return board;
}

function cellsFor(type, rot, x, y) {
  const shape = SHAPES[type][((rot % 4) + 4) % 4];
  const cells = [];
  for (let i = 0; i < shape.length; i += 1) cells.push([shape[i][0] + x, shape[i][1] + y]);
  return cells;
}

/* Cells above the field (y < 0) are always passable; the sides, floor and
 * settled blocks are solid. */
function collides(board, cells) {
  for (let i = 0; i < cells.length; i += 1) {
    const x = cells[i][0];
    const y = cells[i][1];
    if (x < 0 || x >= COLS || y >= ROWS) return true;
    if (y >= 0 && board[y][x]) return true;
  }
  return false;
}

function maxCellY(cells) {
  let highest = -Infinity;
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i][1] > highest) highest = cells[i][1];
  }
  return highest;
}

function findFullRows(board) {
  const rows = [];
  for (let y = 0; y < ROWS; y += 1) {
    if (board[y].every(Boolean)) rows.push(y);
  }
  return rows;
}

function collapseRows(board, rows) {
  const kept = board.filter(function (_, y) { return rows.indexOf(y) === -1; });
  while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
  return kept;
}

function lineScore(lines, level) {
  return [0, 100, 300, 500, 800][lines] * level;
}

function levelForLines(lines) {
  return 1 + Math.floor(lines / 10);
}

/* Guideline-ish gravity curve, in milliseconds per row. */
function gravityMs(level) {
  const seconds = Math.pow(0.8 - (level - 1) * 0.007, level - 1);
  return Math.max(1, seconds * 1000);
}

/* SRS rotation with wall kicks: returns the rotated piece, or null when no
 * kick offset fits. Pure — never mutates the input piece or board. */
function rotateWithKicks(board, piece, dir) {
  const from = ((piece.rot % 4) + 4) % 4;
  const to = (from + (dir > 0 ? 1 : 3)) % 4;
  if (piece.type === "O") return { type: piece.type, rot: to, x: piece.x, y: piece.y };
  const table = piece.type === "I" ? KICKS_I : KICKS_JLSTZ;
  const kicks = table[String(from) + String(to)] || [[0, 0]];
  for (let i = 0; i < kicks.length; i += 1) {
    const x = piece.x + kicks[i][0];
    const y = piece.y + kicks[i][1];
    if (!collides(board, cellsFor(piece.type, to, x, y))) {
      return { type: piece.type, rot: to, x: x, y: y };
    }
  }
  return null;
}

/* ---------- dom ---------- */

const els = {
  score: document.getElementById("score"),
  lines: document.getElementById("lines"),
  level: document.getElementById("level"),
  high: document.getElementById("high"),
  scoreBox: document.getElementById("scoreBox"),
  board: document.getElementById("board"),
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlayTitle"),
  overlaySub: document.getElementById("overlaySub"),
  overlayStats: document.getElementById("overlayStats"),
  startButton: document.getElementById("startButton"),
  pause: document.getElementById("pauseButton"),
  holdCanvas: document.getElementById("holdCanvas"),
  nextCanvas: document.getElementById("nextCanvas"),
  btnLeft: document.getElementById("btnLeft"),
  btnDown: document.getElementById("btnDown"),
  btnRight: document.getElementById("btnRight"),
  btnRotate: document.getElementById("btnRotate"),
  btnDrop: document.getElementById("btnDrop"),
  btnHold: document.getElementById("btnHold"),
};

const boardCtx = els.board.getContext("2d");
const holdCtx = els.holdCanvas.getContext("2d");
const nextCtx = els.nextCanvas.getContext("2d");

/* ---------- persistence (offline, storage may be unavailable) ---------- */

function loadNumber(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch (err) {
    return fallback;
  }
}

function saveNumber(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (err) {
    // Storage unavailable — the run simply is not remembered.
  }
}

/* ---------- canvas sizing (crisp on HiDPI) ---------- */

function DPR() {
  return (typeof window !== "undefined" && window.devicePixelRatio) || 1;
}

function fitBoardCanvas() {
  const dpr = DPR();
  const cssW = els.board.clientWidth || 270;
  const cssH = els.board.clientHeight || 540;
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (els.board.width !== w || els.board.height !== h) {
    els.board.width = w;
    els.board.height = h;
  }
}

function fitMiniCanvas(canvas, cellsW, cellsH) {
  const dpr = DPR();
  canvas.style.width = cellsW * MINI_CELL + "px";
  canvas.style.height = cellsH * MINI_CELL + "px";
  canvas.width = Math.round(cellsW * MINI_CELL * dpr);
  canvas.height = Math.round(cellsH * MINI_CELL * dpr);
}

/* ---------- state ---------- */

const game = {
  phase: "ready", // ready | playing | paused | over
  board: emptyBoard(),
  piece: null,
  queue: [],
  hold: null,
  holdUsed: false,
  score: 0,
  lines: 0,
  level: 1,
  high: loadNumber(HIGH_SCORE_KEY, 0),
  highLines: loadNumber(HIGH_LINES_KEY, 0),
  dropAcc: 0,
  lockTimer: 0,
  lockResets: 0,
  softDrop: false,
  clearing: null,
  effects: [],
  das: { dir: 0, timer: 0 },
  leftHeld: false,
  rightHeld: false,
};

/* ---------- game flow ---------- */

function refillQueue() {
  while (game.queue.length < QUEUE_MIN) {
    const bag = makeBag();
    for (let i = 0; i < bag.length; i += 1) game.queue.push(bag[i]);
  }
}

function spawnPiece(type) {
  const x = type === "O" ? 4 : 3;
  game.piece = {
    type: type,
    rot: 0,
    x: x,
    y: 0,
    lowest: maxCellY(cellsFor(type, 0, x, 0)),
  };
  game.lockTimer = 0;
  game.lockResets = 0;
  game.dropAcc = 0;
  if (collides(game.board, cellsFor(type, 0, x, 0))) {
    game.piece = null;
    endGame();
    return false;
  }
  return true;
}

function spawnNext() {
  refillQueue();
  const type = PIECES[game.queue.shift()];
  game.holdUsed = false;
  return spawnPiece(type);
}

function startGame() {
  game.board = emptyBoard();
  game.queue = [];
  game.hold = null;
  game.holdUsed = false;
  game.score = 0;
  game.lines = 0;
  game.level = 1;
  game.clearing = null;
  game.effects = [];
  game.lockTimer = 0;
  game.lockResets = 0;
  game.dropAcc = 0;
  game.das.timer = 0;
  game.das.dir = game.leftHeld ? -1 : game.rightHeld ? 1 : 0;
  game.phase = "playing";
  els.pause.textContent = "Pause";
  hideOverlay();
  spawnNext();
  updateHud();
}

function pauseGame() {
  if (game.phase !== "playing") return;
  game.phase = "paused";
  els.pause.textContent = "Resume";
  showOverlay("paused");
}

function resumeGame() {
  if (game.phase !== "paused") return;
  game.phase = "playing";
  els.pause.textContent = "Pause";
  hideOverlay();
}

function togglePause() {
  if (game.phase === "playing") pauseGame();
  else if (game.phase === "paused") resumeGame();
}

function endGame() {
  if (game.phase === "over") return;
  game.phase = "over";
  game.piece = null;
  game.clearing = null;
  let newBest = false;
  if (game.score > game.high) {
    game.high = game.score;
    saveNumber(HIGH_SCORE_KEY, game.high);
    newBest = true;
  }
  if (game.lines > game.highLines) {
    game.highLines = game.lines;
    saveNumber(HIGH_LINES_KEY, game.highLines);
  }
  const chips = Math.min(200, Math.max(0, Math.floor(game.score / 25)));
  if (typeof window !== "undefined" && window.GameHubProfile) {
    window.GameHubProfile.award("block-drop", chips, game.score + " pts in Block Drop", game.score);
  }
  updateHud();
  showOverlay("over", { chips: chips, newBest: newBest });
}

/* ---------- piece actions ---------- */

function pieceBelowCollides(piece) {
  return collides(game.board, cellsFor(piece.type, piece.rot, piece.x, piece.y + 1));
}

/* Any successful shift or rotate of a grounded piece resets the lock timer,
 * up to the reset cap. */
function nudgeLockTimer() {
  const piece = game.piece;
  if (!piece) return;
  if (pieceBelowCollides(piece) && game.lockResets < MAX_LOCK_RESETS) {
    game.lockTimer = 0;
    game.lockResets += 1;
  }
}

function tryShift(dx) {
  if (game.phase !== "playing" || !game.piece) return false;
  const piece = game.piece;
  const cells = cellsFor(piece.type, piece.rot, piece.x + dx, piece.y);
  if (collides(game.board, cells)) return false;
  piece.x += dx;
  nudgeLockTimer();
  return true;
}

function rotatePiece(dir) {
  if (game.phase !== "playing" || !game.piece) return false;
  const next = rotateWithKicks(game.board, game.piece, dir);
  if (!next) return false;
  game.piece.rot = next.rot;
  game.piece.x = next.x;
  game.piece.y = next.y;
  nudgeLockTimer();
  return true;
}

/* One manual soft-drop step (touch drag) — same +1/cell as held soft drop. */
function softStep() {
  if (game.phase !== "playing" || !game.piece) return false;
  const piece = game.piece;
  if (pieceBelowCollides(piece)) return false;
  const cells = cellsFor(piece.type, piece.rot, piece.x, piece.y + 1);
  piece.y += 1;
  game.score += 1;
  const low = maxCellY(cells);
  if (low > piece.lowest) {
    piece.lowest = low;
    game.lockTimer = 0;
    game.lockResets = 0;
  }
  return true;
}

function hardDrop() {
  if (game.phase !== "playing" || !game.piece) return;
  const piece = game.piece;
  let distance = 0;
  while (!pieceBelowCollides(piece)) {
    piece.y += 1;
    distance += 1;
  }
  game.score += distance * 2;
  if (distance > 0) {
    game.effects.push({ kind: "flash", cells: cellsFor(piece.type, piece.rot, piece.x, piece.y), t: 0, dur: 160 });
    game.effects.push({ kind: "shake", t: 0, dur: 140 });
  }
  lockPiece();
}

function holdSwap() {
  if (game.phase !== "playing" || !game.piece || game.holdUsed) return;
  const current = game.piece.type;
  const swap = game.hold;
  game.hold = current;
  if (swap) spawnPiece(swap);
  else spawnNext();
  game.holdUsed = true;
}

function lockPiece() {
  const piece = game.piece;
  if (!piece) return;
  const cells = cellsFor(piece.type, piece.rot, piece.x, piece.y);
  let toppedOut = false;
  for (let i = 0; i < cells.length; i += 1) {
    const x = cells[i][0];
    const y = cells[i][1];
    if (y < 0) {
      toppedOut = true;
      continue;
    }
    game.board[y][x] = piece.type;
  }
  game.effects.push({ kind: "thud", cells: cells, t: 0, dur: 130 });
  game.piece = null;
  game.lockTimer = 0;
  game.lockResets = 0;
  game.dropAcc = 0;
  if (toppedOut) {
    endGame();
    return;
  }
  const rows = findFullRows(game.board);
  if (rows.length) game.clearing = { rows: rows, t: 0 };
  else spawnNext();
}

function finishClear() {
  const clearing = game.clearing;
  game.clearing = null;
  if (!clearing) {
    spawnNext();
    return;
  }
  const count = clearing.rows.length;
  game.board = collapseRows(game.board, clearing.rows);
  game.lines += count;
  const gained = lineScore(count, game.level);
  game.score += gained;
  game.level = levelForLines(game.lines);
  flashPoints("+" + gained);
  spawnNext();
}

/* ---------- fixed-step update (driven by the rAF accumulator) ---------- */

function ageEffects(dt) {
  for (let i = game.effects.length - 1; i >= 0; i -= 1) {
    const effect = game.effects[i];
    effect.t += dt;
    if (effect.t >= effect.dur) game.effects.splice(i, 1);
  }
}

function update(dt) {
  ageEffects(dt);

  // DAS auto-repeat for held left/right.
  if (game.das.dir !== 0 && game.piece) {
    game.das.timer += dt;
    let repeats = 0;
    while (game.das.timer >= DAS_DELAY_MS && repeats < 30) {
      game.das.timer -= DAS_REPEAT_MS;
      tryShift(game.das.dir);
      repeats += 1;
    }
  } else if (!game.piece) {
    // Keep the charge warm across line clears (instant DAS on spawn),
    // never bursting past the first repeat.
    game.das.timer = Math.min(game.das.timer + dt, DAS_DELAY_MS);
  }

  // Line-clear flash; the collapse happens when the flash ends.
  if (game.clearing) {
    game.clearing.t += dt;
    if (game.clearing.t >= CLEAR_FLASH_MS) finishClear();
    return;
  }

  const piece = game.piece;
  if (!piece) return;

  // Gravity (soft drop is 20x) with an accumulator so speed never depends
  // on frame rate.
  const interval = game.softDrop
    ? Math.max(1, gravityMs(game.level) / SOFT_DROP_SPEEDUP)
    : gravityMs(game.level);
  game.dropAcc += dt;
  let steps = 0;
  while (game.dropAcc >= interval && steps < 40) {
    game.dropAcc -= interval;
    steps += 1;
    if (pieceBelowCollides(piece)) {
      game.dropAcc = 0;
      break;
    }
    const cells = cellsFor(piece.type, piece.rot, piece.x, piece.y + 1);
    piece.y += 1;
    if (game.softDrop) game.score += 1;
    const low = maxCellY(cells);
    if (low > piece.lowest) {
      piece.lowest = low;
      game.lockTimer = 0;
      game.lockResets = 0;
    }
  }

  // Lock delay with move resets.
  if (pieceBelowCollides(game.piece)) {
    game.lockTimer += dt;
    if (game.lockTimer >= LOCK_DELAY_MS) lockPiece();
  } else {
    game.lockTimer = 0;
  }
}

/* ---------- rendering ---------- */

function roundedPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawBlock(ctx, px, py, size, color, alpha) {
  const inset = Math.max(1, size * 0.055);
  const s = size - inset * 2;
  if (s <= 0) return;
  const r = Math.max(2, size * 0.18);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  roundedPath(ctx, px + inset, py + inset, s, s, r);
  ctx.fill();
  ctx.save();
  roundedPath(ctx, px + inset, py + inset, s, s, r);
  ctx.clip();
  ctx.fillStyle = "rgba(255, 255, 255, 0.24)";
  ctx.fillRect(px + inset, py + inset, s, s * 0.42);
  ctx.fillStyle = "rgba(15, 30, 24, 0.18)";
  ctx.fillRect(px + inset, py + inset + s * 0.72, s, s * 0.28);
  ctx.restore();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "rgba(20, 24, 20, 0.25)";
  ctx.lineWidth = Math.max(1, size * 0.04);
  roundedPath(ctx, px + inset, py + inset, s, s, r);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawGhost(ctx, px, py, size, color) {
  const inset = Math.max(1.5, size * 0.09);
  const s = size - inset * 2;
  if (s <= 0) return;
  roundedPath(ctx, px + inset, py + inset, s, s, Math.max(2, size * 0.16));
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.06);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function draw() {
  const ctx = boardCtx;
  const w = els.board.width;
  const h = els.board.height;
  if (!w || !h) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const cell = w / COLS;

  // Green felt board with a subtle grid.
  ctx.fillStyle = "#24503f";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(246, 241, 230, 0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < COLS; x += 1) {
    ctx.moveTo(x * cell, 0);
    ctx.lineTo(x * cell, h);
  }
  for (let y = 1; y < ROWS; y += 1) {
    ctx.moveTo(0, y * cell);
    ctx.lineTo(w, y * cell);
  }
  ctx.stroke();

  // Tiny horizontal shake right after a hard drop.
  let shakeX = 0;
  for (let i = 0; i < game.effects.length; i += 1) {
    const effect = game.effects[i];
    if (effect.kind === "shake") {
      shakeX += Math.sin(effect.t * 0.12) * 2.5 * (1 - effect.t / effect.dur);
    }
  }
  ctx.save();
  ctx.translate(shakeX, 0);

  // Settled blocks.
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const type = game.board[y][x];
      if (type) drawBlock(ctx, x * cell, y * cell, cell, COLORS[type], 1);
    }
  }

  // Line-clear flash over the doomed rows.
  if (game.clearing) {
    const progress = game.clearing.t / CLEAR_FLASH_MS;
    const alpha = Math.max(0, (0.55 + 0.45 * Math.sin(game.clearing.t * 0.05)) * (1 - progress));
    ctx.fillStyle = "rgba(255, 253, 244, " + alpha.toFixed(3) + ")";
    for (let i = 0; i < game.clearing.rows.length; i += 1) {
      ctx.fillRect(0, game.clearing.rows[i] * cell, w, cell);
    }
  }

  // Lock thud + hard-drop landing flash.
  for (let i = 0; i < game.effects.length; i += 1) {
    const effect = game.effects[i];
    if (effect.kind !== "flash" && effect.kind !== "thud") continue;
    const strength = (effect.kind === "flash" ? 0.55 : 0.3) * (1 - effect.t / effect.dur);
    ctx.fillStyle = "rgba(255, 255, 255, " + strength.toFixed(3) + ")";
    for (let j = 0; j < effect.cells.length; j += 1) {
      const c = effect.cells[j];
      if (c[1] >= 0 && c[1] < ROWS && c[0] >= 0 && c[0] < COLS) {
        ctx.fillRect(c[0] * cell, c[1] * cell, cell, cell);
      }
    }
  }

  // Ghost piece, then the active piece.
  const piece = game.piece;
  if (piece && game.phase !== "ready") {
    let gy = piece.y;
    while (!collides(game.board, cellsFor(piece.type, piece.rot, piece.x, gy + 1))) gy += 1;
    if (gy > piece.y) {
      const ghostCells = cellsFor(piece.type, piece.rot, piece.x, gy);
      for (let i = 0; i < ghostCells.length; i += 1) {
        if (ghostCells[i][1] >= 0) {
          drawGhost(ctx, ghostCells[i][0] * cell, ghostCells[i][1] * cell, cell, COLORS[piece.type]);
        }
      }
    }
    const pieceCells = cellsFor(piece.type, piece.rot, piece.x, piece.y);
    for (let i = 0; i < pieceCells.length; i += 1) {
      if (pieceCells[i][1] >= 0) {
        drawBlock(ctx, pieceCells[i][0] * cell, pieceCells[i][1] * cell, cell, COLORS[piece.type], 1);
      }
    }
  }

  ctx.restore();
  renderPreviews();
}

function drawMini(ctx, type, slotTopCells, slotCells, alpha) {
  const cells = SHAPES[type][0];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i][0] < minX) minX = cells[i][0];
    if (cells[i][0] > maxX) maxX = cells[i][0];
    if (cells[i][1] < minY) minY = cells[i][1];
    if (cells[i][1] > maxY) maxY = cells[i][1];
  }
  const m = MINI_CELL;
  const ox = (4 * m - (maxX - minX + 1) * m) / 2 - minX * m;
  const oy = slotTopCells * m + (slotCells * m - (maxY - minY + 1) * m) / 2 - minY * m;
  for (let i = 0; i < cells.length; i += 1) {
    drawBlock(ctx, ox + cells[i][0] * m, oy + cells[i][1] * m, m, COLORS[type], alpha);
  }
}

function renderPreviews() {
  const dpr = DPR();
  holdCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  holdCtx.clearRect(0, 0, 4 * MINI_CELL, 3 * MINI_CELL);
  if (game.hold) drawMini(holdCtx, game.hold, 0, 3, game.holdUsed ? 0.35 : 1);

  nextCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  nextCtx.clearRect(0, 0, 4 * MINI_CELL, NEXT_COUNT * 3 * MINI_CELL);
  for (let i = 0; i < NEXT_COUNT; i += 1) {
    const type = PIECES[game.queue[i]];
    if (type) drawMini(nextCtx, type, i * 3, 3, 1);
  }
}

/* ---------- hud & overlays ---------- */

const hudCache = { score: -1, lines: -1, level: -1, high: -1 };

function updateHud() {
  if (hudCache.score !== game.score) {
    els.score.textContent = String(game.score);
    hudCache.score = game.score;
  }
  if (hudCache.lines !== game.lines) {
    els.lines.textContent = String(game.lines);
    hudCache.lines = game.lines;
  }
  if (hudCache.level !== game.level) {
    els.level.textContent = String(game.level);
    hudCache.level = game.level;
  }
  const shownHigh = Math.max(game.high, game.score);
  if (hudCache.high !== shownHigh) {
    els.high.textContent = String(shownHigh);
    hudCache.high = shownHigh;
  }
}

function flashPoints(text) {
  if (!els.scoreBox) return;
  const span = document.createElement("span");
  span.className = "score-add";
  span.textContent = text;
  els.scoreBox.appendChild(span);
  setTimeout(function () {
    if (span.parentNode) span.parentNode.removeChild(span);
  }, 800);
}

function chip(text) {
  return '<span class="chip">' + text + "</span>";
}

function hideOverlay() {
  els.overlay.hidden = true;
}

function showOverlay(mode, info) {
  info = info || {};
  els.overlay.hidden = false;
  els.overlayStats.hidden = true;
  els.overlayStats.innerHTML = "";
  if (mode === "paused") {
    els.overlayTitle.textContent = "Paused";
    els.overlaySub.textContent = "The stack is blurred — press P to resume";
    els.startButton.textContent = "Resume";
  } else if (mode === "over") {
    els.overlayTitle.textContent = info.newBest ? "New best!" : "Game over";
    els.overlaySub.textContent = "Best " + game.high + " pts · " + game.highLines + " lines";
    const chips = [
      chip(game.score + " pts"),
      chip(game.lines + " lines"),
      chip("Level " + game.level),
      '<span class="chip chip-gold">+' + info.chips + " chips</span>",
    ];
    if (info.newBest) chips.push('<span class="chip chip-best">Personal best</span>');
    els.overlayStats.innerHTML = chips.join("");
    els.overlayStats.hidden = false;
    els.startButton.textContent = "Play Again";
  } else {
    els.overlayTitle.textContent = "Ready?";
    els.overlaySub.textContent = "Drop in — arrows to steer";
    els.startButton.textContent = "Start";
  }
}

/* ---------- input ---------- */

function pressDir(dir) {
  if (dir === -1) game.leftHeld = true;
  else game.rightHeld = true;
  game.das.dir = dir;
  game.das.timer = 0;
  tryShift(dir);
}

function releaseDir(dir) {
  if (dir === -1) game.leftHeld = false;
  else game.rightHeld = false;
  if (game.das.dir === dir) {
    game.das.dir = game.leftHeld ? -1 : game.rightHeld ? 1 : 0;
    game.das.timer = 0;
  }
}

function releaseAllInput() {
  game.leftHeld = false;
  game.rightHeld = false;
  game.softDrop = false;
  game.das.dir = 0;
  game.das.timer = 0;
}

function bindPress(el, down, up) {
  if (!el) return;
  el.addEventListener("pointerdown", function (event) {
    event.preventDefault();
    if (typeof el.setPointerCapture === "function") {
      try {
        el.setPointerCapture(event.pointerId);
      } catch (err) {
        // Capture is best-effort; the button still works without it.
      }
    }
    down();
  });
  const release = function () {
    if (up) up();
  };
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
}

/* Swipe/drag gestures on the board: drag to steer, drag down to soft drop,
 * fast flick down to hard drop, quick tap to rotate. */
function bindGestures() {
  const canvas = els.board;
  let gesture = null;

  canvas.addEventListener("touchstart", function (event) {
    if (gesture || event.changedTouches.length < 1) return;
    const touch = event.changedTouches[0];
    gesture = {
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      x0: touch.clientX,
      y0: touch.clientY,
      t0: event.timeStamp,
      moved: false,
    };
  }, { passive: true });

  canvas.addEventListener("touchmove", function (event) {
    if (!gesture) return;
    event.preventDefault();
    for (let i = 0; i < event.changedTouches.length; i += 1) {
      const touch = event.changedTouches[i];
      if (touch.identifier !== gesture.id) continue;
      let dx = touch.clientX - gesture.x;
      while (dx >= SWIPE_STEP_PX) {
        tryShift(1);
        gesture.x += SWIPE_STEP_PX;
        dx -= SWIPE_STEP_PX;
        gesture.moved = true;
      }
      while (dx <= -SWIPE_STEP_PX) {
        tryShift(-1);
        gesture.x -= SWIPE_STEP_PX;
        dx += SWIPE_STEP_PX;
        gesture.moved = true;
      }
      let dy = touch.clientY - gesture.y;
      while (dy >= SWIPE_STEP_PX) {
        softStep();
        gesture.y += SWIPE_STEP_PX;
        dy -= SWIPE_STEP_PX;
        gesture.moved = true;
      }
      while (dy <= -SWIPE_STEP_PX) {
        gesture.y -= SWIPE_STEP_PX;
        dy += SWIPE_STEP_PX;
      }
    }
  }, { passive: false });

  const endGesture = function (event) {
    if (!gesture) return;
    for (let i = 0; i < event.changedTouches.length; i += 1) {
      const touch = event.changedTouches[i];
      if (touch.identifier !== gesture.id) continue;
      const elapsed = Math.max(1, event.timeStamp - gesture.t0);
      const totalDy = touch.clientY - gesture.y0;
      const isFlick = totalDy > 60 && totalDy / elapsed > FLICK_PX_PER_MS;
      if (game.phase === "playing") {
        if (isFlick) hardDrop();
        else if (!gesture.moved && elapsed < 300) rotatePiece(1);
      }
      gesture = null;
    }
  };
  canvas.addEventListener("touchend", endGesture, { passive: true });
  canvas.addEventListener("touchcancel", endGesture, { passive: true });
}

function bindInput() {
  document.addEventListener("keydown", function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key;
    if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown" || key === " ") {
      event.preventDefault();
    }
    switch (key) {
      case "ArrowLeft":
      case "a":
      case "A":
        if (!event.repeat && !game.leftHeld) pressDir(-1);
        break;
      case "ArrowRight":
      case "d":
      case "D":
        if (!event.repeat && !game.rightHeld) pressDir(1);
        break;
      case "ArrowDown":
      case "s":
      case "S":
        game.softDrop = true;
        break;
      case "ArrowUp":
      case "x":
      case "X":
      case "w":
      case "W":
        if (!event.repeat) rotatePiece(1);
        break;
      case "z":
      case "Z":
        if (!event.repeat) rotatePiece(-1);
        break;
      case " ":
        if (game.phase === "playing") {
          if (!event.repeat) hardDrop();
        } else if (game.phase === "ready" || game.phase === "over") {
          startGame();
        }
        break;
      case "c":
      case "C":
        if (!event.repeat) holdSwap();
        break;
      case "p":
      case "P":
        togglePause();
        break;
      case "r":
      case "R":
        startGame();
        break;
      case "Enter":
        if (game.phase === "ready" || game.phase === "over") startGame();
        break;
      default:
        break;
    }
  });

  document.addEventListener("keyup", function (event) {
    switch (event.key) {
      case "ArrowLeft":
      case "a":
      case "A":
        releaseDir(-1);
        break;
      case "ArrowRight":
      case "d":
      case "D":
        releaseDir(1);
        break;
      case "ArrowDown":
      case "s":
      case "S":
        game.softDrop = false;
        break;
      default:
        break;
    }
  });

  window.addEventListener("blur", releaseAllInput);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) pauseGame();
  });

  document.addEventListener("contextmenu", function (event) {
    const target = event.target;
    if (target && typeof target.closest === "function" && target.closest("#board, .touch-controls")) {
      event.preventDefault();
    }
  });

  bindPress(els.btnLeft, function () { pressDir(-1); }, function () { releaseDir(-1); });
  bindPress(els.btnRight, function () { pressDir(1); }, function () { releaseDir(1); });
  bindPress(els.btnDown, function () { game.softDrop = true; }, function () { game.softDrop = false; });
  bindPress(els.btnRotate, function () { rotatePiece(1); }, null);
  bindPress(els.btnDrop, function () { hardDrop(); }, null);
  bindPress(els.btnHold, function () { holdSwap(); }, null);
  bindGestures();

  els.startButton.addEventListener("click", function () {
    if (game.phase === "paused") resumeGame();
    else startGame();
  });
  els.pause.addEventListener("click", togglePause);

  window.addEventListener("resize", fitBoardCanvas);
}

/* ---------- main loop ---------- */

let lastTime = 0;

function frame(nowMs) {
  requestAnimationFrame(frame);
  const dt = Math.min(Math.max(nowMs - lastTime, 0), 250);
  lastTime = nowMs;
  if (game.phase === "playing") update(dt);
  draw();
  updateHud();
}

function boot() {
  fitMiniCanvas(els.holdCanvas, 4, 3);
  fitMiniCanvas(els.nextCanvas, 4, NEXT_COUNT * 3);
  fitBoardCanvas();
  refillQueue();
  updateHud();
  showOverlay("ready");
  bindInput();
  lastTime = typeof performance !== "undefined" && performance.now ? performance.now() : 0;
  requestAnimationFrame(frame);
  draw();
}

boot();

/* Test seam — inert in the browser; the headless harness uses it to exercise
 * the pure core and drive the real input handlers. */
if (typeof globalThis !== "undefined" && globalThis.__BLOCKDROP_TEST_HOOK__) {
  globalThis.__BLOCKDROP_TEST_HOOK__({
    COLS: COLS,
    ROWS: ROWS,
    PIECES: PIECES,
    SHAPES: SHAPES,
    KICKS_JLSTZ: KICKS_JLSTZ,
    KICKS_I: KICKS_I,
    makeBag: makeBag,
    emptyBoard: emptyBoard,
    cellsFor: cellsFor,
    collides: collides,
    findFullRows: findFullRows,
    collapseRows: collapseRows,
    lineScore: lineScore,
    levelForLines: levelForLines,
    gravityMs: gravityMs,
    rotateWithKicks: rotateWithKicks,
    endGame: endGame,
    getGame: function () { return game; },
  });
}
