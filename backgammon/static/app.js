const COLORS = ["white", "black"];
const LOCAL_GAME_CODE = "LOCAL";

const state = {
  mode: "choice",
  game: null,
  selected: null,
  eventSource: null,
};

const els = {
  setupView: document.querySelector("#setupView"),
  choicePanel: document.querySelector("#choicePanel"),
  createForm: document.querySelector("#createForm"),
  joinForm: document.querySelector("#joinForm"),
  showLocal: document.querySelector("#showLocal"),
  showCreate: document.querySelector("#showCreate"),
  showJoin: document.querySelector("#showJoin"),
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
  if (mode === "join") els.joinCode.focus();
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
  whiteOff.innerHTML = `<span>White off</span><div class="off-slot">${state.game.borneOff.white}</div>`;
  els.board.append(whiteOff);

  const blackOff = document.createElement("button");
  blackOff.type = "button";
  blackOff.className = `bearoff black${blackOffTarget ? " is-target" : ""}`;
  blackOff.addEventListener("click", () => {
    if (blackOffTarget) playMove("off");
  });
  blackOff.innerHTML = `<span>Black off</span><div class="off-slot">${state.game.borneOff.black}</div>`;
  els.board.append(blackOff);

  const rail = document.createElement("div");
  rail.className = "rail";
  const whiteBarTarget = state.selected?.from === "bar" && state.game.turn === "white";
  const blackBarTarget = state.selected?.from === "bar" && state.game.turn === "black";
  rail.innerHTML = `
    <button class="bar-slot ${blackBarTarget ? "is-selected" : ""}" type="button" data-bar="black">Black bar<br>${state.game.bar.black}</button>
    <button class="bar-slot ${whiteBarTarget ? "is-selected" : ""}" type="button" data-bar="white">White bar<br>${state.game.bar.white}</button>
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
    renderPoint(index, offset < 6 ? offset + 2 : offset + 4, "top");
  });
  [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].forEach((index, offset) => {
    renderPoint(index, offset < 6 ? offset + 2 : offset + 4, "bottom");
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
  els.factMode.textContent = state.mode === "remote" ? "Remote" : "Local";
  els.factTurn.textContent = titleColor(state.game.turn);
  els.factDice.textContent = state.game.dice.length ? remainingDice(state.game).join(", ") || "Done" : "Roll";
  els.rollButton.disabled = state.game.rolled || Boolean(state.game.winner);
  els.endTurnButton.disabled = !state.game.rolled || Boolean(state.game.winner);
  renderDice();
  renderBoard();
  renderStats();
  renderMessage();
}

function resetToStart() {
  closeRemote();
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
