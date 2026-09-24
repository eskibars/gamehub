const els = {
  setupView: document.querySelector("#setupView"),
  setupForm: document.querySelector("#setupForm"),
  gameView: document.querySelector("#gameView"),
  board: document.querySelector("#board"),
  tally: document.querySelector("#tally"),
  turnLine: document.querySelector("#turnLine"),
  hintLine: document.querySelector("#hintLine"),
  p1Label: document.querySelector("#p1Label"),
  p2Label: document.querySelector("#p2Label"),
  overlay: document.querySelector("#overlay"),
  winnerTitle: document.querySelector("#winnerTitle"),
  winnerSub: document.querySelector("#winnerSub"),
  again: document.querySelector("#againButton"),
  newGame: document.querySelector("#newGame"),
};

const state = {
  n: 4, // boxes per side
  mode: "human",
  horizontal: [], // (n+1) rows x n cols — owner 0/1/2
  vertical: [], // n rows x (n+1) cols
  boxes: [], // n x n — owner
  scores: [0, 0],
  current: 1,
  over: false,
  locked: false,
};

function startGame() {
  state.n = Number(document.querySelector('input[name="size"]:checked').value);
  state.mode = document.querySelector('input[name="opponent"]:checked').value;
  state.horizontal = Array.from({ length: state.n + 1 }, () => Array(state.n).fill(0));
  state.vertical = Array.from({ length: state.n }, () => Array(state.n + 1).fill(0));
  state.boxes = Array.from({ length: state.n }, () => Array(state.n).fill(0));
  state.scores = [0, 0];
  state.current = 1;
  state.over = false;
  state.locked = false;
  els.p1Label.textContent = state.mode === "human" ? "Player 1" : "You";
  els.p2Label.textContent = state.mode === "human" ? "Player 2" : "Robot";
  els.overlay.hidden = true;
  els.turnLine.textContent = state.mode === "human" ? "Player 1 draws first" : "You draw first";
  buildBoard();
  updateHud();
  maybeRobot();
}

function buildBoard() {
  const cells = 2 * state.n + 1;
  const available = Math.min(window.innerWidth - 48, 560);
  const cell = Math.max(26, Math.min(46, Math.floor((available - 20) / cells)));
  els.board.style.setProperty("--cells", cells);
  els.board.style.setProperty("--cell", `${cell}px`);
  els.board.innerHTML = "";
  for (let r = 0; r < cells; r += 1) {
    for (let c = 0; c < cells; c += 1) {
      const cellEl = document.createElement("div");
      const isDot = r % 2 === 0 && c % 2 === 0;
      if (isDot) {
        cellEl.className = "dot";
      } else if (r % 2 === 0) {
        // horizontal edge: row r/2, column c/2
        cellEl.className = "edge h";
        cellEl.dataset.h = `${Math.floor(r / 2)},${Math.floor(c / 2)}`;
        cellEl.tabIndex = 0;
        cellEl.setAttribute("role", "button");
        cellEl.setAttribute("aria-label", `Horizontal edge row ${Math.floor(r / 2)} column ${Math.floor(c / 2)}`);
      } else if (c % 2 === 0) {
        // vertical edge: row r/2, column c/2
        cellEl.className = "edge v";
        cellEl.dataset.v = `${Math.floor(r / 2)},${Math.floor(c / 2)}`;
        cellEl.tabIndex = 0;
        cellEl.setAttribute("role", "button");
        cellEl.setAttribute("aria-label", `Vertical edge row ${Math.floor(r / 2)} column ${Math.floor(c / 2)}`);
      } else {
        cellEl.className = "boxslot";
        cellEl.dataset.box = `${Math.floor(r / 2)},${Math.floor(c / 2)}`;
      }
      els.board.append(cellEl);
    }
  }
}

function boxEdges(row, col) {
  return [
    { kind: "h", r: row, c: col },
    { kind: "h", r: row + 1, c: col },
    { kind: "v", r: row, c: col },
    { kind: "v", r: row, c: col + 1 },
  ];
}

function owner(kind, r, c) {
  return kind === "h" ? state.horizontal[r][c] : state.vertical[r][c];
}

function setOwner(kind, r, c, player) {
  if (kind === "h") state.horizontal[r][c] = player;
  else state.vertical[r][c] = player;
}

function boxEdgeCount(row, col) {
  return boxEdges(row, col).filter((edge) => owner(edge.kind, edge.r, edge.c) !== 0).length;
}

function cellFor(kind, r, c) {
  if (kind === "h") return els.board.children[(2 * r) * (2 * state.n + 1) + 2 * c + 1];
  return els.board.children[(2 * r + 1) * (2 * state.n + 1) + 2 * c];
}

function drawEdge(kind, r, c, player) {
  if (owner(kind, r, c) !== 0) return 0;
  setOwner(kind, r, c, player);
  const cellEl = cellFor(kind, r, c);
  cellEl.classList.add("taken", `p${player}`);
  // Close any boxes that just got their fourth side.
  let closed = 0;
  const candidates = kind === "h"
    ? [[r - 1, c], [r, c]]
    : [[r, c - 1], [r, c]];
  for (const [row, col] of candidates) {
    if (row < 0 || col < 0 || row >= state.n || col >= state.n) continue;
    if (state.boxes[row][col] !== 0) continue;
    if (boxEdgeCount(row, col) === 4) {
      state.boxes[row][col] = player;
      state.scores[player - 1] += 1;
      const slot = [...els.board.children].find(
        (child) => child.dataset?.box === `${row},${col}`
      );
      if (slot) {
        slot.classList.add("box", `p${player}`);
        slot.textContent = String(player);
      }
      closed += 1;
    }
  }
  updateHud();
  return closed;
}

function updateHud() {
  els.tally.textContent = `${state.scores[0]} — ${state.scores[1]}`;
  const totalBoxes = state.n * state.n;
  const claimed = state.scores[0] + state.scores[1];
  if (state.over) return;
  const name = (player) => (state.mode === "human"
    ? `Player ${player}`
    : player === 1 ? "You" : "Robot");
  els.turnLine.textContent = state.locked && state.current === 2
    ? "Robot is thinking…"
    : `${name(state.current)}'s turn`;
  if (claimed === totalBoxes) finishGame();
}

function finishGame() {
  state.over = true;
  const [s1, s2] = state.scores;
  if (s1 === s2) {
    els.winnerTitle.textContent = "Dead heat!";
    els.winnerSub.textContent = `${s1} boxes each.`;
  } else {
    const winner = s1 > s2 ? 1 : 2;
    const label = state.mode === "human"
      ? `Player ${winner}`
      : winner === 1 ? "You" : "Robot";
    els.winnerTitle.textContent = `${label} win${label === "You" ? "" : "s"}! 🏆`;
    els.winnerSub.textContent = `${s1} — ${s2}`;
    if (state.mode === "robot" && winner === 1) {
      window.GameHubProfile?.award("dots-and-boxes", 6, "Beat the robot", s1);
    }
  }
  els.overlay.hidden = false;
}

function switchTurn() {
  state.current = state.current === 1 ? 2 : 1;
  updateHud();
  maybeRobot();
}

function maybeRobot() {
  if (state.mode !== "robot" || state.over || state.current !== 2) return;
  state.locked = true;
  updateHud();
  setTimeout(() => {
    state.locked = false;
    if (state.over) return;
    const move = robotPick();
    if (!move) return;
    const closed = drawEdge(move.kind, move.r, move.c, 2);
    if (!closed) switchTurn();
    else maybeRobot(); // completed a box — go again
  }, 480);
}

function robotPick() {
  const open = [];
  for (let r = 0; r <= state.n; r += 1) {
    for (let c = 0; c < state.n; c += 1) {
      if (state.horizontal[r][c] === 0) open.push({ kind: "h", r, c });
    }
  }
  for (let r = 0; r < state.n; r += 1) {
    for (let c = 0; c <= state.n; c += 1) {
      if (state.vertical[r][c] === 0) open.push({ kind: "v", r, c });
    }
  }
  if (!open.length) return null;

  const completes = open.filter((move) => {
    const candidates = move.kind === "h"
      ? [[move.r - 1, move.c], [move.r, move.c]]
      : [[move.r, move.c - 1], [move.r, move.c]];
    return candidates.some(([row, col]) => (
      row >= 0 && col >= 0 && row < state.n && col < state.n &&
      state.boxes[row][col] === 0 && boxEdgeCount(row, col) === 3
    ));
  });
  if (completes.length) return completes[0];

  // Safe edges keep every box at two or fewer sides.
  const safe = open.filter((move) => {
    const candidates = move.kind === "h"
      ? [[move.r - 1, move.c], [move.r, move.c]]
      : [[move.r, move.c - 1], [move.r, move.c]];
    return candidates.every(([row, col]) => (
      row < 0 || col < 0 || row >= state.n || col >= state.n ||
      state.boxes[row][col] !== 0 || boxEdgeCount(row, col) <= 1
    ));
  });
  const pool = safe.length ? safe : open;
  return pool[Math.floor(Math.random() * pool.length)];
}

function onEdgeClick(event) {
  const target = event.target.closest(".edge");
  if (!target || state.over || state.locked) return;
  if (state.mode === "robot" && state.current === 2) return;
  const [r, c] = (target.dataset.h || target.dataset.v).split(",").map(Number);
  const kind = target.dataset.h !== undefined ? "h" : "v";
  if (owner(kind, r, c) !== 0) return;
  const closed = drawEdge(kind, r, c, state.current);
  if (state.over) return;
  if (!closed) switchTurn();
  else {
    els.hintLine.textContent = "Box closed — go again!";
    maybeRobot();
  }
}

els.board.addEventListener("click", onEdgeClick);
els.setupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  els.setupView.hidden = true;
  els.gameView.hidden = false;
  startGame();
});
els.again.addEventListener("click", startGame);
els.newGame.addEventListener("click", () => {
  if (!els.gameView.hidden) startGame();
});
window.addEventListener("resize", () => {
  if (!els.gameView.hidden) buildBoard();
});
