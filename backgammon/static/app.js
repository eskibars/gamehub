const COLORS = ["white", "black"];
const LOCAL_GAME_CODE = "LOCAL";

const SOLO_STORAGE_KEY = "backgammon-robot-v1";
const SOLO_TIER_NAMES = { casual: "Casual", sharp: "Sharp", master: "Master" };

const state = {
  mode: "choice",
  game: null,
  selected: null,
  eventSource: null,
  difficulty: "casual",
  robotPlan: null,
  robotTimer: null,
  soloAwarded: false,
  soloRecord: { wins: 0, losses: 0 },
};

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

const els = {
  setupView: document.querySelector("#setupView"),
  choicePanel: document.querySelector("#choicePanel"),
  createForm: document.querySelector("#createForm"),
  joinForm: document.querySelector("#joinForm"),
  soloForm: document.querySelector("#soloForm"),
  showLocal: document.querySelector("#showLocal"),
  showCreate: document.querySelector("#showCreate"),
  showJoin: document.querySelector("#showJoin"),
  showSolo: document.querySelector("#showSolo"),
  soloDiffRow: document.querySelector("#soloDiffRow"),
  joinCode: document.querySelector("#joinCode"),
  gameView: document.querySelector("#gameView"),
  connectionStatus: document.querySelector("#connectionStatus"),
  shareTools: document.querySelector("#shareTools"),
  shareCode: document.querySelector("#shareCode"),
  copyShare: document.querySelector("#copyShare"),
  newGameButton: document.querySelector("#newGameButton"),
  factMode: document.querySelector("#factMode"),
  factTurn: document.querySelector("#factTurn"),
  factDice: document.querySelector("#factDice"),
  diceRow: document.querySelector("#diceRow"),
  rollButton: document.querySelector("#rollButton"),
  endTurnButton: document.querySelector("#endTurnButton"),
  gameMessage: document.querySelector("#gameMessage"),
  board: document.querySelector("#board"),
  whiteStats: document.querySelector("#whiteStats"),
  blackStats: document.querySelector("#blackStats"),
  whiteBar: document.querySelector("#whiteBar"),
  blackBar: document.querySelector("#blackBar"),
};

function initialPoints() {
  return [
    { color: "black", count: 2 },
    null,
    null,
    null,
    null,
    { color: "white", count: 5 },
    null,
    { color: "white", count: 3 },
    null,
    null,
    null,
    { color: "black", count: 5 },
    { color: "white", count: 5 },
    null,
    null,
    null,
    { color: "black", count: 3 },
    null,
    { color: "black", count: 5 },
    null,
    null,
    null,
    null,
    { color: "white", count: 2 },
  ];
}

function newLocalGame() {
  return {
    code: LOCAL_GAME_CODE,
    mode: "local",
    points: initialPoints(),
    bar: { white: 0, black: 0 },
    borneOff: { white: 0, black: 0 },
    turn: "white",
    dice: [],
    usedDice: [],
    rolled: false,
    winner: null,
    revision: 0,
  };
}

function opponent(color) {
  return color === "white" ? "black" : "white";
}

function titleColor(color) {
  return `${color[0].toUpperCase()}${color.slice(1)}`;
}

function pointNumber(index) {
  return index + 1;
}

function remainingDice(game) {
  return game.dice.filter((_, index) => !game.usedDice.includes(index));
}

function hasAllInHome(game, color) {
  if (game.bar[color] > 0) return false;
  return game.points.every((point, index) => {
    if (!point || point.color !== color) return true;
    return color === "white" ? index <= 5 : index >= 18;
  });
}

function canUseOversizedBearOff(game, color, from) {
  if (color === "white") {
    return !game.points.some((point, index) => point?.color === color && index > from);
  }
  return !game.points.some((point, index) => point?.color === color && index < from);
}

function destinationForDie(game, color, from, die) {
  if (from === "bar") return color === "white" ? 24 - die : die - 1;
  const destination = color === "white" ? from - die : from + die;
  if (destination >= 0 && destination <= 23) return destination;
  if (!hasAllInHome(game, color)) return null;
  const exactBearOff = color === "white" ? destination === -1 : destination === 24;
  if (exactBearOff || canUseOversizedBearOff(game, color, from)) return "off";
  return null;
}

function isOpenDestination(game, color, destination) {
  if (destination === "off") return true;
  const point = game.points[destination];
  return !point || point.color === color || point.count === 1;
}

function legalMovesFrom(game, from) {
  if (!game.rolled || game.winner) return [];
  const color = game.turn;
  if (game.bar[color] > 0 && from !== "bar") return [];
  if (from === "bar") {
    if (game.bar[color] <= 0) return [];
  } else {
    const point = game.points[from];
    if (!point || point.color !== color || point.count <= 0) return [];
  }

  const moves = [];
  game.dice.forEach((die, dieIndex) => {
    if (game.usedDice.includes(dieIndex)) return;
    const destination = destinationForDie(game, color, from, die);
    if (destination === null) return;
    if (!isOpenDestination(game, color, destination)) return;
    moves.push({ from, to: destination, die, dieIndex });
  });
  return moves;
}

function allLegalMoves(game) {
  const starts = game.bar[game.turn] > 0 ? ["bar"] : game.points.map((point, index) => (point?.color === game.turn ? index : null)).filter(Number.isInteger);
  return starts.flatMap((from) => legalMovesFrom(game, from));
}

function moveChecker(game, move) {
  const next = structuredClone(game);
  const color = next.turn;
  const rival = opponent(color);

  if (move.from === "bar") {
    next.bar[color] -= 1;
  } else {
    const fromPoint = next.points[move.from];
    fromPoint.count -= 1;
    if (fromPoint.count === 0) next.points[move.from] = null;
  }

  if (move.to === "off") {
    next.borneOff[color] += 1;
  } else {
    const destination = next.points[move.to];
    if (!destination) {
      next.points[move.to] = { color, count: 1 };
    } else if (destination.color === color) {
      destination.count += 1;
    } else {
      next.bar[rival] += 1;
      next.points[move.to] = { color, count: 1 };
    }
  }

  next.usedDice.push(move.dieIndex);
  next.revision += 1;
  if (next.borneOff[color] >= 15) {
    next.winner = color;
    next.rolled = false;
  } else if (remainingDice(next).length === 0 || allLegalMoves(next).length === 0) {
    advanceTurn(next);
  }
  return next;
}

function advanceTurn(game) {
  game.turn = opponent(game.turn);
  game.dice = [];
  game.usedDice = [];
  game.rolled = false;
  game.revision += 1;
}

function rollDiceFor(game) {
  if (game.rolled || game.winner) return game;
  const first = Math.floor(Math.random() * 6) + 1;
  const second = Math.floor(Math.random() * 6) + 1;
  const next = structuredClone(game);
  next.dice = first === second ? [first, first, first, first] : [first, second];
  next.usedDice = [];
  next.rolled = true;
  next.revision += 1;
  if (allLegalMoves(next).length === 0) advanceTurn(next);
  return next;
}

// ----- Robot opponent (offline duel) -----
//
// A compact engine mirrors the UI rules on a sign-convention board
// (+n white checkers, -n black) so moves can be applied without cloning
// whole game objects. Tiers: Casual picks a random legal sequence, Sharp
// plays the best 1-ply evaluation, Master runs 2-ply expectimax over all
// 21 opponent rolls.

const BG_HOME_COUNT = 5; // points per home quadrant

function bgBoardFrom(game) {
  const points = new Int8Array(24);
  game.points.forEach((point, index) => {
    if (point) points[index] = point.color === "white" ? point.count : -point.count;
  });
  return { points, barW: game.bar.white, barB: game.bar.black, offW: game.borneOff.white, offB: game.borneOff.black };
}

function bgApply(pos, color, from, die) {
  // from: 0..23 or "bar"; returns {to} and mutates pos. Assumes legality.
  const white = color === "white";
  if (from === "bar") {
    if (white) pos.barW -= 1;
    else pos.barB -= 1;
  } else if (white) {
    pos.points[from] -= 1;
  } else {
    pos.points[from] += 1;
  }
  let to;
  if (from === "bar") to = white ? 24 - die : die - 1;
  else to = white ? from - die : from + die;
  if (to >= 0 && to <= 23) {
    const occupant = pos.points[to];
    if (occupant !== 0 && (occupant > 0) !== white && Math.abs(occupant) === 1) {
      pos.points[to] = white ? 1 : -1;
      if (white) pos.barB += 1;
      else pos.barW += 1;
    } else {
      pos.points[to] = white ? occupant + 1 : occupant - 1;
    }
  } else if (white) {
    pos.offW += 1;
  } else {
    pos.offB += 1;
  }
}

function bgDestination(color, from, die) {
  if (from === "bar") return color === "white" ? 24 - die : die - 1;
  const to = color === "white" ? from - die : from + die;
  if (to >= 0 && to <= 23) return to;
  return to < 0 || to > 23 ? "off" : to;
}

function bgHasAllHome(pos, color) {
  if (color === "white") {
    if (pos.barW > 0) return false;
    for (let i = 6; i < 24; i += 1) if (pos.points[i] > 0) return false;
    return true;
  }
  if (pos.barB > 0) return false;
  for (let i = 0; i < 18; i += 1) if (pos.points[i] < 0) return false;
  return true;
}

function bgCanBearOff(pos, color, from) {
  if (!bgHasAllHome(pos, color)) return false;
  if (color === "white") {
    for (let i = from + 1; i < 24; i += 1) if (pos.points[i] > 0) return false;
    return true;
  }
  for (let i = 0; i < from; i += 1) if (pos.points[i] < 0) return false;
  return true;
}

function bgLegalTargets(pos, color, from, die) {
  // Returns the destination ("off" allowed) when moving `from` by `die`.
  const white = color === "white";
  if (from === "bar") {
    const onBar = white ? pos.barW > 0 : pos.barB > 0;
    if (!onBar) return null;
  } else {
    const stack = pos.points[from];
    const mine = white ? stack > 0 : stack < 0;
    if (!mine || stack === 0) return null;
    if ((white ? pos.barW : pos.barB) > 0) return null;
  }
  let to = bgDestination(color, from, die);
  if (to === "off") {
    return bgCanBearOff(pos, color, from === "bar" ? (white ? 23 : 0) : from) ? "off" : null;
  }
  const occupant = pos.points[to];
  const blocked = white ? occupant <= -2 : occupant >= 2;
  return blocked ? null : to;
}

function bgSingleMoves(pos, color, die) {
  const moves = [];
  const white = color === "white";
  if ((white ? pos.barW : pos.barB) > 0) {
    const to = bgLegalTargets(pos, color, "bar", die);
    if (to !== null) moves.push({ from: "bar", to, die });
    return moves;
  }
  for (let i = 0; i < 24; i += 1) {
    const stack = pos.points[i];
    if (white ? stack <= 0 : stack >= 0) continue;
    if (stack === 0) continue;
    const to = bgLegalTargets(pos, color, i, die);
    if (to !== null) moves.push({ from: i, to, die });
  }
  return moves;
}

function bgKey(pos) {
  return `${pos.points.join(",")}|${pos.barW},${pos.barB},${pos.offW},${pos.offB}`;
}

// Enumerate all complete (maximal) move sequences for a dice list.
function bgSequences(pos, color, dice) {
  const results = new Map();
  const budget = { count: 0, max: 6000 };
  function step(current, remaining, moves) {
    budget.count += 1;
    if (budget.count > budget.max) return;
    let anyMove = false;
    for (let d = 0; d < remaining.length; d += 1) {
      const die = remaining[d];
      const movesForDie = bgSingleMoves(current, color, die);
      for (const move of movesForDie) {
        anyMove = true;
        const next = { points: current.points.slice(), barW: current.barW, barB: current.barB, offW: current.offW, offB: current.offB };
        bgApply(next, color, move.from, die);
        const rest = remaining.slice();
        rest.splice(d, 1);
        step(next, rest, moves.concat([{ from: move.from, die }]));
      }
      if (budget.count > budget.max) return;
    }
    if (!anyMove) {
      const key = bgKey(current);
      if (!results.has(key)) results.set(key, { moves, pos: current });
    }
  }
  step(pos, dice, []);
  return [...results.values()];
}

function bgPips(pos, color) {
  let total = 0;
  if (color === "white") {
    for (let i = 0; i < 24; i += 1) if (pos.points[i] > 0) total += pos.points[i] * (i + 1);
    total += pos.barW * 25;
  } else {
    for (let i = 0; i < 24; i += 1) if (pos.points[i] < 0) total += -pos.points[i] * (24 - i);
    total += pos.barB * 25;
  }
  return total;
}

function bgNoContact(pos) {
  let maxBlack = -1;
  let minWhite = 24;
  for (let i = 0; i < 24; i += 1) {
    if (pos.points[i] > 0 && i < minWhite) minWhite = i;
    if (pos.points[i] < 0 && i > maxBlack) maxBlack = i;
  }
  return maxBlack < minWhite;
}

// Static evaluation from White's perspective.
function bgEvaluate(pos) {
  const offDiff = 32 * (pos.offW - pos.offB);
  if (pos.offW >= 15) return 10000 + offDiff;
  if (pos.offB >= 15) return -10000 + offDiff;
  const race = bgPips(pos, "black") - bgPips(pos, "white") + 14 * (pos.barB - pos.barW);
  if (bgNoContact(pos)) return race + offDiff;
  let blots = 0;
  let structure = 0;
  for (let i = 0; i < 24; i += 1) {
    const stack = pos.points[i];
    if (stack === 1) blots -= 1;
    else if (stack === -1) blots += 1;
    else if (stack >= 2) structure += i <= 5 ? 2.4 : 1.1;
    else if (stack <= -2) structure -= i >= 18 ? 2.4 : 1.1;
  }
  return race + offDiff + 3.4 * blots + structure;
}

const BG_ROLLS = (() => {
  const rolls = [];
  for (let a = 1; a <= 6; a += 1) {
    for (let b = a; b <= 6; b += 1) {
      rolls.push(a === b ? [a, a, a, a] : [a, b]);
    }
  }
  return rolls;
})();

function robotSequenceChoice(pos, color, dice, difficulty) {
  const sequences = bgSequences(pos, color, dice);
  if (!sequences.length) return null;
  const white = color === "white";
  const sign = white ? 1 : -1;
  const scored = sequences.map((seq) => ({ seq, score: sign * bgEvaluate(seq.pos) }));
  scored.sort((a, b) => b.score - a.score);
  if (difficulty === "casual") {
    // Weak but not hopeless: race home badly from the top 60% of plans.
    const pool = scored.slice(0, Math.max(1, Math.ceil(scored.length * 0.6)));
    return pool[Math.floor(Math.random() * pool.length)].seq;
  }
  if (difficulty !== "master") {
    return scored[0].seq;
  }
  const opponent = white ? "black" : "white";
  let best = null;
  let bestValue = -Infinity;
  for (const { seq } of scored.slice(0, 36)) {
    let total = 0;
    for (const roll of BG_ROLLS) {
      const replies = bgSequences(seq.pos, opponent, roll);
      if (!replies.length) {
        total += sign * bgEvaluate(seq.pos);
        continue;
      }
      let bestReply = Infinity;
      for (const reply of replies) {
        const value = sign * bgEvaluate(reply.pos);
        if (value < bestReply) bestReply = value;
      }
      total += bestReply;
    }
    const value = total / BG_ROLLS.length;
    if (value > bestValue) {
      bestValue = value;
      best = seq;
    }
  }
  return best || scored[0].seq;
}

function computeRobotPlan() {
  const game = state.game;
  const pos = bgBoardFrom(game);
  const color = game.turn;
  const dice = game.dice.filter((_, index) => !game.usedDice.includes(index));
  const seq = robotSequenceChoice(pos, color, dice, state.difficulty);
  state.robotPlan = seq ? seq.moves : [];
}

function robotColorIsNext() {
  return state.mode === "robot" && state.game && !state.game.winner && state.game.turn === "black";
}

function scheduleRobotStep(delay = 750) {
  if (state.robotTimer) clearTimeout(state.robotTimer);
  state.robotTimer = setTimeout(robotStep, delay);
}

function robotStep() {
  if (!robotColorIsNext()) return;
  const game = state.game;
  if (!game.rolled) {
    state.robotPlan = null;
    applyLocal(rollDiceFor(game));
    if (robotColorIsNext()) scheduleRobotStep(650);
    return;
  }
  if (!state.robotPlan || !state.robotPlan.length) computeRobotPlan();
  const planMove = state.robotPlan?.[0];
  if (!planMove) {
    // Nothing left to play — hand the turn over.
    const next = structuredClone(game);
    advanceTurn(next);
    applyLocal(next);
    return;
  }
  // Translate the planned (from, die) into the UI engine's move object.
  const options = legalMovesFrom(game, planMove.from);
  const move = options.find((option) => option.die === planMove.die);
  if (!move) {
    computeRobotPlan();
    const retry = legalMovesFrom(game, state.robotPlan?.[0]?.from ?? "bar").find(
      (option) => option.die === state.robotPlan?.[0]?.die
    );
    if (!retry) {
      const next = structuredClone(game);
      advanceTurn(next);
      applyLocal(next);
      return;
    }
    state.robotPlan.shift();
    applyLocal(moveChecker(game, retry));
    scheduleRobotStep(600);
    return;
  }
  state.robotPlan.shift();
  applyLocal(moveChecker(game, move));
  if (robotColorIsNext()) scheduleRobotStep(600);
}

function maybeAwardSolo() {
  if (state.mode !== "robot" || state.soloAwarded || !state.game?.winner) return;
  state.soloAwarded = true;
  const humanWon = state.game.winner === "white";
  if (humanWon) {
    state.soloRecord.wins += 1;
    const chips = state.difficulty === "master" ? 6 : state.difficulty === "sharp" ? 4 : 2;
    GameHubProfile?.achieve("backgammon-robot-win");
    if (state.soloRecord.wins >= 5) GameHubProfile?.achieve("backgammon-robot-5");
    GameHubProfile?.award("backgammon", chips, `Raced the ${SOLO_TIER_NAMES[state.difficulty]} robot home`, state.soloRecord.wins);
    GameHubJuice?.win();
  } else {
    state.soloRecord.losses += 1;
    GameHubProfile?.award("backgammon", 1, "The robot bore off first", 0);
    GameHubJuice?.lose();
  }
  persistSoloRecord();
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

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function showMode(mode) {
  state.mode = mode;
  els.choicePanel.hidden = mode !== "choice";
  els.createForm.hidden = mode !== "create";
  els.joinForm.hidden = mode !== "join";
  els.soloForm.hidden = mode !== "solo";
  if (mode === "join") els.joinCode.focus();
}

function startSolo(event) {
  event.preventDefault();
  const checked = els.soloDiffRow.querySelector("input[name=soloDiff]:checked");
  state.difficulty = checked ? checked.value : "casual";
  state.soloAwarded = false;
  state.robotPlan = null;
  if (state.robotTimer) clearTimeout(state.robotTimer);
  closeRemote();
  openGame(newLocalGame(), "robot");
  els.connectionStatus.textContent = "Offline duel";
}

function openGame(game, mode) {
  state.game = game;
  state.mode = mode;
  state.selected = null;
  els.setupView.hidden = true;
  els.gameView.hidden = false;
  els.shareTools.hidden = mode !== "remote";
  if (mode === "remote") connectEvents(game.code);
  render();
}

function closeRemote() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
}

function connectEvents(code) {
  closeRemote();
  state.eventSource = new EventSource(`/api/backgammon/games/${code}/events`);
  els.connectionStatus.textContent = "Live";
  state.eventSource.addEventListener("game", (event) => {
    state.game = JSON.parse(event.data);
    state.selected = null;
    render();
  });
  state.eventSource.addEventListener("error", () => {
    els.connectionStatus.textContent = "Reconnecting";
  });
}

async function createRemote(event) {
  event.preventDefault();
  try {
    const data = await requestJson("/api/backgammon/games", { method: "POST" });
    openGame(data.game, "remote");
    els.connectionStatus.textContent = "Created";
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function joinRemote(event) {
  event.preventDefault();
  const code = parseShareInput(els.joinCode.value);
  if (!code) return;
  try {
    const data = await requestJson(`/api/backgammon/games/${code}`);
    openGame(data.game, "remote");
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function remoteAction(path, body = {}) {
  if (!state.game || state.mode !== "remote") return;
  try {
    const data = await requestJson(`/api/backgammon/games/${state.game.code}/${path}`, {
      method: "POST",
      body: JSON.stringify({ ...body, revision: state.game.revision }),
    });
    state.game = data.game;
    state.selected = null;
    render();
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

function applyLocal(nextGame) {
  state.game = nextGame;
  state.selected = null;
  render();
  if (state.mode !== "robot") return;
  maybeAwardSolo();
  if (robotColorIsNext()) scheduleRobotStep(700);
}

function rollDice() {
  if (!state.game) return;
  if (state.mode === "remote") remoteAction("roll");
  else applyLocal(rollDiceFor(state.game));
}

function endTurn() {
  if (!state.game || !state.game.rolled || state.game.winner) return;
  if (state.mode === "remote") remoteAction("end-turn");
  else {
    const next = structuredClone(state.game);
    advanceTurn(next);
    applyLocal(next);
  }
}

function selectStart(from) {
  if (!state.game || state.game.winner) return;
  const moves = legalMovesFrom(state.game, from);
  if (!moves.length) return;
  state.selected = { from, moves };
  render();
}

function playMove(to) {
  if (!state.selected || !state.game) return;
  const move = state.selected.moves.find((item) => item.to === to);
  if (!move) return;
  if (state.mode === "remote") remoteAction("moves", move);
  else applyLocal(moveChecker(state.game, move));
}

function checkerElement(color, label = "") {
  const checker = document.createElement("button");
  checker.type = "button";
  checker.className = `checker ${color}`;
  checker.textContent = label;
  return checker;
}

function renderPoint(index, gridColumn, rowClass) {
  const point = document.createElement("div");
  point.role = "button";
  point.tabIndex = 0;
  point.ariaLabel = `Point ${pointNumber(index)}`;
  point.className = `point ${rowClass}`;
  point.dataset.point = String(index);
  point.style.gridColumn = String(gridColumn);
  point.style.setProperty("--triangle-color", index % 2 === 0 ? "#efd1a3" : "#7a302c");

  const legalTarget = state.selected?.moves.some((move) => move.to === index);
  point.classList.toggle("is-target", Boolean(legalTarget));
  point.classList.toggle("is-selected", state.selected?.from === index);
  point.addEventListener("click", () => {
    if (legalTarget) playMove(index);
    else selectStart(index);
  });
  point.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (legalTarget) playMove(index);
    else selectStart(index);
  });

  const stack = document.createElement("div");
  stack.className = "checkers";
  const pointState = state.game.points[index];
  if (pointState) {
    const visible = Math.min(pointState.count, 5);
    for (let item = 0; item < visible; item += 1) {
      const label = item === visible - 1 && pointState.count > visible ? `+${pointState.count - visible}` : "";
      const checker = checkerElement(pointState.color, label);
      checker.addEventListener("click", (event) => {
        event.stopPropagation();
        selectStart(index);
      });
      stack.append(checker);
    }
  }
  point.append(stack);
  els.board.append(point);
}

function renderBoard() {
  els.board.innerHTML = "";
  const whiteOffTarget = state.selected?.moves.some((move) => move.to === "off") && state.game.turn === "white";
  const blackOffTarget = state.selected?.moves.some((move) => move.to === "off") && state.game.turn === "black";

  const whiteOff = document.createElement("button");
  whiteOff.type = "button";
  whiteOff.className = `bearoff white${whiteOffTarget ? " is-target" : ""}`;
  whiteOff.addEventListener("click", () => {
    if (whiteOffTarget) playMove("off");
  });
  whiteOff.innerHTML = `<span>White<br>off</span><div class="off-slot">${state.game.borneOff.white}</div>`;
  els.board.append(whiteOff);

  const blackOff = document.createElement("button");
  blackOff.type = "button";
  blackOff.className = `bearoff black${blackOffTarget ? " is-target" : ""}`;
  blackOff.addEventListener("click", () => {
    if (blackOffTarget) playMove("off");
  });
  blackOff.innerHTML = `<span>Black<br>off</span><div class="off-slot">${state.game.borneOff.black}</div>`;
  els.board.append(blackOff);

  const rail = document.createElement("div");
  rail.className = "rail";
  const whiteBarTarget = state.selected?.from === "bar" && state.game.turn === "white";
  const blackBarTarget = state.selected?.from === "bar" && state.game.turn === "black";
  rail.innerHTML = `
    <button class="bar-slot ${blackBarTarget ? "is-selected" : ""}" type="button" data-bar="black"><span>Black<br>bar</span><strong>${state.game.bar.black}</strong></button>
    <button class="bar-slot ${whiteBarTarget ? "is-selected" : ""}" type="button" data-bar="white"><span>White<br>bar</span><strong>${state.game.bar.white}</strong></button>
  `;
  rail.querySelectorAll("[data-bar]").forEach((button) => {
    button.addEventListener("click", () => selectStart("bar"));
  });
  els.board.append(rail);

  const label = document.createElement("div");
  label.className = "mid-label";
  label.textContent = "24 points";
  els.board.append(label);

  [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].forEach((index, offset) => {
    renderPoint(index, offset < 6 ? offset + 2 : offset + 3, "top");
  });
  [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].forEach((index, offset) => {
    renderPoint(index, offset < 6 ? offset + 2 : offset + 3, "bottom");
  });
}

function renderDice() {
  els.diceRow.innerHTML = "";
  if (!state.game.dice.length) {
    const empty = document.createElement("span");
    empty.className = "die";
    empty.textContent = "-";
    els.diceRow.append(empty);
    return;
  }
  state.game.dice.forEach((die, index) => {
    const item = document.createElement("span");
    item.className = `die${state.game.usedDice.includes(index) ? " used" : ""}`;
    item.textContent = String(die);
    els.diceRow.append(item);
  });
}

function renderStats() {
  const whiteOnBoard = state.game.points.reduce((sum, point) => sum + (point?.color === "white" ? point.count : 0), 0);
  const blackOnBoard = state.game.points.reduce((sum, point) => sum + (point?.color === "black" ? point.count : 0), 0);
  els.whiteStats.textContent = `${whiteOnBoard} on board, ${state.game.borneOff.white} borne off`;
  els.blackStats.textContent = `${blackOnBoard} on board, ${state.game.borneOff.black} borne off`;
  els.whiteBar.textContent = String(state.game.bar.white);
  els.blackBar.textContent = String(state.game.bar.black);
}

function renderMessage() {
  if (state.game.winner) {
    els.gameMessage.textContent = `${titleColor(state.game.winner)} wins.`;
  } else if (state.mode === "robot" && state.game.turn === "black") {
    els.gameMessage.textContent = state.game.rolled ? "The robot is moving…" : "The robot is rolling…";
  } else if (!state.game.rolled) {
    els.gameMessage.textContent = `${titleColor(state.game.turn)} rolls.`;
  } else if (state.game.bar[state.game.turn] > 0) {
    els.gameMessage.textContent = `${titleColor(state.game.turn)} must enter from the bar.`;
  } else if (allLegalMoves(state.game).length === 0) {
    els.gameMessage.textContent = "No legal moves remain.";
  } else {
    els.gameMessage.textContent = `${titleColor(state.game.turn)} moves ${remainingDice(state.game).join(", ")}.`;
  }
}

function render() {
  if (!state.game) return;
  els.shareCode.textContent = state.game.code;
  els.factMode.textContent = state.mode === "remote" ? "Remote" : state.mode === "robot" ? "vs Robot" : "Local";
  els.factTurn.textContent = titleColor(state.game.turn);
  els.factDice.textContent = state.game.dice.length ? remainingDice(state.game).join(", ") || "Done" : "Roll";
  const robotTurn = state.mode === "robot" && state.game.turn === "black";
  els.rollButton.disabled = state.game.rolled || Boolean(state.game.winner) || robotTurn;
  els.endTurnButton.disabled = !state.game.rolled || Boolean(state.game.winner) || robotTurn;
  renderDice();
  renderBoard();
  renderStats();
  renderMessage();
}

function resetToStart() {
  closeRemote();
  if (state.robotTimer) clearTimeout(state.robotTimer);
  state.robotTimer = null;
  state.robotPlan = null;
  state.game = null;
  state.selected = null;
  state.mode = "choice";
  els.setupView.hidden = false;
  els.gameView.hidden = true;
  els.connectionStatus.textContent = "Ready";
  showMode("choice");
}

function bindEvents() {
  els.showLocal.addEventListener("click", () => {
    closeRemote();
    openGame(newLocalGame(), "local");
    els.connectionStatus.textContent = "Local";
  });
  els.showSolo.addEventListener("click", () => showMode("solo"));
  els.soloForm.addEventListener("submit", startSolo);
  els.showCreate.addEventListener("click", () => showMode("create"));
  els.showJoin.addEventListener("click", () => showMode("join"));
  els.createForm.addEventListener("submit", createRemote);
  els.joinForm.addEventListener("submit", joinRemote);
  els.rollButton.addEventListener("click", rollDice);
  els.endTurnButton.addEventListener("click", endTurn);
  els.newGameButton.addEventListener("click", resetToStart);
  els.copyShare.addEventListener("click", async () => {
    const url = new URL(`/backgammon/?game=${state.game.code}`, window.location.origin).toString();
    await navigator.clipboard?.writeText(url).catch(() => {});
    els.connectionStatus.textContent = "Copied";
  });
}

bindEvents();
loadSoloRecord();
showMode("choice");

const params = new URLSearchParams(window.location.search);
const code = params.get("game");
if (code) {
  els.joinCode.value = code.toUpperCase();
  requestJson(`/api/backgammon/games/${code.toUpperCase()}`)
    .then((data) => openGame(data.game, "remote"))
    .catch((error) => {
      showMode("join");
      els.connectionStatus.textContent = error.message;
    });
}
