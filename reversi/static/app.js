/*
 * Reversi (Othello) for the offline Game Hub — pure vanilla JS, no libraries,
 * no network. Board is an Array(64): 0 empty, 1 black (moves first), 2 white.
 *
 * The top half of this file is a DOM-free engine + robot so a node harness can
 * exercise it through module.exports; the UI half at the bottom is guarded by
 * `typeof document`. All localStorage keys are prefixed "reversi-".
 */
"use strict";

/* ===========================================================================
 * Engine — pure functions
 * ======================================================================== */

const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

function opponent(player) {
  return player === BLACK ? WHITE : BLACK;
}

function newBoard() {
  const board = new Array(64).fill(EMPTY);
  board[27] = WHITE; // d4
  board[28] = BLACK; // e4
  board[35] = BLACK; // d5
  board[36] = WHITE; // e5
  return board;
}

/* Every disc `player` would flip by playing on `idx` ([] when illegal). */
function flipsFor(board, player, idx) {
  if (board[idx] !== EMPTY) return [];
  const r0 = idx >> 3;
  const c0 = idx & 7;
  const opp = opponent(player);
  const flips = [];
  for (let d = 0; d < 8; d += 1) {
    const dr = DIRS[d][0];
    const dc = DIRS[d][1];
    let r = r0 + dr;
    let c = c0 + dc;
    let seen = 0;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === opp) {
      seen += 1;
      r += dr;
      c += dc;
    }
    if (seen > 0 && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === player) {
      let rr = r0 + dr;
      let cc = c0 + dc;
      for (let k = 0; k < seen; k += 1) {
        flips.push(rr * 8 + cc);
        rr += dr;
        cc += dc;
      }
    }
  }
  return flips;
}

/* Early-exit legality check for one square. */
function hasFlips(board, player, idx) {
  if (board[idx] !== EMPTY) return false;
  const r0 = idx >> 3;
  const c0 = idx & 7;
  const opp = opponent(player);
  for (let d = 0; d < 8; d += 1) {
    const dr = DIRS[d][0];
    const dc = DIRS[d][1];
    let r = r0 + dr;
    let c = c0 + dc;
    let seen = 0;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === opp) {
      seen += 1;
      r += dr;
      c += dc;
    }
    if (seen > 0 && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === player) {
      return true;
    }
  }
  return false;
}

function legalMoves(board, player) {
  const moves = [];
  for (let idx = 0; idx < 64; idx += 1) {
    if (board[idx] === EMPTY && hasFlips(board, player, idx)) moves.push(idx);
  }
  return moves;
}

function hasMove(board, player) {
  return legalMoves(board, player).length > 0;
}

/* Copying move application for game-level play and tests. */
function applyMove(board, player, idx) {
  const flips = flipsFor(board, player, idx);
  if (flips.length === 0) return null;
  const next = board.slice();
  next[idx] = player;
  for (let i = 0; i < flips.length; i += 1) next[flips[i]] = player;
  return { board: next, flips };
}

function countDiscs(board) {
  let b = 0;
  let w = 0;
  for (let i = 0; i < 64; i += 1) {
    const v = board[i];
    if (v === BLACK) b += 1;
    else if (v === WHITE) w += 1;
  }
  return [b, w];
}

function countEmpties(board) {
  let n = 0;
  for (let i = 0; i < 64; i += 1) {
    if (board[i] === EMPTY) n += 1;
  }
  return n;
}

function discDiff(board, player) {
  const [b, w] = countDiscs(board);
  return player === BLACK ? b - w : w - b;
}

/* ----------------------------- robot brains ------------------------------ */

/* Classic positional table: corners gold, X/C squares poison. */
const WEIGHTS = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
];

function mobilityOf(board, player) {
  let n = 0;
  for (let idx = 0; idx < 64; idx += 1) {
    if (board[idx] === EMPTY && hasFlips(board, player, idx)) n += 1;
  }
  return n;
}

/* Rough stability: edge discs in monochromatic runs anchored to a corner. */
const EDGE_LINES = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [56, 57, 58, 59, 60, 61, 62, 63],
  [0, 8, 16, 24, 32, 40, 48, 56],
  [7, 15, 23, 31, 39, 47, 55, 63],
];

function stableDiscs(board, player) {
  let n = 0;
  for (let e = 0; e < EDGE_LINES.length; e += 1) {
    const edge = EDGE_LINES[e];
    const o0 = board[edge[0]];
    if (o0 !== EMPTY) {
      let i = 0;
      while (i < 8 && board[edge[i]] === o0) i += 1;
      if (o0 === player) n += i;
    }
    const o1 = board[edge[7]];
    if (o1 !== EMPTY) {
      let j = 7;
      while (j >= 0 && board[edge[j]] === o1) j -= 1;
      if (o1 === player) n += 7 - j;
    }
  }
  return n;
}

/* Static eval from `player`'s (side-to-move) perspective. */
function evaluateBoard(board, player) {
  const opp = opponent(player);
  let pos = 0;
  for (let i = 0; i < 64; i += 1) {
    const v = board[i];
    if (v === player) pos += WEIGHTS[i];
    else if (v === opp) pos -= WEIGHTS[i];
  }
  const mob = mobilityOf(board, player) - mobilityOf(board, opp);
  const stab = stableDiscs(board, player) - stableDiscs(board, opp);
  return pos + 8 * mob + 10 * stab;
}

function terminalScore(board, player) {
  const d = discDiff(board, player);
  if (d > 0) return 100000 + d;
  if (d < 0) return -100000 + d;
  return 0;
}

/* Mutating move + undo for the search (fast). Returns flips or null. */
function makeMove(board, player, idx) {
  const flips = flipsFor(board, player, idx);
  if (flips.length === 0) return null;
  board[idx] = player;
  for (let i = 0; i < flips.length; i += 1) board[flips[i]] = player;
  return flips;
}

function undoMove(board, player, idx, flips) {
  const opp = opponent(player);
  board[idx] = EMPTY;
  for (let i = 0; i < flips.length; i += 1) board[flips[i]] = opp;
}

let searchDeadline = 0;
let searchAborted = false;
let searchNodes = 0;

function negamax(board, player, depth, alpha, beta, empties) {
  if (searchAborted) return 0;
  searchNodes += 1;
  if ((searchNodes & 511) === 0 && Date.now() > searchDeadline) {
    searchAborted = true;
    return 0;
  }
  const opp = opponent(player);
  const moves = legalMoves(board, player);
  if (moves.length === 0) {
    if (!hasMove(board, opp)) return terminalScore(board, player);
    return -negamax(board, opp, depth, -beta, -alpha, empties);
  }
  if (depth <= 0) return evaluateBoard(board, player);
  if (moves.length > 1) moves.sort((a, b) => WEIGHTS[b] - WEIGHTS[a]);
  let bestVal = -Infinity;
  for (let i = 0; i < moves.length; i += 1) {
    const flips = makeMove(board, player, moves[i]);
    const val = -negamax(board, opp, depth - 1, -beta, -alpha, empties - 1);
    undoMove(board, player, moves[i], flips);
    if (searchAborted) return 0;
    if (val > bestVal) bestVal = val;
    if (val > alpha) alpha = val;
    if (alpha >= beta) break;
  }
  return bestVal;
}

function rootSearch(board, player, order, depth, empties) {
  let alpha = -Infinity;
  let best = order[0];
  const scored = [];
  let aborted = false;
  for (let i = 0; i < order.length; i += 1) {
    const idx = order[i];
    const flips = makeMove(board, player, idx);
    const val = -negamax(board, opponent(player), depth - 1, -Infinity, -alpha, empties - 1);
    undoMove(board, player, idx, flips);
    if (searchAborted) {
      aborted = true;
      break;
    }
    scored.push({ idx, val });
    if (val > alpha) {
      alpha = val;
      best = idx;
    }
  }
  scored.sort((a, b) => b.val - a.val);
  return {
    best,
    score: alpha,
    order: aborted ? order : scored.map((s) => s.idx),
    aborted,
  };
}

/* Alpha-beta with iterative deepening inside a ~380ms budget; exact solve
 * once the board is down to the last ~10 empties. */
function hardMove(board, player, moves) {
  const empties = countEmpties(board);
  const maxDepth = empties <= 10 ? empties : 3;
  let order = moves.slice().sort((a, b) => WEIGHTS[b] - WEIGHTS[a]);
  let bestIdx = order[0];
  searchDeadline = Date.now() + 380;
  searchAborted = false;
  searchNodes = 0;
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const res = rootSearch(board, player, order, depth, empties);
    if (res.aborted) break;
    bestIdx = res.best;
    order = res.order;
    if (res.score > 90000 || res.score < -90000) break;
    if (depth >= empties) break;
  }
  return bestIdx;
}

/* Positional weights + mobility, searched two plies deep. */
function mediumEval(board, viewer) {
  const opp = opponent(viewer);
  let pos = 0;
  for (let i = 0; i < 64; i += 1) {
    const v = board[i];
    if (v === viewer) pos += WEIGHTS[i];
    else if (v === opp) pos -= WEIGHTS[i];
  }
  const mob = mobilityOf(board, viewer) - mobilityOf(board, opp);
  return pos + 7 * mob;
}

function mediumMove(board, player, moves) {
  const opp = opponent(player);
  let bestIdx = moves[0];
  let bestScore = -Infinity;
  for (let i = 0; i < moves.length; i += 1) {
    const idx = moves[i];
    const applied = applyMove(board, player, idx);
    const next = applied.board;
    let val;
    const replies = legalMoves(next, opp);
    if (replies.length === 0) {
      if (hasMove(next, player)) val = mediumEval(next, player) + 25; // free pass
      else val = terminalScore(next, player) * 10;
    } else {
      let worst = Infinity;
      for (let j = 0; j < replies.length; j += 1) {
        const reply = applyMove(next, opp, replies[j]);
        const v = mediumEval(reply.board, player);
        if (v < worst) worst = v;
      }
      val = worst;
    }
    val += Math.random() * 4;
    if (val > bestScore) {
      bestScore = val;
      bestIdx = idx;
    }
  }
  return bestIdx;
}

/* Greedy max-flips with a pinch of chaos. */
function easyMove(board, player, moves) {
  if (Math.random() < 0.25) return moves[(Math.random() * moves.length) | 0];
  let maxFlips = 0;
  for (let i = 0; i < moves.length; i += 1) {
    const f = flipsFor(board, player, moves[i]).length;
    if (f > maxFlips) maxFlips = f;
  }
  const top = [];
  for (let i = 0; i < moves.length; i += 1) {
    if (flipsFor(board, player, moves[i]).length === maxFlips) top.push(moves[i]);
  }
  return top[(Math.random() * top.length) | 0];
}

function bestMove(board, player, strength) {
  const moves = legalMoves(board, player);
  if (moves.length === 0) return null;
  if (strength === "easy") return easyMove(board, player, moves);
  if (strength === "medium") return mediumMove(board, player, moves);
  return hardMove(board, player, moves);
}

/* Node test harness hook (browser: `module` is undefined, so this is a no-op). */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    EMPTY, BLACK, WHITE,
    newBoard, opponent, flipsFor, hasFlips, legalMoves, hasMove,
    applyMove, countDiscs, countEmpties, discDiff, bestMove, evaluateBoard, WEIGHTS,
  };
}

/* ===========================================================================
 * UI
 * ======================================================================== */

if (typeof document !== "undefined") {

  const els = {
    setupView: document.querySelector("#setupView"),
    setupForm: document.querySelector("#setupForm"),
    strengthRow: document.querySelector("#strengthRow"),
    colorRow: document.querySelector("#colorRow"),
    hintsInput: document.querySelector("#hintsInput"),
    gameView: document.querySelector("#gameView"),
    board: document.querySelector("#board"),
    boardFrame: document.querySelector("#boardFrame"),
    blackBox: document.querySelector("#blackBox"),
    whiteBox: document.querySelector("#whiteBox"),
    blackScore: document.querySelector("#blackScore"),
    whiteScore: document.querySelector("#whiteScore"),
    statusPill: document.querySelector("#statusPill"),
    turnLine: document.querySelector("#turnLine"),
    overlay: document.querySelector("#overlay"),
    winnerTitle: document.querySelector("#winnerTitle"),
    winnerSub: document.querySelector("#winnerSub"),
    recordLine: document.querySelector("#recordLine"),
    chipsLine: document.querySelector("#chipsLine"),
    rematchButton: document.querySelector("#rematchButton"),
    setupButton: document.querySelector("#setupButton"),
    undoButton: document.querySelector("#undoButton"),
    hintsButton: document.querySelector("#hintsButton"),
    rematchSmall: document.querySelector("#rematchSmall"),
    newGame: document.querySelector("#newGame"),
  };

  const STRENGTH_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" };
  const CHIP_VALUES = { easy: 10, medium: 20, hard: 35 };

  const state = {
    board: newBoard(),
    current: BLACK,
    mode: "robot", // "robot" | "human"
    strength: "medium", // "easy" | "medium" | "hard"
    humanColor: BLACK,
    hints: true,
    lastMove: -1,
    over: false,
    winner: 0,
    awarded: false,
    notice: "",
    locked: false, // robot is thinking
    history: [], // pre-move snapshots for undo
    robotTimer: null,
  };

  let record = loadRecord();
  let flipResetTimer = null;

  function colorName(player) {
    return player === BLACK ? "Black" : "White";
  }

  function strengthName() {
    return STRENGTH_LABEL[state.strength] || "Medium";
  }

  /* ------------------------------ storage ------------------------------ */

  function readJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      /* storage unavailable — session-only play */
    }
  }

  function loadRecord() {
    const fresh = { easy: { w: 0, l: 0, d: 0 }, medium: { w: 0, l: 0, d: 0 }, hard: { w: 0, l: 0, d: 0 } };
    const saved = readJSON("reversi-record");
    if (saved) {
      for (const key of Object.keys(fresh)) {
        if (saved[key]) fresh[key] = { ...fresh[key], ...saved[key] };
      }
    }
    return fresh;
  }

  function saveRecord() {
    writeJSON("reversi-record", record);
  }

  function loadSettingsIntoState() {
    const saved = readJSON("reversi-settings");
    if (!saved) return;
    if (saved.mode === "robot" || saved.mode === "human") state.mode = saved.mode;
    if (STRENGTH_LABEL[saved.strength]) state.strength = saved.strength;
    if (saved.humanColor === BLACK || saved.humanColor === WHITE) state.humanColor = saved.humanColor;
    if (typeof saved.hints === "boolean") state.hints = saved.hints;
  }

  function persistSettings() {
    writeJSON("reversi-settings", {
      mode: state.mode,
      strength: state.strength,
      humanColor: state.humanColor,
      hints: state.hints,
    });
  }

  function persistGame() {
    writeJSON("reversi-game", {
      board: state.board,
      current: state.current,
      mode: state.mode,
      strength: state.strength,
      humanColor: state.humanColor,
      hints: state.hints,
      lastMove: state.lastMove,
      over: state.over,
      winner: state.winner,
      awarded: state.awarded,
    });
  }

  function loadSavedGame() {
    const saved = readJSON("reversi-game");
    if (!saved || !Array.isArray(saved.board) || saved.board.length !== 64) return false;
    if (!saved.board.every((v) => v === EMPTY || v === BLACK || v === WHITE)) return false;
    if (saved.current !== BLACK && saved.current !== WHITE) return false;
    if (saved.mode !== "robot" && saved.mode !== "human") return false;
    if (!STRENGTH_LABEL[saved.strength]) return false;
    if (saved.humanColor !== BLACK && saved.humanColor !== WHITE) return false;
    state.board = saved.board.slice();
    state.current = saved.current;
    state.mode = saved.mode;
    state.strength = saved.strength;
    state.humanColor = saved.humanColor;
    state.hints = saved.hints === true;
    state.lastMove = typeof saved.lastMove === "number" && saved.lastMove >= 0 && saved.lastMove < 64
      ? saved.lastMove
      : -1;
    state.over = saved.over === true;
    state.winner = saved.winner === BLACK || saved.winner === WHITE ? saved.winner : 0;
    state.awarded = saved.awarded === true;
    return true;
  }

  /* ---------------------------- board render ---------------------------- */

  function buildBoardCells() {
    els.board.innerHTML = "";
    for (let idx = 0; idx < 64; idx += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.idx = String(idx);
      cell.setAttribute("aria-label", `Square row ${(idx >> 3) + 1} column ${(idx & 7) + 1}`);
      els.board.append(cell);
    }
  }

  function sizeBoard() {
    const available = Math.min(window.innerWidth - 40, window.innerHeight - 310, 520);
    els.board.style.width = `${Math.max(280, Math.floor(available))}px`;
  }

  function makeFace(kind) {
    const face = document.createElement("span");
    face.className = `face ${kind}`;
    return face;
  }

  function makeDisc(color, pop) {
    const disc = document.createElement("span");
    disc.className = pop ? "disc pop" : "disc";
    disc.append(makeFace("black"), makeFace("white"));
    disc.dataset.color = color;
    return disc;
  }

  function renderDiscs() {
    for (let idx = 0; idx < 64; idx += 1) {
      const cell = els.board.children[idx];
      cell.innerHTML = "";
      const v = state.board[idx];
      if (v !== EMPTY) {
        cell.append(makeDisc(v === BLACK ? "black" : "white", false));
      }
      cell.classList.toggle("last", idx === state.lastMove);
    }
  }

  function animateMove(player, idx, flips) {
    const cell = els.board.children[idx];
    let disc = cell.querySelector(".disc");
    if (!disc) {
      disc = makeDisc(colorName(player), true);
      cell.append(disc);
    } else {
      disc.dataset.color = colorName(player);
    }
    const r0 = idx >> 3;
    const c0 = idx & 7;
    for (let i = 0; i < flips.length; i += 1) {
      const f = flips[i];
      const fCell = els.board.children[f];
      let fDisc = fCell.querySelector(".disc");
      if (!fDisc) {
        fDisc = makeDisc(colorName(player), false);
        fCell.append(fDisc);
      }
      const dist = Math.max(Math.abs((f >> 3) - r0), Math.abs((f & 7) - c0));
      fDisc.style.transitionDelay = `${Math.min(dist * 55, 440)}ms`;
      fDisc.dataset.color = colorName(player);
    }
    clearTimeout(flipResetTimer);
    flipResetTimer = setTimeout(() => {
      for (const el of els.board.querySelectorAll(".disc")) {
        el.style.transitionDelay = "0ms";
      }
    }, 760);
  }

  function updateLegal() {
    const moves = state.over ? [] : legalMoves(state.board, state.current);
    const legalSet = new Set(moves);
    els.board.classList.toggle("show-hints", state.hints && !state.over);
    els.board.dataset.turn = state.current === BLACK ? "black" : "white";
    for (let idx = 0; idx < 64; idx += 1) {
      els.board.children[idx].classList.toggle("legal", legalSet.has(idx));
    }
  }

  /* ------------------------------- HUD ---------------------------------- */

  function updateHud() {
    const [b, w] = countDiscs(state.board);
    els.blackScore.textContent = String(b);
    els.whiteScore.textContent = String(w);
    els.blackBox.classList.toggle("active", !state.over && state.current === BLACK);
    els.whiteBox.classList.toggle("active", !state.over && state.current === WHITE);
    els.statusPill.textContent = state.mode === "robot" ? `Robot · ${strengthName()}` : "Pass & Play";
    let text;
    if (state.over) {
      text = "Game over";
    } else if (state.notice) {
      text = state.notice;
    } else if (state.mode === "robot") {
      text = state.current === state.humanColor
        ? `Your turn — you play ${colorName(state.current)}`
        : "Robot is thinking…";
    } else {
      text = `${colorName(state.current)} to move`;
    }
    els.turnLine.textContent = text;
    els.turnLine.classList.toggle("notice", Boolean(state.notice) && !state.over);
    els.turnLine.classList.toggle(
      "thinking",
      !state.over && !state.notice && state.mode === "robot" && state.current !== state.humanColor
    );
    els.undoButton.disabled = state.over || state.locked || state.history.length === 0;
    els.hintsButton.textContent = state.hints ? "Hints: On" : "Hints: Off";
  }

  /* --------------------------- chips + result ---------------------------- */

  function chipsForOutcome() {
    if (state.mode !== "robot") {
      return { chips: 5, note: "Finished a pass-and-play game" };
    }
    const base = CHIP_VALUES[state.strength] || 10;
    if (state.winner === 0) {
      return { chips: Math.ceil(base / 2), note: `Drew the ${strengthName()} robot at Reversi` };
    }
    if (state.winner === state.humanColor) {
      return { chips: base, note: `Beat ${strengthName()} robot at Reversi` };
    }
    return { chips: 2, note: "Fell to the robot — consolation chips" };
  }

  function describeResult() {
    const [b, w] = countDiscs(state.board);
    let title;
    if (state.mode === "robot") {
      title = state.winner === 0
        ? "Dead heat!"
        : state.winner === state.humanColor ? "You win! 🏆" : "Robot wins 🤖";
    } else {
      title = state.winner === 0 ? "Dead heat!" : `${colorName(state.winner)} wins! 🏆`;
    }
    const sub = `Black ${b} — ${w} White`
      + (state.mode === "robot" ? ` · you played ${colorName(state.humanColor)}` : "");
    const outcome = chipsForOutcome();
    const chips = `+${outcome.chips} chips — ${outcome.note}`;
    let recordText = "";
    if (state.mode === "robot") {
      const rec = record[state.strength] || { w: 0, l: 0, d: 0 };
      recordText = `All-time vs ${strengthName()}: ${rec.w}W · ${rec.l}L · ${rec.d}D`;
    }
    return { title, sub, chips, recordText };
  }

  function showGameOverUI() {
    const view = describeResult();
    els.winnerTitle.textContent = view.title;
    els.winnerSub.textContent = view.sub;
    els.chipsLine.textContent = view.chips;
    els.recordLine.textContent = view.recordText;
    els.overlay.hidden = false;
  }

  function endGame() {
    state.over = true;
    const [b, w] = countDiscs(state.board);
    state.winner = b > w ? BLACK : w > b ? WHITE : 0;
    if (state.mode === "robot") {
      const rec = record[state.strength] || (record[state.strength] = { w: 0, l: 0, d: 0 });
      if (state.winner === 0) rec.d += 1;
      else if (state.winner === state.humanColor) rec.w += 1;
      else rec.l += 1;
      saveRecord();
    }
    if (!state.awarded) {
      state.awarded = true;
      const outcome = chipsForOutcome();
      if (window.GameHubProfile) {
        window.GameHubProfile.award("reversi", outcome.chips, outcome.note, outcome.chips);
      }
    }
    showGameOverUI();
    const celebrate = state.mode === "human"
      ? state.winner !== 0
      : state.winner !== 0 && state.winner === state.humanColor;
    if (celebrate) confetti();
  }

  /* ------------------------------ game flow ------------------------------ */

  function pushHistory() {
    state.history.push({
      board: state.board.slice(),
      current: state.current,
      lastMove: state.lastMove,
    });
    if (state.history.length > 128) state.history.shift();
  }

  function playMove(idx, player) {
    state.notice = "";
    pushHistory();
    const flips = flipsFor(state.board, player, idx);
    state.board[idx] = player;
    for (let i = 0; i < flips.length; i += 1) state.board[flips[i]] = player;
    state.lastMove = idx;
    animateMove(player, idx, flips);
    const opp = opponent(player);
    if (hasMove(state.board, opp)) {
      state.current = opp;
    } else if (hasMove(state.board, player)) {
      state.current = player;
      state.notice = `${colorName(opp)} has no moves — ${colorName(player)} plays again`;
    } else {
      state.current = opp;
      endGame();
    }
    afterAction();
  }

  function afterAction() {
    updateLegal();
    updateHud();
    persistGame();
    if (!state.over) maybeRobot();
  }

  function clearRobotTimer() {
    if (state.robotTimer !== null) {
      clearTimeout(state.robotTimer);
      state.robotTimer = null;
    }
    state.locked = false;
  }

  function maybeRobot() {
    if (state.over || state.mode !== "robot" || state.current === state.humanColor) return;
    state.locked = true;
    updateHud();
    const startedAt = Date.now();
    state.robotTimer = setTimeout(() => {
      const legal = legalMoves(state.board, state.current);
      if (state.over || legal.length === 0) {
        state.locked = false;
        return;
      }
      const idx = bestMove(state.board, state.current, state.strength);
      const choice = legal.includes(idx) ? idx : legal[0];
      const wait = Math.max(30, 480 - (Date.now() - startedAt));
      state.robotTimer = setTimeout(() => {
        state.robotTimer = null;
        state.locked = false;
        if (state.over) return;
        playMove(choice, state.current);
      }, wait);
    }, 130);
  }

  function undo() {
    if (state.over || state.history.length === 0) return;
    clearRobotTimer();
    let snap = state.history.pop();
    if (state.mode === "robot") {
      while (snap.current !== state.humanColor && state.history.length > 0) {
        snap = state.history.pop();
      }
    }
    state.board = snap.board.slice();
    state.current = snap.current;
    state.lastMove = snap.lastMove;
    state.notice = "";
    state.over = false;
    state.winner = 0;
    renderDiscs();
    updateLegal();
    updateHud();
    persistGame();
    if (state.mode === "robot" && state.current !== state.humanColor) maybeRobot();
  }

  function startNewGame() {
    clearRobotTimer();
    state.board = newBoard();
    state.current = BLACK;
    state.lastMove = -1;
    state.history = [];
    state.notice = "";
    state.over = false;
    state.winner = 0;
    state.awarded = false;
    els.overlay.hidden = true;
    sizeBoard();
    renderDiscs();
    updateLegal();
    updateHud();
    persistGame();
    maybeRobot();
  }

  function rematch() {
    if (state.mode === "robot") state.humanColor = opponent(state.humanColor);
    persistSettings();
    startNewGame();
  }

  /* ------------------------------ confetti ------------------------------- */

  function confetti() {
    const emojis = ["🎉", "✨", "🏆", "🎊", "⚫", "⚪"];
    for (let i = 0; i < 30; i += 1) {
      const span = document.createElement("span");
      span.className = "confetti";
      span.textContent = emojis[(Math.random() * emojis.length) | 0];
      span.style.left = `${8 + Math.random() * 84}%`;
      span.style.setProperty("--dx", `${(Math.random() - 0.5) * 180}px`);
      span.style.setProperty("--dy", `${260 + Math.random() * 220}px`);
      span.style.setProperty("--rot", `${Math.round((Math.random() - 0.5) * 720)}deg`);
      span.style.setProperty("--dur", `${(0.9 + Math.random() * 0.9).toFixed(2)}s`);
      span.style.setProperty("--delay", `${(Math.random() * 0.35).toFixed(2)}s`);
      els.boardFrame.append(span);
      setTimeout(() => span.remove(), 2400);
    }
  }

  /* ------------------------------- events -------------------------------- */

  function onCellClick(event) {
    const cell = event.target.closest(".cell");
    if (!cell || state.over || state.locked) return;
    if (state.mode === "robot" && state.current !== state.humanColor) return;
    const idx = Number(cell.dataset.idx);
    if (flipsFor(state.board, state.current, idx).length === 0) return;
    playMove(idx, state.current);
  }

  function radioValue(name, fallback) {
    const picked = els.setupForm.querySelector(`input[name='${name}']:checked`);
    return picked ? picked.value : fallback;
  }

  function syncSetupForm() {
    for (const input of els.setupForm.querySelectorAll("input[name='mode']")) {
      input.checked = input.value === state.mode;
    }
    for (const input of els.setupForm.querySelectorAll("input[name='strength']")) {
      input.checked = input.value === state.strength;
    }
    for (const input of els.setupForm.querySelectorAll("input[name='color']")) {
      input.checked = Number(input.value) === state.humanColor;
    }
    els.hintsInput.checked = state.hints;
    const robot = state.mode === "robot";
    els.strengthRow.hidden = !robot;
    els.colorRow.hidden = !robot;
  }

  function openSetup() {
    clearRobotTimer();
    persistGame();
    els.gameView.hidden = true;
    els.setupView.hidden = false;
    syncSetupForm();
  }

  els.setupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.mode = radioValue("mode", "robot") === "human" ? "human" : "robot";
    const strength = radioValue("strength", "medium");
    state.strength = STRENGTH_LABEL[strength] ? strength : "medium";
    state.humanColor = radioValue("color", "1") === "2" ? WHITE : BLACK;
    state.hints = els.hintsInput.checked;
    persistSettings();
    els.setupView.hidden = true;
    els.gameView.hidden = false;
    startNewGame();
  });

  els.setupForm.addEventListener("change", () => {
    const robot = radioValue("mode", "robot") === "robot";
    els.strengthRow.hidden = !robot;
    els.colorRow.hidden = !robot;
  });

  els.board.addEventListener("click", onCellClick);
  els.newGame.addEventListener("click", openSetup);
  els.setupButton.addEventListener("click", openSetup);
  els.rematchButton.addEventListener("click", rematch);
  els.rematchSmall.addEventListener("click", rematch);
  els.undoButton.addEventListener("click", undo);
  els.hintsButton.addEventListener("click", () => {
    state.hints = !state.hints;
    persistSettings();
    updateLegal();
    updateHud();
  });
  window.addEventListener("resize", sizeBoard);

  /* -------------------------------- boot --------------------------------- */

  function init() {
    loadSettingsIntoState();
    syncSetupForm();
    buildBoardCells();
    sizeBoard();
    if (loadSavedGame()) {
      els.setupView.hidden = true;
      els.gameView.hidden = false;
      renderDiscs();
      updateLegal();
      updateHud();
      if (state.over) showGameOverUI();
      else maybeRobot();
    }
  }

  init();
}
