// app.js — Checkers client. The server is authoritative: the client mirrors
// the movement rules only to highlight legal moves; every move is validated
// again server-side. The board rotates 180° for the black player so each
// player always sees their own men at the bottom.

const STORAGE_PLAYER_KEY = "checkers-player-v1";

const SOLO_STORAGE_KEY = "checkers-robot-v1";
const SOLO_TIER_NAMES = { casual: "Casual", sharp: "Sharp", master: "Master" };

const state = {
  game: null,
  playerId: "",
  eventSource: null,
  streamKey: "",
  selected: null, // [r, c] in server coordinates
  targets: [],
  lastMoved: null, // [r, c]
  resultShown: false,
  solo: null, // offline duel: { difficulty, robotTimer }
  soloRecord: { wins: 0, losses: 0 },
  soloSize: 8,
};

const els = {
  setupView: document.querySelector("#setupView"),
  choicePanel: document.querySelector("#choicePanel"),
  createForm: document.querySelector("#createForm"),
  joinForm: document.querySelector("#joinForm"),
  soloForm: document.querySelector("#soloForm"),
  showCreate: document.querySelector("#showCreate"),
  showJoin: document.querySelector("#showJoin"),
  showSolo: document.querySelector("#showSolo"),
  soloDiffRow: document.querySelector("#soloDiffRow"),
  factMode: document.querySelector("#factMode"),
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

// ----- Offline duel vs the robot -----

function loadSoloRecord() {
  try {
    const saved = JSON.parse(localStorage.getItem(SOLO_STORAGE_KEY) || "{}");
    state.soloRecord = { wins: saved.wins || 0, losses: saved.losses || 0 };
  } catch {
    // Fresh install.
  }
}

function persistSoloRecord() {
  try {
    localStorage.setItem(SOLO_STORAGE_KEY, JSON.stringify(state.soloRecord));
  } catch {
    // Storage unavailable.
  }
}

function soloNewBoard(size) {
  const rows = size / 2 - 1;
  const board = Array.from({ length: size }, () => Array.from({ length: size }, () => null));
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if ((r + c) % 2 === 1) board[r][c] = { color: "black", king: false };
    }
  }
  for (let r = size - rows; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if ((r + c) % 2 === 1) board[r][c] = { color: "red", king: false };
    }
  }
  return board;
}

function soloCellLabel(size, row, col) {
  return `${String.fromCharCode(65 + col)}${size - row}`;
}

function startSolo(event) {
  event.preventDefault();
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  state.streamKey = "";
  const checked = els.soloDiffRow.querySelector("input[name=soloDiff]:checked");
  const difficulty = checked ? checked.value : "casual";
  state.solo = { difficulty, robotTimer: null };
  state.playerId = "you";
  state.resultShown = false;
  state.lastMoved = null;
  state.selected = null;
  state.targets = [];
  const size = state.soloSize;
  state.game = {
    code: "ROBOT",
    status: "active",
    round: 1,
    size,
    players: [
      { id: "robot", name: "Robot", color: "black" },
      { id: "you", name: "You", color: "red" },
    ],
    board: soloNewBoard(size),
    turnId: "robot",
    turnColor: "black",
    chainFrom: null,
    quiet: 0,
    winnerId: null,
    winReason: null,
    log: [{ text: "Round 1. Black moves first!", at: new Date().toISOString() }],
    yourColor: "red",
    yourTurn: false,
  };
  els.setupView.hidden = true;
  els.lobbyPanel.hidden = true;
  els.playArea.hidden = false;
  els.resultBackdrop.hidden = true;
  els.factMode.textContent = "vs Robot";
  setConnection("Offline duel");
  render();
  scheduleRobot(900);
}

function soloRematch() {
  state.resultShown = false;
  state.lastMoved = null;
  state.selected = null;
  state.targets = [];
  els.resultBackdrop.hidden = true;
  const difficulty = state.solo?.difficulty || "casual";
  const size = state.game?.size || state.soloSize;
  state.solo = { difficulty, robotTimer: null };
  state.game = {
    code: "ROBOT",
    status: "active",
    round: 1,
    size,
    players: [
      { id: "robot", name: "Robot", color: "black" },
      { id: "you", name: "You", color: "red" },
    ],
    board: soloNewBoard(size),
    turnId: "robot",
    turnColor: "black",
    chainFrom: null,
    quiet: 0,
    winnerId: null,
    winReason: null,
    log: [{ text: "Round 1. Black moves first!", at: new Date().toISOString() }],
    yourColor: "red",
    yourTurn: false,
  };
  render();
  scheduleRobot(900);
}

// Applies one move with the exact rules the server enforces, then keeps
// the local flow going (chained jumps, robot replies, game end).
function localMove(from, to) {
  const game = state.game;
  if (!game || game.status !== "active") return;
  const [fr, fc] = from;
  const [tr, tc] = to;
  const size = game.size;
  const board = game.board;
  const targets = legalTargets(game, fr, fc);
  if (!targets.some(([lr, lc]) => lr === tr && lc === tc)) return;

  const piece = board[fr][fc];
  const isJump = Math.abs(tr - fr) === 2;
  let capturedLabel = null;
  if (isJump) {
    const mid = board[(fr + tr) / 2][(fc + tc) / 2];
    capturedLabel = mid && mid.king ? "a king" : "a man";
    board[(fr + tr) / 2][(fc + tc) / 2] = null;
    game.quiet = 0;
  } else {
    game.quiet += 1;
  }
  board[tr][tc] = piece;
  board[fr][fc] = null;

  const moverName = game.turnId === "you" ? "You" : "The robot";
  const movedLabel = piece.king ? "king" : "man";
  let text = `${moverName} moved the ${game.turnColor} ${movedLabel} ${soloCellLabel(size, fr, fc)} to ${soloCellLabel(size, tr, tc)}`;
  let crowned = false;
  if (!piece.king) {
    const homeRow = piece.color === "black" ? size - 1 : 0;
    if (tr === homeRow) {
      piece.king = true;
      crowned = true;
      text += " — crowned!";
    }
  }
  if (isJump) text += `, capturing ${capturedLabel}`;
  game.log.push({ text: text + ".", at: new Date().toISOString() });
  if (game.log.length > 60) game.log.shift();

  const chained = isJump && !crowned && pieceJumps(board, size, tr, tc).length;
  if (chained) {
    game.chainFrom = [tr, tc];
    game.log.push({ text: `${moverName} must keep jumping!`, at: new Date().toISOString() });
  } else {
    game.chainFrom = null;
    const nextColor = game.turnColor === "red" ? "black" : "red";
    if (game.quiet >= 60) {
      game.status = "finished";
      game.winnerId = null;
      game.winReason = "draw";
      game.log.push({ text: "Draw — sixty quiet moves.", at: new Date().toISOString() });
    } else if (!anyMovesLeft(game, nextColor)) {
      game.status = "finished";
      game.winnerId = game.turnId;
      game.winReason = "no_moves";
      game.log.push({ text: game.turnId === "you" ? "You win!" : "The robot wins!", at: new Date().toISOString() });
    } else {
      game.turnId = game.turnId === "you" ? "robot" : "you";
      game.turnColor = nextColor;
    }
  }
  game.yourTurn = game.status === "active" && game.turnId === "you";
  state.lastMoved = [tr, tc];
  state.selected = null;
  state.targets = [];
  if (game.status === "active" && game.yourTurn && game.chainFrom) {
    state.selected = [game.chainFrom[0], game.chainFrom[1]];
    state.targets = legalTargets(game, state.selected[0], state.selected[1]);
  }
  render();
  if (game.status === "finished") {
    finishSolo(game.winnerId === "you", game.winReason === "draw");
    return;
  }
  scheduleRobot(700 + Math.random() * 500);
}

function anyMovesLeft(game, color) {
  for (let r = 0; r < game.size; r += 1) {
    for (let c = 0; c < game.size; c += 1) {
      const piece = game.board[r][c];
      if (piece && piece.color === color && (pieceJumps(game.board, game.size, r, c).length || pieceSteps(game.board, game.size, r, c).length)) {
        return true;
      }
    }
  }
  return false;
}

function scheduleRobot(delay) {
  if (!state.solo) return;
  if (state.solo.robotTimer) clearTimeout(state.solo.robotTimer);
  state.solo.robotTimer = setTimeout(robotMove, delay);
}

function robotMove() {
  const game = state.game;
  if (!state.solo || !game || game.status !== "active" || game.turnId !== "robot") return;
  const move = chooseRobotMove(game);
  if (!move) return;
  localMove(move[0], move[1]);
}

function finishSolo(youWon, draw) {
  if (state.solo?.robotTimer) clearTimeout(state.solo.robotTimer);
  const tier = state.solo?.difficulty || "casual";
  if (draw) {
    state.soloRecord.losses += 0;
    GameHubProfile?.award("checkers", 2, "Drew the robot — sixty quiet moves", 0);
    GameHubJuice?.levelUp();
  } else if (youWon) {
    state.soloRecord.wins += 1;
    persistSoloRecord();
    const chips = tier === "master" ? 6 : tier === "sharp" ? 4 : 3;
    GameHubProfile?.achieve("checkers-robot-win");
    if (state.soloRecord.wins >= 5) GameHubProfile?.achieve("checkers-robot-5");
    GameHubProfile?.award("checkers", chips, `Beat the ${SOLO_TIER_NAMES[tier]} robot`, state.soloRecord.wins);
    GameHubJuice?.win();
  } else {
    state.soloRecord.losses += 1;
    persistSoloRecord();
    GameHubProfile?.award("checkers", 1, "The robot out-drafted you", 0);
    GameHubJuice?.lose();
  }
  showResult(state.game);
}


// ----- Robot brain -----
//
// The search runs on a compact Int8Array board (positive = red, negative =
// black; magnitude 2 = king) so moves apply without cloning objects.
// Negamax with alpha-beta; chained jumps keep the same side on move, which
// the recursion handles by not flipping the color or the sign.

const SOLO_DEPTHS = {
  sharp: { 8: 4, 10: 3, 12: 3 },
  master: { 8: 8, 10: 6, 12: 5 },
};
const SOLO_NODE_CAP = 500000;

function toCompact(board, size) {
  const cells = new Int8Array(size * size);
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const piece = board[r][c];
      if (!piece) continue;
      const sign = piece.color === "red" ? 1 : -1;
      cells[r * size + c] = sign * (piece.king ? 2 : 1);
    }
  }
  return cells;
}

function compactDirections(value) {
  if (Math.abs(value) === 2) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return value > 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

function compactJumps(cells, size, r, c) {
  const value = cells[r * size + c];
  if (!value) return [];
  const jumps = [];
  for (const [dr, dc] of compactDirections(value)) {
    const lr = r + 2 * dr;
    const lc = c + 2 * dc;
    if (lr < 0 || lr >= size || lc < 0 || lc >= size) continue;
    const over = cells[(r + dr) * size + (c + dc)];
    if (over !== 0 && over * value < 0 && cells[lr * size + lc] === 0) jumps.push([lr, lc]);
  }
  return jumps;
}

function compactSteps(cells, size, r, c) {
  const value = cells[r * size + c];
  if (!value) return [];
  const steps = [];
  for (const [dr, dc] of compactDirections(value)) {
    const sr = r + dr;
    const sc = c + dc;
    if (sr >= 0 && sr < size && sc >= 0 && sc < size && cells[sr * size + sc] === 0) steps.push([sr, sc]);
  }
  return steps;
}

function compactAnyJumps(cells, size, sign) {
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const value = cells[r * size + c];
      if (value * sign > 0 && compactJumps(cells, size, r, c).length) return true;
    }
  }
  return false;
}

// All (from, to) moves for `sign`, honoring forced captures and chains.
function compactMoves(cells, size, sign, chainFrom) {
  const moves = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const value = cells[r * size + c];
      if (value * sign <= 0) continue;
      if (chainFrom && (chainFrom[0] !== r || chainFrom[1] !== c)) continue;
      const jumps = compactJumps(cells, size, r, c);
      if (jumps.length || chainFrom || compactAnyJumps(cells, size, sign)) {
        jumps.forEach(([lr, lc]) => moves.push({ from: [r, c], to: [lr, lc] }));
      } else {
        compactSteps(cells, size, r, c).forEach(([sr, sc]) => moves.push({ from: [r, c], to: [sr, sc] }));
      }
    }
  }
  return moves;
}

function compactApply(cells, size, move, sign) {
  const next = cells.slice();
  const [fr, fc] = move.from;
  const [tr, tc] = move.to;
  let value = next[fr * size + fc];
  if (Math.abs(tr - fr) === 2) next[((fr + tr) / 2) * size + ((fc + tc) / 2)] = 0;
  next[fr * size + fc] = 0;
  const wasKing = Math.abs(value) === 2;
  if (!wasKing) {
    const homeRow = value < 0 ? size - 1 : 0;
    if (tr === homeRow) value = value > 0 ? 2 : -2;
  }
  next[tr * size + tc] = value;
  const crowned = !wasKing && Math.abs(value) === 2;
  const isJump = Math.abs(tr - fr) === 2;
  const chain = isJump && !crowned && compactJumps(next, size, tr, tc).length ? [tr, tc] : null;
  return { cells: next, chain, sameColor: Boolean(chain) };
}

// Red-positive evaluation.
function compactEval(cells, size) {
  let score = 0;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const value = cells[r * size + c];
      if (!value) continue;
      let pieceScore = Math.abs(value) === 2 ? 165 : 100;
      if (Math.abs(value) === 1) {
        // Advancement: men closer to crowning are worth more.
        const progress = value > 0 ? size - 1 - r : r;
        pieceScore += progress * 3;
        // Guard the back row early.
        const backRow = value > 0 ? size - 1 : 0;
        if (r === backRow) pieceScore += 6;
      }
      score += value > 0 ? pieceScore : -pieceScore;
    }
  }
  return score;
}

const searchState = { nodes: 0, capped: false };

function negamax(cells, size, sign, depth, alpha, beta, chainFrom) {
  searchState.nodes += 1;
  if (searchState.nodes > SOLO_NODE_CAP) {
    searchState.capped = true;
    return sign > 0 ? compactEval(cells, size) : -compactEval(cells, size);
  }
  const moves = compactMoves(cells, size, sign, chainFrom);
  if (!moves.length) return -(100000 + depth); // no moves: current side loses
  if (depth <= 0) return sign > 0 ? compactEval(cells, size) : -compactEval(cells, size);
  let best = -Infinity;
  for (const move of moves) {
    const applied = compactApply(cells, size, move, sign);
    let value;
    if (applied.sameColor) {
      value = negamax(applied.cells, size, sign, depth - 1, alpha, beta, applied.chain);
    } else {
      value = -negamax(applied.cells, size, -sign, depth - 1, -beta, -alpha, null);
    }
    if (value > best) best = value;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function chooseRobotMove(game) {
  const size = game.size;
  const difficulty = state.solo?.difficulty || "casual";
  const cells = toCompact(game.board, size);
  const BLACK = -1;
  const moves = compactMoves(cells, size, BLACK, game.chainFrom ? [...game.chainFrom] : null);
  if (!moves.length) return null;
  if (difficulty === "casual") {
    const pick = moves[Math.floor(Math.random() * moves.length)];
    return [pick.from, pick.to];
  }
  const depth = SOLO_DEPTHS[difficulty][size] || 4;
  searchState.nodes = 0;
  searchState.capped = false;
  let best = null;
  let bestScore = -Infinity;
  // Root: search each black move; small jitter breaks ties naturally.
  const scored = [];
  for (const move of moves) {
    const applied = compactApply(cells, size, move, BLACK);
    const value = applied.sameColor
      ? negamax(applied.cells, size, BLACK, depth - 1, -Infinity, Infinity, applied.chain)
      : -negamax(applied.cells, size, 1, depth - 1, -Infinity, Infinity, null);
    scored.push({ move, value: value + Math.random() * 0.5 });
  }
  scored.sort((a, b) => b.value - a.value);
  best = scored[0].move;
  return [best.from, best.to];
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
  if (state.solo) {
    localMove(from, to);
    return;
  }
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
  if (state.solo) {
    soloRematch();
    return;
  }
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
  if (state.solo?.robotTimer) clearTimeout(state.solo.robotTimer);
  state.solo = null;
  els.setupView.hidden = false;
  els.playArea.hidden = true;
  els.lobbyPanel.hidden = true;
  els.resultBackdrop.hidden = true;
  els.choicePanel.hidden = mode !== "choice";
  els.createForm.hidden = mode !== "create";
  els.joinForm.hidden = mode !== "join";
  els.soloForm.hidden = mode !== "solo";
  if (mode === "join") els.joinCode.focus();
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
  els.soloForm.addEventListener("submit", startSolo);
  els.showSolo.addEventListener("click", () => showStartMode("solo"));
  document.querySelectorAll(".solo-size").forEach((option) => {
    option.addEventListener("click", () => {
      state.soloSize = Number(option.dataset.size);
      document.querySelectorAll(".solo-size").forEach((other) => {
        const active = other === option;
        other.classList.toggle("is-active", active);
        other.setAttribute("aria-pressed", String(active));
      });
    });
  });
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

loadSoloRecord();
bindEvents();
const params = new URLSearchParams(window.location.search);
const gameCode = params.get("game");
if (gameCode) loadGame(gameCode.toUpperCase());
