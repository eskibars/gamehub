// app.js — Checkers client. The server is authoritative: the client mirrors
// the movement rules only to highlight legal moves; every move is validated
// again server-side. The board rotates 180° for the black player so each
// player always sees their own men at the bottom.

const STORAGE_PLAYER_KEY = "checkers-player-v1";

const state = {
  game: null,
  playerId: "",
  eventSource: null,
  streamKey: "",
  selected: null, // [r, c] in server coordinates
  targets: [],
  lastMoved: null, // [r, c]
  resultShown: false,
};

const els = {
  setupView: document.querySelector("#setupView"),
  choicePanel: document.querySelector("#choicePanel"),
  createForm: document.querySelector("#createForm"),
  joinForm: document.querySelector("#joinForm"),
  showCreate: document.querySelector("#showCreate"),
  showJoin: document.querySelector("#showJoin"),
  joinCode: document.querySelector("#joinCode"),
  sizeOptions: document.querySelectorAll(".size-option"),
  connectionStatus: document.querySelector("#connectionStatus"),
  lobbyPanel: document.querySelector("#lobbyPanel"),
  shareTools: document.querySelector("#shareTools"),
  shareCode: document.querySelector("#shareCode"),
  copyShare: document.querySelector("#copyShare"),
  factStatus: document.querySelector("#factStatus"),
  factBoard: document.querySelector("#factBoard"),
  nameForm: document.querySelector("#nameForm"),
  playerName: document.querySelector("#playerName"),
  lobbyActions: document.querySelector("#lobbyActions"),
  startButton: document.querySelector("#startButton"),
  lobbyMessage: document.querySelector("#lobbyMessage"),
  newGameButton: document.querySelector("#newGameButton"),
  playArea: document.querySelector("#playArea"),
  phaseLabel: document.querySelector("#phaseLabel"),
  turnBanner: document.querySelector("#turnBanner"),
  gameMessage: document.querySelector("#gameMessage"),
  board: document.querySelector("#board"),
  chipBlack: document.querySelector("#chipBlack"),
  chipRed: document.querySelector("#chipRed"),
  blackName: document.querySelector("#blackName"),
  redName: document.querySelector("#redName"),
  blackCaptured: document.querySelector("#blackCaptured"),
  redCaptured: document.querySelector("#redCaptured"),
  moveLog: document.querySelector("#moveLog"),
  resultBackdrop: document.querySelector("#resultBackdrop"),
  resultTitle: document.querySelector("#resultTitle"),
  resultBody: document.querySelector("#resultBody"),
  resultClose: document.querySelector("#resultClose"),
  rematchButton: document.querySelector("#rematchButton"),
};

let entryControls = null;
let chosenSize = 8;

// ----- Storage -----

function playerStorageKey(code) {
  return `${STORAGE_PLAYER_KEY}:${code}`;
}

function loadPlayerId(code) {
  try {
    return localStorage.getItem(playerStorageKey(code)) || "";
  } catch {
    return "";
  }
}

function savePlayerId(code, playerId) {
  try {
    if (playerId) localStorage.setItem(playerStorageKey(code), playerId);
  } catch {
    /* localStorage unavailable; rejoin manually. */
  }
}

// ----- API helpers -----

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function parseShareInput(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed, window.location.origin);
    return (url.searchParams.get("game") || "").toUpperCase();
  } catch {
    return trimmed.toUpperCase();
  }
}

function setConnection(text, isError = false) {
  els.connectionStatus.textContent = text;
  els.connectionStatus.classList.toggle("is-live", text === "Live");
  els.connectionStatus.classList.toggle("is-error", Boolean(isError));
}

function currentPlayer() {
  if (!state.game || !state.playerId) return null;
  return state.game.players.find((p) => p.id === state.playerId) || null;
}

function opponentInfo() {
  if (!state.game || !state.playerId) return null;
  return state.game.players.find((p) => p.id !== state.playerId) || null;
}

// ----- Rules mirror (highlighting only; the server validates every move) -----

function pieceDirections(piece) {
  if (piece.king) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return piece.color === "black" ? [[1, -1], [1, 1]] : [[-1, -1], [-1, 1]];
}

function pieceJumps(board, size, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const jumps = [];
  for (const [dr, dc] of pieceDirections(piece)) {
    const lr = r + 2 * dr;
    const lc = c + 2 * dc;
    if (lr < 0 || lr >= size || lc < 0 || lc >= size) continue;
    const over = board[r + dr][c + dc];
    if (over && over.color !== piece.color && !board[lr][lc]) jumps.push([lr, lc]);
  }
  return jumps;
}

function pieceSteps(board, size, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const steps = [];
  for (const [dr, dc] of pieceDirections(piece)) {
    const sr = r + dr;
    const sc = c + dc;
    if (sr >= 0 && sr < size && sc >= 0 && sc < size && !board[sr][sc]) steps.push([sr, sc]);
  }
  return steps;
}

function anyJumps(board, size, color) {
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const piece = board[r][c];
      if (piece && piece.color === color && pieceJumps(board, size, r, c).length) return true;
    }
  }
  return false;
}

function legalTargets(game, r, c) {
  const board = game.board;
  const size = game.size;
  const piece = board[r][c];
  if (!piece || piece.color !== game.turnColor) return [];
  if (game.chainFrom && (game.chainFrom[0] !== r || game.chainFrom[1] !== c)) return [];
  const jumps = pieceJumps(board, size, r, c);
  if (jumps.length || game.chainFrom || anyJumps(board, size, piece.color)) return jumps;
  return pieceSteps(board, size, r, c);
}

function movablePieces(game) {
  // Pieces the mover may pick, as [r, c] — respecting forced captures/chains.
  const board = game.board;
  const size = game.size;
  const out = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const piece = board[r][c];
      if (!piece || piece.color !== game.turnColor) continue;
      if (game.chainFrom && (game.chainFrom[0] !== r || game.chainFrom[1] !== c)) continue;
      const moves = legalTargets(game, r, c);
      if (moves.length) out.push([r, c]);
    }
  }
  return out;
}

// ----- Game flow -----

function adoptGame(game) {
  // Detect the piece that just appeared (for the last-move highlight).
  if (state.game?.board && game.board) {
    outer: for (let r = 0; r < game.size; r += 1) {
      for (let c = 0; c < game.size; c += 1) {
        const now = game.board[r][c];
        const before = state.game.board[r][c];
        if (now && (!before || before.color !== now.color || before.king !== now.king)) {
          state.lastMoved = [r, c];
          break outer;
        }
        if (!now && before) {
          state.lastMoved = null;
        }
      }
    }
  }
  state.game = game;
  if (game.playerId) {
    state.playerId = game.playerId;
    if (game.code) savePlayerId(game.code, game.playerId);
  }
  // Re-select the chained piece automatically after a mid-chain SSE push.
  state.selected = null;
  state.targets = [];
  if (game.status === "active" && game.yourTurn && game.chainFrom) {
    state.selected = [game.chainFrom[0], game.chainFrom[1]];
    state.targets = legalTargets(game, state.selected[0], state.selected[1]);
  }
  els.setupView.hidden = true;
  // Reconnect only when the stream target actually changes — every SSE
  // event lands here too, and reconnecting per event would loop forever.
  const streamKey = `${game.code}:${state.playerId}`;
  if (state.streamKey !== streamKey) {
    state.streamKey = streamKey;
    connectEvents();
  }
  render();
}

async function createGame(event) {
  event.preventDefault();
  try {
    const data = await requestJson("/api/checkers/games", {
      method: "POST",
      body: JSON.stringify({ size: chosenSize }),
    });
    state.playerId = "";
    state.resultShown = false;
    state.lastMoved = null;
    adoptGame(data.game);
  } catch (error) {
    setConnection(error.message, true);
  }
}

async function loadGame(code) {
  if (!code) return;
  const savedPlayerId = loadPlayerId(code);
  const suffix = savedPlayerId ? `?playerId=${encodeURIComponent(savedPlayerId)}` : "";
  try {
    const data = await requestJson(`/api/checkers/games/${code}${suffix}`);
    if (savedPlayerId) state.playerId = savedPlayerId;
    adoptGame(data.game);
  } catch (error) {
    setConnection(error.message, true);
  }
}

async function joinByCode(event) {
  event.preventDefault();
  const code = parseShareInput(els.joinCode.value);
  if (!code) {
    setConnection("Enter a share link or code", true);
    return;
  }
  await loadGame(code);
}

async function sitDown(event) {
  event.preventDefault();
  if (!state.game) return;
  try {
    const data = await requestJson(`/api/checkers/games/${state.game.code}/players`, {
      method: "POST",
      body: JSON.stringify({ name: els.playerName.value, playerId: state.playerId }),
    });
    state.playerId = data.playerId;
    savePlayerId(state.game.code, state.playerId);
    adoptGame(data.game);
  } catch (error) {
    setConnection(error.message, true);
  }
}

async function startGame() {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/checkers/games/${state.game.code}/start`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId }),
    });
    state.lastMoved = null;
    adoptGame(data.game);
  } catch (error) {
    setConnection(error.message, true);
  }
}

async function sendMove(from, to) {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(
      `/api/checkers/games/${state.game.code}/players/${state.playerId}/move`,
      { method: "POST", body: JSON.stringify({ move: { from, to } }) }
    );
    const finished = data.game.status === "finished";
    adoptGame(data.game);
    if (finished && !state.resultShown) showResult(data.game);
  } catch (error) {
    setConnection(error.message, true);
  }
}

async function rematch() {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/checkers/games/${state.game.code}/rematch`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId }),
    });
    state.resultShown = false;
    state.lastMoved = null;
    state.selected = null;
    state.targets = [];
    els.resultBackdrop.hidden = true;
    adoptGame(data.game);
  } catch (error) {
    setConnection(error.message, true);
  }
}

function connectEvents() {
  if (!state.game) return;
  if (state.eventSource) state.eventSource.close();
  const suffix = state.playerId ? `?playerId=${encodeURIComponent(state.playerId)}` : "";
  state.eventSource = new EventSource(`/api/checkers/games/${state.game.code}/events${suffix}`);
  setConnection("Live");
  const handler = (event) => {
    const game = JSON.parse(event.data);
    const wasOpen = !els.resultBackdrop.hidden;
    adoptGame(game);
    if (game.status === "finished" && !wasOpen && !state.resultShown) showResult(game);
  };
  ["game", "joined", "started", "move", "rematch"].forEach((name) => {
    state.eventSource.addEventListener(name, handler);
  });
  state.eventSource.addEventListener("error", () => {
    setConnection("Reconnecting", true);
  });
}

// ----- Rendering -----

function renderLobby() {
  const me = currentPlayer();
  const everyone = state.game.players.length === 2;
  els.shareCode.textContent = state.game.code;
  els.factStatus.textContent = "Lobby";
  els.factBoard.textContent = `${state.game.size} × ${state.game.size}`;
  els.shareTools.hidden = !state.game.youAreHost;
  els.newGameButton.hidden = !state.game.youAreHost;
  els.nameForm.hidden = Boolean(me);
  els.lobbyActions.hidden = !me;
  els.startButton.disabled = !everyone;
  if (!everyone) {
    els.lobbyMessage.textContent = "Waiting for an opponent to sit down…";
  } else {
    const black = state.game.players.find((p) => p.color === "black");
    els.lobbyMessage.textContent = `${black?.name || "Black"} opens. Start when ready.`;
  }
}

// Board orientation: display grid runs top-to-bottom; the player's own men
// belong at the bottom. Red plays from high row indices, black from low —
// so flip the coordinates for the black player.
function flip() {
  return state.game && state.game.yourColor === "black";
}

function toDisplay(r, c) {
  if (!flip()) return [r, c];
  return [state.game.size - 1 - r, state.game.size - 1 - c];
}

function fromServer(dr, dc) {
  if (!flip()) return [dr, dc];
  return [state.game.size - 1 - dr, state.game.size - 1 - dc];
}

function renderBoard() {
  const game = state.game;
  const size = game.size;
  els.board.style.setProperty("--n", String(size));
  els.board.innerHTML = "";

  const movable = new Set(movablePieces(game).map(([r, c]) => `${r},${c}`));
  const targetSet = new Set(state.targets.map(([r, c]) => `${r},${c}`));
  const isCaptureMove = Boolean(anyJumps(game.board, size, game.turnColor)) || Boolean(game.chainFrom);

  for (let dr = 0; dr < size; dr += 1) {
    for (let dc = 0; dc < size; dc += 1) {
      const [r, c] = fromServer(dr, dc);
      const square = document.createElement("div");
      const dark = (r + c) % 2 === 1;
      square.className = `square ${dark ? "dark" : "light"}`;
      const piece = game.board[r][c];
      const key = `${r},${c}`;
      const isSelected = state.selected && state.selected[0] === r && state.selected[1] === c;

      if (piece) {
        const el = document.createElement("div");
        el.className = `piece ${piece.color}${piece.king ? " king" : ""}`;
        if (movable.has(key)) el.classList.add("can-move");
        if (state.lastMoved && state.lastMoved[0] === r && state.lastMoved[1] === c) {
          el.classList.add("last-moved");
        }
        square.append(el);
      }
      if (isSelected) square.classList.add("is-selected");
      if (targetSet.has(key)) {
        square.classList.add("is-destination");
        if (isCaptureMove) square.classList.add("is-capture");
      }
      if (game.status === "active" && game.yourTurn) {
        square.classList.add("is-playable");
        square.addEventListener("click", () => onSquareClick(r, c));
      }
      els.board.append(square);
    }
  }
}

function onSquareClick(r, c) {
  const game = state.game;
  if (game.status !== "active" || !game.yourTurn) return;
  const piece = game.board[r][c];
  const key = `${r},${c}`;
  if (state.targets.some(([tr, tc]) => `${tr},${tc}` === key)) {
    sendMove(state.selected, [r, c]);
    state.selected = null;
    state.targets = [];
    return;
  }
  if (piece && piece.color === game.turnColor) {
    const targets = legalTargets(game, r, c);
    if (!targets.length) {
      // Not movable (forced capture elsewhere, or chained piece is locked).
      state.selected = null;
      state.targets = [];
      renderBoard();
      return;
    }
    state.selected = [r, c];
    state.targets = targets;
    renderBoard();
    return;
  }
  state.selected = null;
  state.targets = [];
  renderBoard();
}

function renderPlayers() {
  const game = state.game;
  const black = game.players.find((p) => p.color === "black");
  const red = game.players.find((p) => p.color === "red");
  els.blackName.textContent = black ? `${black.name}${black.id === state.playerId ? " (you)" : ""}` : "Open seat";
  els.redName.textContent = red ? `${red.name}${red.id === state.playerId ? " (you)" : ""}` : "Open seat";
  const perSide = (game.size / 2 - 1) * (game.size / 2);
  const count = (color) => game.board.flat().filter((p) => p && p.color === color).length;
  const redLeft = count("red");
  const blackLeft = count("black");
  els.blackCaptured.textContent = `${perSide - redLeft} taken`;
  els.redCaptured.textContent = `${perSide - blackLeft} taken`;
  els.chipBlack.classList.toggle("is-turn", game.turnColor === "black" && game.status === "active");
  els.chipRed.classList.toggle("is-turn", game.turnColor === "red" && game.status === "active");
}

function renderLog() {
  const log = state.game.log || [];
  els.moveLog.innerHTML = "";
  [...log].reverse().forEach((entry, index) => {
    const item = document.createElement("li");
    item.textContent = entry.text;
    if (index === 0) item.classList.add("is-newest");
    if (/wins!/i.test(entry.text) || /draw/i.test(entry.text)) item.classList.add("is-win");
    els.moveLog.append(item);
  });
}

function renderHeading() {
  const game = state.game;
  if (game.status === "active") {
    if (game.yourTurn) {
      els.phaseLabel.textContent = `Round ${game.round} · Your move`;
      els.turnBanner.textContent = game.chainFrom ? "Keep jumping!" : "Your move";
      els.turnBanner.classList.add("mine");
      els.gameMessage.textContent = game.chainFrom
        ? "That piece has to finish the job."
        : anyJumps(game.board, game.size, game.turnColor)
          ? "Capture is mandatory — a glowing piece has to jump."
          : "Slide a man forward, or jump an opponent.";
    } else {
      const opp = opponentInfo();
      els.phaseLabel.textContent = `Round ${game.round} · Waiting`;
      els.turnBanner.textContent = `${opp?.name || "Opponent"} is plotting…`;
      els.turnBanner.classList.remove("mine");
      els.gameMessage.textContent = "Watch the board and plan your reply.";
    }
  } else if (game.status === "finished") {
    els.phaseLabel.textContent = `Round ${game.round} · Over`;
    const iWon = game.winnerId === state.playerId;
    const draw = game.winReason === "draw";
    els.turnBanner.textContent = draw ? "Draw" : iWon ? "You win!" : "You lose";
    els.turnBanner.classList.toggle("mine", iWon || draw);
    els.gameMessage.textContent = draw
      ? "Nobody could land a blow. Call it a tie."
      : iWon ? "Opponent is out of moves." : "You have no legal move left.";
  }
}

function render() {
  if (!state.game) return;
  const inLobby = state.game.status === "lobby";
  els.playArea.hidden = inLobby;
  els.lobbyPanel.hidden = !inLobby;
  if (inLobby) {
    renderLobby();
    return;
  }
  renderHeading();
  renderBoard();
  renderPlayers();
  renderLog();
}

function showResult(game) {
  state.resultShown = true;
  const iWon = game.winnerId === state.playerId;
  if (game.winReason === "draw") {
    els.resultTitle.textContent = "A draw!";
    els.resultBody.textContent = "Sixty moves without a capture — the table calls it even.";
  } else {
    els.resultTitle.textContent = iWon ? "You win!" : "You lose";
    els.resultBody.textContent = iWon
      ? "Your opponent ran out of moves. Well played."
      : "You have no legal move left. Rematch and turn the tables — colors swap.";
  }
  els.resultBackdrop.hidden = false;
}

function showStartMode(mode) {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  state.streamKey = "";
  state.game = null;
  state.playerId = "";
  state.selected = null;
  state.targets = [];
  state.lastMoved = null;
  state.resultShown = false;
  els.setupView.hidden = false;
  els.playArea.hidden = true;
  els.lobbyPanel.hidden = true;
  els.resultBackdrop.hidden = true;
  entryControls.showMode(mode || "choice");
  setConnection("Ready");
}

function bindEvents() {
  entryControls = window.GameEntry.setup({
    choicePanel: els.choicePanel,
    createForm: els.createForm,
    joinForm: els.joinForm,
    showCreate: els.showCreate,
    showJoin: els.showJoin,
    joinInput: els.joinCode,
  });
  els.sizeOptions.forEach((option) => {
    option.addEventListener("click", () => {
      chosenSize = Number(option.dataset.size);
      els.sizeOptions.forEach((other) => {
        const active = other === option;
        other.classList.toggle("is-active", active);
        other.setAttribute("aria-pressed", String(active));
      });
    });
  });
  els.createForm.addEventListener("submit", createGame);
  els.joinForm.addEventListener("submit", joinByCode);
  els.nameForm.addEventListener("submit", sitDown);
  els.startButton.addEventListener("click", startGame);
  els.rematchButton.addEventListener("click", rematch);
  els.resultClose.addEventListener("click", () => {
    els.resultBackdrop.hidden = true;
  });
  els.resultBackdrop.addEventListener("click", (event) => {
    if (event.target === els.resultBackdrop) els.resultBackdrop.hidden = true;
  });
  els.copyShare.addEventListener("click", async () => {
    if (!state.game) return;
    const url = new URL(`/checkers/?game=${state.game.code}`, window.location.origin).toString();
    await navigator.clipboard?.writeText(url).catch(() => {});
    setConnection("Copied");
  });
  els.newGameButton.addEventListener("click", () => showStartMode("choice"));
}

bindEvents();
const params = new URLSearchParams(window.location.search);
const gameCode = params.get("game");
if (gameCode) loadGame(gameCode.toUpperCase());
