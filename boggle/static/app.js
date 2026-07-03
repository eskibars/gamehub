const PLAYER_KEY_PREFIX = "boggle-table-player-";

const state = {
  game: null,
  playerId: "",
  eventSource: null,
  clock: null,
  entryMode: "choice",
};

const els = {
  setupView: document.querySelector("#setupView"),
  choicePanel: document.querySelector("#choicePanel"),
  gameView: document.querySelector("#gameView"),
  createForm: document.querySelector("#createForm"),
  joinByCodeForm: document.querySelector("#joinByCodeForm"),
  showJoin: document.querySelector("#showJoin"),
  showCreate: document.querySelector("#showCreate"),
  boardSize: document.querySelector("#boardSize"),
  timerSeconds: document.querySelector("#timerSeconds"),
  joinCode: document.querySelector("#joinCode"),
  connectionStatus: document.querySelector("#connectionStatus"),
  shareCode: document.querySelector("#shareCode"),
  copyShare: document.querySelector("#copyShare"),
  factBoard: document.querySelector("#factBoard"),
  factTimer: document.querySelector("#factTimer"),
  factStatus: document.querySelector("#factStatus"),
  lobbyPanel: document.querySelector("#lobbyPanel"),
  shareTools: document.querySelector("#shareTools"),
  nameForm: document.querySelector("#nameForm"),
  playerName: document.querySelector("#playerName"),
  lobbyActions: document.querySelector("#lobbyActions"),
  readyButton: document.querySelector("#readyButton"),
  startButton: document.querySelector("#startButton"),
  playersList: document.querySelector("#playersList"),
  timerDisplay: document.querySelector("#timerDisplay"),
  gameMessage: document.querySelector("#gameMessage"),
  boardArea: document.querySelector("#boardArea"),
  letterBoard: document.querySelector("#letterBoard"),
  wordForm: document.querySelector("#wordForm"),
  wordInput: document.querySelector("#wordInput"),
  wordCount: document.querySelector("#wordCount"),
  wordsPanel: document.querySelector("#wordsPanel"),
  wordLists: document.querySelector("#wordLists"),
  newGameButton: document.querySelector("#newGameButton"),
};

let entryControls = null;

function playerStorageKey(code) {
  return `${PLAYER_KEY_PREFIX}${code}`;
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function normalizeWord(word) {
  return word.toUpperCase().replace(/[^A-Z]/g, "");
}

function currentPlayer() {
  if (!state.game || !state.playerId) return null;
  return state.game.players.find((player) => player.id === state.playerId) || null;
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
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function openGame(game, options = {}) {
  state.game = game;
  state.entryMode = options.entryMode || state.entryMode;
  state.playerId = localStorage.getItem(playerStorageKey(game.code)) || state.playerId || "";
  els.setupView.hidden = true;
  els.gameView.hidden = false;
  connectEvents();
  render();
}

async function createGame(event) {
  event.preventDefault();
  try {
    const data = await requestJson("/api/boggle/games", {
      method: "POST",
      body: JSON.stringify({
        size: Number(els.boardSize.value),
        timerSeconds: Number(els.timerSeconds.value),
      }),
    });
    openGame(data.game, { entryMode: "create" });
    els.connectionStatus.textContent = "Created";
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function loadGame(code, options = {}) {
  if (!code) return;
  const savedPlayerId = localStorage.getItem(playerStorageKey(code)) || "";
  const suffix = savedPlayerId ? `?playerId=${encodeURIComponent(savedPlayerId)}` : "";
  try {
    const data = await requestJson(`/api/boggle/games/${code}${suffix}`);
    state.playerId = savedPlayerId;
    openGame(data.game, { entryMode: options.entryMode || "join" });
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function joinByCode(event) {
  event.preventDefault();
  await loadGame(parseShareInput(els.joinCode.value), { entryMode: "join" });
}

async function joinPlayer(event) {
  event.preventDefault();
  if (!state.game) return;
  try {
    const data = await requestJson(`/api/boggle/games/${state.game.code}/players`, {
      method: "POST",
      body: JSON.stringify({ name: els.playerName.value, playerId: state.playerId }),
    });
    state.playerId = data.playerId;
    localStorage.setItem(playerStorageKey(state.game.code), state.playerId);
    state.game = data.game;
    connectEvents();
    render();
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function setReady() {
  const player = currentPlayer();
  if (!state.game || !player) return;
  try {
    const data = await requestJson(`/api/boggle/games/${state.game.code}/players/${state.playerId}/ready`, {
      method: "POST",
      body: JSON.stringify({ ready: !player.ready }),
    });
    state.game = data.game;
    render();
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function startGame() {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/boggle/games/${state.game.code}/start`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId }),
    });
    state.game = data.game;
    render();
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function submitWord(event) {
  event.preventDefault();
  const word = normalizeWord(els.wordInput.value);
  if (!state.game || !state.playerId || !word) return;
  try {
    const data = await requestJson(`/api/boggle/games/${state.game.code}/players/${state.playerId}/words`, {
      method: "POST",
      body: JSON.stringify({ word }),
    });
    state.game = data.game;
    els.wordInput.value = "";
    render();
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function toggleChallenge(targetId, word) {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/boggle/games/${state.game.code}/challenges`, {
      method: "POST",
      body: JSON.stringify({ challengerId: state.playerId, targetId, word }),
    });
    state.game = data.game;
    render();
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

function connectEvents() {
  if (!state.game) return;
  if (state.eventSource) state.eventSource.close();
  const suffix = state.playerId ? `?playerId=${encodeURIComponent(state.playerId)}` : "";
  state.eventSource = new EventSource(`/api/boggle/games/${state.game.code}/events${suffix}`);
  els.connectionStatus.textContent = "Live";
  state.eventSource.addEventListener("game", handleGameEvent);
  state.eventSource.addEventListener("started", handleGameEvent);
  state.eventSource.addEventListener("finished", handleGameEvent);
  state.eventSource.addEventListener("error", () => {
    els.connectionStatus.textContent = "Reconnecting";
  });
}

function handleGameEvent(event) {
  state.game = JSON.parse(event.data);
  render();
}

function renderBoard() {
  els.letterBoard.innerHTML = "";
  const size = state.game.size;
  els.letterBoard.style.setProperty("--board-size", size);
  state.game.board.flat().forEach((letter) => {
    const cell = document.createElement("div");
    cell.className = "letter-cell";
    cell.textContent = letter;
    cell.style.setProperty("--tile-rotation", `${Math.floor(Math.random() * 4) * 90}deg`);
    els.letterBoard.append(cell);
  });
  els.letterBoard.hidden = state.game.status === "lobby";
}

function renderPlayers() {
  els.playersList.innerHTML = "";
  state.game.players.forEach((player) => {
    const row = document.createElement("div");
    row.className = "player-row";
    row.innerHTML = `
      <span>${player.name}${player.id === state.playerId ? " (you)" : ""}</span>
      <strong>${state.game.status === "lobby" ? (player.ready ? "Ready" : "Waiting") : `${player.wordCount} words`}</strong>
    `;
    els.playersList.append(row);
  });
}

function challengeCount(targetId, word) {
  const normalized = normalizeWord(word);
  return state.game.challenges.filter((challenge) => challenge.targetId === targetId && challenge.word === normalized).length;
}

function hasMyChallenge(targetId, word) {
  const normalized = normalizeWord(word);
  return state.game.challenges.some(
    (challenge) => challenge.challengerId === state.playerId && challenge.targetId === targetId && challenge.word === normalized
  );
}

function renderWords() {
  const duplicates = new Set(state.game.duplicateWords || []);
  const player = currentPlayer();
  const ownWords = player?.words || [];
  els.wordCount.textContent = String(ownWords.length);
  els.wordLists.innerHTML = "";

  const playersToShow = state.game.status === "finished" ? state.game.players : state.game.players.filter((item) => item.id === state.playerId);
  playersToShow.forEach((listOwner) => {
    const section = document.createElement("section");
    section.className = "word-list";
    const heading = document.createElement("h3");
    heading.textContent = listOwner.id === state.playerId ? "Your Words" : listOwner.name;
    const list = document.createElement("ul");

    if (!listOwner.words.length) {
      const item = document.createElement("li");
      item.className = "empty";
      item.textContent = state.game.status === "finished" ? "No words submitted" : "Start typing when the board appears";
      list.append(item);
    }

    listOwner.words.forEach((word) => {
      const item = document.createElement("li");
      const normalized = normalizeWord(word);
      item.classList.toggle("duplicate", duplicates.has(normalized));
      const label = document.createElement("span");
      label.textContent = word;
      item.append(label);

      if (state.game.status === "finished" && listOwner.id !== state.playerId) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "challenge-button";
        button.textContent = hasMyChallenge(listOwner.id, word) ? "Challenged" : "Challenge";
        button.addEventListener("click", () => toggleChallenge(listOwner.id, word));
        item.append(button);
      }

      const count = challengeCount(listOwner.id, word);
      if (count) {
        const badge = document.createElement("small");
        badge.textContent = String(count);
        item.append(badge);
      }
      list.append(item);
    });

    section.append(heading, list);
    els.wordLists.append(section);
  });
}

function renderClock() {
  if (state.clock) clearInterval(state.clock);
  const tick = () => {
    if (!state.game || state.game.status !== "active" || !state.game.endsAt) {
      els.timerDisplay.textContent = state.game?.status === "lobby" ? "--:--" : "0:00";
      return;
    }
    els.timerDisplay.textContent = formatTime(state.game.endsAt - Date.now() / 1000);
  };
  tick();
  state.clock = setInterval(tick, 250);
}

function render() {
  if (!state.game) return;
  const player = currentPlayer();
  const isHost = state.playerId && state.playerId === state.game.hostId;
  const canInvite = state.entryMode === "create" || isHost;
  const allReady = state.game.players.length > 0 && state.game.players.every((item) => item.ready);
  const inLobby = state.game.status === "lobby";

  els.shareCode.textContent = state.game.code;
  els.factBoard.textContent = `${state.game.size}x${state.game.size}`;
  els.factTimer.textContent = formatTime(state.game.timerSeconds);
  els.factStatus.textContent = state.game.status[0].toUpperCase() + state.game.status.slice(1);
  els.gameView.classList.toggle("is-lobby", inLobby);
  els.shareTools.hidden = !canInvite;
  els.newGameButton.hidden = !canInvite;
  els.nameForm.hidden = Boolean(player) || !inLobby;
  els.nameForm.querySelector("button").textContent = canInvite ? "Join as Host" : "Join Table";
  els.lobbyActions.hidden = !player || !inLobby;
  els.readyButton.textContent = player?.ready ? "Unready" : "Ready";
  els.startButton.hidden = !isHost;
  els.startButton.disabled = !allReady;
  els.boardArea.hidden = inLobby;
  els.wordsPanel.hidden = inLobby;
  els.wordForm.hidden = state.game.status !== "active" || !player;
  els.wordInput.disabled = state.game.status !== "active" || !player;

  if (inLobby) {
    els.gameMessage.textContent = isHost ? "Start when everyone is ready." : "Waiting for the host.";
  } else if (state.game.status === "active") {
    els.gameMessage.textContent = "Find words. Press Enter to submit.";
  } else {
    els.gameMessage.textContent = "Lists are revealed. Duplicates are crossed out.";
  }

  renderBoard();
  renderPlayers();
  renderWords();
  renderClock();
}

function bindEvents() {
  entryControls = window.GameEntry.setup({
    choicePanel: els.choicePanel,
    createForm: els.createForm,
    joinForm: els.joinByCodeForm,
    showCreate: els.showCreate,
    showJoin: els.showJoin,
    joinInput: els.joinCode,
  });
  els.createForm.addEventListener("submit", createGame);
  els.joinByCodeForm.addEventListener("submit", joinByCode);
  els.nameForm.addEventListener("submit", joinPlayer);
  els.readyButton.addEventListener("click", setReady);
  els.startButton.addEventListener("click", startGame);
  els.wordForm.addEventListener("submit", submitWord);
  els.copyShare.addEventListener("click", async () => {
    const url = new URL(`/boggle/?game=${state.game.code}`, window.location.origin).toString();
    await navigator.clipboard?.writeText(url).catch(() => {});
    els.connectionStatus.textContent = "Copied";
  });
  els.newGameButton.addEventListener("click", () => {
    if (state.eventSource) state.eventSource.close();
    els.setupView.hidden = false;
    els.gameView.hidden = true;
    state.game = null;
    state.playerId = "";
    state.entryMode = "choice";
    els.connectionStatus.textContent = "Ready";
    entryControls.showMode("choice");
  });
}

bindEvents();
const params = new URLSearchParams(window.location.search);
const gameCode = params.get("game");
if (gameCode) loadGame(gameCode.toUpperCase(), { entryMode: "join" });
