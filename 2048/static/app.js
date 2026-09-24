const SIZE = 4;
const BEST_KEY = "gamehub-2048-best";
const STATE_KEY = "gamehub-2048-state";

const els = {
  board: document.querySelector("#board"),
  layer: document.querySelector("#tileLayer"),
  score: document.querySelector("#score"),
  best: document.querySelector("#best"),
  scoreAdd: document.querySelector("#scoreAdd"),
  overlay: document.querySelector("#overlay"),
  overlayTitle: document.querySelector("#overlayTitle"),
  overlaySub: document.querySelector("#overlaySub"),
  overlayAction: document.querySelector("#overlayAction"),
  overlayKeep: document.querySelector("#overlayKeep"),
  newGame: document.querySelector("#newGame"),
  undo: document.querySelector("#undo"),
};

let grid;
let nextId = 1;
let score = 0;
let best = Number(localStorage.getItem(BEST_KEY) || 0);
let won = false;
let over = false;
let undoStack = [];
const tileEls = new Map();
let pending = [];

function emptyGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

function activeTiles() {
  const tiles = [];
  for (const row of grid) for (const tile of row) if (tile) tiles.push(tile);
  return tiles;
}

function addRandomTile() {
  const empty = [];
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (!grid[r][c]) empty.push([r, c]);
    }
  }
  if (!empty.length) return null;
  const [row, col] = empty[Math.floor(Math.random() * empty.length)];
  const tile = { id: nextId++, value: Math.random() < 0.9 ? 2 : 4, row, col };
  grid[row][col] = tile;
  return tile;
}

function inBounds(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function snapshot() {
  const cells = grid.map((row) => row.map((tile) => (tile ? tile.value : 0)));
  return { cells, score, won };
}

function pushUndo(snap) {
  undoStack.push(snap);
  if (undoStack.length > 20) undoStack.shift();
}

function restore(snapshotData) {
  grid = emptyGrid();
  const tiles = [];
  snapshotData.cells.forEach((row, r) => {
    row.forEach((value, c) => {
      if (value) {
        const tile = { id: nextId++, value, row: r, col: c };
        grid[r][c] = tile;
        tiles.push(tile);
      }
    });
  });
  score = snapshotData.score;
  won = snapshotData.won;
  over = false;
  hideOverlay();
  renderAll(tiles);
  updateHud();
}

function renderAll(tiles) {
  flushPending();
  els.layer.innerHTML = "";
  tileEls.clear();
  for (const tile of tiles) {
    const el = createTileEl(tile);
    els.layer.append(el);
    tileEls.set(tile.id, el);
  }
}

function createTileEl(tile) {
  const el = document.createElement("div");
  el.className = "tile";
  el.dataset.value = tile.value;
  const face = document.createElement("div");
  face.className = "face";
  face.textContent = tile.value;
  el.append(face);
  el.style.transform = `translate(${tile.col * TILE_PITCH}%, ${tile.row * TILE_PITCH}%)`;
  return el;
}

const TILE_PITCH = 113.1875; // cell pitch as a percentage of tile width (22.75% + 3% gap)

function later(fn, ms) {
  const record = { fn, timer: 0 };
  record.timer = setTimeout(() => {
    pending.splice(pending.indexOf(record), 1);
    fn();
  }, ms);
  pending.push(record);
}

function flushPending() {
  while (pending.length) {
    const record = pending.shift();
    clearTimeout(record.timer);
    record.fn();
  }
}

function move(direction) {
  if (over) return;
  flushPending();

  const vectors = {
    up: [-1, 0],
    down: [1, 0],
    left: [0, -1],
    right: [0, 1],
  };
  const [dr, dc] = vectors[direction];

  const rows = [0, 1, 2, 3];
  const cols = [0, 1, 2, 3];
  if (dr === 1) rows.reverse();
  if (dc === 1) cols.reverse();

  const before = snapshot();
  let moved = false;
  let gained = 0;
  const dying = [];
  const born = [];

  for (const r of rows) {
    for (const c of cols) {
      const tile = grid[r][c];
      if (!tile) continue;

      let target = [r, c];
      let step = [r + dr, c + dc];
      while (inBounds(step[0], step[1]) && !grid[step[0]][step[1]]) {
        target = step;
        step = [step[0] + dr, step[1] + dc];
      }
      const next = inBounds(step[0], step[1]) ? grid[step[0]][step[1]] : null;

      if (next && next.value === tile.value && !next.mergedFrom) {
        const merged = {
          id: nextId++,
          value: tile.value * 2,
          row: next.row,
          col: next.col,
          mergedFrom: true,
        };
        grid[next.row][next.col] = merged;
        grid[r][c] = null;
        tile.row = next.row;
        tile.col = next.col;
        dying.push(tile, next);
        born.push(merged);
        gained += merged.value;
        if (merged.value >= 2048 && !won) {
          won = true;
          later(showWin, 240);
        }
        moved = true;
      } else if (target[0] !== r || target[1] !== c) {
        grid[r][c] = null;
        grid[target[0]][target[1]] = tile;
        tile.row = target[0];
        tile.col = target[1];
        moved = true;
      }
    }
  }

  if (!moved) return;

  pushUndo(before);
  els.undo.disabled = false;
  score += gained;
  if (score > best) {
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
  }

  const spawned = addRandomTile();

  // Slide every surviving tile, slide merge sources into their target,
  // then pop the merged result and the fresh spawn.
  for (const tile of activeTiles()) {
    if (born.includes(tile)) continue;
    const el = tileEls.get(tile.id);
    if (el) {
      el.style.transform = `translate(${tile.col * TILE_PITCH}%, ${tile.row * TILE_PITCH}%)`;
    } else {
      const fresh = createTileEl(tile);
      els.layer.append(fresh);
      tileEls.set(tile.id, fresh);
    }
  }
  for (const tile of dying) {
    const el = tileEls.get(tile.id);
    if (el) {
      el.style.transform = `translate(${tile.col * TILE_PITCH}%, ${tile.row * TILE_PITCH}%)`;
      later(() => {
        el.remove();
        tileEls.delete(tile.id);
      }, 140);
    }
  }
  for (const tile of born) {
    later(() => {
      if (tileEls.has(tile.id)) return;
      const el = createTileEl(tile);
      const face = el.querySelector(".face");
      face.style.animation = "bump 0.18s ease";
      els.layer.append(el);
      tileEls.set(tile.id, el);
    }, 105);
  }
  if (spawned) {
    later(() => {
      if (tileEls.has(spawned.id)) return;
      const el = createTileEl(spawned);
      el.querySelector(".face").style.animation = "pop 0.18s ease";
      els.layer.append(el);
      tileEls.set(spawned.id, el);
    }, 110);
  }

  flashScore(gained);
  updateHud();
  persist();

  if (!movesAvailable()) {
    over = true;
    later(showGameOver, 300);
  }
}

function movesAvailable() {
  if (activeTiles().length < SIZE * SIZE) return true;
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const value = grid[r][c].value;
      if (
        (inBounds(r + 1, c) && grid[r + 1][c].value === value) ||
        (inBounds(r, c + 1) && grid[r][c + 1].value === value)
      ) {
        return true;
      }
    }
  }
  return false;
}

function flashScore(gained) {
  if (!gained) return;
  els.scoreAdd.hidden = false;
  els.scoreAdd.textContent = `+${gained}`;
  els.scoreAdd.style.animation = "none";
  void els.scoreAdd.offsetWidth;
  els.scoreAdd.style.animation = "";
  later(() => {
    els.scoreAdd.hidden = true;
  }, 700);
}

function updateHud() {
  els.score.textContent = score;
  els.best.textContent = best;
  els.undo.disabled = undoStack.length === 0;
}

function persist() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...snapshot(), best }));
  } catch {
    // Storage may be unavailable; play continues in memory.
  }
}

function showWin() {
  els.overlayTitle.textContent = "You win! 🎉";
  els.overlaySub.textContent = `Score ${score}`;
  els.overlayAction.textContent = "New Game";
  els.overlayKeep.hidden = false;
  els.overlay.hidden = false;
}

function showGameOver() {
  els.overlayTitle.textContent = "Game over!";
  els.overlaySub.textContent = `You scored ${score}`;
  els.overlayAction.textContent = "Try Again";
  els.overlayKeep.hidden = true;
  els.overlay.hidden = false;
  window.GameHubProfile?.award("g2048", Math.round(score / 20), `Scored ${score}`, score);
}

function hideOverlay() {
  els.overlay.hidden = true;
}

function newGame() {
  grid = emptyGrid();
  score = 0;
  won = false;
  over = false;
  undoStack = [];
  hideOverlay();
  renderAll([]);
  const first = addRandomTile();
  const second = addRandomTile();
  for (const tile of [first, second]) {
    const el = createTileEl(tile);
    el.querySelector(".face").style.animation = "pop 0.18s ease";
    els.layer.append(el);
    tileEls.set(tile.id, el);
  }
  els.undo.disabled = true;
  updateHud();
  persist();
}

function undo() {
  const prev = undoStack.pop();
  if (!prev) return;
  restore(prev);
  persist();
}

function bindInput() {
  const directions = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right",
  };
  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    move(direction);
  });

  let start = null;
  const begin = (x, y) => {
    start = { x, y };
  };
  const finish = (x, y) => {
    if (!start) return;
    const dx = x - start.x;
    const dy = y - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
    else move(dy > 0 ? "down" : "up");
  };
  document.addEventListener("touchstart", (event) => {
    const touch = event.touches[0];
    begin(touch.clientX, touch.clientY);
  }, { passive: true });
  document.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    finish(touch.clientX, touch.clientY);
  });
  document.addEventListener("mousedown", (event) => begin(event.clientX, event.clientY));
  document.addEventListener("mouseup", (event) => finish(event.clientX, event.clientY));

  els.newGame.addEventListener("click", newGame);
  els.overlayAction.addEventListener("click", newGame);
  els.undo.addEventListener("click", undo);
  els.overlayKeep.addEventListener("click", hideOverlay);
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved || !Array.isArray(saved.cells) || saved.cells.length !== SIZE) return false;
    const hasTiles = saved.cells.some((row) => row.some((value) => value > 0));
    if (!hasTiles) return false;
    grid = emptyGrid();
    const tiles = [];
    saved.cells.forEach((row, r) => {
      row.forEach((value, c) => {
        if (value) {
          const tile = { id: nextId++, value, row: r, col: c };
          grid[r][c] = tile;
          tiles.push(tile);
        }
      });
    });
    score = Number(saved.score) || 0;
    won = Boolean(saved.won);
    renderAll(tiles);
    return true;
  } catch {
    return false;
  }
}

best = Number(localStorage.getItem(BEST_KEY) || 0) || best;
els.best.textContent = best;
if (!loadSaved()) newGame();
updateHud();
bindInput();
