const ROWS = 6;
const COLS = 7;
const TALLY_KEY = "gamehub-connectfour-tally";
const OPPONENT_KEY = "gamehub-connectfour-opponent";

const els = {
  setupView: document.querySelector("#setupView"),
  setupForm: document.querySelector("#setupForm"),
  gameView: document.querySelector("#gameView"),
  board: document.querySelector("#board"),
  tally: document.querySelector("#tally"),
  turnLine: document.querySelector("#turnLine"),
  hintLine: document.querySelector("#hintLine"),
  resetBoard: document.querySelector("#resetBoard"),
  redLabel: document.querySelector("#redLabel"),
  yellowLabel: document.querySelector("#yellowLabel"),
};

const state = {
  grid: [],
  current: 1,
  mode: "human",
  over: false,
  locked: false,
  tally: { red: 0, yellow: 0 },
};

function freshGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function startGame() {
  state.grid = freshGrid();
  state.current = 1;
  state.over = false;
  state.locked = false;
  buildBoard();
  els.turnLine.textContent = "Red drops first";
  els.hintLine.textContent = state.mode === "human" ? "Tap a column to drop your disc." : "You are Red. Tap a column to drop.";
  render();
  maybeRobotMove();
}

function buildBoard() {
  els.board.innerHTML = "";
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const slot = document.createElement("button");
      slot.type = "button";
      slot.dataset.col = c;
      slot.setAttribute("aria-label", `Column ${c + 1}`);
      els.board.append(slot);
    }
  }
}

function render() {
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const slot = els.board.children[r * COLS + c];
      slot.className = `slot${state.grid[r][c] ? ` p${state.grid[r][c]}` : ""}`;
    }
  }
  els.tally.textContent = `${state.tally.red} — ${state.tally.yellow}`;
  els.redLabel.textContent = state.mode === "human" ? "Red" : "You";
  els.yellowLabel.textContent = state.mode === "human" ? "Yellow" : "Robot";
}

function dropRow(col) {
  for (let r = ROWS - 1; r >= 0; r -= 1) {
    if (!state.grid[r][col]) return r;
  }
  return -1;
}

function markWin(cells) {
  cells.forEach(([r, c]) => {
    const index = r * COLS + c;
    const slot = els.board.children[index];
    if (slot) slot.classList.add("win");
  });
}

function findWin(grid, player) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (grid[r][c] !== player) continue;
      for (const [dr, dc] of dirs) {
        const cells = [[r, c]];
        for (let step = 1; step < 4; step += 1) {
          const nr = r + dr * step;
          const nc = c + dc * step;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || grid[nr][nc] !== player) break;
          cells.push([nr, nc]);
        }
        if (cells.length === 4) return cells;
      }
    }
  }
  return null;
}

function boardFull(grid) {
  return grid[0].every((cell) => cell !== 0);
}

function play(col) {
  if (state.over || state.locked) return;
  const row = dropRow(col);
  if (row < 0) return;
  const player = state.current;
  state.grid[row][col] = player;
  render();

  const win = findWin(state.grid, player);
  if (win) {
    state.over = true;
    markWin(win);
    state.tally[player === 1 ? "red" : "yellow"] += 1;
    localStorage.setItem(TALLY_KEY, JSON.stringify(state.tally));
    els.tally.textContent = `${state.tally.red} — ${state.tally.yellow}`;
    els.turnLine.textContent = player === 1 ? "Red wins the round! 🎉" : "Yellow wins the round! 🎉";
    els.hintLine.textContent = "New Round deals the next game.";
    if (state.mode !== "human" && player === 1) {
      window.GameHubProfile?.award(
        "connect-four",
        state.mode === "hard" ? 8 : state.mode === "medium" ? 5 : 3,
        `Beat the robot (${state.mode})`
      );
    }
    return;
  }
  if (boardFull(state.grid)) {
    state.over = true;
    els.turnLine.textContent = "Dead heat — nobody connected four.";
    return;
  }
  state.current = player === 1 ? 2 : 1;
  els.turnLine.textContent = state.current === 1 ? "Red's turn" : "Yellow's turn";
  maybeRobotMove();
}

function maybeRobotMove() {
  if (state.mode === "human" || state.over) return;
  if (state.current !== 2) return;
  state.locked = true;
  els.turnLine.textContent = "Robot is thinking…";
  setTimeout(() => {
    const col = robotColumn();
    state.locked = false;
    if (col >= 0 && !state.over) play(col);
  }, 420);
}

// ---------- Robot brain (minimax with alpha-beta) ----------

function robotColumn() {
  const depth = state.mode === "easy" ? 1 : state.mode === "medium" ? 4 : 8;
  const valid = validCols(state.grid);
  if (!valid.length) return -1;
  if (state.mode === "easy" && Math.random() < 0.35) {
    return valid[Math.floor(Math.random() * valid.length)];
  }
  let bestCol = valid[0];
  let bestScore = -Infinity;
  for (const col of shuffle(valid)) {
    const row = dropRowFor(state.grid, col);
    state.grid[row][col] = 2;
    const score = minimax(state.grid, depth - 1, -Infinity, Infinity, false);
    state.grid[row][col] = 0;
    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  }
  return bestCol;
}

function validCols(grid) {
  const cols = [];
  for (let c = 0; c < COLS; c += 1) if (!grid[0][c]) cols.push(c);
  return cols;
}

function dropRowFor(grid, col) {
  for (let r = ROWS - 1; r >= 0; r -= 1) if (!grid[r][col]) return r;
  return -1;
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function minimax(grid, depth, alpha, beta, maximizing) {
  if (findWin(grid, 2)) return 100000 + depth;
  if (findWin(grid, 1)) return -100000 - depth;
  if (boardFull(grid) || depth === 0) return evaluate(grid);

  const cols = validCols(grid);
  if (maximizing) {
    let value = -Infinity;
    for (const col of orderCenter(cols)) {
      const row = dropRowFor(grid, col);
      grid[row][col] = 2;
      value = Math.max(value, minimax(grid, depth - 1, alpha, beta, false));
      grid[row][col] = 0;
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }
  let value = Infinity;
  for (const col of orderCenter(cols)) {
    const row = dropRowFor(grid, col);
    grid[row][col] = 1;
    value = Math.min(value, minimax(grid, depth - 1, alpha, beta, true));
    grid[row][col] = 0;
    beta = Math.min(beta, value);
    if (beta <= alpha) break;
  }
  return value;
}

function orderCenter(cols) {
  return [...cols].sort((a, b) => Math.abs(3 - a) - Math.abs(3 - b));
}

function evaluate(grid) {
  let score = 0;
  // Center columns are strategically worth more.
  for (let r = 0; r < ROWS; r += 1) {
    if (grid[r][3] === 2) score += 3;
    if (grid[r][3] === 1) score -= 3;
  }
  const windows = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (c + 3 < COLS) windows.push([[r, c], [r, c + 1], [r, c + 2], [r, c + 3]]);
      if (r + 3 < ROWS) windows.push([[r, c], [r + 1, c], [r + 2, c], [r + 3, c]]);
      if (r + 3 < ROWS && c + 3 < COLS) windows.push([[r, c], [r + 1, c + 1], [r + 2, c + 2], [r + 3, c + 3]]);
      if (r + 3 < ROWS && c - 3 >= 0) windows.push([[r, c], [r + 1, c - 1], [r + 2, c - 2], [r + 3, c - 3]]);
    }
  }
  for (const window of windows) {
    let robot = 0;
    let human = 0;
    for (const [r, c] of window) {
      if (grid[r][c] === 2) robot += 1;
      else if (grid[r][c] === 1) human += 1;
    }
    if (robot && human) continue;
    if (robot === 3) score += 12;
    else if (robot === 2) score += 3;
    if (human === 3) score -= 14;
    else if (human === 2) score -= 3;
  }
  return score;
}

// ---------- Wiring ----------

els.board.addEventListener("click", (event) => {
  const col = event.target.dataset?.col;
  if (col === undefined) return;
  if (state.mode !== "human" && state.current === 2) return;
  play(Number(col));
});

els.setupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.mode = document.querySelector('input[name="opponent"]:checked').value;
  localStorage.setItem(OPPONENT_KEY, state.mode);
  els.setupView.hidden = true;
  els.gameView.hidden = false;
  startGame();
});

els.resetBoard.addEventListener("click", () => {
  if (els.gameView.hidden) return;
  startGame();
});

try {
  const savedTally = JSON.parse(localStorage.getItem(TALLY_KEY) || "null");
  if (savedTally && Number.isFinite(savedTally.red) && Number.isFinite(savedTally.yellow)) {
    state.tally = savedTally;
  }
} catch {
  // Keep zeroed tally.
}
const savedOpponent = localStorage.getItem(OPPONENT_KEY);
if (savedOpponent) {
  const radio = document.querySelector(`input[name="opponent"][value="${savedOpponent}"]`);
  if (radio) radio.checked = true;
}
