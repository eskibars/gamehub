// app.js — The Oracle client. The server only ever sends the key map to
// spymasters (and to everyone after the game ends), so this renderer can
// trust its view: whatever colors arrive are colors this player may see.

const STORAGE_PLAYER_KEY = "oracle-player-v1";
const ROLE_LABELS = {
  "red-spymaster": "Red Spymaster",
  "blue-spymaster": "Blue Spymaster",
  "red-operative": "Red Operative",
  "blue-operative": "Blue Operative",
};
const COUNT_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8, "∞"];

const state = {
  game: null,
  playerId: "",
  eventSource: null,
  streamKey: "",
  chosenRole: "",
  chosenCount: 3,
  seenRevealed: [],
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
  connectionStatus: document.querySelector("#connectionStatus"),
  lobbyPanel: document.querySelector("#lobbyPanel"),
  shareTools: document.querySelector("#shareTools"),
  shareCode: document.querySelector("#shareCode"),
  copyShare: document.querySelector("#copyShare"),
  seats: document.querySelector("#seats"),
  seatHint: document.querySelector("#seatHint"),
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
  clueDisplay: document.querySelector("#clueDisplay"),
  clueForm: document.querySelector("#clueForm"),
  clueFormEl: document.querySelector("#clueFormEl"),
  clueWord: document.querySelector("#clueWord"),
  countRow: document.querySelector("#countRow"),
  guessControls: document.querySelector("#guessControls"),
  guessLeftLabel: document.querySelector("#guessLeftLabel"),
  endTurnButton: document.querySelector("#endTurnButton"),
  chipRed: document.querySelector("#chipRed"),
  chipBlue: document.querySelector("#chipBlue"),
  redRemaining: document.querySelector("#redRemaining"),
  blueRemaining: document.querySelector("#blueRemaining"),
  gameLog: document.querySelector("#gameLog"),
  resultBackdrop: document.querySelector("#resultBackdrop"),
  resultTitle: document.querySelector("#resultTitle"),
  resultBody: document.querySelector("#resultBody"),
  resultClose: document.querySelector("#resultClose"),
  rematchButton: document.querySelector("#rematchButton"),
};

let entryControls = null;

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
    /* localStorage unavailable; rejoin manually. */
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

function myTeam() {
  const mine = me();
  return mine ? mine.role.split("-")[0] : null;
}

function myKind() {
  const mine = me();
  return mine ? mine.role.split("-")[1] : null;
}

function rolePlayer(role) {
  return state.game.players.find((p) => p.role === role) || null;
}

// ----- Game flow -----

function adoptGame(game) {
  // Remember which cards are newly revealed for the pop animation.
  state.newlyRevealed = game.revealed
    .map((isRevealed, index) => (isRevealed && !state.seenRevealed[index] ? index : -1))
    .filter((index) => index >= 0);
  state.seenRevealed = [...game.revealed];
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
    const data = await requestJson("/api/oracle/games", { method: "POST" });
    state.playerId = "";
    state.resultShown = false;
    state.seenRevealed = [];
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
    const data = await requestJson(`/api/oracle/games/${code}${suffix}`);
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

async function takeSeat(event) {
  event.preventDefault();
  if (!state.game) return;
  try {
    const data = await requestJson(`/api/oracle/games/${state.game.code}/players`, {
      method: "POST",
      body: JSON.stringify({ name: els.playerName.value, role: state.chosenRole, playerId: state.playerId }),
    });
    state.playerId = data.playerId;
    savePlayerId(state.game.code, state.playerId);
    state.chosenRole = "";
    adoptGame(data.game);
  } catch (error) {
    setConnection(error.message, true);
  }
}

async function startGame() {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/oracle/games/${state.game.code}/start`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId }),
    });
    state.seenRevealed = [];
    adoptGame(data.game);
  } catch (error) {
    setConnection(error.message, true);
  }
}

async function giveClue(event) {
  event.preventDefault();
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/oracle/games/${state.game.code}/clue`, {
      method: "POST",
      body: JSON.stringify({
        playerId: state.playerId,
        word: els.clueWord.value,
        count: state.chosenCount === "∞" ? "infinite" : state.chosenCount,
      }),
    });
    els.clueWord.value = "";
    adoptGame(data.game);
  } catch (error) {
    setConnection(error.message, true);
  }
}

async function guessAt(index) {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/oracle/games/${state.game.code}/guess`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId, index }),
    });
    const finished = data.game.status === "finished";
    adoptGame(data.game);
    if (finished && !state.resultShown) showResult(data.game);
  } catch (error) {
    setConnection(error.message, true);
  }
}

async function endTurn() {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/oracle/games/${state.game.code}/end-turn`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId }),
    });
    adoptGame(data.game);
  } catch (error) {
    setConnection(error.message, true);
  }
}

async function rematch() {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/oracle/games/${state.game.code}/rematch`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId }),
    });
    state.resultShown = false;
    state.seenRevealed = [];
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
  state.eventSource = new EventSource(`/api/oracle/games/${state.game.code}/events${suffix}`);
  setConnection("Live");
  const handler = (event) => {
    const game = JSON.parse(event.data);
    const wasOpen = !els.resultBackdrop.hidden;
    adoptGame(game);
    if (game.status === "finished" && !wasOpen && !state.resultShown) showResult(game);
  };
  ["game", "joined", "started", "clue", "guess", "turn", "rematch"].forEach((name) => {
    state.eventSource.addEventListener(name, handler);
  });
  state.eventSource.addEventListener("error", () => {
    setConnection("Reconnecting", true);
  });
}

// ----- Rendering -----

function renderSeats() {
  const game = state.game;
  els.seats.innerHTML = "";
  for (const role of Object.keys(ROLE_LABELS)) {
    const player = rolePlayer(role);
    const seat = document.createElement("button");
    seat.type = "button";
    seat.className = `seat ${role.split("-")[0]}-team`;
    const taken = Boolean(player);
    seat.classList.add(taken ? "is-taken" : "is-open");
    if (!taken && state.chosenRole === role) seat.classList.add("is-chosen");
    const roleEl = document.createElement("span");
    roleEl.className = "seat-role";
    roleEl.textContent = ROLE_LABELS[role];
    const playerEl = document.createElement("span");
    playerEl.className = "seat-player";
    playerEl.textContent = player ? player.name + (player.id === state.playerId ? " (you)" : "") : "Open seat";
    seat.append(roleEl, playerEl);
    if (!taken && !me()) {
      seat.addEventListener("click", () => {
        state.chosenRole = state.chosenRole === role ? "" : role;
        renderSeats();
      });
    }
    els.seats.append(seat);
  }
}

function renderLobby() {
  const seated = Boolean(me());
  els.shareCode.textContent = state.game.code;
  els.shareTools.hidden = !state.game.youAreHost;
  els.newGameButton.hidden = !state.game.youAreHost;
  renderSeats();
  els.nameForm.hidden = seated;
  const openCount = state.game.openRoles.length;
  if (!openCount) {
    els.lobbyMessage.textContent = "All four seats are filled. Begin when ready.";
  } else {
    els.lobbyMessage.textContent = `Waiting for ${openCount} more ${openCount === 1 ? "seer" : "seers"}…`;
  }
  const allFilled = openCount === 0;
  els.lobbyActions.hidden = !seated;
  els.startButton.disabled = !allFilled;
  els.seatHint.textContent = state.chosenRole
    ? `You will sit as the ${ROLE_LABELS[state.chosenRole]}.`
    : "Pick an open seat above, then take it.";
}

function seesKey() {
  return Boolean(state.game.key);
}

function renderBoard() {
  const game = state.game;
  els.board.classList.toggle("sees-key", seesKey());
  els.board.innerHTML = "";
  const canGuess =
    game.status === "active" &&
    game.phase === "guessing" &&
    game.turnTeam === myTeam() &&
    myKind() === "operative";
  game.words.forEach((word, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    const color = seesKey() ? game.key[index] : null;
    if (game.revealed[index]) {
      card.classList.add("is-revealed", `revealed-${game.key ? game.key[index] : "neutral"}`);
      if (state.newlyRevealed.includes(index)) card.classList.add("pop");
    } else if (color) {
      card.classList.add(`key-${color}`);
    }
    if (canGuess && !game.revealed[index]) card.classList.add("is-playable");
    const wordEl = document.createElement("span");
    wordEl.className = "word";
    wordEl.textContent = word;
    card.append(wordEl);
    if (canGuess && !game.revealed[index]) {
      card.addEventListener("click", () => guessAt(index));
    }
    els.board.append(card);
  });
}

function renderCluePanel() {
  const game = state.game;
  const clue = game.clue;
  if (clue) {
    const countText = clue.count === -1 ? "∞" : String(clue.count);
    els.clueDisplay.innerHTML = "";
    els.clueDisplay.append(`${clue.word} `);
    const small = document.createElement("small");
    small.textContent = `${countText} · ${clue.team} team · ${clue.by}`;
    els.clueDisplay.append(small);
  } else {
    els.clueDisplay.textContent = "Awaiting a clue…";
  }

  const iAmActingSpymaster =
    game.status === "active" &&
    game.phase === "clue" &&
    game.turnTeam === myTeam() &&
    myKind() === "spymaster";
  els.clueForm.hidden = !iAmActingSpymaster;
  if (iAmActingSpymaster) renderCountRow();

  const iAmActingOperative =
    game.status === "active" &&
    game.phase === "guessing" &&
    game.turnTeam === myTeam() &&
    myKind() === "operative";
  els.guessControls.hidden = !iAmActingOperative;
  if (iAmActingOperative) {
    const left = game.guessesLeft >= 99 ? "∞" : String(game.guessesLeft);
    els.guessLeftLabel.textContent = `Guesses left: ${left}`;
  }
}

function renderCountRow() {
  els.countRow.innerHTML = "";
  COUNT_CHOICES.forEach((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "count-option";
    button.textContent = String(choice);
    button.classList.toggle("is-active", state.chosenCount === choice);
    button.addEventListener("click", () => {
      state.chosenCount = choice;
      renderCountRow();
    });
    els.countRow.append(button);
  });
}

function renderTeams() {
  const game = state.game;
  els.redRemaining.textContent = `${game.remaining.red} left`;
  els.blueRemaining.textContent = `${game.remaining.blue} left`;
  els.chipRed.classList.toggle("is-turn", game.status === "active" && game.turnTeam === "red");
  els.chipBlue.classList.toggle("is-turn", game.status === "active" && game.turnTeam === "blue");
}

function renderLog() {
  const log = state.game.log || [];
  els.gameLog.innerHTML = "";
  [...log].reverse().forEach((entry, index) => {
    const item = document.createElement("li");
    item.textContent = entry.text;
    if (index === 0) item.classList.add("is-newest");
    if (/wins!?/i.test(entry.text) || /victory/i.test(entry.text)) item.classList.add("is-win");
    if (/assassin/i.test(entry.text)) item.classList.add("is-assassin");
    els.gameLog.append(item);
  });
}

function renderHeading() {
  const game = state.game;
  const teamName = game.turnTeam ? game.turnTeam.charAt(0).toUpperCase() + game.turnTeam.slice(1) : "";
  if (game.status === "active") {
    if (game.phase === "clue") {
      const iGive = game.turnTeam === myTeam() && myKind() === "spymaster";
      els.phaseLabel.textContent = `Round ${game.round} · ${teamName} spymaster`;
      if (iGive) {
        els.turnBanner.textContent = "Craft your clue";
        els.turnBanner.classList.add("mine");
        els.gameMessage.textContent = "One word, one number — and never a word from the board.";
      } else {
        els.turnBanner.textContent = `${teamName} is divining…`;
        els.turnBanner.classList.remove("mine");
        els.gameMessage.textContent = "The spymaster studies the key.";
      }
    } else {
      const iGuess = game.turnTeam === myTeam() && myKind() === "operative";
      els.phaseLabel.textContent = `Round ${game.round} · ${teamName} operative`;
      if (iGuess) {
        els.turnBanner.textContent = "Your team guesses";
        els.turnBanner.classList.add("mine");
        els.gameMessage.textContent = `Follow the clue "${game.clue ? game.clue.word : ""}". Choose wisely.`;
      } else {
        els.turnBanner.textContent = `${teamName} is guessing`;
        els.turnBanner.classList.remove("mine");
        els.gameMessage.textContent = "Hold your breath.";
      }
    }
  } else if (game.status === "finished") {
    els.phaseLabel.textContent = `Round ${game.round} · Over`;
    const iWon = game.winnerTeam === myTeam();
    if (game.winReason === "assassin") {
      els.turnBanner.textContent = iWon ? "They found the assassin!" : "You found the assassin";
    } else {
      els.turnBanner.textContent = `${game.winnerTeam ? game.winnerTeam.charAt(0).toUpperCase() + game.winnerTeam.slice(1) : ""} wins`;
    }
    els.turnBanner.classList.toggle("mine", iWon);
    els.gameMessage.textContent = "The board is fully revealed.";
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
  renderCluePanel();
  renderTeams();
  renderLog();
}

function showResult(game) {
  state.resultShown = true;
  const iWon = game.winnerTeam === myTeam();
  if (game.winReason === "assassin") {
    els.resultTitle.textContent = iWon ? "The assassin strikes for you" : "The assassin!";
    els.resultBody.textContent = iWon
      ? "The other team touched the assassin. Their visions end — yours begin."
      : "Your operative revealed the assassin. All is lost.";
  } else {
    els.resultTitle.textContent = iWon ? "Victory" : "Defeat";
    els.resultBody.textContent = iWon
      ? "Every one of your team's words has been found."
      : "The opposing team found all of their words first.";
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
  state.chosenRole = "";
  state.seenRevealed = [];
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
  els.createForm.addEventListener("submit", createGame);
  els.joinForm.addEventListener("submit", joinByCode);
  els.nameForm.addEventListener("submit", takeSeat);
  els.startButton.addEventListener("click", startGame);
  els.clueFormEl.addEventListener("submit", giveClue);
  els.endTurnButton.addEventListener("click", endTurn);
  els.rematchButton.addEventListener("click", rematch);
  els.resultClose.addEventListener("click", () => {
    els.resultBackdrop.hidden = true;
  });
  els.resultBackdrop.addEventListener("click", (event) => {
    if (event.target === els.resultBackdrop) els.resultBackdrop.hidden = true;
  });
  els.copyShare.addEventListener("click", async () => {
    if (!state.game) return;
    const url = new URL(`/oracle/?game=${state.game.code}`, window.location.origin).toString();
    await navigator.clipboard?.writeText(url).catch(() => {});
    setConnection("Copied");
  });
  els.newGameButton.addEventListener("click", () => showStartMode("choice"));
}

bindEvents();
const params = new URLSearchParams(window.location.search);
const gameCode = params.get("game");
if (gameCode) loadGame(gameCode.toUpperCase());
