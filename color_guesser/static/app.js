const DEFAULT_COLORS = [
  "#d94f4f",
  "#2f80ed",
  "#27ae60",
  "#f2c94c",
  "#9b51e0",
  "#f2994a",
  "#56ccf2",
  "#eb5757",
  "#6fcf97",
  "#bb6bd9",
];
const LOCAL_SECRET_KEY = "color-guesser-maker-secrets-v1";

const state = {
  colors: DEFAULT_COLORS.slice(0, 6),
  selectedColor: DEFAULT_COLORS[0],
  currentGuess: [],
  game: null,
  eventSource: null,
  makerSecrets: {},
  shareToken: "",
};

const els = {
  startView: document.querySelector("#startView"),
  choicePanel: document.querySelector("#choicePanel"),
  collapsedActions: document.querySelector("#collapsedActions"),
  playView: document.querySelector("#playView"),
  createForm: document.querySelector("#createForm"),
  joinForm: document.querySelector("#joinForm"),
  showJoin: document.querySelector("#showJoin"),
  showCreate: document.querySelector("#showCreate"),
  newGameButton: document.querySelector("#newGameButton"),
  joinAnotherButton: document.querySelector("#joinAnotherButton"),
  addColor: document.querySelector("#addColor"),
  colorEditor: document.querySelector("#colorEditor"),
  pegCount: document.querySelector("#pegCount"),
  maxRounds: document.querySelector("#maxRounds"),
  joinCode: document.querySelector("#joinCode"),
  connectionStatus: document.querySelector("#connectionStatus"),
  shareCode: document.querySelector("#shareCode"),
  copyShare: document.querySelector("#copyShare"),
  factPegs: document.querySelector("#factPegs"),
  factRounds: document.querySelector("#factRounds"),
  factStatus: document.querySelector("#factStatus"),
  makerSecret: document.querySelector("#makerSecret"),
  secretPreview: document.querySelector("#secretPreview"),
  gameMessage: document.querySelector("#gameMessage"),
  guessBoard: document.querySelector("#guessBoard"),
  guessPalette: document.querySelector("#guessPalette"),
  guessSlots: document.querySelector("#guessSlots"),
  submitGuess: document.querySelector("#submitGuess"),
};

function normalizeHex(color) {
  return color.toLowerCase();
}

function loadMakerSecrets() {
  try {
    state.makerSecrets = JSON.parse(localStorage.getItem(LOCAL_SECRET_KEY)) || {};
  } catch {
    localStorage.removeItem(LOCAL_SECRET_KEY);
  }
}

function saveMakerSecret(code, secret) {
  state.makerSecrets[code] = secret;
  localStorage.setItem(LOCAL_SECRET_KEY, JSON.stringify(state.makerSecrets));
}

function clampSettings() {
  const pegCount = Math.min(Math.max(Number(els.pegCount.value) || 4, 3), 8);
  const maxRounds = Math.min(Math.max(Number(els.maxRounds.value) || 10, 4), 20);
  els.pegCount.value = pegCount;
  els.maxRounds.value = maxRounds;
  state.colors = state.colors.slice(0, 10);
  while (state.colors.length < 2) state.colors.push(DEFAULT_COLORS[state.colors.length]);
}

function makePeg(color, className = "peg") {
  const peg = document.createElement("span");
  peg.className = className;
  if (color) peg.style.setProperty("--slot-color", color);
  else peg.classList.add("is-empty");
  return peg;
}

function renderColorEditor() {
  clampSettings();
  els.colorEditor.innerHTML = "";
  state.colors.forEach((color, index) => {
    const row = document.createElement("div");
    row.className = "color-row";

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = color;
    colorInput.ariaLabel = `Color ${index + 1}`;
    colorInput.addEventListener("input", () => {
      const nextColor = normalizeHex(colorInput.value);
      state.colors[index] = nextColor;
      state.selectedColor = nextColor;
      renderSetup();
    });

    const remove = document.createElement("button");
    remove.className = "remove-color";
    remove.type = "button";
    remove.textContent = "x";
    remove.ariaLabel = `Remove color ${index + 1}`;
    remove.disabled = state.colors.length <= 2;
    remove.addEventListener("click", () => {
      state.colors.splice(index, 1);
      state.selectedColor = state.colors[0];
      renderSetup();
    });

    row.append(colorInput, remove);
    els.colorEditor.append(row);
  });
}

function renderSetup() {
  renderColorEditor();
}

function showStartMode(mode) {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  state.game = null;
  state.shareToken = "";
  els.startView.hidden = false;
  els.collapsedActions.hidden = true;
  els.playView.hidden = true;
  els.choicePanel.hidden = false;
  els.createForm.hidden = mode !== "create";
  els.joinForm.hidden = mode !== "join";
  if (mode === "join") els.joinCode.focus();
}

function collapseStartControls() {
  els.startView.hidden = true;
  els.collapsedActions.hidden = false;
}

function statusText(status) {
  if (status === "won") return "Solved";
  if (status === "lost") return "Code held";
  return "Active";
}

function openGame(game, options = {}) {
  state.game = game;
  state.shareToken = options.shareToken || state.shareToken;
  state.currentGuess = Array(game.pegCount).fill(game.colors[0]);
  state.selectedColor = game.colors[0];
  if (options.creatorSecret) saveMakerSecret(game.code, options.creatorSecret);
  collapseStartControls();
  els.playView.hidden = false;
  renderGame();
  connectEvents(game.code);
}

function connectEvents(code) {
  if (state.eventSource) state.eventSource.close();
  state.eventSource = new EventSource(`/api/color-guesser/games/${code}/events`);
  els.connectionStatus.textContent = "Live";
  state.eventSource.addEventListener("game", (event) => {
    state.game = JSON.parse(event.data);
    renderGame();
  });
  state.eventSource.addEventListener("error", () => {
    els.connectionStatus.textContent = "Reconnecting";
  });
}

function renderSecretPreview() {
  const secret = state.makerSecrets[state.game.code] || state.game.secret;
  els.secretPreview.innerHTML = "";
  if (!secret) {
    els.makerSecret.hidden = true;
    return;
  }
  els.makerSecret.hidden = false;
  secret.forEach((color) => els.secretPreview.append(makePeg(color)));
}

function renderBoard() {
  els.guessBoard.innerHTML = "";
  const guessesByRound = new Map(state.game.guesses.map((guess) => [guess.round, guess]));

  for (let round = 1; round <= state.game.maxRounds; round += 1) {
    const guess = guessesByRound.get(round);
    const row = document.createElement("article");
    row.className = "round-row";

    const number = document.createElement("div");
    number.className = "round-number";
    number.textContent = String(round);

    const pegs = document.createElement("div");
    pegs.className = "round-pegs";
    const colors = guess ? guess.guess : Array(state.game.pegCount).fill("");
    colors.forEach((color) => pegs.append(makePeg(color)));

    const feedback = document.createElement("div");
    feedback.className = "feedback";
    if (guess) {
      feedback.innerHTML = `<span><strong>${guess.feedback.exact}</strong> exact</span><span><strong>${guess.feedback.misplaced}</strong> misplaced</span>`;
    } else {
      feedback.textContent = "Open";
    }

    row.append(number, pegs, feedback);
    els.guessBoard.append(row);
  }
}

function renderGuessControls() {
  els.guessPalette.innerHTML = "";
  state.game.colors.forEach((color) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch";
    swatch.style.setProperty("--swatch-color", color);
    swatch.classList.toggle("is-selected", color === state.selectedColor);
    swatch.ariaLabel = `Select ${color}`;
    swatch.addEventListener("click", () => {
      state.selectedColor = color;
      renderGuessControls();
    });
    els.guessPalette.append(swatch);
  });

  els.guessSlots.innerHTML = "";
  state.currentGuess.forEach((color, index) => {
    const slot = makePeg(color, "slot");
    slot.title = `Guess peg ${index + 1}`;
    slot.addEventListener("click", () => {
      state.currentGuess[index] = state.selectedColor;
      renderGuessControls();
    });
    els.guessSlots.append(slot);
  });

  els.submitGuess.disabled = state.game.status !== "active";
}

function renderGame() {
  els.shareCode.textContent = state.game.code;
  els.factPegs.textContent = String(state.game.pegCount);
  els.factRounds.textContent = String(state.game.maxRounds);
  els.factStatus.textContent = statusText(state.game.status);

  const usedRounds = state.game.guesses.length;
  if (state.game.status === "won") {
    els.gameMessage.textContent = `Solved in ${usedRounds} round${usedRounds === 1 ? "" : "s"}.`;
  } else if (state.game.status === "lost") {
    els.gameMessage.textContent = "No rounds left.";
  } else {
    els.gameMessage.textContent = `${state.game.maxRounds - usedRounds} round${state.game.maxRounds - usedRounds === 1 ? "" : "s"} left.`;
  }

  renderSecretPreview();
  renderBoard();
  renderGuessControls();
}

async function createGame(event) {
  event.preventDefault();
  clampSettings();
  const response = await fetch("/api/color-guesser/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      colors: state.colors,
      pegCount: Number(els.pegCount.value),
      maxRounds: Number(els.maxRounds.value),
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    els.connectionStatus.textContent = data.error || "Could not create game";
    return;
  }
  openGame(data.game, { creatorSecret: data.creatorSecret, shareToken: data.shareToken });
}

async function joinGame(event) {
  event.preventDefault();
  const parsed = parseShareInput(els.joinCode.value);
  if (parsed.token) await loadGameFromToken(parsed.token);
  else if (parsed.code) await loadGame(parsed.code);
}

function parseShareInput(value) {
  const trimmed = value.trim();
  if (!trimmed) return {};
  try {
    const url = new URL(trimmed, window.location.origin);
    return {
      token: url.searchParams.get("token") || "",
      code: (url.searchParams.get("game") || "").toUpperCase(),
    };
  } catch {
    if (trimmed.length > 24) return { token: trimmed };
    return { code: trimmed.toUpperCase() };
  }
}

async function loadGame(code) {
  const response = await fetch(`/api/color-guesser/games/${code}`);
  const data = await response.json();
  if (!response.ok) {
    els.connectionStatus.textContent = data.error || "Game not found";
    return;
  }
  openGame(data.game);
}

async function loadGameFromToken(token) {
  const response = await fetch("/api/color-guesser/games/from-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const data = await response.json();
  if (!response.ok) {
    els.connectionStatus.textContent = data.error || "Share link not valid";
    return;
  }
  openGame(data.game, { shareToken: data.shareToken });
}

async function submitGuess() {
  if (!state.game || state.game.status !== "active") return;
  const response = await fetch(`/api/color-guesser/games/${state.game.code}/guesses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guess: state.currentGuess }),
  });
  const data = await response.json();
  if (!response.ok) {
    els.connectionStatus.textContent = data.error || "Could not submit guess";
    return;
  }
  state.game = data.game;
  renderGame();
}

function bindEvents() {
  els.createForm.addEventListener("submit", createGame);
  els.joinForm.addEventListener("submit", joinGame);
  els.showCreate.addEventListener("click", () => showStartMode("create"));
  els.showJoin.addEventListener("click", () => showStartMode("join"));
  els.newGameButton.addEventListener("click", () => showStartMode("create"));
  els.joinAnotherButton.addEventListener("click", () => showStartMode("join"));
  els.addColor.addEventListener("click", () => {
    if (state.colors.length >= 10) return;
    state.colors.push(DEFAULT_COLORS[state.colors.length % DEFAULT_COLORS.length]);
    renderSetup();
  });
  els.pegCount.addEventListener("change", renderSetup);
  els.maxRounds.addEventListener("change", clampSettings);
  els.submitGuess.addEventListener("click", submitGuess);
  els.copyShare.addEventListener("click", async () => {
    const query = state.shareToken ? `token=${encodeURIComponent(state.shareToken)}` : `game=${state.game.code}`;
    const url = new URL(`/color-guesser/?${query}`, window.location.origin).toString();
    await navigator.clipboard?.writeText(url).catch(() => {});
    els.connectionStatus.textContent = "Copied";
  });
}

function init() {
  loadMakerSecrets();
  bindEvents();
  renderSetup();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const gameCode = params.get("game");
  if (token) {
    els.joinCode.value = token;
    loadGameFromToken(token);
  } else if (gameCode) {
    els.joinCode.value = gameCode.toUpperCase();
    loadGame(gameCode.toUpperCase());
  }
}

init();
