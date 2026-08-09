// app.js
// Hangman — local pass-and-play and remote join-code play. The remote flow
// mirrors the other two-player games in the hub: create a table, share a
// code, pick names, ready up, then alternate picking words and guessing
// letters. The local flow runs entirely in the browser with a "hand off"
// overlay to hide the word from the guesser on the same device.

const STORAGE_PLAYER_KEY = "hangman-player-v1";
const STORAGE_LOCAL_KEY = "hangman-local-v1";
const STORAGE_LOCAL_VERSION = 1;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const HANGMAN_PARTS = ["head", "body", "arm-left", "arm-right", "leg-left", "leg-right"];
const HANGMAN_MAX_WRONG = HANGMAN_PARTS.length;
const LOCAL_DEFAULT_NAMES = ["Player 1", "Player 2"];

const state = {
  mode: null, // "local" | "remote"
  game: null,
  playerId: "",
  eventSource: null,
  entryMode: "choice",
  local: null,
  handoff: null, // { from, to, toName }
};

const els = {
  setupView: document.querySelector("#setupView"),
  choicePanel: document.querySelector("#choicePanel"),
  createForm: document.querySelector("#createForm"),
  joinForm: document.querySelector("#joinForm"),
  showLocal: document.querySelector("#showLocal"),
  showCreate: document.querySelector("#showCreate"),
  showJoin: document.querySelector("#showJoin"),
  categoryInput: document.querySelector("#categoryInput"),
  joinCode: document.querySelector("#joinCode"),
  connectionStatus: document.querySelector("#connectionStatus"),
  playArea: document.querySelector("#playArea"),
  opponentLabel: document.querySelector("#opponentLabel"),
  opponentName: document.querySelector("#opponentName"),
  gameMessage: document.querySelector("#gameMessage"),
  roundPill: document.querySelector("#roundPill"),
  categoryPill: document.querySelector("#categoryPill"),
  gallowsSvg: document.querySelector("#gallowsSvg"),
  wordPattern: document.querySelector("#wordPattern"),
  pickerBanner: document.querySelector("#pickerBanner"),
  pickerForm: document.querySelector("#pickerForm"),
  wordInput: document.querySelector("#wordInput"),
  setWordButton: document.querySelector("#setWordButton"),
  alphabet: document.querySelector("#alphabet"),
  scoreList: document.querySelector("#scoreList"),
  historyList: document.querySelector("#historyList"),
  nextPanelLabel: document.querySelector("#nextPanelLabel"),
  nextHint: document.querySelector("#nextHint"),
  nextRoundButton: document.querySelector("#nextRoundButton"),
  newGameButton: document.querySelector("#newGameButton"),
  lobbyPanel: document.querySelector("#lobbyPanel"),
  newGameButtonLobby: document.querySelector("#newGameButtonLobby"),
  shareTools: document.querySelector("#shareTools"),
  shareCode: document.querySelector("#shareCode"),
  copyShare: document.querySelector("#copyShare"),
  factStatus: document.querySelector("#factStatus"),
  factCategory: document.querySelector("#factCategory"),
  nameForm: document.querySelector("#nameForm"),
  playerName: document.querySelector("#playerName"),
  lobbyActions: document.querySelector("#lobbyActions"),
  readyButton: document.querySelector("#readyButton"),
  startButton: document.querySelector("#startButton"),
  lobbyMessage: document.querySelector("#lobbyMessage"),
  resultBanner: document.querySelector("#resultBanner"),
  resultInner: document.querySelector("#resultBanner .result-inner"),
  resultEyebrow: document.querySelector("#resultEyebrow"),
  resultTitle: document.querySelector("#resultTitle"),
  resultBody: document.querySelector("#resultBody"),
};

let entryControls = null;
let handoffOverlay = null;

// ----- Utilities -----
function playerStorageKey(code) {
  return `${STORAGE_PLAYER_KEY}:${code}`;
}

function localStorageKey(version = STORAGE_LOCAL_VERSION) {
  return `${STORAGE_LOCAL_KEY}:${version}`;
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

function loadLocal() {
  try {
    const raw = localStorage.getItem(localStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveLocal(data) {
  try {
    localStorage.setItem(localStorageKey(), JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function clearLocal() {
  try {
    localStorage.removeItem(localStorageKey());
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
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
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

function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function normalizeWord(text) {
  const cleaned = text.replace(/[^A-Za-z\s\-']/g, "").replace(/\s+/g, " ").trim();
  return cleaned.toUpperCase();
}

function lettersIn(word) {
  const set = new Set();
  for (const char of word) if (/[A-Z]/.test(char)) set.add(char);
  return set;
}

function buildPattern(word, guessed) {
  if (!word) return "";
  return word
    .split("")
    .map((char) => {
      if (char === " ") return " ";
      if (char === "-") return "-";
      if (char === "'") return "'";
      return guessed.has(char) ? char : "_";
    })
    .join("");
}

function statusLabel(status) {
  if (status === "lobby") return "Lobby";
  if (status === "active") return "In play";
  if (status === "finished") return "Finished";
  return status || "—";
}

// ----- Mode 1: Local pass-and-play -----
function newLocalGame(playerNames, category) {
  return {
    p1Name: playerNames[0] || LOCAL_DEFAULT_NAMES[0],
    p2Name: playerNames[1] || LOCAL_DEFAULT_NAMES[1],
    category: category || null,
    pickerIndex: 0,
    roundNumber: 1,
    word: null,
    guessed: [],
    wrongCount: 0,
    status: "pending",
    result: null,
    history: [],
    score: { 0: 0, 1: 0 },
    setAt: null,
    finishedAt: null,
  };
}

function localPickerName() {
  return state.local.pickerIndex === 0 ? state.local.p1Name : state.local.p2Name;
}

function localGuesserName() {
  return state.local.pickerIndex === 0 ? state.local.p2Name : state.local.p1Name;
}

function localGuesserIndex() {
  return state.local.pickerIndex === 0 ? 1 : 0;
}

function startLocalGame(payload) {
  const names = (payload.names || []).map((n) => (n || "").trim());
  const p1 = names[0] || LOCAL_DEFAULT_NAMES[0];
  const p2 = names[1] || LOCAL_DEFAULT_NAMES[1];
  const category = (payload.category || "").trim() || null;
  state.mode = "local";
  state.local = newLocalGame([p1, p2], category);
  state.handoff = null;
  saveLocal(state.local);
  els.connectionStatus.textContent = "Local";
  els.setupView.hidden = true;
  els.playArea.hidden = false;
  els.lobbyPanel.hidden = true;
  render();
}

function setLocalWord(rawWord) {
  if (!state.local || state.local.status !== "pending") return;
  const word = normalizeWord(rawWord || "");
  if (!word || !/[A-Z]/.test(word)) {
    els.connectionStatus.textContent = "Enter a word with at least one letter.";
    return;
  }
  state.local.word = word;
  state.local.status = "active";
  state.local.setAt = new Date().toISOString();
  state.handoff = {
    from: state.local.pickerIndex,
    to: localGuesserIndex(),
    toName: localGuesserName(),
  };
  saveLocal(state.local);
  els.connectionStatus.textContent = "Local";
  render();
}

function guessLocalLetter(letter) {
  if (!state.local || state.local.status !== "active") return;
  if (!state.local.word) return;
  if (state.local.guessed.some((g) => g.letter === letter)) return;
  const correct = state.local.word.includes(letter);
  state.local.guessed.push({ letter, correct, at: new Date().toISOString() });
  if (!correct) state.local.wrongCount += 1;
  const correctSet = new Set(state.local.guessed.filter((g) => g.correct).map((g) => g.letter));
  const win = [...lettersIn(state.local.word)].every((l) => correctSet.has(l));
  if (win) {
    state.local.status = "finished";
    state.local.result = "won";
    state.local.finishedAt = new Date().toISOString();
    state.local.score[localGuesserIndex()] = (state.local.score[localGuesserIndex()] || 0) + 1;
    state.local.history.unshift({
      number: state.local.roundNumber,
      word: state.local.word,
      result: "won",
      winnerIndex: localGuesserIndex(),
      wrongCount: state.local.wrongCount,
    });
  } else if (state.local.wrongCount >= HANGMAN_MAX_WRONG) {
    state.local.status = "finished";
    state.local.result = "lost";
    state.local.finishedAt = new Date().toISOString();
    state.local.score[state.local.pickerIndex] = (state.local.score[state.local.pickerIndex] || 0) + 1;
    state.local.history.unshift({
      number: state.local.roundNumber,
      word: state.local.word,
      result: "lost",
      winnerIndex: state.local.pickerIndex,
      wrongCount: state.local.wrongCount,
    });
  }
  if (state.local.history.length > 8) state.local.history = state.local.history.slice(0, 8);
  saveLocal(state.local);
  render();
}

function nextLocalRound() {
  if (!state.local || state.local.status !== "finished") return;
  state.local.roundNumber += 1;
  state.local.pickerIndex = state.local.pickerIndex === 0 ? 1 : 0;
  state.local.word = null;
  state.local.guessed = [];
  state.local.wrongCount = 0;
  state.local.status = "pending";
  state.local.result = null;
  state.local.setAt = null;
  state.local.finishedAt = null;
  // Hand the device to the next picker.
  state.handoff = {
    from: localGuesserIndex(),
    to: state.local.pickerIndex,
    toName: localPickerName(),
  };
  saveLocal(state.local);
  render();
}

function exitToSetup() {
  state.mode = null;
  state.local = null;
  state.handoff = null;
  clearLocal();
  showStartMode("choice");
}

// ----- Mode 2: Remote -----
function adoptGame(game, options = {}) {
  state.game = game;
  state.entryMode = options.entryMode || state.entryMode;
  if (game.playerId) {
    state.playerId = game.playerId;
    if (game.code) savePlayerId(game.code, game.playerId);
  }
  if (state.eventSource) state.eventSource.close();
  state.eventSource = null;
  if (game.code) connectEvents();
  els.setupView.hidden = true;
  render();
}

async function createRemoteGame(event) {
  event.preventDefault();
  const category = els.categoryInput.value.trim();
  try {
    const data = await requestJson("/api/hangman/games", {
      method: "POST",
      body: JSON.stringify({ category }),
    });
    state.playerId = "";
    adoptGame(data.game, { entryMode: "create" });
    els.connectionStatus.textContent = "Lobby";
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function loadRemoteGame(code, options = {}) {
  if (!code) return;
  const savedPlayerId = loadPlayerId(code);
  const suffix = savedPlayerId ? `?playerId=${encodeURIComponent(savedPlayerId)}` : "";
  try {
    const data = await requestJson(`/api/hangman/games/${code}${suffix}`);
    if (savedPlayerId) state.playerId = savedPlayerId;
    adoptGame(data.game, { entryMode: options.entryMode || "join" });
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function joinByCode(event) {
  event.preventDefault();
  const code = parseShareInput(els.joinCode.value);
  if (!code) {
    els.connectionStatus.textContent = "Enter a share link or code";
    return;
  }
  await loadRemoteGame(code, { entryMode: "join" });
}

async function joinTable(event) {
  event.preventDefault();
  if (!state.game) return;
  try {
    const data = await requestJson(`/api/hangman/games/${state.game.code}/players`, {
      method: "POST",
      body: JSON.stringify({ name: els.playerName.value, playerId: state.playerId }),
    });
    state.playerId = data.playerId;
    savePlayerId(state.game.code, state.playerId);
    adoptGame(data.game);
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function setReady() {
  if (!state.game || !state.playerId) return;
  const me = currentPlayer();
  try {
    const data = await requestJson(`/api/hangman/games/${state.game.code}/players/${state.playerId}/ready`, {
      method: "POST",
      body: JSON.stringify({ ready: !me?.ready }),
    });
    adoptGame(data.game);
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function startRemoteGame() {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/hangman/games/${state.game.code}/start`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId }),
    });
    adoptGame(data.game);
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function setRemoteWord() {
  if (!state.game || !state.playerId) return;
  const word = normalizeWord(els.wordInput.value);
  if (!word) {
    els.connectionStatus.textContent = "Enter a word with at least one letter.";
    return;
  }
  if (!/[A-Z]/.test(word)) {
    els.connectionStatus.textContent = "Word must include at least one letter.";
    return;
  }
  try {
    const data = await requestJson(`/api/hangman/games/${state.game.code}/rounds`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId, word }),
    });
    els.wordInput.value = "";
    adoptGame(data.game);
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function guessRemoteLetter(letter) {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/hangman/games/${state.game.code}/guess`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId, letter }),
    });
    adoptGame(data.game);
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function requestNextRound() {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/hangman/games/${state.game.code}/next`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId }),
    });
    adoptGame(data.game);
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

function connectEvents() {
  if (!state.game) return;
  if (state.eventSource) state.eventSource.close();
  const suffix = state.playerId ? `?playerId=${encodeURIComponent(state.playerId)}` : "";
  state.eventSource = new EventSource(`/api/hangman/games/${state.game.code}/events${suffix}`);
  els.connectionStatus.textContent = "Live";
  const handler = (event) => {
    const game = JSON.parse(event.data);
    adoptGame(game);
  };
  ["game", "joined", "started", "round", "guess"].forEach((name) => {
    state.eventSource.addEventListener(name, handler);
  });
  state.eventSource.addEventListener("error", () => {
    els.connectionStatus.textContent = "Reconnecting";
  });
}

function currentPlayer() {
  if (!state.game || !state.playerId) return null;
  return state.game.players.find((p) => p.id === state.playerId) || null;
}

function youAreHost() {
  if (!state.game || !state.playerId) return false;
  return Boolean(state.game.youAreHost);
}

function opponentName() {
  if (state.mode === "local") {
    if (!state.local) return "Opponent";
    return state.local.pickerIndex === 0 ? state.local.p2Name : state.local.p1Name;
  }
  if (!state.game || !state.game.opponents || !state.game.opponents.length) return "Opponent";
  return state.game.opponents[0].name;
}

function pickerName() {
  if (state.mode === "local") {
    return state.local ? localPickerName() : "Picker";
  }
  if (!state.game) return "Picker";
  const picker = state.game.players.find((p) => p.id === state.game.pickerId);
  return picker ? picker.name : "Picker";
}

// ----- Rendering -----
function renderGallows(wrongCount) {
  if (!els.gallowsSvg) return;
  const parts = els.gallowsSvg.querySelectorAll(".hangman-part");
  parts.forEach((part) => {
    const index = HANGMAN_PARTS.indexOf(part.dataset.part);
    if (index >= 0 && index < wrongCount) {
      part.style.display = "";
    } else {
      part.style.display = "none";
    }
  });
  els.gallowsSvg.classList.toggle("is-game-over", wrongCount >= HANGMAN_MAX_WRONG);
}

function renderAlphabet(guessedEntries, disabled) {
  els.alphabet.innerHTML = "";
  const guessedMap = new Map();
  for (const entry of guessedEntries || []) {
    guessedMap.set(entry.letter, entry);
  }
  ALPHABET.forEach((letter) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "letter";
    btn.textContent = letter;
    btn.dataset.letter = letter;
    if (guessedMap.has(letter)) {
      const entry = guessedMap.get(letter);
      btn.classList.add(entry.correct ? "is-correct" : "is-wrong");
      btn.disabled = true;
    } else if (disabled) {
      btn.disabled = true;
    }
    btn.addEventListener("click", () => onLetterClick(letter));
    els.alphabet.append(btn);
  });
  els.alphabet.classList.toggle("is-watching", disabled);
}

function onLetterClick(letter) {
  if (state.mode === "local") {
    guessLocalLetter(letter);
  } else if (state.mode === "remote") {
    guessRemoteLetter(letter);
  }
}

function renderWordPattern(pattern, word, reveal) {
  els.wordPattern.classList.toggle("is-revealed", Boolean(reveal));
  els.wordPattern.innerHTML = "";
  const source = reveal && word ? word : pattern;
  if (!source) {
    const placeholder = "_".repeat(8).split("").join(" ");
    els.wordPattern.textContent = placeholder;
    return;
  }
  for (const char of source) {
    const span = document.createElement("span");
    if (char === " ") {
      span.className = "slot is-space";
      span.innerHTML = "&nbsp;";
    } else if (char === "-" || char === "'") {
      span.className = "slot";
      span.textContent = char;
    } else if (char === "_") {
      span.className = "slot";
      span.textContent = "_";
    } else {
      span.className = "slot";
      span.textContent = char;
    }
    els.wordPattern.append(span);
  }
}

function renderScore() {
  els.scoreList.innerHTML = "";
  if (state.mode === "local") {
    if (!state.local) return;
    [
      { name: state.local.p1Name, score: state.local.score[0] || 0 },
      { name: state.local.p2Name, score: state.local.score[1] || 0 },
    ].forEach((row) => {
      const div = document.createElement("div");
      div.className = "score-row";
      const name = document.createElement("span");
      name.className = "player-name";
      name.textContent = row.name;
      const score = document.createElement("span");
      score.className = "player-score";
      score.textContent = String(row.score);
      div.append(name, score);
      els.scoreList.append(div);
    });
    return;
  }
  if (!state.game) return;
  state.game.players.forEach((player) => {
    const row = document.createElement("div");
    row.className = "score-row";
    if (player.id === state.playerId) row.classList.add("is-me");
    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = player.name;
    const score = document.createElement("span");
    score.className = "player-score";
    score.textContent = String((state.game.score && state.game.score[player.id]) || 0);
    row.append(name, score);
    els.scoreList.append(row);
  });
}

function renderHistory() {
  els.historyList.innerHTML = "";
  const history = state.mode === "local"
    ? state.local?.history || []
    : state.game?.history || [];
  if (!history.length) {
    const li = document.createElement("li");
    li.className = "history-empty";
    li.textContent = "No rounds yet.";
    els.historyList.append(li);
    return;
  }
  history.slice(0, 8).forEach((entry) => {
    const li = document.createElement("li");
    const tag = document.createElement("span");
    tag.className = "round-tag";
    tag.textContent = `R${entry.number}`;
    const word = document.createElement("span");
    word.className = "word";
    word.textContent = entry.word;
    const verdict = document.createElement("span");
    verdict.className = `verdict ${entry.result}`;
    verdict.textContent = entry.result === "won" ? "Guessed" : "Missed";
    li.append(tag, word, verdict);
    els.historyList.append(li);
  });
}

function renderRoundPill(roundNumber) {
  els.roundPill.textContent = `Round ${roundNumber || 1}`;
}

function renderCategoryPill(category) {
  if (category) {
    els.categoryPill.textContent = category;
    els.categoryPill.hidden = false;
  } else {
    els.categoryPill.hidden = true;
  }
}

function hideResultBanner() {
  els.resultBanner.hidden = true;
  els.resultInner.classList.remove("is-won");
}

function renderResultBanner(roundData) {
  if (!roundData || roundData.status !== "finished") {
    hideResultBanner();
    return;
  }
  els.resultEyebrow.textContent = `Round ${roundData.number}`;
  const word = roundData.word || "";
  const wrongCount = roundData.wrongCount || 0;
  const maxWrong = roundData.maxWrong || HANGMAN_MAX_WRONG;
  const localWon = computeLocalIWon(roundData);
  const remoteWon = computeRemoteIWon(roundData);
  const isLocalWin = state.mode === "local" && roundData.result === "won";
  const isRemoteWin = state.mode === "remote" && remoteWon && roundData.result === "won";
  const isRemoteStumped = state.mode === "remote" && remoteWon && roundData.result === "lost";
  let title;
  if (roundData.result === "won") {
    title = isLocalWin || isRemoteWin ? "You won!" : "Guesser won";
  } else {
    title = isRemoteStumped ? "You stumped them" : "You lost";
  }
  els.resultTitle.textContent = title;
  els.resultBody.innerHTML = "";
  els.resultBody.append(document.createTextNode("The word was "));
  const reveal = document.createElement("span");
  reveal.className = "reveal";
  reveal.textContent = word;
  els.resultBody.append(reveal);
  els.resultBody.appendChild(
    document.createTextNode(`. ${wrongCount} wrong guess${wrongCount === 1 ? "" : "es"} of ${maxWrong}.`)
  );
  els.resultInner.classList.toggle("is-won", isLocalWin || isRemoteWin);
  els.resultBanner.hidden = false;
}

function computeLocalIWon(_roundData) {
  // Local mode runs on a single device, so we just say "you won/lost" — both
  // players are present. The banner wording is informational.
  return true;
}

function computeRemoteIWon(roundData) {
  if (state.mode !== "remote") return false;
  if (!state.game || !state.playerId) return false;
  if (roundData.result === "won") {
    return state.playerId !== roundData.pickerId;
  }
  return state.playerId === roundData.pickerId;
}

function renderLocalPlayArea() {
  const local = state.local;
  if (!local) return;
  renderRoundPill(local.roundNumber);
  renderCategoryPill(local.category);
  els.opponentLabel.textContent = local.status === "pending" ? "Guesser" : "Picker";
  els.opponentName.textContent = local.status === "pending" ? localGuesserName() : localPickerName();

  if (local.status === "pending") {
    els.gameMessage.textContent = `${localPickerName()}, type a word for ${localGuesserName()}.`;
    els.pickerBanner.hidden = true;
    els.pickerForm.hidden = false;
    els.wordInput.value = "";
    els.wordInput.placeholder = `A word for ${localGuesserName()}`;
    renderWordPattern("", null, false);
    renderAlphabet([], true);
    renderGallows(0);
    els.nextRoundButton.disabled = true;
    els.nextPanelLabel.textContent = "Next round";
    els.nextHint.textContent = "Set the word to begin this round.";
  } else if (local.status === "active") {
    const remaining = HANGMAN_MAX_WRONG - local.wrongCount;
    els.gameMessage.textContent = `${localGuesserName()}, guess the word! ${remaining} wrong guess${remaining === 1 ? "" : "es"} left.`;
    els.pickerBanner.hidden = true;
    els.pickerForm.hidden = true;
    const guessedSet = new Set(local.guessed.filter((g) => g.correct).map((g) => g.letter));
    renderWordPattern(buildPattern(local.word, guessedSet), null, false);
    renderAlphabet(local.guessed, false);
    renderGallows(local.wrongCount);
    els.nextRoundButton.disabled = true;
    els.nextPanelLabel.textContent = "Round in play";
    els.nextHint.textContent = "Click letters above. The word appears as you guess.";
  } else if (local.status === "finished") {
    els.gameMessage.textContent = local.result === "won"
      ? `${localGuesserName()} guessed it!`
      : `${localPickerName()} stumped ${localGuesserName()}.`;
    els.pickerBanner.hidden = true;
    els.pickerForm.hidden = true;
    renderWordPattern(buildPattern(local.word, lettersIn(local.word)), local.word, true);
    renderAlphabet(local.guessed, true);
    renderGallows(local.wrongCount);
    els.nextRoundButton.disabled = false;
    const nextPicker = state.local.pickerIndex === 0 ? state.local.p2Name : state.local.p1Name;
    els.nextPanelLabel.textContent = "Pass the device";
    els.nextHint.textContent = `Hand to ${nextPicker} to pick the next word.`;
    renderResultBanner({
      number: local.roundNumber,
      status: "finished",
      result: local.result,
      word: local.word,
      guessed: local.guessed,
      wrongCount: local.wrongCount,
      maxWrong: HANGMAN_MAX_WRONG,
    });
  }
  renderScore();
  renderHistory();
  renderHandoff();
}

function renderRemotePlayArea() {
  const game = state.game;
  if (!game) return;
  renderRoundPill(game.roundNumber || 1);
  renderCategoryPill(game.category);
  els.opponentLabel.textContent = "Opponent";
  els.opponentName.textContent = opponentName();

  const roundData = game.currentRound;
  const inLobby = game.status === "lobby";
  els.playArea.hidden = inLobby;
  els.lobbyPanel.hidden = !inLobby;
  if (inLobby) {
    renderLobby();
    return;
  }
  if (!roundData) return;

  const isPicker = Boolean(game.youArePicker);

  if (roundData.status === "pending") {
    if (isPicker) {
      els.gameMessage.textContent = `You're picking a word for ${opponentName()}.`;
      els.pickerBanner.hidden = false;
      els.pickerForm.hidden = false;
      els.wordInput.value = "";
      els.wordInput.placeholder = "A word or short phrase";
    } else {
      els.gameMessage.textContent = `Waiting for ${pickerName()} to choose a word…`;
      els.pickerBanner.hidden = true;
      els.pickerForm.hidden = true;
    }
    renderWordPattern("", null, false);
    renderAlphabet([], !isPicker);
    renderGallows(0);
    els.nextRoundButton.disabled = true;
    els.nextPanelLabel.textContent = "Next round";
    els.nextHint.textContent = "Picker enters the word to begin.";
  } else if (roundData.status === "active") {
    if (isPicker) {
      els.gameMessage.textContent = `${opponentName()} is guessing. You're watching.`;
      els.pickerBanner.hidden = true;
      els.pickerForm.hidden = true;
      const guessedSet = new Set(roundData.guessed.filter((g) => g.correct).map((g) => g.letter));
      renderWordPattern(buildPattern(roundData.word || "", guessedSet), null, false);
      renderAlphabet(roundData.guessed, true);
    } else {
      const remaining = HANGMAN_MAX_WRONG - roundData.wrongCount;
      els.gameMessage.textContent = `Your turn to guess! ${remaining} wrong guess${remaining === 1 ? "" : "es"} left.`;
      els.pickerBanner.hidden = true;
      els.pickerForm.hidden = true;
      const guessedSet = new Set(roundData.guessed.filter((g) => g.correct).map((g) => g.letter));
      renderWordPattern(buildPattern(roundData.word || "", guessedSet), null, false);
      renderAlphabet(roundData.guessed, false);
    }
    renderGallows(roundData.wrongCount);
    els.nextRoundButton.disabled = true;
    els.nextPanelLabel.textContent = "Round in play";
    els.nextHint.textContent = "Click letters above to guess.";
  } else if (roundData.status === "finished") {
    if (isPicker) {
      els.gameMessage.textContent = roundData.result === "won"
        ? `${opponentName()} guessed your word.`
        : `${opponentName()} couldn't guess it.`;
    } else {
      els.gameMessage.textContent = roundData.result === "won"
        ? `You guessed the word!`
        : `Out of guesses. The word was ${roundData.word || ""}.`;
    }
    els.pickerBanner.hidden = true;
    els.pickerForm.hidden = true;
    const guessedSet = new Set(roundData.guessed.filter((g) => g.correct).map((g) => g.letter));
    renderWordPattern(buildPattern(roundData.word || "", guessedSet), roundData.word, true);
    renderAlphabet(roundData.guessed, true);
    renderGallows(roundData.wrongCount);
    els.nextRoundButton.disabled = !game.youCanPickNext;
    els.nextPanelLabel.textContent = "Next round";
    if (game.youCanPickNext) {
      els.nextHint.textContent = "You're the next picker. Set the next word when you're ready.";
    } else {
      els.nextHint.textContent = `Waiting for ${pickerName()} to set the next word.`;
    }
    renderResultBanner({
      number: roundData.number,
      status: "finished",
      result: roundData.result,
      word: roundData.word,
      guessed: roundData.guessed,
      wrongCount: roundData.wrongCount,
      maxWrong: roundData.maxWrong || HANGMAN_MAX_WRONG,
      pickerId: roundData.pickerId,
    });
  }
  renderScore();
  renderHistory();
}

function renderLobby() {
  if (!state.game) return;
  const me = currentPlayer();
  const allReady = state.game.players.length === 2 && state.game.players.every((p) => p.ready);
  const inLobby = state.game.status === "lobby";
  els.shareCode.textContent = state.game.code;
  els.factStatus.textContent = statusLabel(state.game.status);
  els.factCategory.textContent = state.game.category || "None";
  els.shareTools.hidden = !youAreHost();
  els.newGameButtonLobby.hidden = !youAreHost();
  els.nameForm.hidden = Boolean(me) || !inLobby;
  els.lobbyActions.hidden = !me || !inLobby;
  els.readyButton.textContent = me?.ready ? "Unready" : "Ready";
  els.startButton.disabled = !allReady;
  if (state.game.players.length < 2) {
    els.lobbyMessage.textContent = "Waiting for an opponent to join…";
  } else if (!allReady) {
    els.lobbyMessage.textContent = "Both players need to mark themselves ready.";
  } else {
    els.lobbyMessage.textContent = "Everyone is ready. Either player can start.";
  }
}

function renderHandoff() {
  if (!state.handoff) {
    if (handoffOverlay) {
      handoffOverlay.remove();
      handoffOverlay = null;
    }
    return;
  }
  if (!handoffOverlay) {
    handoffOverlay = document.createElement("div");
    handoffOverlay.className = "modal-backdrop";
    handoffOverlay.id = "handoffOverlay";
    document.body.append(handoffOverlay);
  }
  handoffOverlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="handoffTitle">
      <p class="eyebrow">Pass the device</p>
      <h2 id="handoffTitle">Hand to ${esc(state.handoff.toName)}</h2>
      <p>The other player should look away until they're ready to take over.</p>
      <button class="primary-button" id="handoffContinue" type="button">I'm ${esc(state.handoff.toName)}, continue</button>
    </div>
  `;
  handoffOverlay.querySelector("#handoffContinue").addEventListener("click", () => {
    state.handoff = null;
    render();
  });
}

function render() {
  if (state.mode === "local") {
    els.lobbyPanel.hidden = true;
    els.playArea.hidden = false;
    renderLocalPlayArea();
  } else if (state.mode === "remote") {
    if (!state.game) return;
    const inLobby = state.game.status === "lobby";
    els.playArea.hidden = inLobby;
    els.lobbyPanel.hidden = !inLobby;
    if (inLobby) {
      renderLobby();
    } else {
      renderRemotePlayArea();
    }
  } else {
    els.playArea.hidden = true;
    els.lobbyPanel.hidden = true;
    hideResultBanner();
    if (handoffOverlay) {
      handoffOverlay.remove();
      handoffOverlay = null;
    }
  }
}

// ----- Lifecycle -----
function showStartMode(mode) {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  state.game = null;
  state.mode = null;
  state.local = null;
  state.playerId = "";
  state.handoff = null;
  state.entryMode = mode;
  els.setupView.hidden = false;
  els.playArea.hidden = true;
  els.lobbyPanel.hidden = true;
  hideResultBanner();
  if (handoffOverlay) {
    handoffOverlay.remove();
    handoffOverlay = null;
  }
  if (entryControls) entryControls.showMode(mode);
  els.connectionStatus.textContent = "Ready";
}

function buildLocalSetupPanel() {
  let localForm = document.querySelector("#localForm");
  if (localForm) return localForm;
  localForm = document.createElement("form");
  localForm.className = "entry-panel";
  localForm.id = "localForm";
  localForm.hidden = true;
  localForm.innerHTML = `
    <div class="section-heading">
      <h2>Pass &amp; Play</h2>
    </div>
    <p class="hint">Two players share this device. Player 1 picks a word, then hands the device to Player 2. The picker rotates after every round.</p>
    <label class="field">
      <span>Player 1 name</span>
      <input id="localP1" type="text" maxlength="24" autocomplete="off" placeholder="Player 1">
    </label>
    <label class="field">
      <span>Player 2 name</span>
      <input id="localP2" type="text" maxlength="24" autocomplete="off" placeholder="Player 2">
    </label>
    <label class="field">
      <span>Category (optional)</span>
      <input id="localCategory" type="text" maxlength="48" autocomplete="off" placeholder="Movies, animals, places…">
    </label>
    <button class="primary-button" type="submit">Start Local Game</button>
  `;
  document.querySelector("#setupView").append(localForm);
  localForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const p1 = document.querySelector("#localP1").value.trim() || LOCAL_DEFAULT_NAMES[0];
    const p2 = document.querySelector("#localP2").value.trim() || LOCAL_DEFAULT_NAMES[1];
    const category = document.querySelector("#localCategory").value.trim();
    startLocalGame({ names: [p1, p2], category });
  });
  return localForm;
}

function bindEvents() {
  const localForm = buildLocalSetupPanel();
  entryControls = window.GameEntry.setup({
    choicePanel: els.choicePanel,
    createForm: els.createForm,
    joinForm: els.joinForm,
    showCreate: els.showCreate,
    showJoin: els.showJoin,
    joinInput: els.joinCode,
    initialMode: "choice",
    onModeChange: () => {
      // Whenever the user moves into a remote mode, hide the local form.
      localForm.hidden = true;
    },
  });
  els.showLocal.addEventListener("click", () => {
    els.choicePanel.hidden = true;
    els.createForm.hidden = true;
    els.joinForm.hidden = true;
    localForm.hidden = false;
  });
  els.createForm.addEventListener("submit", createRemoteGame);
  els.joinForm.addEventListener("submit", joinByCode);
  els.nameForm.addEventListener("submit", joinTable);
  els.readyButton.addEventListener("click", setReady);
  els.startButton.addEventListener("click", startRemoteGame);
  els.setWordButton.addEventListener("click", () => {
    if (state.mode === "local") {
      setLocalWord(els.wordInput.value);
    } else {
      setRemoteWord();
    }
  });
  els.wordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (state.mode === "local") {
        setLocalWord(els.wordInput.value);
      } else {
        setRemoteWord();
      }
    }
  });
  els.nextRoundButton.addEventListener("click", () => {
    if (state.mode === "local") {
      nextLocalRound();
    } else {
      requestNextRound();
    }
  });
  els.newGameButton.addEventListener("click", () => showStartMode("choice"));
  els.newGameButtonLobby.addEventListener("click", () => showStartMode("choice"));
  els.copyShare.addEventListener("click", async () => {
    if (!state.game) return;
    const url = new URL(`/hangman/?game=${state.game.code}`, window.location.origin).toString();
    await navigator.clipboard?.writeText(url).catch(() => {});
    els.connectionStatus.textContent = "Copied";
  });
  els.resultBanner.addEventListener("click", () => {
    hideResultBanner();
  });
}

bindEvents();

// Deep-link: /hangman/?game=ABCD opens the remote game straight into the lobby.
const params = new URLSearchParams(window.location.search);
const gameCode = params.get("game");
if (gameCode) {
  loadRemoteGame(gameCode.toUpperCase(), { entryMode: "join" });
}
