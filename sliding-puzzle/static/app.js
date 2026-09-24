const BEST_KEY = "gamehub-slidingpuzzle-best";
const SIZE_KEY = "gamehub-slidingpuzzle-size";

const els = {
  board: document.querySelector("#board"),
  moves: document.querySelector("#moves"),
  timer: document.querySelector("#timer"),
  best: document.querySelector("#best"),
  overlay: document.querySelector("#overlay"),
  overlaySub: document.querySelector("#overlaySub"),
  again: document.querySelector("#againButton"),
  shuffle: document.querySelector("#shuffleButton"),
  sizeRow: document.querySelector("#sizeRow"),
};

const state = {
  n: Number(localStorage.getItem(SIZE_KEY) || 4),
  tiles: [], // tiles[boardIndex] = tile number, 0 = gap
  moves: 0,
  seconds: 0,
  running: false,
  timerId: null,
  won: false,
  bests: JSON.parse(localStorage.getItem(BEST_KEY) || "{}"),
};

const savedSize = localStorage.getItem(SIZE_KEY);
if (savedSize) {
  const radio = document.querySelector(`input[name="size"][value="${savedSize}"]`);
  if (radio) radio.checked = true;
}

function isSolved(tiles) {
  for (let i = 0; i < tiles.length - 1; i += 1) {
    if (tiles[i] !== i + 1) return false;
  }
  return tiles[tiles.length - 1] === 0;
}

function shuffle() {
  // Shuffle by random legal moves from the solved state — always solvable.
  const total = state.n * state.n;
  const tiles = Array.from({ length: total }, (_, i) => (i + 1) % total);
  let gap = total - 1;
  let previous = -1;
  const steps = state.n * state.n * 20;
  for (let i = 0; i < steps; i += 1) {
    const neighbors = neighborIndexes(gap).filter((n) => n !== previous);
    const pick = neighbors[Math.floor(Math.random() * neighbors.length)];
    tiles[gap] = tiles[pick];
    tiles[pick] = 0;
    previous = gap;
    gap = pick;
  }
  if (isSolved(tiles)) return shuffle();
  state.tiles = tiles;
  state.moves = 0;
  state.seconds = 0;
  state.running = true;
  state.won = false;
  clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    if (!state.running) return;
    state.seconds += 1;
    els.timer.textContent = `${state.seconds}s`;
  }, 1000);
  els.overlay.hidden = true;
  els.moves.textContent = "0";
  els.timer.textContent = "0s";
  render();
}

function neighborIndexes(index) {
  const n = state.n;
  const row = Math.floor(index / n);
  const col = index % n;
  const result = [];
  if (row > 0) result.push(index - n);
  if (row < n - 1) result.push(index + n);
  if (col > 0) result.push(index - 1);
  if (col < n - 1) result.push(index + 1);
  return result;
}

function trySlide(index) {
  if (state.won) return;
  const gap = state.tiles.indexOf(0);
  if (!neighborIndexes(gap).includes(index)) return;
  state.tiles[gap] = state.tiles[index];
  state.tiles[index] = 0;
  state.moves += 1;
  els.moves.textContent = state.moves;
  render();
  if (isSolved(state.tiles)) win();
}

function win() {
  state.running = false;
  state.won = true;
  clearInterval(state.timerId);
  const key = String(state.n);
  const score = Math.max(0, 200 - state.moves - state.seconds);
  const previousBest = state.bests[key];
  const isRecord = !previousBest || state.moves < previousBest.moves ||
    (state.moves === previousBest.moves && state.seconds < previousBest.seconds);
  if (isRecord) {
    state.bests[key] = { moves: state.moves, seconds: state.seconds };
    localStorage.setItem(BEST_KEY, JSON.stringify(state.bests));
  }
  els.overlaySub.textContent = `${state.n}×${state.n} in ${state.moves} moves · ${state.seconds}s`;
  els.overlay.hidden = false;
  showBest();
  window.GameHubProfile?.award("sliding-puzzle", Math.max(3, Math.round(score / 12)) + state.n, `${state.n}×${state.n} in ${state.moves} moves`, score);
}

function showBest() {
  const best = state.bests[state.n];
  els.best.textContent = best ? `${best.moves} moves` : "—";
}

function render() {
  els.board.style.setProperty("--n", state.n);
  els.board.innerHTML = "";
  state.tiles.forEach((tile, index) => {
    const el = document.createElement("button");
    el.type = "button";
    if (tile === 0) {
      el.className = "gap";
      el.disabled = true;
    } else {
      el.className = "tile";
      el.textContent = tile;
      if (tile === index + 1) el.classList.add("correct-spot");
      el.addEventListener("click", () => trySlide(index));
    }
    els.board.append(el);
  });
}

function bindInput() {
  // Arrow keys slide the tile that sits on the pressed side into the gap.
  const movesByKey = {
    ArrowUp: state.n,
    ArrowDown: -state.n,
    ArrowLeft: 1,
    ArrowRight: -1,
    w: state.n,
    s: -state.n,
    a: 1,
    d: -1,
  };
  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const offset = movesByKey[event.key];
    if (!offset) return;
    event.preventDefault();
    const gap = state.tiles.indexOf(0);
    const source = gap + offset;
    if (source < 0 || source >= state.tiles.length) return;
    if ((offset === 1 || offset === -1) && Math.floor(gap / state.n) !== Math.floor(source / state.n)) return;
    trySlide(source);
  });

  els.shuffle.addEventListener("click", shuffle);
  els.again.addEventListener("click", shuffle);
  els.sizeRow.addEventListener("change", (event) => {
    state.n = Number(event.target.value);
    localStorage.setItem(SIZE_KEY, event.target.value);
    showBest();
    shuffle();
  });
}

showBest();
shuffle();
bindInput();
