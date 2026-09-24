const LEVELS = {
  easy: { cols: 9, rows: 9, mines: 10, cell: 38 },
  medium: { cols: 16, rows: 16, mines: 40, cell: 32 },
  expert: { cols: 30, rows: 16, mines: 99, cell: 28 },
};
const BEST_KEY = "gamehub-minesweeper-best";
const LEVEL_KEY = "gamehub-minesweeper-level";

const els = {
  board: document.querySelector("#board"),
  mineCounter: document.querySelector("#mineCounter"),
  timer: document.querySelector("#timer"),
  reset: document.querySelector("#resetButton"),
  flagMode: document.querySelector("#flagMode"),
  bestLine: document.querySelector("#bestLine"),
  helpOverlay: document.querySelector("#helpOverlay"),
  helpButton: document.querySelector("#helpButton"),
  difficultyRow: document.querySelector("#difficultyRow"),
};

let level = LEVELS[document.querySelector('input[name="difficulty"]:checked').value] || LEVELS.medium;
if (LEVELS[localStorage.getItem(LEVEL_KEY)]) {
  level = LEVELS[localStorage.getItem(LEVEL_KEY)];
  const radio = document.querySelector(`input[name="difficulty"][value="${localStorage.getItem(LEVEL_KEY)}"]`);
  if (radio) radio.checked = true;
}

let cells;
let cols;
let rows;
let started;
let finished;
let flags;
let revealedCount;
let timerId;
let seconds;

function neighbors(index) {
  const result = [];
  const r = Math.floor(index / cols);
  const c = index % cols;
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (!dr && !dc) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) result.push(nr * cols + nc);
    }
  }
  return result;
}

function newGame() {
  cols = level.cols;
  rows = level.rows;
  cells = Array.from({ length: cols * rows }, () => ({
    mine: false,
    open: false,
    flag: false,
    count: 0,
  }));
  started = false;
  finished = false;
  flags = 0;
  revealedCount = 0;
  seconds = 0;
  stopTimer();
  els.timer.textContent = "⏱ 0";
  els.reset.textContent = "🙂";
  updateCounter();
  showBest();
  applyCellSize();
  render();
}

function applyCellSize() {
  // Shrink cells on narrow screens so even Expert fits without scrolling.
  const available = Math.min(window.innerWidth - 40, 1040);
  const fit = Math.floor((available - 22) / cols) - 2;
  const size = Math.max(20, Math.min(level.cell, fit));
  els.board.style.setProperty("--cell", `${size}px`);
}

function placeMines(safeIndex) {
  const forbidden = new Set([safeIndex, ...neighbors(safeIndex)]);
  const pool = [];
  for (let i = 0; i < cells.length; i += 1) {
    if (!forbidden.has(i)) pool.push(i);
  }
  // If the board is too dense to keep a moat, allow the ring around the click.
  if (pool.length < level.mines) {
    pool.length = 0;
    for (let i = 0; i < cells.length; i += 1) if (i !== safeIndex) pool.push(i);
  }
  for (let placed = 0; placed < level.mines; placed += 1) {
    const pick = Math.floor(Math.random() * pool.length);
    cells[pool[pick]].mine = true;
    pool.splice(pick, 1);
  }
  for (let i = 0; i < cells.length; i += 1) {
    cells[i].count = neighbors(i).filter((n) => cells[n].mine).length;
  }
}

function reveal(index) {
  const stack = [index];
  while (stack.length) {
    const i = stack.pop();
    const cell = cells[i];
    if (cell.open || cell.flag) continue;
    cell.open = true;
    revealedCount += 1;
    if (cell.count === 0 && !cell.mine) {
      for (const n of neighbors(i)) {
        if (!cells[n].open && !cells[n].flag) stack.push(n);
      }
    }
  }
}

function primary(index) {
  if (finished) return;
  const cell = cells[index];
  if (cell.flag) return;
  if (!started) {
    started = true;
    placeMines(index);
    startTimer();
  }
  if (cell.open) {
    chord(index);
    return;
  }
  if (cell.mine) return lose(index);
  reveal(index);
  afterAction();
}

function chord(index) {
  const cell = cells[index];
  if (!cell.open || !cell.count) return;
  const around = neighbors(index);
  const flagged = around.filter((n) => cells[n].flag).length;
  if (flagged !== cell.count) return;
  for (const n of around) {
    const other = cells[n];
    if (other.open || other.flag) continue;
    if (other.mine) return lose(n);
    reveal(n);
  }
  afterAction();
}

function toggleFlag(index) {
  if (finished) return;
  const cell = cells[index];
  if (cell.open) return;
  cell.flag = !cell.flag;
  flags += cell.flag ? 1 : -1;
  updateCounter();
  renderCell(index);
}

function lose(hitIndex) {
  finished = true;
  stopTimer();
  els.reset.textContent = "🤯";
  cells.forEach((cell, i) => {
    if (cell.mine) cell.open = true;
    if (!cell.mine && cell.flag) cell.wrong = true;
  });
  cells[hitIndex].boom = true;
  render();
}

function afterAction() {
  render();
  if (revealedCount === cells.length - level.mines) win();
}

const LEVEL_XP = { easy: 6, medium: 12, expert: 25 };

function win() {
  finished = true;
  stopTimer();
  els.reset.textContent = "😎";
  cells.forEach((cell, i) => {
    if (!cell.open) {
      cell.flag = true;
      renderCell(i);
    }
  });
  const key = `${document.querySelector('input[name="difficulty"]:checked').value}`;
  window.GameHubProfile?.award("minesweeper", LEVEL_XP[key] || 6, `Cleared a ${key} board`, seconds);
  const best = JSON.parse(localStorage.getItem(BEST_KEY) || "{}");
  if (!best[key] || seconds < best[key]) {
    best[key] = seconds;
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
    els.bestLine.textContent = `New best time: ${seconds}s on ${key}! 🏆`;
  }
  updateCounter();
}

function startTimer() {
  stopTimer();
  timerId = setInterval(() => {
    seconds += 1;
    els.timer.textContent = `⏱ ${seconds}`;
  }, 1000);
}

function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
}

function updateCounter() {
  els.mineCounter.textContent = `💣 ${Math.max(level.mines - flags, 0)}`;
}

function showBest() {
  const value = document.querySelector('input[name="difficulty"]:checked').value;
  const best = JSON.parse(localStorage.getItem(BEST_KEY) || "{}");
  els.bestLine.textContent = best[value] ? `Best time on ${value}: ${best[value]}s` : "";
}

function renderCell(index) {
  const cell = cells[index];
  const el = els.board.children[index];
  el.className = `cell${cell.open ? " open" : ""}${cell.open && cell.mine ? " mine" : ""}${cell.wrong ? " wrong" : ""}${cell.boom ? " mine" : ""}`;
  el.textContent = cell.open
    ? (cell.mine ? "💥" : (cell.count ? String(cell.count) : ""))
    : (cell.flag ? "🚩" : "");
  if (cell.open && !cell.mine && cell.count) el.classList.add(`n${cell.count}`);
}

function render() {
  els.board.innerHTML = "";
  els.board.style.gridTemplateColumns = `repeat(${cols}, var(--cell, 34px))`;
  const frag = document.createDocumentFragment();
  cells.forEach((cell, i) => {
    const el = document.createElement("button");
    el.type = "button";
    el.dataset.index = i;
    frag.append(el);
  });
  els.board.append(frag);
  for (let i = 0; i < cells.length; i += 1) renderCell(i);
}

let pressTimer = null;
let longPressed = false;

function bindEvents() {
  els.board.addEventListener("click", (event) => {
    if (longPressed) {
      longPressed = false;
      return;
    }
    const index = event.target.dataset?.index;
    if (index === undefined) return;
    if (els.flagMode.checked) toggleFlag(Number(index));
    else primary(Number(index));
  });

  els.board.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const index = event.target.dataset?.index;
    if (index !== undefined) toggleFlag(Number(index));
  });

  els.board.addEventListener("touchstart", (event) => {
    const index = event.target.dataset?.index;
    if (index === undefined) return;
    pressTimer = setTimeout(() => {
      longPressed = true;
      toggleFlag(Number(index));
    }, 350);
  }, { passive: true });

  ["touchend", "touchcancel"].forEach((name) => {
    els.board.addEventListener(name, () => {
      clearTimeout(pressTimer);
    });
  });

  els.reset.addEventListener("click", newGame);
  els.flagMode.addEventListener("change", () => {
    els.flagMode.closest(".toggle").classList.toggle("active", els.flagMode.checked);
  });

  els.difficultyRow.addEventListener("change", (event) => {
    level = LEVELS[event.target.value];
    localStorage.setItem(LEVEL_KEY, event.target.value);
    newGame();
  });

  els.helpButton.addEventListener("click", () => {
    els.helpOverlay.hidden = false;
  });
  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.target.closest(".overlay").hidden = true;
    });
  });

  window.addEventListener("resize", applyCellSize);
}

newGame();
bindEvents();
