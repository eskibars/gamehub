// app.js
// Main client for "Who Am I?". Talks to the Flask server through the REST
// API and an SSE stream, holds the local board state (which cards are
// flipped down) and renders the lobby, board, chat, and question panel.

const STORAGE_PLAYER_KEY = "whoami-player-v1";
const STORAGE_FLIPPED_KEY = "whoami-flipped-v1";
const FLIP_STORAGE_VERSION = 1;

const state = {
  game: null,
  playerId: "",
  pool: [],
  eliminated: new Set(),
  guessedThisRound: false,
  lastQuestionId: null,
  eventSource: null,
  entryMode: "choice",
  showReveal: false,
  pendingGuessIndex: null,
  guessMode: false,
};

const els = {
  setupView: document.querySelector("#setupView"),
  choicePanel: document.querySelector("#choicePanel"),
  gameView: document.querySelector("#gameView"),
  createForm: document.querySelector("#createForm"),
  joinForm: document.querySelector("#joinForm"),
  showJoin: document.querySelector("#showJoin"),
  showCreate: document.querySelector("#showCreate"),
  joinCode: document.querySelector("#joinCode"),
  connectionStatus: document.querySelector("#connectionStatus"),
  lobbyPanel: document.querySelector("#lobbyPanel"),
  shareTools: document.querySelector("#shareTools"),
  shareCode: document.querySelector("#shareCode"),
  copyShare: document.querySelector("#copyShare"),
  factStatus: document.querySelector("#factStatus"),
  factPool: document.querySelector("#factPool"),
  nameForm: document.querySelector("#nameForm"),
  playerName: document.querySelector("#playerName"),
  lobbyActions: document.querySelector("#lobbyActions"),
  readyButton: document.querySelector("#readyButton"),
  startButton: document.querySelector("#startButton"),
  lobbyMessage: document.querySelector("#lobbyMessage"),
  newGameButton: document.querySelector("#newGameButton"),
  playArea: document.querySelector("#playArea"),
  opponentName: document.querySelector("#opponentName"),
  playerNameDisplay: document.querySelector("#playerNameDisplay"),
  gameMessage: document.querySelector("#gameMessage"),
  guessModeButton: document.querySelector("#guessModeButton"),
  board: document.querySelector("#board"),
  sidePanel: document.querySelector("#sidePanel"),
  yourCharacter: document.querySelector("#yourCharacter"),
  yourCharacterPortrait: document.querySelector("#yourCharacterPortrait"),
  questionGrid: document.querySelector("#questionGrid"),
  chatLog: document.querySelector("#chatLog"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  chatCount: document.querySelector("#chatCount"),
  modalBackdrop: document.querySelector("#modalBackdrop"),
  modal: document.querySelector("#modal"),
  modalTitle: document.querySelector("#modalTitle"),
  modalPortrait: document.querySelector("#modalPortrait"),
  modalBody: document.querySelector("#modalBody"),
  modalDismiss: document.querySelector("#modalDismiss"),
  guessBackdrop: document.querySelector("#guessBackdrop"),
  guessPortrait: document.querySelector("#guessPortrait"),
  guessCaption: document.querySelector("#guessCaption"),
  guessCancel: document.querySelector("#guessCancel"),
  guessConfirm: document.querySelector("#guessConfirm"),
  resultBackdrop: document.querySelector("#resultBackdrop"),
  resultTitle: document.querySelector("#resultTitle"),
  resultBody: document.querySelector("#resultBody"),
  resultClose: document.querySelector("#resultClose"),
  resultAgain: document.querySelector("#resultAgain"),
};

let entryControls = null;

function playerStorageKey(code) {
  return `${STORAGE_PLAYER_KEY}:${code}`;
}

function flippedStorageKey(code) {
  return `${STORAGE_FLIPPED_KEY}:${code}:${FLIP_STORAGE_VERSION}`;
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
    /* localStorage unavailable; the player will need to rejoin manually. */
  }
}

function loadFlipped(code) {
  try {
    const raw = localStorage.getItem(flippedStorageKey(code));
    if (!raw) return new Set();
    const list = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

function saveFlipped(code, set) {
  try {
    localStorage.setItem(flippedStorageKey(code), JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

function clearFlipped(code) {
  try {
    localStorage.removeItem(flippedStorageKey(code));
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

function statusLabel(status) {
  if (status === "lobby") return "Lobby";
  if (status === "active") return "In play";
  if (status === "finished") return "Finished";
  return status;
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
  if (!state.game || !state.game.opponents || !state.game.opponents.length) return "Opponent";
  return state.game.opponents[0].name;
}

function rebuildPool() {
  if (!state.game) {
    state.pool = [];
    return;
  }
  state.pool = window.WhoAmI.generatePool(state.game.seed, state.game.count);
  // Trim eliminated entries that don't exist in the current pool.
  const validIndices = new Set(state.pool.map((c) => c.index));
  state.eliminated = new Set([...state.eliminated].filter((i) => validIndices.has(i)));
  if (state.game.code) saveFlipped(state.game.code, state.eliminated);
}

function adoptGame(game, options = {}) {
  const previousCode = state.game?.code;
  state.game = game;
  state.entryMode = options.entryMode || state.entryMode;
  if (game.playerId) {
    state.playerId = game.playerId;
    if (game.code) savePlayerId(game.code, game.playerId);
  }
  if (!state.pool.length || previousCode !== game.code) {
    state.eliminated = loadFlipped(game.code);
  } else {
    state.eliminated = new Set([...state.eliminated].filter((i) => i < game.count));
  }
  rebuildPool();
  els.setupView.hidden = true;
  els.gameView.hidden = false;
  if (state.eventSource) state.eventSource.close();
  state.eventSource = null;
  connectEvents();
  render();
  if (game.status === "active" && game.yourSecretIndex != null && options.showReveal) {
    revealYourCharacter();
  }
}

async function createGame(event) {
  event.preventDefault();
  try {
    const data = await requestJson("/api/whoami/games", { method: "POST" });
    state.playerId = "";
    adoptGame(data.game, { entryMode: "create", showReveal: false });
    els.connectionStatus.textContent = "Lobby";
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function loadGame(code, options = {}) {
  if (!code) return;
  const savedPlayerId = loadPlayerId(code);
  const suffix = savedPlayerId ? `?playerId=${encodeURIComponent(savedPlayerId)}` : "";
  try {
    const data = await requestJson(`/api/whoami/games/${code}${suffix}`);
    if (savedPlayerId) state.playerId = savedPlayerId;
    adoptGame(data.game, { entryMode: options.entryMode || "join", showReveal: false });
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
  await loadGame(code, { entryMode: "join" });
}

async function joinTable(event) {
  event.preventDefault();
  if (!state.game) return;
  try {
    const data = await requestJson(`/api/whoami/games/${state.game.code}/players`, {
      method: "POST",
      body: JSON.stringify({ name: els.playerName.value, playerId: state.playerId }),
    });
    state.playerId = data.playerId;
    savePlayerId(state.game.code, state.playerId);
    adoptGame(data.game, { showReveal: false });
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function setReady() {
  if (!state.game || !state.playerId) return;
  const me = currentPlayer();
  try {
    const data = await requestJson(`/api/whoami/games/${state.game.code}/players/${state.playerId}/ready`, {
      method: "POST",
      body: JSON.stringify({ ready: !me?.ready }),
    });
    adoptGame(data.game);
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function startGame() {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/whoami/games/${state.game.code}/start`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId }),
    });
    adoptGame(data.game, { showReveal: true });
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function sendChat(event) {
  event.preventDefault();
  if (!state.game || !state.playerId) return;
  const text = els.chatInput.value.trim();
  if (!text) return;
  try {
    const data = await requestJson(`/api/whoami/games/${state.game.code}/messages`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId, text }),
    });
    els.chatInput.value = "";
    adoptGame(data.game);
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function askQuestion(question) {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/whoami/games/${state.game.code}/questions`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId, questionId: question.id, label: question.label }),
    });
    state.lastQuestionId = data.event.id;
    adoptGame(data.game);
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function answerQuestion(eventId, answer) {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/whoami/games/${state.game.code}/answers`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId, eventId, answer }),
    });
    adoptGame(data.game);
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function submitGuess(characterIndex) {
  if (!state.game || !state.playerId) return;
  try {
    const data = await requestJson(`/api/whoami/games/${state.game.code}/guess`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId, characterIndex }),
    });
    adoptGame(data.game);
    if (data.game.status === "finished") {
      showResultModal(data.game);
    }
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

function connectEvents() {
  if (!state.game) return;
  if (state.eventSource) state.eventSource.close();
  const suffix = state.playerId ? `?playerId=${encodeURIComponent(state.playerId)}` : "";
  state.eventSource = new EventSource(`/api/whoami/games/${state.game.code}/events${suffix}`);
  els.connectionStatus.textContent = "Live";
  const handler = (event) => {
    const game = JSON.parse(event.data);
    const wasInLobby = state.game?.status === "lobby";
    const wasRevealed = state.showReveal;
    adoptGame(game);
    if (event.type === "started" && !wasRevealed) {
      revealYourCharacter();
    }
    if (event.type === "guess" && game.status === "finished") {
      showResultModal(game);
    }
    if (event.type === "guess" && wasInLobby === false) {
      // Stay responsive on guesses in active games.
    }
  };
  ["game", "joined", "started", "question", "answer", "guess", "chat"].forEach((name) => {
    state.eventSource.addEventListener(name, handler);
  });
  state.eventSource.addEventListener("error", () => {
    els.connectionStatus.textContent = "Reconnecting";
  });
}

// ----- Rendering -----
function renderLobby() {
  const me = currentPlayer();
  const allReady = state.game.players.length === 2 && state.game.players.every((p) => p.ready);
  const inLobby = state.game.status === "lobby";
  els.shareCode.textContent = state.game.code;
  els.factStatus.textContent = statusLabel(state.game.status);
  els.factPool.textContent = String(state.game.count);
  els.shareTools.hidden = !youAreHost();
  els.newGameButton.hidden = !youAreHost();
  els.nameForm.hidden = Boolean(me) || !inLobby;
  els.lobbyActions.hidden = !me || !inLobby;
  els.readyButton.textContent = me?.ready ? "Unready" : "Ready";
  // Either player can start once both are ready, so neither gets stuck if the
  // host has to step away.
  els.startButton.hidden = false;
  els.startButton.disabled = !allReady;
  const slots = state.game.players.length;
  if (slots < 2) {
    els.lobbyMessage.textContent = "Waiting for an opponent to join…";
  } else if (!allReady) {
    els.lobbyMessage.textContent = "Both players need to mark themselves ready.";
  } else {
    els.lobbyMessage.textContent = "Everyone is ready. Either player can start.";
  }
}

function renderBoard() {
  els.board.innerHTML = "";
  els.board.classList.toggle("is-guess-mode", state.guessMode);
  if (els.guessModeButton) {
    els.guessModeButton.textContent = state.guessMode ? "Cancel guess" : "Make a final guess";
    els.guessModeButton.classList.toggle("is-active", state.guessMode);
  }
  state.pool.forEach((character) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    card.dataset.index = String(character.index);
    const eliminated = state.eliminated.has(character.index);
    card.classList.toggle("is-eliminated", eliminated);
    const isMine = state.game.yourSecretIndex === character.index;
    card.classList.toggle("is-mine", isMine);
    card.setAttribute("aria-pressed", eliminated ? "true" : "false");
    card.setAttribute(
      "aria-label",
      state.guessMode
        ? `Guess ${kindLabel(character.kind).toLowerCase()} ${character.index + 1}`
        : `${kindLabel(character.kind)} ${character.index + 1}${isMine ? " (your character)" : ""}${eliminated ? " eliminated" : ""}`
    );

    const inner = document.createElement("span");
    inner.className = "card-inner";

    const front = document.createElement("span");
    front.className = "card-face card-front";
    front.append(window.WhoAmI.renderPortrait(character, { className: "card-portrait" }));
    if (isMine) {
      const mine = document.createElement("span");
      mine.className = "mine-badge";
      mine.textContent = "You";
      front.append(mine);
    }
    if (state.guessMode) {
      const guessBadge = document.createElement("span");
      guessBadge.className = "guess-badge";
      guessBadge.textContent = "Guess?";
      front.append(guessBadge);
    }

    const back = document.createElement("span");
    back.className = "card-face card-back";
    back.textContent = "✕";

    inner.append(front, back);
    card.append(inner);
    card.addEventListener("click", () => toggleCard(character.index));
    els.board.append(card);
  });
}

function kindLabel(kind) {
  if (kind === "human") return "Person";
  if (kind === "cat") return "Cat";
  if (kind === "dog") return "Dog";
  return kind;
}

function toggleCard(index) {
  if (!state.game || state.game.status !== "active") return;
  if (state.guessedThisRound) return;
  if (state.guessMode) {
    openGuessModal(index);
    return;
  }
  if (state.eliminated.has(index)) state.eliminated.delete(index);
  else state.eliminated.add(index);
  saveFlipped(state.game.code, state.eliminated);
  renderBoard();
}

function renderYourCharacter() {
  els.yourCharacterPortrait.innerHTML = "";
  if (state.game.yourSecretIndex == null) {
    els.yourCharacter.hidden = true;
    return;
  }
  const me = state.pool[state.game.yourSecretIndex];
  if (!me) {
    els.yourCharacter.hidden = true;
    return;
  }
  els.yourCharacter.hidden = false;
  els.yourCharacterPortrait.append(window.WhoAmI.renderPortrait(me, { className: "your-portrait-svg" }));
}

function renderQuestions() {
  els.questionGrid.innerHTML = "";
  const me = currentPlayer();
  if (!me || state.game.status !== "active") {
    els.questionGrid.classList.add("is-empty");
    els.questionGrid.textContent = "Questions unlock when the game starts.";
    return;
  }
  els.questionGrid.classList.remove("is-empty");
  els.questionGrid.innerHTML = "";
  const lastQuestion = [...state.game.events].reverse().find((e) => e.type === "question");
  const awaitingMine = lastQuestion && lastQuestion.askerId !== state.playerId && !lastQuestion.answer;
  if (awaitingMine) {
    const prompt = document.createElement("div");
    prompt.className = "question-prompt";
    prompt.innerHTML = `<strong>${escapeHtml(lastQuestion.askerName)} asks:</strong> ${escapeHtml(lastQuestion.label)}`;
    const buttons = document.createElement("div");
    buttons.className = "question-buttons";
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "primary-button";
    yes.textContent = "Yes";
    yes.addEventListener("click", () => answerQuestion(lastQuestion.id, "yes"));
    const no = document.createElement("button");
    no.type = "button";
    no.className = "secondary-button";
    no.textContent = "No";
    no.addEventListener("click", () => answerQuestion(lastQuestion.id, "no"));
    buttons.append(yes, no);
    prompt.append(buttons);
    els.questionGrid.append(prompt);
    return;
  }
  window.WhoAmI.QUESTIONS.forEach((question) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "question-button";
    button.textContent = question.label;
    button.addEventListener("click", () => askQuestion(question));
    els.questionGrid.append(button);
  });
}

function renderChat() {
  els.chatLog.innerHTML = "";
  const messages = state.game.messages || [];
  if (!messages.length) {
    const empty = document.createElement("p");
    empty.className = "chat-empty";
    empty.textContent = "No messages yet. Say hi!";
    els.chatLog.append(empty);
  } else {
    messages.forEach((message) => {
      const row = document.createElement("div");
      row.className = "chat-message";
      if (message.fromId === state.playerId) row.classList.add("from-me");
      const author = document.createElement("strong");
      author.textContent = message.fromName;
      const text = document.createElement("span");
      text.textContent = message.text;
      row.append(author, text);
      els.chatLog.append(row);
    });
    els.chatLog.scrollTop = els.chatLog.scrollHeight;
  }
  els.chatCount.textContent = String(messages.length);
}

function renderEventFeed() {
  const events = state.game.events || [];
  if (!events.length) {
    els.gameMessage.textContent = "Ask your first question.";
    return;
  }
  const latest = events[events.length - 1];
  if (latest.type === "system") {
    els.gameMessage.textContent = latest.text;
  } else if (latest.type === "question") {
    if (latest.askerId === state.playerId) {
      els.gameMessage.textContent = latest.answer
        ? `${latest.answeredByName} answered: ${latest.answer.toUpperCase()}.`
        : `You asked: ${latest.label}`;
    } else {
      els.gameMessage.textContent = latest.answer
        ? `You answered ${latest.answer.toUpperCase()} to ${latest.askerName}.`
        : `${latest.askerName} is asking a question.`;
    }
  } else if (latest.type === "guess") {
    const correctWord = latest.correct ? "guessed right" : "guessed wrong";
    els.gameMessage.textContent = `${latest.guesserName} ${correctWord} about ${latest.targetName}'s character.`;
  }
}

function renderPlayArea() {
  if (!state.game) return;
  const inPlay = state.game.status !== "lobby";
  els.playArea.hidden = !inPlay;
  els.sidePanel.hidden = !inPlay;
  if (!inPlay) {
    state.guessMode = false;
    return;
  }
  els.opponentName.textContent = opponentName();
  els.playerNameDisplay.textContent = state.game.yourName || currentPlayer()?.name || "You";
  if (state.game.status !== "active") {
    state.guessMode = false;
  }
  if (els.guessModeButton) {
    els.guessModeButton.disabled = state.game.status !== "active" || state.guessedThisRound;
  }
  renderBoard();
  renderYourCharacter();
  renderQuestions();
  renderChat();
  renderEventFeed();
}

function render() {
  if (!state.game) return;
  const inLobby = state.game.status === "lobby";
  els.lobbyPanel.hidden = !inLobby;
  if (inLobby) {
    renderLobby();
  } else {
    renderPlayArea();
  }
}

function revealYourCharacter() {
  if (state.game.yourSecretIndex == null) return;
  const me = state.pool[state.game.yourSecretIndex];
  if (!me) return;
  state.showReveal = true;
  els.modalTitle.textContent = `Your secret character`;
  els.modalBody.textContent = "Memorize this character. The other player will be trying to guess which one is yours.";
  els.modalPortrait.innerHTML = "";
  els.modalPortrait.append(window.WhoAmI.renderPortrait(me, { className: "modal-portrait-svg" }));
  els.modalBackdrop.hidden = false;
  els.modalDismiss.textContent = "Got it";
}

function showResultModal(game) {
  const winner = game.players.find((p) => p.id === game.winnerId);
  const iWon = game.winnerId === state.playerId;
  els.resultTitle.textContent = iWon ? "You won!" : `${winner?.name || "Opponent"} won`;
  const lastGuess = [...(game.events || [])].reverse().find((e) => e.type === "guess");
  let body;
  if (lastGuess) {
    const targetName = lastGuess.targetName;
    if (iWon) {
      body = `You correctly guessed ${targetName}'s character. Great detective work.`;
    } else {
      body = `${lastGuess.guesserName} guessed ${targetName}'s character correctly. Better luck next time.`;
    }
  } else {
    body = "Round complete.";
  }
  els.resultBody.textContent = body;
  els.resultBackdrop.hidden = false;
  state.guessedThisRound = false;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

// ----- Modals -----
function bindModalHandlers() {
  els.modalDismiss.addEventListener("click", () => {
    els.modalBackdrop.hidden = true;
  });
  els.modalBackdrop.addEventListener("click", (event) => {
    if (event.target === els.modalBackdrop) els.modalBackdrop.hidden = true;
  });
  els.guessCancel.addEventListener("click", () => {
    els.guessBackdrop.hidden = true;
    state.pendingGuessIndex = null;
  });
  els.guessConfirm.addEventListener("click", async () => {
    if (state.pendingGuessIndex == null) return;
    const index = state.pendingGuessIndex;
    state.pendingGuessIndex = null;
    els.guessBackdrop.hidden = true;
    state.guessedThisRound = true;
    await submitGuess(index);
  });
  els.guessBackdrop.addEventListener("click", (event) => {
    if (event.target === els.guessBackdrop) {
      els.guessBackdrop.hidden = true;
      state.pendingGuessIndex = null;
    }
  });
  els.resultClose.addEventListener("click", () => {
    els.resultBackdrop.hidden = true;
  });
  els.resultAgain.addEventListener("click", () => {
    els.resultBackdrop.hidden = true;
    showStartMode("create");
  });
}

function openGuessModal(index) {
  if (state.game.status !== "active" || state.game.yourSecretIndex == null) return;
  const character = state.pool[index];
  if (!character) return;
  state.pendingGuessIndex = index;
  els.guessPortrait.innerHTML = "";
  els.guessPortrait.append(window.WhoAmI.renderPortrait(character, { className: "guess-portrait-svg" }));
  els.guessCaption.textContent = `${kindLabel(character.kind)} #${index + 1}`;
  els.guessConfirm.disabled = false;
  els.guessBackdrop.hidden = false;
}

// ----- Long-press / right-click for "Make final guess" -----
function bindBoardGestures() {
  let pressTimer = null;
  let pressTarget = null;
  els.board.addEventListener("contextmenu", (event) => {
    const card = event.target.closest(".card");
    if (!card) return;
    event.preventDefault();
    if (state.game?.status === "active") openGuessModal(Number(card.dataset.index));
  });
  els.board.addEventListener("touchstart", (event) => {
    const card = event.target.closest(".card");
    if (!card) return;
    pressTarget = card;
    pressTimer = window.setTimeout(() => {
      if (pressTarget === card && state.game?.status === "active") {
        openGuessModal(Number(card.dataset.index));
      }
      pressTimer = null;
    }, 600);
  }, { passive: true });
  const cancelPress = () => {
    if (pressTimer) {
      window.clearTimeout(pressTimer);
      pressTimer = null;
    }
    pressTarget = null;
  };
  ["touchend", "touchmove", "touchcancel"].forEach((evt) => {
    els.board.addEventListener(evt, cancelPress, { passive: true });
  });
  // Add a help hint to the game message about how to make a final guess.
}

function showStartMode(mode) {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  state.game = null;
  state.pool = [];
  state.eliminated = new Set();
  state.entryMode = mode || "choice";
  els.setupView.hidden = false;
  els.gameView.hidden = true;
  els.modalBackdrop.hidden = true;
  els.guessBackdrop.hidden = true;
  els.resultBackdrop.hidden = true;
  entryControls.showMode(mode || "choice");
  els.connectionStatus.textContent = "Ready";
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
  els.nameForm.addEventListener("submit", joinTable);
  els.readyButton.addEventListener("click", setReady);
  els.startButton.addEventListener("click", startGame);
  els.guessModeButton.addEventListener("click", () => {
    if (state.game?.status !== "active") return;
    state.guessMode = !state.guessMode;
    renderBoard();
  });
  els.chatForm.addEventListener("submit", sendChat);
  els.copyShare.addEventListener("click", async () => {
    if (!state.game) return;
    const url = new URL(`/whoami/?game=${state.game.code}`, window.location.origin).toString();
    await navigator.clipboard?.writeText(url).catch(() => {});
    els.connectionStatus.textContent = "Copied";
  });
  els.newGameButton.addEventListener("click", () => {
    showStartMode("choice");
  });
  bindModalHandlers();
  bindBoardGestures();
}

bindEvents();
const params = new URLSearchParams(window.location.search);
const gameCode = params.get("game");
if (gameCode) loadGame(gameCode.toUpperCase(), { entryMode: "join" });
