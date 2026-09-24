const BEST_KEY = "gamehub-lightsout-best";
const SIZE_KEY = "gamehub-lightsout-size";

const els = {
  board: document.querySelector("#board"),
  moves: document.querySelector("#moves"),
  best: document.querySelector("#best"),
  overlay: document.querySelector("#overlay"),
  overlaySub: document.querySelector("#overlaySub"),
  again: document.querySelector("#againButton"),
  newPuzzle: document.querySelector("#newPuzzle"),
  sizeRow: document.querySelector("#sizeRow"),
};

const state = {
  n: Number(localStorage.getItem(SIZE_KEY) || 5),
  lights: [],
  moves: 0,
  bests: JSON.parse(localStorage.getItem(BEST_KEY) || "{}"),
};

const savedSize = localStorage.getItem(SIZE_KEY);
if (savedSize) {
  const radio = document.querySelector(`input[name="size"][value="${savedSize}"]`);
  if (radio) radio.checked = true;
  state.n = Number(savedSize);
}

// Applying random clicks to a dark board always yields a solvable puzzle.
function newPuzzle() {
  const total = state.n * state.n;
  let clicks = Math.max(4, state.n * 3);
  let lights;
  do {
    lights = Array(total).fill(false);
    for (let i = 0; i < clicks; i += 1) {
      toggle(lights, Math.floor(Math.random() * total));
    }
    clicks += 1; // guarantee progress even if a random click undid the last
  } while (!lights.some(Boolean));
  state.lights = lights;
  state.moves = 0;
  els.moves.textContent = "0";
  els.overlay.hidden = true;
  render();
}

function toggle(lights, index) {
  const n = state.n;
  const row = Math.floor(index / n);
  const col = index % n;
  const cross = [[row, col], [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]];
  for (const [r, c] of cross) {
    if (r >= 0 && r < n && c >= 0 && c < n) {
      const i = r * n + c;
      lights[i] = !lights[i];
    }
  }
}

function tap(index) {
  toggle(state.lights, index);
  state.moves += 1;
  els.moves.textContent = state.moves;
  render();
  if (!state.lights.some(Boolean)) win();
}

function win() {
  const key = String(state.n);
  const previous = state.bests[key];
  const isRecord = previous === undefined || state.moves < previous;
  if (isRecord) {
    state.bests[key] = state.moves;
    localStorage.setItem(BEST_KEY, JSON.stringify(state.bests));
  }
  showBest();
  els.overlaySub.textContent = `${state.n}×${state.n} cleared in ${state.moves} moves`;
  els.overlay.hidden = false;
  window.GameHubProfile?.award(
    "lights-out",
    5 + state.n + (state.moves <= state.n * 3 ? 4 : 0),
    `${state.n}×${state.n} in ${state.moves} moves`,
    state.moves
  );
}

function showBest() {
  const best = state.bests[state.n];
  els.best.textContent = best !== undefined ? `${best} moves` : "—";
}

function render() {
  els.board.style.setProperty("--n", state.n);
  els.board.innerHTML = "";
  state.lights.forEach((lit, index) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell" + (lit ? " lit" : "");
    cell.setAttribute("aria-label", `Cell ${index + 1}${lit ? " lit" : ""}`);
    cell.addEventListener("click", () => tap(index));
    els.board.append(cell);
  });
}

function bind() {
  els.newPuzzle.addEventListener("click", newPuzzle);
  els.again.addEventListener("click", newPuzzle);
  els.sizeRow.addEventListener("change", (event) => {
    state.n = Number(event.target.value);
    localStorage.setItem(SIZE_KEY, event.target.value);
    showBest();
    newPuzzle();
  });
}

showBest();
newPuzzle();
bind();
