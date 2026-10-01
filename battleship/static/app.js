// app.js — Battleship client. Talks to the Flask API and an SSE stream.
// Placement happens entirely client-side (validated again server-side on
// anchor); the battle boards are rendered from the per-player server view,
// so enemy ship positions never reach this client until they are sunk.

const STORAGE_PLAYER_KEY = "battleship-player-v1";
const SOLO_STORAGE_KEY = "battleship-robot-v1";
const LEGACY_SOLO_KEY = "gamehub-battleship-solo-v1"; // retired Battleship Solo card
const COL_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const SOLO_FLEET_SPEC = [
  { name: "carrier", size: 5 },
  { name: "battleship", size: 4 },
  { name: "cruiser", size: 3 },
  { name: "submarine", size: 3 },
  { name: "destroyer", size: 2 },
];

const state = {
  game: null,
  playerId: "",
  eventSource: null,
  streamKey: "",
  entryMode: "choice",
  placement: {
    selected: "carrier",
    horizontal: true,
    ships: {}, // name -> [[r,c],...]
  },
  recentShotKey: "",
  resultShown: false,
  solo: null, // offline duel state
  soloTimer: null,
  soloRecord: { wins: 0, losses: 0 },
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
  joinCode: document.querySelector("#joinCode"),
  connectionStatus: document.querySelector("#connectionStatus"),
  lobbyPanel: document.querySelector("#lobbyPanel"),
  shareTools: document.querySelector("#shareTools"),
  shareCode: document.querySelector("#shareCode"),
  copyShare: document.querySelector("#copyShare"),
  factStatus: document.querySelector("#factStatus"),
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
  placementPanel: document.querySelector("#placementPanel"),
  placeBoard: document.querySelector("#placeBoard"),
  placeCoords: document.querySelector("#placeCoords"),
  placeRows: document.querySelector("#placeRows"),
  fleetList: document.querySelector("#fleetList"),
  rotateButton: document.querySelector("#rotateButton"),
  randomButton: document.querySelector("#randomButton"),
  clearButton: document.querySelector("#clearButton"),
  anchorButton: document.querySelector("#anchorButton"),
  placementHint: document.querySelector("#placementHint"),
  battlePanel: document.querySelector("#battlePanel"),
  ownBoard: document.querySelector("#ownBoard"),
  ownCoords: document.querySelector("#ownCoords"),
  ownRows: document.querySelector("#ownRows"),
  ownFleetStatus: document.querySelector("#ownFleetStatus"),
  enemyBoard: document.querySelector("#enemyBoard"),
  enemyCoords: document.querySelector("#enemyCoords"),
  enemyRows: document.querySelector("#enemyRows"),
  enemyTitle: document.querySelector("#enemyTitle"),
  enemyFleetStatus: document.querySelector("#enemyFleetStatus"),
  battleLog: document.querySelector("#battleLog"),
  resultBackdrop: document.querySelector("#resultBackdrop"),
  resultTitle: document.querySelector("#resultTitle"),
  resultBody: document.querySelector("#resultBody"),
  resultClose: document.querySelector("#resultClose"),
  rematchButton: document.querySelector("#rematchButton"),
};

let entryControls = null;

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

function cellKey(row, col) {
  return `${row},${col}`;
}

function cellLabel(row, col) {
  return `${COL_LABELS[col]}${row + 1}`;
}

function currentPlayer() {
  if (!state.game || !state.playerId) return null;
  return state.game.players.find((p) => p.id === state.playerId) || null;
}

function opponent() {
  if (!state.game?.opponents?.length) return null;
  return state.game.opponents[0];
}

function opponentName() {
  if (state.entryMode === "solo") return "the Robot Admiral";
  return opponent()?.name || "Opponent";
}

// ----- Game flow -----

function adoptGame(game) {
  state.game = game;
  if (game.playerId) {
    state.playerId = game.playerId;
    if (game.code) savePlayerId(game.code, game.playerId);
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
    const data = await requestJson("/api/battleship/games", { method: "POST" });
    state.playerId = "";
    state.resultShown = false;
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
    const data = await requestJson(`/api/battleship/games/${code}${suffix}`);
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

async function joinBattle(event) {
  event.preventDefault();
  if (!state.game) return;
  try {
    const data = await requestJson(`/api/battleship/games/${state.game.code}/players`, {
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

async function startPlacement() {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/battleship/games/${state.game.code}/start`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId }),
    });
    adoptGame(data.game);
  } catch (error) {
    setConnection(error.message, true);
  }
}

async function anchorFleet() {
  if (state.entryMode === "solo" && state.solo) {
    startSoloBattle();
    return;
  }
  if (!state.game || !state.playerId) return;
  const ships = Object.entries(state.placement.ships).map(([name, cells]) => ({ name, cells }));
  try {
    const data = await requestJson(
      `/api/battleship/games/${state.game.code}/players/${state.playerId}/fleet`,
      { method: "POST", body: JSON.stringify({ ships }) }
    );
    adoptGame(data.game);
  } catch (error) {
    setConnection(error.message, true);
  }
}

async function fireAt(row, col) {
  if (state.entryMode === "solo" && state.solo) {
    localFire(row, col);
    return;
  }
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(
      `/api/battleship/games/${state.game.code}/players/${state.playerId}/fire`,
      { method: "POST", body: JSON.stringify({ row, col }) }
    );
    state.recentShotKey = cellKey(row, col);
    const wasFinished = data.game.status === "finished";
    adoptGame(data.game);
    if (wasFinished && !state.resultShown) showResult(data.game);
  } catch (error) {
    setConnection(error.message, true);
  }
}

async function rematch() {
  if (state.entryMode === "solo" && state.solo) {
    soloRematch();
    return;
  }
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/battleship/games/${state.game.code}/rematch`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId }),
    });
    state.resultShown = false;
    state.recentShotKey = "";
    resetPlacement();
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
  state.eventSource = new EventSource(`/api/battleship/games/${state.game.code}/events${suffix}`);
  setConnection("Live");
  const handler = (event) => {
    const game = JSON.parse(event.data);
    const wasOpen = !els.resultBackdrop.hidden;
    adoptGame(game);
    if (game.status === "finished" && !wasOpen && !state.resultShown) showResult(game);
  };
  ["game", "joined", "started", "fleet", "shot", "rematch"].forEach((name) => {
    state.eventSource.addEventListener(name, handler);
  });
  state.eventSource.addEventListener("error", () => {
    setConnection("Reconnecting", true);
  });
}

function setConnection(text, isError = false) {
  els.connectionStatus.textContent = text;
  els.connectionStatus.classList.toggle("is-live", text === "Live");
  els.connectionStatus.classList.toggle("is-error", Boolean(isError));
}

// ----- Placement -----

function resetPlacement() {
  state.placement = { selected: "carrier", horizontal: true, ships: {} };
}

function placedCells() {
  const taken = new Set();
  for (const cells of Object.values(state.placement.ships)) {
    for (const [r, c] of cells) taken.add(cellKey(r, c));
  }
  return taken;
}

function shipCellsFor(row, col, size, horizontal) {
  const cells = [];
  for (let i = 0; i < size; i += 1) {
    cells.push(horizontal ? [row, col + i] : [row + i, col]);
  }
  return cells;
}

function placementIsValid(cells) {
  const taken = placedCells();
  return cells.every(([r, c]) => r >= 0 && r < 10 && c >= 0 && c < 10 && !taken.has(cellKey(r, c)));
}

function selectNextShip() {
  const spec = state.game?.fleetSpec || [];
  const next = spec.find((ship) => !state.placement.ships[ship.name]);
  state.placement.selected = next ? next.name : "";
}

function placeSelectedShip(row, col) {
  const spec = (state.game?.fleetSpec || []).find((s) => s.name === state.placement.selected);
  if (!spec) return;
  const cells = shipCellsFor(row, col, spec.size, state.placement.horizontal);
  if (!placementIsValid(cells)) return;
  state.placement.ships[spec.name] = cells;
  selectNextShip();
  renderPlacement();
}

function randomLayout() {
  const spec = state.game?.fleetSpec || [];
  resetPlacement();
  for (const ship of spec) {
    let placed = false;
    for (let attempt = 0; attempt < 400 && !placed; attempt += 1) {
      const horizontal = Math.random() < 0.5;
      const row = Math.floor(Math.random() * (horizontal ? 10 : 10 - ship.size + 1));
      const col = Math.floor(Math.random() * (horizontal ? 10 - ship.size + 1 : 10));
      const cells = shipCellsFor(row, col, ship.size, horizontal);
      if (placementIsValid(cells)) {
        state.placement.ships[ship.name] = cells;
        placed = true;
      }
    }
  }
  selectNextShip();
  renderPlacement();
}

// ----- Offline duel vs a robot admiral -----
//
// The local duel mirrors the shape of the server's per-player game view so
// every render helper works unchanged: yourFleet / yourShots / incomingShots
// / sunkEnemyShips / log are all maintained in the browser, and the robot's
// fleet lives only in memory here, never on a server.

function loadSoloRecord() {
  try {
    const saved = JSON.parse(localStorage.getItem(SOLO_STORAGE_KEY) || "null");
    if (saved && (saved.wins || saved.losses)) {
      state.soloRecord = { wins: saved.wins || 0, losses: saved.losses || 0 };
      return;
    }
    // One-time carry-over: wins earned on the retired Battleship Solo card
    // count toward the robot-duel record here.
    const legacy = JSON.parse(localStorage.getItem(LEGACY_SOLO_KEY) || "null");
    if (legacy && (legacy.battlesWon || legacy.battlesPlayed)) {
      const wins = legacy.battlesWon || 0;
      state.soloRecord = {
        wins,
        losses: Math.max(0, (legacy.battlesPlayed || 0) - wins),
      };
      persistSoloRecord();
    }
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

function soloDifficulty() {
  const checked = els.soloDiffRow?.querySelector("input[name=soloDiff]:checked");
  return checked ? checked.value : "easy";
}

const SOLO_TIER_NAMES = { easy: "Easy", medium: "Medium", hard: "Hard" };

function soloPlacementGame() {
  return {
    code: "ROBOT",
    round: 1,
    status: "placement",
    fleetSpec: SOLO_FLEET_SPEC,
    yourFleet: null,
    players: [
      { id: "you", name: "You", shipsSunk: 0 },
      { id: "robot", name: "Robot Admiral", shipsSunk: 0 },
    ],
    log: [],
  };
}

function startSoloSetup(event) {
  event.preventDefault();
  if (state.eventSource) state.eventSource.close();
  state.eventSource = null;
  state.streamKey = "";
  state.playerId = "you";
  state.resultShown = false;
  state.recentShotKey = "";
  state.entryMode = "solo";
  state.solo = {
    difficulty: soloDifficulty(),
    robotFleet: [],
    robotShots: new Set(),
    robotQueue: [],
    turnTimer: null,
  };
  state.game = soloPlacementGame();
  resetPlacement();
  els.setupView.hidden = true;
  els.lobbyPanel.hidden = true;
  els.playArea.hidden = false;
  els.resultBackdrop.hidden = true;
  setConnection("Offline duel");
  render();
}

function randomRobotFleet() {
  const fleet = [];
  for (const ship of SOLO_FLEET_SPEC) {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const horizontal = Math.random() < 0.5;
      const row = Math.floor(Math.random() * (horizontal ? 10 : 11 - ship.size));
      const col = Math.floor(Math.random() * (horizontal ? 11 - ship.size : 10));
      const cells = shipCellsFor(row, col, ship.size, horizontal);
      const taken = new Set(fleet.flatMap((placed) => placed.cells.map(([r, c]) => cellKey(r, c))));
      if (cells.every(([r, c]) => r >= 0 && r < 10 && c >= 0 && c < 10 && !taken.has(cellKey(r, c)))) {
        fleet.push({ name: ship.name, cells, hits: new Set() });
        break;
      }
    }
  }
  return fleet;
}

function startSoloBattle() {
  const solo = state.solo;
  state.game = {
    ...soloPlacementGame(),
    status: "active",
    yourTurn: true,
    yourFleet: Object.entries(state.placement.ships).map(([name, cells]) => ({
      name,
      cells,
      hitCells: [],
      sunk: false,
    })),
    yourShots: {},
    incomingShots: [],
    sunkEnemyShips: [],
    opponentFleet: null,
    winnerId: null,
  };
  solo.robotFleet = randomRobotFleet();
  solo.robotShots = new Set();
  solo.robotQueue = [];
  state.game.log.push({ text: "Fleets anchored. You have the first salvo." });
  render();
}

function playerFleetDestroyed() {
  return state.game.yourFleet.every((ship) => ship.sunk);
}

function robotFleetDestroyed() {
  return state.solo.robotFleet.every((ship) => ship.hits.size === ship.cells.length);
}

function soloLog(text) {
  state.game.log.push({ text });
  if (state.game.log.length > 60) state.game.log.shift();
}

function localFire(row, col) {
  const game = state.game;
  const solo = state.solo;
  if (!game || game.status !== "active" || !game.yourTurn) return;
  const key = cellKey(row, col);
  if (game.yourShots[key]) return;

  const hitShip = solo.robotFleet.find((ship) => ship.cells.some(([r, c]) => cellKey(r, c) === key));
  const hit = Boolean(hitShip);
  game.yourShots[key] = { row, col, hit };
  state.recentShotKey = key;
  if (hit) {
    hitShip.hits.add(key);
    const sunk = hitShip.hits.size === hitShip.cells.length;
    if (sunk && !game.sunkEnemyShips.some((ship) => ship.name === hitShip.name)) {
      game.sunkEnemyShips.push({ name: hitShip.name, cells: hitShip.cells });
      game.players.find((p) => p.id === "robot").shipsSunk += 1;
      soloLog(`You sank the robot's ${hitShip.name} at ${cellLabel(row, col)}!`);
      GameHubJuice?.pop(300);
    } else {
      soloLog(`You fire at ${cellLabel(row, col)} — direct hit!`);
      GameHubJuice?.pop(420);
    }
  } else {
    soloLog(`You fire at ${cellLabel(row, col)} — splash, a miss.`);
    GameHubJuice?.drop();
  }
  render();

  if (robotFleetDestroyed()) {
    finishSolo(true);
    return;
  }
  game.yourTurn = false;
  render();
  if (solo.turnTimer) clearTimeout(solo.turnTimer);
  solo.turnTimer = setTimeout(robotFire, 950 + Math.random() * 600);
}

// Robot targeting. Easy sprinkles randomness into pursuit; Medium hunts on
// a checkerboard and walks hit lines; Hard scores every unshot cell by how
// many placements of the surviving fleet could still cover it.
function robotChooseTarget() {
  const solo = state.solo;
  const unshot = [];
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 10; c += 1) {
      const key = cellKey(r, c);
      if (!state.game.yourShots[key]) unshot.push([r, c, key]);
    }
  }
  if (!unshot.length) return [0, 0];

  // Pursuit queue holds neighbors of un-sunk hits, line-extensions first.
  // Medium works the queue; Easy only sniffs at hits via its 45% rule below;
  // Hard's density map already chases un-sunk hits by weight.
  while (solo.robotQueue.length && solo.difficulty === "medium") {
    const candidate = solo.robotQueue.shift();
    if (!state.game.yourShots[candidate]) {
      const [r, c] = candidate.split(",").map(Number);
      return [r, c];
    }
  }

  if (solo.difficulty === "easy") {
    const hitNeighbors = [];
    for (const ship of state.game.yourFleet) {
      for (const [hr, hc] of ship.hitCells) {
        for (const [nr, nc] of [[hr - 1, hc], [hr + 1, hc], [hr, hc - 1], [hr, hc + 1]]) {
          if (nr < 0 || nr > 9 || nc < 0 || nc > 9) continue;
          if (!state.game.yourShots[cellKey(nr, nc)]) hitNeighbors.push([nr, nc]);
        }
      }
    }
    if (hitNeighbors.length && Math.random() < 0.45) {
      return hitNeighbors[Math.floor(Math.random() * hitNeighbors.length)];
    }
    return unshot[Math.floor(Math.random() * unshot.length)].slice(0, 2);
  }

  if (solo.difficulty === "medium") {
    const checker = unshot.filter(([r, c]) => (r + c) % 2 === 0);
    const pool = checker.length ? checker : unshot;
    return pool[Math.floor(Math.random() * pool.length)].slice(0, 2);
  }

  // Hard: probability density over the surviving fleet.
  const sunkKeys = new Set(
    state.game.yourFleet.filter((ship) => ship.sunk).flatMap((ship) => ship.cells.map(([r, c]) => cellKey(r, c)))
  );
  const density = new Float64Array(100);
  const weighPlacement = (cells) => {
    let weight = 1;
    for (const [cr, cc] of cells) {
      const key = cellKey(cr, cc);
      if (sunkKeys.has(key)) return 0;
      const shot = state.game.yourShots[key];
      if (shot && !shot.hit) return 0;
      if (shot?.hit) weight += 5; // placements must cover un-sunk hits
    }
    return weight;
  };
  for (const spec of SOLO_FLEET_SPEC) {
    if (state.game.yourFleet.find((ship) => ship.name === spec.name)?.sunk) continue;
    for (let r = 0; r < 10; r += 1) {
      for (let c = 0; c + spec.size <= 10; c += 1) {
        const cells = shipCellsFor(r, c, spec.size, true);
        const weight = weighPlacement(cells);
        if (!weight) continue;
        for (const [cr, cc] of cells) {
          if (!state.game.yourShots[cellKey(cr, cc)]) density[cr * 10 + cc] += weight;
        }
      }
    }
    for (let r = 0; r + spec.size <= 10; r += 1) {
      for (let c = 0; c < 10; c += 1) {
        const cells = shipCellsFor(r, c, spec.size, false);
        const weight = weighPlacement(cells);
        if (!weight) continue;
        for (const [cr, cc] of cells) {
          if (!state.game.yourShots[cellKey(cr, cc)]) density[cr * 10 + cc] += weight;
        }
      }
    }
  }
  let best = null;
  let bestDensity = -1;
  for (const [r, c] of unshot) {
    const value = density[r * 10 + c] + Math.random() * 0.01;
    if (value > bestDensity) {
      bestDensity = value;
      best = [r, c];
    }
  }
  return best || unshot[Math.floor(Math.random() * unshot.length)].slice(0, 2);
}

function robotFire() {
  const game = state.game;
  const solo = state.solo;
  if (!game || game.status !== "active" || game.yourTurn) return;
  const [row, col] = robotChooseTarget();
  const key = cellKey(row, col);
  solo.robotShots.add(key);
  const hitShip = game.yourFleet.find((ship) => ship.cells.some(([r, c]) => cellKey(r, c) === key));
  const hit = Boolean(hitShip);
  game.incomingShots.push({ row, col, hit });
  let sunk = false;
  if (hit) {
    hitShip.hitCells.push([row, col]);
    sunk = hitShip.hitCells.length === hitShip.cells.length;
    if (sunk) {
      hitShip.sunk = true;
      game.players.find((p) => p.id === "you").shipsSunk += 1;
      soloLog(`The robot sank your ${hitShip.name} at ${cellLabel(row, col)}.`);
      GameHubJuice?.boom();
    } else {
      soloLog(`The robot hits your ${hitShip.name} at ${cellLabel(row, col)}.`);
      GameHubJuice?.boom();
      // Queue line extensions around the new hit for Medium.
      const hitKeys = new Set(game.yourFleet.flatMap((ship) => ship.hitCells.map(([r, c]) => cellKey(r, c))));
      const neighbors = [];
      for (const [nr, nc] of [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]) {
        if (nr < 0 || nr > 9 || nc < 0 || nc > 9) continue;
        const nKey = cellKey(nr, nc);
        if (game.yourShots[nKey]) continue;
        const onLine = [[nr - 1, nc], [nr + 1, nc], [nr, nc - 1], [nr, nc + 1]].some(
          ([lr, lc]) => lr >= 0 && lr <= 9 && lc >= 0 && lc <= 9 && hitKeys.has(cellKey(lr, lc))
        );
        if (onLine) neighbors.unshift(nKey);
        else neighbors.push(nKey);
      }
      solo.robotQueue.push(...neighbors);
    }
  } else {
    soloLog(`The robot fires at ${cellLabel(row, col)} — a miss.`);
    GameHubJuice?.drop();
  }
  render();

  if (playerFleetDestroyed()) {
    finishSolo(false);
    return;
  }
  game.yourTurn = true;
  render();
}

function finishSolo(playerWon) {
  const game = state.game;
  const solo = state.solo;
  game.status = "finished";
  game.yourTurn = false;
  game.winnerId = playerWon ? "you" : "robot";
  // Reveal the rival fleet for the post-battle boards.
  game.opponentFleet = solo.robotFleet.map((ship) => ({ name: ship.name, cells: ship.cells }));
  soloLog(playerWon ? "You win the battle!" : "The robot wins the battle.");
  state.soloRecord[playerWon ? "wins" : "losses"] += 1;
  persistSoloRecord();
  const shotsFired = Object.keys(game.yourShots).length;
  if (playerWon) {
    const chips = solo.difficulty === "hard" ? 8 : solo.difficulty === "medium" ? 5 : 3;
    GameHubProfile?.achieve("battleship-robot-win");
    if (state.soloRecord.wins >= 5) GameHubProfile?.achieve("battleship-robot-5");
    GameHubProfile?.award("battleship", chips,
      `Sank the ${SOLO_TIER_NAMES[solo.difficulty]} robot fleet in ${shotsFired} shots`, state.soloRecord.wins);
    GameHubJuice?.win();
  } else {
    GameHubProfile?.award("battleship", 1, "Went down fighting the robot", state.soloRecord.wins);
    GameHubJuice?.lose();
  }
  render();
  showResult(game);
}

function soloRematch() {
  state.resultShown = false;
  state.recentShotKey = "";
  if (state.solo?.turnTimer) clearTimeout(state.solo.turnTimer);
  resetPlacement();
  state.game = soloPlacementGame();
  els.resultBackdrop.hidden = true;
  render();
}


// ----- Rendering -----

function buildCoords(coordsCols, coordsRows) {
  coordsCols.innerHTML = "";
  coordsRows.innerHTML = "";
  COL_LABELS.forEach((label) => {
    const span = document.createElement("span");
    span.textContent = label;
    coordsCols.append(span);
  });
  for (let r = 0; r < 10; r += 1) {
    const span = document.createElement("span");
    span.textContent = String(r + 1);
    coordsRows.append(span);
  }
}

function makeCell(row, col) {
  const cell = document.createElement("div");
  cell.className = "cell";
  cell.dataset.row = String(row);
  cell.dataset.col = String(col);
  cell.dataset.key = cellKey(row, col);
  return cell;
}

// Hull shaping: ends of a ship get rounded caps, direction decides the class.
function hullClass(cells, index) {
  const horizontal = cells.length < 2 || cells[0][0] === cells[1][0];
  if (cells.length === 1) return "";
  if (index === 0) return horizontal ? "bow-h" : "bow-v";
  if (index === cells.length - 1) return horizontal ? "stern-h" : "stern-v";
  return horizontal ? "mid-h" : "mid-v";
}

function paintShipCell(cell, cells, index) {
  cell.classList.add("ship", hullClass(cells, index));
}

function burstMarker(sunk = false) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.classList.add("burst");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M12 1.6 L14.4 8 L21 6.2 L16.6 11.4 L22 15.4 L15.2 15.8 L15.8 22.6 L12 17 L8.2 22.6 L8.8 15.8 L2 15.4 L7.4 11.4 L3 6.2 L9.6 8 Z"
  );
  if (sunk) path.setAttribute("fill-rule", "evenodd");
  svg.append(path);
  return svg;
}

function renderLobby() {
  const me = currentPlayer();
  const everyone = state.game.players.length === 2;
  els.shareCode.textContent = state.game.code;
  els.factStatus.textContent = "Lobby";
  els.shareTools.hidden = !state.game.youAreHost;
  els.newGameButton.hidden = !state.game.youAreHost;
  els.nameForm.hidden = Boolean(me);
  els.lobbyActions.hidden = !me;
  els.startButton.disabled = !everyone;
  if (!everyone) {
    els.lobbyMessage.textContent = "Waiting for an opponent to join…";
  } else {
    els.lobbyMessage.textContent = "Both admirals aboard. Begin when ready.";
  }
}

function renderPlacement() {
  const game = state.game;
  const me = currentPlayer();
  const myFleetLocked = Boolean(game.yourFleet);
  const opponentReady = game.players.some((p) => p.id !== state.playerId && p.fleetReady);
  els.placementPanel.hidden = false;
  els.battlePanel.hidden = true;

  buildCoords(els.placeCoords, els.placeRows);
  els.placeBoard.innerHTML = "";
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 10; c += 1) {
      const cell = makeCell(r, c);
      const key = cellKey(r, c);
      // Ships already anchored locally or on the server.
      const localEntry = Object.entries(state.placement.ships).find(
        ([, cells]) => cells.some(([rr, cc]) => cellKey(rr, cc) === key)
      );
      if (localEntry) {
        paintShipCell(cell, localEntry[1], localEntry[1].findIndex(([rr, cc]) => cellKey(rr, cc) === key));
      } else if (myFleetLocked) {
        const serverShip = game.yourFleet.find((ship) =>
          ship.cells.some(([rr, cc]) => cellKey(rr, cc) === key)
        );
        if (serverShip) {
          paintShipCell(cell, serverShip.cells, serverShip.cells.findIndex(([rr, cc]) => cellKey(rr, cc) === key));
        }
      }
      if (!myFleetLocked) {
        cell.addEventListener("click", () => placeSelectedShip(r, c));
        cell.addEventListener("mouseenter", () => paintGhost(r, c, true));
        cell.addEventListener("mouseleave", () => paintGhost(r, c, false));
      }
      els.placeBoard.append(cell);
    }
  }

  // Fleet tray
  els.fleetList.innerHTML = "";
  (game.fleetSpec || []).forEach((ship) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "fleet-item";
    const localCells = state.placement.ships[ship.name];
    const locked = myFleetLocked || Boolean(localCells);
    if (ship.name === state.placement.selected && !myFleetLocked) item.classList.add("is-selected");
    if (locked) item.classList.add("is-placed");

    const mini = document.createElement("span");
    mini.className = "ship-mini";
    mini.style.gridTemplateColumns = `repeat(${ship.size}, 12px)`;
    for (let i = 0; i < ship.size; i += 1) {
      const miniCell = document.createElement("span");
      miniCell.className = "mini-cell";
      mini.append(miniCell);
    }
    const name = document.createElement("span");
    name.className = "fleet-item-name";
    name.textContent = ship.name.charAt(0).toUpperCase() + ship.name.slice(1);
    const size = document.createElement("span");
    size.className = "fleet-item-size";
    size.textContent = `${ship.size} cells`;
    item.append(mini, name, size);
    if (!myFleetLocked) {
      item.addEventListener("click", () => {
        delete state.placement.ships[ship.name];
        state.placement.selected = ship.name;
        renderPlacement();
      });
    } else {
      item.disabled = true;
    }
    els.fleetList.append(item);
  });

  const canAnchor = !myFleetLocked && Object.keys(state.placement.ships).length === (game.fleetSpec || []).length;
  els.anchorButton.disabled = !canAnchor;
  els.anchorButton.hidden = myFleetLocked;
  els.rotateButton.disabled = myFleetLocked;
  els.randomButton.disabled = myFleetLocked;
  els.clearButton.disabled = myFleetLocked;
  if (myFleetLocked) {
    els.placementHint.textContent = opponentReady
      ? "All fleets anchored. Opening fire…"
      : `Fleet anchored. Waiting for ${opponentName()}…`;
  } else if (state.placement.selected) {
    els.placementHint.textContent = `Placing the ${state.placement.selected} — ${
      state.placement.horizontal ? "horizontal" : "vertical"
    }. Click your harbor.`;
  } else {
    els.placementHint.textContent = "All five ships placed — anchor when ready.";
  }
}

function paintGhost(row, col, on) {
  const spec = (state.game?.fleetSpec || []).find((s) => s.name === state.placement.selected);
  if (!spec) return;
  const cells = shipCellsFor(row, col, spec.size, state.placement.horizontal);
  const valid = placementIsValid(cells);
  cells.forEach(([r, c]) => {
    if (r < 0 || r >= 10 || c < 0 || c >= 10) return;
    const cell = els.placeBoard.querySelector(`[data-key="${cellKey(r, c)}"]`);
    if (!cell) return;
    cell.classList.toggle("ghost-valid", on && valid);
    cell.classList.toggle("ghost-invalid", on && !valid);
  });
}

function shipCellIndexMap(fleet) {
  // key -> {cells, index, hit}
  const map = new Map();
  (fleet || []).forEach((ship) => {
    const hitSet = new Set((ship.hitCells || []).map(([r, c]) => cellKey(r, c)));
    ship.cells.forEach(([r, c], index) => {
      map.set(cellKey(r, c), { cells: ship.cells, index, hit: hitSet.has(cellKey(r, c)), name: ship.name, sunk: ship.sunk });
    });
  });
  return map;
}

function renderBattle() {
  const game = state.game;
  els.placementPanel.hidden = true;
  els.battlePanel.hidden = false;

  buildCoords(els.ownCoords, els.ownRows);
  buildCoords(els.enemyCoords, els.enemyRows);

  // --- My fleet board ---
  els.ownBoard.innerHTML = "";
  const myShipMap = shipCellIndexMap(game.yourFleet);
  const incoming = new Map((game.incomingShots || []).map((shot) => [cellKey(shot.row, shot.col), shot]));
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 10; c += 1) {
      const key = cellKey(r, c);
      const cell = makeCell(r, c);
      const ship = myShipMap.get(key);
      if (ship) paintShipCell(cell, ship.cells, ship.index);
      const shot = incoming.get(key);
      if (shot) {
        if (shot.hit) {
          cell.classList.add("hit");
          const sunk = ship?.sunk;
          if (sunk) cell.classList.add("sunk");
          cell.append(burstMarker(sunk));
        } else {
          cell.classList.add("miss");
        }
      } else if (ship?.hit) {
        cell.classList.add("hit");
        cell.append(burstMarker(ship.sunk));
      }
      els.ownBoard.append(cell);
    }
  }
  const afloat = (game.players.find((p) => p.id === state.playerId) || {}).shipsSunk;
  els.ownFleetStatus.textContent = `${5 - (afloat || 0)} afloat`;

  // --- Enemy waters ---
  els.enemyTitle.textContent = `${opponentName()}'s waters`;
  els.enemyBoard.innerHTML = "";
  const myTurn = Boolean(game.yourTurn);
  els.enemyBoard.classList.toggle("is-locked", !myTurn);

  const shots = new Map(Object.entries(game.yourShots || {}));
  // Plain array — Map here would break the .find below via Object.values.
  const sunkShips = game.sunkEnemyShips || [];
  const revealed = shipCellIndexMap(game.opponentFleet); // only after game over
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 10; c += 1) {
      const key = cellKey(r, c);
      const cell = makeCell(r, c);
      const shot = shots.get(key);
      const sunkShip = sunkShips.find((ship) =>
        ship.cells.some(([rr, cc]) => cellKey(rr, cc) === key)
      );
      const revealShip = revealed.get(key);
      if (sunkShip) {
        const index = sunkShip.cells.findIndex(([rr, cc]) => cellKey(rr, cc) === key);
        paintShipCell(cell, sunkShip.cells, index);
        cell.classList.add("sunk");
      } else if (revealShip) {
        paintShipCell(cell, revealShip.cells, revealShip.index);
      }
      if (shot) {
        if (shot.hit) {
          cell.classList.add("hit");
          if (sunkShip) cell.classList.add("sunk");
          if (key === state.recentShotKey) cell.classList.add("is-recent");
          cell.append(burstMarker(Boolean(sunkShip)));
        } else {
          cell.classList.add("miss");
        }
      } else if (game.status === "active" && myTurn) {
        cell.classList.add("is-target");
        cell.addEventListener("click", () => fireAt(r, c));
      }
      els.enemyBoard.append(cell);
    }
  }
  // shipsSunk lives on the players list, not on the opponents summary.
  const enemySunk = (game.players.find((p) => p.id !== state.playerId) || {}).shipsSunk || 0;
  els.enemyFleetStatus.textContent = `${5 - enemySunk} afloat`;

  renderLog();
}

function renderLog() {
  const log = state.game.log || [];
  els.battleLog.innerHTML = "";
  [...log].reverse().forEach((entry, index) => {
    const item = document.createElement("li");
    item.textContent = entry.text;
    if (index === 0) item.classList.add("is-newest");
    if (/wins the battle/i.test(entry.text)) item.classList.add("is-win");
    els.battleLog.append(item);
  });
}

function renderHeading() {
  const game = state.game;
  if (game.status === "placement") {
    els.phaseLabel.textContent = `Round ${game.round} · Placement`;
    els.turnBanner.textContent = game.yourFleet ? "Fleet anchored" : "Anchor your fleet";
    els.gameMessage.textContent = game.yourFleet
      ? `Waiting for ${opponentName()} to anchor.`
      : "Hide your five ships, then anchor.";
  } else if (game.status === "active") {
    els.phaseLabel.textContent = `Round ${game.round} · Battle`;
    if (game.yourTurn) {
      els.turnBanner.textContent = "Your turn — fire!";
      els.turnBanner.classList.add("turn-banner-mine");
      els.gameMessage.textContent = "Pick a square in enemy waters.";
    } else {
      els.turnBanner.textContent = `${opponentName()} is aiming…`;
      els.turnBanner.classList.remove("turn-banner-mine");
      els.gameMessage.textContent = "Hold fast and watch the water.";
    }
  } else if (game.status === "finished") {
    els.phaseLabel.textContent = `Round ${game.round} · Over`;
    const iWon = game.winnerId === state.playerId;
    els.turnBanner.textContent = iWon ? "Victory!" : "Defeat";
    els.turnBanner.classList.toggle("turn-banner-mine", iWon);
    els.gameMessage.textContent = iWon
      ? `You sent ${opponentName()}'s whole fleet to the bottom.`
      : `${opponentName()} sank your fleet.`;
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
  if (state.game.status === "placement") {
    renderPlacement();
  } else {
    renderBattle();
  }
}

function showResult(game) {
  state.resultShown = true;
  const iWon = game.winnerId === state.playerId;
  els.resultTitle.textContent = iWon ? "Victory!" : "Defeat";
  els.resultBody.textContent = iWon
    ? `Every ship in ${opponentName()}'s fleet is at the bottom of the sea.`
    : `${opponentName()} has sunk your entire fleet. Round ${game.round} goes to them.`;
  els.resultBackdrop.hidden = false;
}

function showStartMode(mode) {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  if (state.solo?.turnTimer) {
    clearTimeout(state.solo.turnTimer);
  }
  state.game = null;
  state.playerId = "";
  state.streamKey = "";
  state.solo = null;
  state.resultShown = false;
  state.entryMode = mode || "choice";
  resetPlacement();
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
  els.createForm.addEventListener("submit", createGame);
  els.joinForm.addEventListener("submit", joinByCode);
  els.soloForm.addEventListener("submit", startSoloSetup);
  els.showSolo.addEventListener("click", () => showStartMode("solo"));
  els.nameForm.addEventListener("submit", joinBattle);
  els.startButton.addEventListener("click", startPlacement);
  els.anchorButton.addEventListener("click", anchorFleet);
  els.rematchButton.addEventListener("click", rematch);
  els.resultClose.addEventListener("click", () => {
    els.resultBackdrop.hidden = true;
  });
  els.resultBackdrop.addEventListener("click", (event) => {
    if (event.target === els.resultBackdrop) els.resultBackdrop.hidden = true;
  });
  els.rotateButton.addEventListener("click", () => {
    state.placement.horizontal = !state.placement.horizontal;
    renderPlacement();
  });
  els.randomButton.addEventListener("click", randomLayout);
  els.clearButton.addEventListener("click", () => {
    resetPlacement();
    renderPlacement();
  });
  els.copyShare.addEventListener("click", async () => {
    if (!state.game) return;
    const url = new URL(`/battleship/?game=${state.game.code}`, window.location.origin).toString();
    await navigator.clipboard?.writeText(url).catch(() => {});
    setConnection("Copied");
  });
  els.newGameButton.addEventListener("click", () => showStartMode("choice"));
  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "r" && !els.placementPanel.hidden) {
      state.placement.horizontal = !state.placement.horizontal;
      renderPlacement();
    }
  });
}

bindEvents();
loadSoloRecord();
const params = new URLSearchParams(window.location.search);
const gameCode = params.get("game");
if (gameCode) loadGame(gameCode.toUpperCase());
