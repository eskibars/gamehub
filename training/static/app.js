// app.js — Training client. Renders the shared SVG map, the train-card
// market, your hand, and destination tickets. The server owns the rules;
// this client only highlights what is currently allowed.

const STORAGE_PLAYER_KEY = "training-player-v1";

const state = {
  game: null,
  playerId: "",
  eventSource: null,
  streamKey: "",
  maps: {},            // mapId -> map data (cities/routes)
  mapList: [],
  chosenMap: "coastline",
  previewMapId: "",
  pendingKeep: [],
  resultShown: false,
};

const els = {
  setupView: document.querySelector("#setupView"),
  choicePanel: document.querySelector("#choicePanel"),
  createForm: document.querySelector("#createForm"),
  creatorName: document.querySelector("#creatorName"),
  joinForm: document.querySelector("#joinForm"),
  showCreate: document.querySelector("#showCreate"),
  showJoin: document.querySelector("#showJoin"),
  joinCode: document.querySelector("#joinCode"),
  mapPicker: document.querySelector("#mapPicker"),
  mapPreview: document.querySelector("#mapPreview"),
  mapPreviewSvg: document.querySelector("#mapPreviewSvg"),
  factMap: document.querySelector("#factMap"),
  factTrains: document.querySelector("#factTrains"),
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
  board: document.querySelector("#board"),
  chipRed: document.querySelector("#chipRed"),
  chipBlue: document.querySelector("#chipBlue"),
  redName: document.querySelector("#redName"),
  blueName: document.querySelector("#blueName"),
  redDetail: document.querySelector("#redDetail"),
  blueDetail: document.querySelector("#blueDetail"),
  redScore: document.querySelector("#redScore"),
  blueScore: document.querySelector("#blueScore"),
  deckPile: document.querySelector("#deckPile"),
  deckCount: document.querySelector("#deckCount"),
  marketSlots: document.querySelector("#marketSlots"),
  handRow: document.querySelector("#handRow"),
  handHint: document.querySelector("#handHint"),
  ticketList: document.querySelector("#ticketList"),
  drawTicketsButton: document.querySelector("#drawTicketsButton"),
  gameLog: document.querySelector("#gameLog"),
  ticketPicker: document.querySelector("#ticketPicker"),
  ticketKeepHint: document.querySelector("#ticketKeepHint"),
  ticketChoice: document.querySelector("#ticketChoice"),
  ticketConfirm: document.querySelector("#ticketConfirm"),
  colorBackdrop: document.querySelector("#colorBackdrop"),
  suitChoice: document.querySelector("#suitChoice"),
  colorCancel: document.querySelector("#colorCancel"),
  resultBackdrop: document.querySelector("#resultBackdrop"),
  resultTitle: document.querySelector("#resultTitle"),
  resultBody: document.querySelector("#resultBody"),
  standings: document.querySelector("#standings"),
  resultClose: document.querySelector("#resultClose"),
  rematchButton: document.querySelector("#rematchButton"),
};

let entryControls = null;
let pendingClaimRoute = null;

// ----- Storage / helpers -----

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
    /* ignore */
  }
}

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

function me() {
  if (!state.game || !state.playerId) return null;
  return state.game.players.find((p) => p.id === state.playerId) || null;
}

function myTurn() {
  return Boolean(state.game?.yourTurn);
}

function canDraw() {
  return myTurn() && state.game.status === "active" && state.game.drawn < 2 && (state.game.pendingTickets?.length || 0) === 0;
}

function canClaim() {
  return myTurn() && state.game.status === "active" && state.game.drawn === 0 && (state.game.pendingTickets?.length || 0) === 0;
}

async function loadMapById(mapId) {
  if (state.maps[mapId]) return state.maps[mapId];
  const data = await requestJson(`/api/training/map?map=${encodeURIComponent(mapId)}`);
  state.maps[mapId] = data;
  return data;
}

async function showMapPreview(mapId) {
  state.previewMapId = mapId;
  try {
    const map = await loadMapById(mapId);
    if (state.previewMapId !== mapId) return; // another map was picked meanwhile
    window.TrainingBoard.render(els.mapPreviewSvg, map, {});
    els.mapPreview.hidden = false;
  } catch {
    els.mapPreview.hidden = true;
  }
}

function suitFill(suit) {
  return window.TrainingBoard.SUIT_FILL[suit] || "#a49c90";
}

function suitStroke(suit) {
  return window.TrainingBoard.SUIT_STROKE[suit] || "#6d665c";
}

// ----- Game flow -----

function adoptGame(game) {
  state.game = game;
  if (game.playerId) {
    state.playerId = game.playerId;
    if (game.code) savePlayerId(game.code, game.playerId);
  }
  try {
    localStorage.setItem("training-last-game", game.code);
  } catch {
    /* ignore */
  }
  els.setupView.hidden = true;
  const streamKey = `${game.code}:${state.playerId}`;
  if (state.streamKey !== streamKey) {
    state.streamKey = streamKey;
    connectEvents();
  }
  // The map fetch may still be in flight on first load; render when it lands.
  if (state.maps[game.mapId]) {
    state.map = state.maps[game.mapId];
    render();
  } else {
    loadMapById(game.mapId).then((map) => {
      if (state.game && state.game.mapId === game.mapId) {
        state.map = map;
        render();
      }
    });
  }
}

async function createGame(event) {
  event.preventDefault();
  const name = els.creatorName.value.trim();
  if (!name) {
    setConnection("Enter your name first", true);
    return;
  }
  try {
    const data = await requestJson("/api/training/games", {
      method: "POST",
      body: JSON.stringify({ map: state.chosenMap }),
    });
    const game = data.game;
    // Seat the creator right away so the opponent can never start without them.
    const joined = await requestJson(`/api/training/games/${game.code}/players`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    state.playerId = joined.playerId;
    savePlayerId(game.code, state.playerId);
    state.resultShown = false;
    adoptGame(joined.game);
  } catch (error) {
    setConnection(error.message, true);
  }
}

async function loadGame(code) {
  if (!code) return;
  const savedPlayerId = loadPlayerId(code);
  const suffix = savedPlayerId ? `?playerId=${encodeURIComponent(savedPlayerId)}` : "";
  try {
    const data = await requestJson(`/api/training/games/${code}${suffix}`);
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

async function joinGame(event) {
  event.preventDefault();
  if (!state.game) return;
  try {
    const data = await requestJson(`/api/training/games/${state.game.code}/players`, {
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
    const data = await requestJson(`/api/training/games/${state.game.code}/start`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId }),
    });
    state.resultShown = false;
    adoptGame(data.game);
  } catch (error) {
    setConnection(error.message, true);
  }
}

async function drawCard(source, index) {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/training/games/${state.game.code}/draw`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId, source, index }),
    });
    adoptGame(data.game);
  } catch (error) {
    setConnection(error.message, true);
  }
}

async function claimRoute(routeId, color) {
  if (!state.game || !state.playerId) return;
  try {
    const body = { playerId: state.playerId, routeId };
    if (color) body.color = color;
    const data = await requestJson(`/api/training/games/${state.game.code}/claim`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    adoptGame(data.game);
    if (data.game.status === "finished" && !state.resultShown) showResult(data.game);
  } catch (error) {
    setConnection(error.message, true);
  }
}

async function surveyTickets() {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/training/games/${state.game.code}/tickets`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId }),
    });
    adoptGame(data.game);
    openTicketModal();
  } catch (error) {
    setConnection(error.message, true);
  }
}

async function keepTickets(ids) {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/training/games/${state.game.code}/keep`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId, keep: ids }),
    });
    state.pendingKeep = [];
    els.ticketPicker.hidden = true;
    adoptGame(data.game);
    if (data.game.status === "finished" && !state.resultShown) showResult(data.game);
  } catch (error) {
    setConnection(error.message, true);
  }
}

async function rematch() {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/training/games/${state.game.code}/rematch`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId }),
    });
    state.resultShown = false;
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
  state.eventSource = new EventSource(`/api/training/games/${state.game.code}/events${suffix}`);
  setConnection("Live");
  const handler = (event) => {
    const game = JSON.parse(event.data);
    // A pre-seat spectator connection can deliver one last spectator-shaped
    // snapshot after we've taken a seat — never let it overwrite real state.
    if (state.playerId && !game.players.some((p) => p.id === state.playerId)) return;
    const wasOpen = !els.resultBackdrop.hidden;
    adoptGame(game);
    if (game.status === "finished" && !wasOpen && !state.resultShown) showResult(game);
  };
  ["game", "joined", "started", "kept", "draw", "claim", "tickets", "rematch"].forEach((name) => {
    state.eventSource.addEventListener(name, handler);
  });
  state.eventSource.addEventListener("error", () => {
    setConnection("Reconnecting", true);
  });
}

// ----- Rendering -----

function renderLobby() {
  const seated = Boolean(me());
  els.shareCode.textContent = state.game.code;
  els.factStatus.textContent = "Lobby";
  els.factMap.textContent = state.game.mapName;
  els.factTrains.textContent = `${state.game.trainsPerPlayer} each`;
  els.shareTools.hidden = !state.game.youAreHost;
  els.newGameButton.hidden = !state.game.youAreHost;
  els.nameForm.hidden = seated;
  const full = state.game.players.length === 2;
  els.lobbyActions.hidden = !seated;
  els.startButton.disabled = !full || !state.game.youAreHost;
  els.lobbyMessage.textContent = !full
    ? "Waiting for an opponent…"
    : state.game.youAreHost
    ? "Both engineers aboard. All set to start."
    : "Both engineers aboard — waiting for the host to start.";
}

function renderPlayers() {
  const game = state.game;
  const byColor = Object.fromEntries(game.players.map((p) => [p.color, p]));
  for (const color of ["red", "blue"]) {
    const player = byColor[color];
    const chip = color === "red" ? els.chipRed : els.chipBlue;
    const nameEl = color === "red" ? els.redName : els.blueName;
    const detailEl = color === "red" ? els.redDetail : els.blueDetail;
    const scoreEl = color === "red" ? els.redScore : els.blueScore;
    if (!player) {
      nameEl.textContent = color === "red" ? "Red" : "Blue";
      detailEl.textContent = "Open seat";
      scoreEl.textContent = "0";
      chip.classList.remove("is-turn");
      continue;
    }
    nameEl.textContent = player.name + (player.id === state.playerId ? " (you)" : "");
    detailEl.textContent = `${player.trains} trains · ${player.handCount} cards · ${player.ticketsDone}/${player.ticketCount} tickets`;
    scoreEl.textContent = String(player.score);
    chip.classList.toggle("is-turn", game.turnId === player.id && game.status !== "lobby" && game.status !== "finished");
  }
}

function renderMarket() {
  const game = state.game;
  els.deckCount.textContent = String(game.deckCount);
  const drawable = canDraw();
  els.deckPile.classList.toggle("is-drawable", drawable);
  els.deckPile.disabled = !drawable;
  els.marketSlots.innerHTML = "";
  if (!game.market.length) {
    const empty = document.createElement("div");
    empty.className = "train-card";
    empty.textContent = "—";
    els.marketSlots.append(empty);
    return;
  }
  game.market.forEach((suit, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "train-card" + (suit === "wild" ? " is-wild" : "");
    card.style.background = suit === "wild" ? "" : suitFill(suit);
    card.style.borderColor = suitStroke(suit);
    card.style.color = ["white", "yellow", "gray"].includes(suit) ? "#3a3532" : "#fffdf7";
    if (suit === "wild") card.textContent = "★";
    card.setAttribute("aria-label", `Draw ${suit} card`);
    if (drawable) {
      card.classList.add("is-drawable");
      card.addEventListener("click", () => drawCard("market", index));
    }
    els.marketSlots.append(card);
  });
}

function renderHand() {
  const game = state.game;
  els.handRow.innerHTML = "";
  if (!me()) return;
  const hand = game.yourHand || {};
  const order = ["red", "orange", "yellow", "green", "blue", "pink", "black", "white", "wild"];
  let total = 0;
  for (const suit of order) {
    const count = hand[suit] || 0;
    total += count;
    if (!count) continue;
    const chip = document.createElement("div");
    chip.className = "train-count" + (suit === "wild" ? " wild" : "");
    chip.style.background = suit === "wild" ? "" : suitFill(suit);
    chip.style.borderColor = suitStroke(suit);
    chip.style.color = ["white", "yellow"].includes(suit) ? "#3a3532" : "#fffdf7";
    chip.textContent = count;
    chip.title = `${count} × ${suit}`;
    els.handRow.append(chip);
  }
  if (!total) {
    const empty = document.createElement("span");
    empty.className = "hint small";
    empty.textContent = "No cards yet.";
    els.handRow.append(empty);
  }
  els.handHint.textContent = `${total} cards · ${game.yourTrains} trains`;
}

function renderTickets() {
  const game = state.game;
  els.ticketList.innerHTML = "";
  if (!me()) return;
  const tickets = game.yourTickets || [];
  if (!tickets.length) {
    const empty = document.createElement("p");
    empty.className = "hint small";
    empty.textContent = "No tickets yet.";
    els.ticketList.append(empty);
  }
  const gameOver = game.status === "finished";
  tickets.forEach((ticket) => {
    const row = document.createElement("div");
    let stateClass = " is-progress";
    if (ticket.complete) stateClass = " is-done";
    else if (gameOver) stateClass = " is-failed";
    row.className = "ticket" + stateClass;
    const state1 = document.createElement("span");
    state1.className = "ticket-state";
    state1.textContent = ticket.complete ? "✓" : (gameOver ? "✗" : "○");
    const route = document.createElement("span");
    route.textContent = `${cityName(ticket.a)} → ${cityName(ticket.b)}`;
    const points = document.createElement("span");
    points.className = "ticket-points";
    let pointsText;
    if (ticket.complete) pointsText = `+${ticket.points}`;
    else if (gameOver) pointsText = `−${ticket.points}`;
    else pointsText = `${ticket.points}`;
    points.textContent = pointsText;
    row.append(state1, route, points);
    els.ticketList.append(row);
  });
  const drawable = myTurn() && state.game.status === "active" && state.game.drawn === 0 && (game.pendingTickets?.length || 0) === 0;
  els.drawTicketsButton.disabled = !drawable;
}

function cityName(cityId) {
  const city = state.map?.cities.find((c) => c.id === cityId);
  return city ? city.name : cityId;
}

function renderBoard() {
  const game = state.game;
  const claimed = Object.fromEntries(
    Object.entries(game.routes || {}).map(([id, color]) => [id, color])
  );
  const clickable = {};
  if (canClaim()) {
    for (const route of state.map.routes) {
      if (claimed[route.id]) continue;
      clickable[route.id] = true;
    }
  }
  window.TrainingBoard.render(els.board, state.map, {
    claimed,
    clickable,
    onRouteClick: (routeId) => onRouteClick(routeId),
  });
}

function onRouteClick(routeId) {
  const route = state.map.routes.find((r) => r.id === routeId);
  if (!route || !canClaim()) return;
  const mine = me();
  if (mine.trains < route.length) {
    setConnection(`You need ${route.length} trains for that line.`, true);
    return;
  }
  if (route.color === "gray") {
    openColorModal(route);
    return;
  }
  claimRoute(routeId);
}

function openColorModal(route) {
  const hand = state.game.yourHand || {};
  const suits = Object.keys(hand).filter(
    (suit) => suit !== "wild" && (hand[suit] || 0) + (hand.wild || 0) >= route.length && hand[suit] > 0
  );
  els.suitChoice.innerHTML = "";
  if (!suits.length) {
    setConnection(`You need ${route.length} cards of one suit (wilds help).`, true);
    return;
  }
  pendingClaimRoute = route.id;
  suits.forEach((suit) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suit-button";
    button.style.background = suitFill(suit);
    button.style.borderColor = suitStroke(suit);
    button.style.color = ["white", "yellow"].includes(suit) ? "#3a3532" : "#fffdf7";
    button.textContent = suit;
    button.addEventListener("click", () => {
      els.colorBackdrop.hidden = true;
      claimRoute(pendingClaimRoute, suit);
      pendingClaimRoute = null;
    });
    els.suitChoice.append(button);
  });
  els.colorBackdrop.hidden = false;
}

function renderLog() {
  const log = state.game.log || [];
  els.gameLog.innerHTML = "";
  [...log].reverse().forEach((entry, index) => {
    const item = document.createElement("li");
    item.textContent = entry.text;
    if (index === 0) item.classList.add("is-newest");
    if (/final round/i.test(entry.text)) item.classList.add("is-final");
    if (/Final whistle/i.test(entry.text)) item.classList.add("is-win");
    els.gameLog.append(item);
  });
}

function renderHeading() {
  const game = state.game;
  if (game.status === "tickets") {
    els.phaseLabel.textContent = `Round ${game.round} · Tickets`;
    els.turnBanner.textContent = "Choose your destinations";
    els.turnBanner.classList.add("mine");
    els.gameMessage.textContent = (game.pendingTickets?.length || 0) > 0
      ? "Pick the routes you swear to complete."
      : "Waiting for your opponent to seal their tickets.";
  } else if (game.status === "active") {
    const final = game.endTriggeredBy ? " · FINAL ROUND" : "";
    if (myTurn()) {
      els.phaseLabel.textContent = `Round ${game.round}${final}`;
      els.turnBanner.textContent = game.drawn === 0 ? "Your turn" : "Your turn — one more draw";
      els.turnBanner.classList.add("mine");
      els.gameMessage.textContent =
        game.drawn === 0
          ? "Draw two cards from the glowing deck or market \u2014 or claim a route."
          : "One more draw (glowing) and your turn passes.";
    } else {
      const opp = game.players.find((p) => p.id === game.turnId);
      els.phaseLabel.textContent = `Round ${game.round}${final}`;
      els.turnBanner.textContent = `${opp?.name || "Opponent"} is moving…`;
      els.turnBanner.classList.remove("mine");
      els.gameMessage.textContent = "Watch the rails.";
    }
  } else if (game.status === "finished") {
    els.phaseLabel.textContent = `Round ${game.round} · Over`;
    const iWon = game.winnerColor === state.game.yourColor;
    const draw1 = !game.winnerColor;
    els.turnBanner.textContent = draw1 ? "A tie!" : iWon ? "You win!" : "You lose";
    els.turnBanner.classList.toggle("mine", iWon || draw1);
    els.gameMessage.textContent = "The final whistle has blown.";
  }
}

function render() {
  if (!state.game) return;
  try {
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
    renderMarket();
    renderHand();
    renderTickets();
    renderLog();
    if ((state.game.pendingTickets?.length || 0) > 0 && els.ticketPicker.hidden) {
      openTicketModal();
    }
  } catch (error) {
    setConnection("Render error: " + error.message, true);
    window.__renderError = error.stack || error.message;
  }
}

function openTicketModal() {
  const minKeep = state.game.status === "tickets" ? 2 : 1;
  els.ticketKeepHint.textContent = `Keep at least ${minKeep}. Unkept tickets return to the deck.`;
  els.ticketChoice.innerHTML = "";
  state.pendingKeep = [];
  const tickets = state.game.pendingTickets || [];
  tickets.forEach((ticket) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "ticket-option";
    option.dataset.id = String(ticket.id);
    const route = document.createElement("span");
    route.textContent = `${cityName(ticket.a)} → ${cityName(ticket.b)}`;
    const points = document.createElement("span");
    points.className = "ticket-points";
    points.textContent = `${ticket.points} pts`;
    option.append(route, points);
    option.addEventListener("click", () => {
      const id = Number(option.dataset.id);
      const at = state.pendingKeep.indexOf(id);
      if (at >= 0) {
        state.pendingKeep.splice(at, 1);
        option.classList.remove("is-chosen");
      } else {
        state.pendingKeep.push(id);
        option.classList.add("is-chosen");
      }
      els.ticketConfirm.disabled = state.pendingKeep.length < minKeep;
    });
    els.ticketChoice.append(option);
  });
  els.ticketConfirm.disabled = true;
  els.ticketPicker.hidden = false;
  els.ticketPicker.scrollIntoView({ behavior: "smooth", block: "center" });
}

function showResult(game) {
  state.resultShown = true;
  const iWon = game.winnerColor === state.game.yourColor;
  if (!game.winnerColor) {
    els.resultTitle.textContent = "A tie!";
    els.resultBody.textContent = "Dead even at the final whistle.";
  } else {
    els.resultTitle.textContent = iWon ? "You win!" : "You lose";
    els.resultBody.textContent = iWon
      ? "Your rail empire outbuilt the competition."
      : "Your opponent's empire reached farther.";
  }
  els.standings.innerHTML = "";
  (game.standings || []).forEach((standing) => {
    const row = document.createElement("div");
    row.className = "standing";
    const head = document.createElement("strong");
    head.textContent = `${standing.name} — ${standing.total} points`;
    row.append(head);
    const lines = document.createElement("div");
    lines.className = "standing-lines";
    lines.textContent = `Routes ${standing.routePoints} · Tickets ${standing.ticketPoints >= 0 ? "+" : ""}${standing.ticketPoints} · ${standing.tickets.filter((t) => t.complete).length}/${standing.tickets.length} completed`;
    row.append(lines);
    standing.tickets.forEach((ticket) => {
      const line = document.createElement("div");
      line.textContent = `${ticket.complete ? "✓" : "✗"} ${cityName(ticket.a)} → ${cityName(ticket.b)} (${ticket.delta >= 0 ? "+" : "−"}${Math.abs(ticket.delta)})`;
      lines.append(line);
    });
    els.standings.append(row);
  });
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
  try {
    localStorage.removeItem("training-last-game");
  } catch {
    /* ignore */
  }
  state.resultShown = false;
  els.setupView.hidden = false;
  els.playArea.hidden = true;
  els.lobbyPanel.hidden = true;
  els.ticketPicker.hidden = true;
  els.colorBackdrop.hidden = true;
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
  els.createForm.addEventListener("submit", createGame);
  els.joinForm.addEventListener("submit", joinByCode);
  els.nameForm.addEventListener("submit", joinGame);
  els.startButton.addEventListener("click", startGame);
  els.deckPile.addEventListener("click", () => drawCard("deck"));
  els.drawTicketsButton.addEventListener("click", surveyTickets);
  els.rematchButton.addEventListener("click", rematch);
  els.ticketConfirm.addEventListener("click", () => keepTickets(state.pendingKeep));
  els.colorCancel.addEventListener("click", () => {
    els.colorBackdrop.hidden = true;
    pendingClaimRoute = null;
  });
  els.colorBackdrop.addEventListener("click", (event) => {
    if (event.target === els.colorBackdrop) {
      els.colorBackdrop.hidden = true;
      pendingClaimRoute = null;
    }
  });
  els.resultClose.addEventListener("click", () => {
    els.resultBackdrop.hidden = true;
  });
  els.resultBackdrop.addEventListener("click", (event) => {
    if (event.target === els.resultBackdrop) els.resultBackdrop.hidden = true;
  });
  els.copyShare.addEventListener("click", async () => {
    if (!state.game) return;
    const url = new URL(`/training/?game=${state.game.code}`, window.location.origin).toString();
    await navigator.clipboard?.writeText(url).catch(() => {});
    setConnection("Copied");
  });
  els.newGameButton.addEventListener("click", () => showStartMode("choice"));
}

function renderMapPicker() {
  els.mapPicker.innerHTML = "";
  state.mapList.forEach((map) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "map-option" + (map.id === state.chosenMap ? " is-active" : "");
    option.setAttribute("aria-pressed", String(map.id === state.chosenMap));
    const name = document.createElement("strong");
    name.textContent = `${map.name} — ${map.cities} cities, ${map.routes} routes`;
    const blurb = document.createElement("span");
    blurb.className = "map-blurb";
    blurb.textContent = map.blurb;
    option.append(name, blurb);
    option.addEventListener("click", () => {
      if (state.chosenMap === map.id) return;
      state.chosenMap = map.id;
      renderMapPicker();
      showMapPreview(map.id);
    });
    els.mapPicker.append(option);
  });
}

async function loadMapList() {
  try {
    const data = await requestJson("/api/training/maps");
    state.mapList = data.maps;
    renderMapPicker();
    showMapPreview(state.chosenMap);
  } catch {
    /* picker stays empty; create still works with the default map */
  }
}

bindEvents();
loadMapList();
const params = new URLSearchParams(window.location.search);
const gameCode = params.get("game") || (() => {
  try {
    return localStorage.getItem("training-last-game") || "";
  } catch {
    return "";
  }
})();
if (gameCode) loadGame(gameCode.toUpperCase());
