// app.js
// Main client for "Who Am I?". Talks to the Flask server through the REST
// API and an SSE stream, holds the local board state (which cards are
// flipped down) and renders the lobby, board, chat, and ask/answer panel.

const STORAGE_PLAYER_KEY = "whoami-player-v1";
const STORAGE_FLIPPED_KEY = "whoami-flipped-v1";
const FLIP_STORAGE_VERSION = 1;
const SOLO_STORAGE_KEY = "whoami-robot-v1";

const state = {
  game: null,
  playerId: "",
  pool: [],
  eliminated: new Set(),
  guessedThisRound: false,
  eventSource: null,
  streamKey: "",
  entryMode: "choice",
  showReveal: false,
  pendingGuessIndex: null,
  guessMode: false,
  solo: null,
  soloTimer: null,
  soloRecord: { wins: 0, losses: 0, robotGuesses: 0 },
};

const els = {
  setupView: document.querySelector("#setupView"),
  choicePanel: document.querySelector("#choicePanel"),
  createForm: document.querySelector("#createForm"),
  joinForm: document.querySelector("#joinForm"),
  soloForm: document.querySelector("#soloForm"),
  showJoin: document.querySelector("#showJoin"),
  showCreate: document.querySelector("#showCreate"),
  showSolo: document.querySelector("#showSolo"),
  soloDiffRow: document.querySelector("#soloDiffRow"),
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
  gameMessage: document.querySelector("#gameMessage"),
  guessModeButton: document.querySelector("#guessModeButton"),
  board: document.querySelector("#board"),
  yourCharacterPortrait: document.querySelector("#yourCharacterPortrait"),
  askDisplay: document.querySelector("#askDisplay"),
  askForm: document.querySelector("#askForm"),
  askInput: document.querySelector("#askInput"),
  chatPanel: document.querySelector("#chatPanel"),
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
  // Reconnect only when the stream target actually changes — every SSE
  // event lands here too, and reconnecting per event would loop forever.
  const streamKey = `${game.code}:${state.playerId}`;
  if (state.streamKey !== streamKey) {
    state.streamKey = streamKey;
    connectEvents();
  }
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

async function sendAsk(event) {
  event.preventDefault();
  if (state.entryMode === "solo" && state.solo) {
    await askSoloQuestion(event);
    return;
  }
  if (!state.game || !state.playerId) return;
  const text = els.askInput.value.trim();
  if (!text) return;
  // If there is an unanswered question aimed at us, force the user to answer
  // it first rather than stacking more questions on top.
  const pendingForMe = (state.game.events || []).find(
    (e) => e.type === "question" && e.askerId !== state.playerId && !e.answer
  );
  if (pendingForMe) {
    els.connectionStatus.textContent = "Answer the open question first";
    return;
  }
  try {
    const data = await requestJson(`/api/whoami/games/${state.game.code}/questions`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId, label: text }),
    });
    els.askInput.value = "";
    adoptGame(data.game);
  } catch (error) {
    els.connectionStatus.textContent = error.message;
  }
}

async function answerQuestion(eventId, answer) {
  if (state.entryMode === "solo" && state.solo) {
    answerSoloQuestion(eventId, answer);
    return;
  }
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
  if (state.entryMode === "solo" && state.solo) {
    soloSubmitGuess(characterIndex);
    return;
  }
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
    const wasRevealed = state.showReveal;
    adoptGame(game);
    if (event.type === "started" && !wasRevealed) {
      revealYourCharacter();
    }
    if (event.type === "guess" && game.status === "finished") {
      showResultModal(game);
    }
  };
  ["game", "joined", "started", "question", "answer", "guess", "chat"].forEach((name) => {
    state.eventSource.addEventListener(name, handler);
  });
  state.eventSource.addEventListener("error", () => {
    els.connectionStatus.textContent = "Reconnecting";
  });
}

// ----- Solo mode vs the detective robot -----
//
// Both sides guard a secret character on the same procedurally-dealt board.
// You ask free-text yes/no questions (a keyword parser turns them into
// attribute tests, and the robot answers truthfully); the robot narrows its
// candidate set with balanced-split questions of its own.

const SOLO_TIERS = {
  rookie: { label: "Rookie", guessAt: 1, askRange: 0.55 },
  sleuth: { label: "Sleuth", guessAt: 2, askRange: 1 },
  mastermind: { label: "Mastermind", guessAt: 2, askRange: 1, guessAtThree: true },
};

// Attribute families for questions and parsing.
const HAIR_FAMILIES = {
  black: ["#1f1a17", "#33251c"],
  brown: ["#4a3222", "#5f4025", "#7a5230", "#96683a"],
  blond: ["#b8894e", "#d3ac69"],
  red: ["#c96f3b", "#a34f2a"],
  gray: ["#8a8d93", "#d9d5cf"],
};
const SKIN_FAMILIES = {
  light: ["#ffe0c4", "#f6c99f"],
  medium: ["#e2a878", "#bf8157"],
  deep: ["#8d5a3b", "#5f3d28"],
};
const FUR_FAMILIES = {
  dark: ["#6b5138", "#4c3a28", "#2f2620"],
  golden: ["#8a6a48", "#a8845e", "#c7a37c"],
  light: ["#d9c8ae", "#b5b0a8", "#8c8578"],
};
const SHIRT_FAMILIES = {
  blue: ["#4a7d8c", "#5b6b9e"],
  green: ["#7d9c6a"],
  orange: ["#c96f4a", "#96604a"],
  yellow: ["#d9a441"],
  purple: ["#a86a8e"],
};

function inFamily(value, family) {
  return Object.values(family).some((list) => list.includes(value));
}

function familyOf(value, family) {
  for (const [name, list] of Object.entries(family)) {
    if (list.includes(value)) return name;
  }
  return null;
}

function hasGlasses(character) {
  const glasses = character.traits.glasses;
  return Boolean(glasses && glasses !== "none");
}

function buildQuestionBank(pool) {
  const questions = [];
  const add = (label, test) => questions.push({ label, test });
  add("Is your character a human?", (c) => c.kind === "human");
  add("Is your character a cat?", (c) => c.kind === "cat");
  add("Is your character a dog?", (c) => c.kind === "dog");
  add("Is your character an animal?", (c) => c.kind !== "human");
  add("Is your character a man?", (c) => c.kind === "human" && c.breed === "man");
  add("Is your character a woman?", (c) => c.kind === "human" && c.breed === "woman");
  add("Is your character a kid?", (c) => c.kind === "human" && c.breed === "kid");
  add("Is your character wearing glasses?", (c) => c.kind === "human" && hasGlasses(c));
  add("Is your character wearing a hat?", (c) => c.kind === "human" && c.traits.hat !== "none");
  add("Does your character have facial hair?", (c) => c.kind === "human" && c.traits.facialHair !== "none");
  add("Is your character wearing earrings?", (c) => Boolean(c.traits.earrings));
  add("Does your character have freckles?", (c) => Boolean(c.traits.freckles));
  add("Is your character wearing lipstick?", (c) => Boolean(c.traits.lipstick));
  add("Is your character smiling?", (c) => ["happy", "grin"].includes(c.traits.expression));
  add("Does your character look sleepy?", (c) => c.traits.expression === "sleepy");
  add("Does your character look grumpy?", (c) => c.traits.expression === "grumpy");
  add("Does your character look surprised?", (c) => c.traits.expression === "surprised");
  add("Does your character look sad?", (c) => c.traits.expression === "sad");
  add("Does your character have long hair?", (c) => c.traits.hairStyle === "long");
  add("Does your character have a ponytail?", (c) => c.traits.hairStyle === "ponytail");
  add("Does your character have a hair bun?", (c) => c.traits.hairStyle === "bun");
  add("Does your character have curly hair?", (c) => c.traits.hairStyle === "curly");
  add("Does your character have an afro?", (c) => c.traits.hairStyle === "afro");
  add("Is your character bald?", (c) => c.traits.hairStyle === "bald");
  add("Is your character wearing a collar?", (c) => c.kind !== "human" && Boolean(c.traits.collar));
  add("Is your animal wearing a tag?", (c) => c.kind !== "human" && Boolean(c.traits.tag));
  add("Is your cat striped?", (c) => c.kind === "cat" && c.traits.pattern === "stripes");
  add("Is your cat a calico?", (c) => c.kind === "cat" && c.traits.pattern === "calico");
  add("Is your cat a colorpoint?", (c) => c.kind === "cat" && c.traits.pattern === "colorpoint");
  add("Is your dog a shepherd?", (c) => c.kind === "dog" && c.breed === "shepherd");
  add("Is your dog a spaniel?", (c) => c.kind === "dog" && c.breed === "spaniel");
  add("Is your dog a bulldog?", (c) => c.kind === "dog" && c.breed === "bulldog");
  add("Is your dog a puppy?", (c) => c.kind === "dog" && c.breed === "puppy");
  for (const family of Object.keys(HAIR_FAMILIES)) {
    const cap = family[0].toUpperCase() + family.slice(1);
    add(`Does your character have ${family} hair?`, (c) => c.kind === "human" && familyOf(c.traits.hair, HAIR_FAMILIES) === family);
    void cap;
  }
  for (const family of Object.keys(SKIN_FAMILIES)) {
    add(`Does your character have ${family} skin?`, (c) => c.kind === "human" && familyOf(c.traits.skin, SKIN_FAMILIES) === family);
  }
  for (const family of Object.keys(FUR_FAMILIES)) {
    add(`Does your animal have ${family} fur?`, (c) => c.kind !== "human" && familyOf(c.traits.fur, FUR_FAMILIES) === family);
  }
  for (const family of Object.keys(SHIRT_FAMILIES)) {
    add(`Is your character wearing a ${family} shirt?`, (c) => c.kind === "human" && familyOf(c.traits.shirt, SHIRT_FAMILIES) === family);
  }
  return questions;
}

// Turns free text into a {label, test} or null when nothing parses.
function parseSoloQuestion(text) {
  const raw = text.toLowerCase();
  const negated = /\b(not|no|n't|never|without)\b/.test(raw);
  const wrap = (test) => (negated ? (c) => !test(c) : test);

  // Kind questions (order matters: "woman" before "man", "kid" early).
  if (/\b(woman|lady|girl)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "human" && c.breed === "woman") };
  if (/\b(man|guy|boy|male)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "human" && c.breed === "man") };
  if (/\b(kid|child|children)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "human" && c.breed === "kid") };
  if (/\b(human|person|people)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "human") };
  if (/\b(cat|kitten|kitty|feline)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "cat") };
  if (/\b(dog|puppy|pup|hound)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "dog") };
  if (/\b(animal|pet|creature)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind !== "human") };

  if (/\b(glasses|sunglasses|monocle|spectacles|specs)\b/.test(raw)) return { label: text, test: wrap(hasGlasses) };
  if (/\b(hat|beanie|cap|cowboy|bandana|top ?hat)\b/.test(raw)) {
    return { label: text, test: wrap((c) => c.kind === "human" && c.traits.hat !== "none") };
  }
  if (/\b(beard|mustache|moustache|goatee|facial hair|stubble)\b/.test(raw)) {
    return { label: text, test: wrap((c) => c.kind === "human" && c.traits.facialHair !== "none") };
  }
  if (/\bearing/.test(raw)) return { label: text, test: wrap((c) => Boolean(c.traits.earrings)) };
  if (/\bfreckle/.test(raw)) return { label: text, test: wrap((c) => Boolean(c.traits.freckles)) };
  if (/\b(lipstick|makeup)\b/.test(raw)) return { label: text, test: wrap((c) => Boolean(c.traits.lipstick)) };
  if (/\bcollar\b/.test(raw)) return { label: text, test: wrap((c) => c.kind !== "human" && Boolean(c.traits.collar)) };

  if (/\b(shepherd|spaniel|bulldog)\b/.test(raw)) {
    const breed = raw.match(/\b(shepherd|spaniel|bulldog)\b/)[1];
    return { label: text, test: wrap((c) => c.kind === "dog" && c.breed === breed) };
  }
  if (/\b(striped|stripes|strip)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "cat" && c.traits.pattern === "stripes") };
  if (/\bcalico\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "cat" && c.traits.pattern === "calico") };
  if (/\bcolorpoint|siamese\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "cat" && c.traits.pattern === "colorpoint") };

  if (/\bhair\b/.test(raw)) {
    if (/\b(black)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "human" && familyOf(c.traits.hair, HAIR_FAMILIES) === "black") };
    if (/\b(brown|brunette)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "human" && familyOf(c.traits.hair, HAIR_FAMILIES) === "brown") };
    if (/\b(blond|blonde)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "human" && familyOf(c.traits.hair, HAIR_FAMILIES) === "blond") };
    if (/\b(red|ginger|auburn)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "human" && familyOf(c.traits.hair, HAIR_FAMILIES) === "red") };
    if (/\b(gray|grey|white|silver)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "human" && familyOf(c.traits.hair, HAIR_FAMILIES) === "gray") };
    if (/\b(long)\b/.test(raw)) return { label: text, test: wrap((c) => c.traits.hairStyle === "long") };
    if (/\b(ponytail)\b/.test(raw)) return { label: text, test: wrap((c) => c.traits.hairStyle === "ponytail") };
    if (/\b(bun|buns)\b/.test(raw)) return { label: text, test: wrap((c) => c.traits.hairStyle === "bun") };
    if (/\b(curly|curls)\b/.test(raw)) return { label: text, test: wrap((c) => c.traits.hairStyle === "curly") };
    if (/\b(afro)\b/.test(raw)) return { label: text, test: wrap((c) => c.traits.hairStyle === "afro") };
    if (/\b(buzz)\b/.test(raw)) return { label: text, test: wrap((c) => c.traits.hairStyle === "buzz") };
    if (/\b(bald|shaved head|no hair)\b/.test(raw)) return { label: text, test: wrap((c) => c.traits.hairStyle === "bald") };
    return { label: text, test: wrap((c) => c.kind === "human") };
  }
  if (/\b(fur|coat|pelt)\b/.test(raw)) {
    if (/\b(dark|black|brown)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind !== "human" && familyOf(c.traits.fur, FUR_FAMILIES) === "dark") };
    if (/\b(golden|tan|orange)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind !== "human" && familyOf(c.traits.fur, FUR_FAMILIES) === "golden") };
    if (/\b(light|cream|white|gray|grey)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind !== "human" && familyOf(c.traits.fur, FUR_FAMILIES) === "light") };
    return { label: text, test: wrap((c) => c.kind !== "human") };
  }
  if (/\bskin\b/.test(raw)) {
    if (/\b(light|pale|fair)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "human" && familyOf(c.traits.skin, SKIN_FAMILIES) === "light") };
    if (/\b(medium|tan|olive)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "human" && familyOf(c.traits.skin, SKIN_FAMILIES) === "medium") };
    if (/\b(dark|brown|deep)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "human" && familyOf(c.traits.skin, SKIN_FAMILIES) === "deep") };
    return { label: text, test: wrap((c) => c.kind === "human") };
  }
  if (/\b(shirt|clothes|clothing|outfit|jacket|sweater|top\b)/.test(raw)) {
    if (/\b(blue)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "human" && familyOf(c.traits.shirt, SHIRT_FAMILIES) === "blue") };
    if (/\b(green)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "human" && familyOf(c.traits.shirt, SHIRT_FAMILIES) === "green") };
    if (/\b(orange|red)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "human" && familyOf(c.traits.shirt, SHIRT_FAMILIES) === "orange") };
    if (/\b(yellow|gold)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "human" && familyOf(c.traits.shirt, SHIRT_FAMILIES) === "yellow") };
    if (/\b(purple|pink|violet)\b/.test(raw)) return { label: text, test: wrap((c) => c.kind === "human" && familyOf(c.traits.shirt, SHIRT_FAMILIES) === "purple") };
    return { label: text, test: wrap((c) => c.kind === "human") };
  }
  if (/\b(smil|happy|grin)\b/.test(raw)) return { label: text, test: wrap((c) => ["happy", "grin"].includes(c.traits.expression)) };
  if (/\b(sleepy|sleeping|tired|yawn|napping)\b/.test(raw)) return { label: text, test: wrap((c) => c.traits.expression === "sleepy") };
  if (/\b(grumpy|angry|frown|annoyed|mad)\b/.test(raw)) return { label: text, test: wrap((c) => c.traits.expression === "grumpy") };
  if (/\b(surprised|shocked|startled)\b/.test(raw)) return { label: text, test: wrap((c) => c.traits.expression === "surprised") };
  if (/\b(sad|upset|crying)\b/.test(raw)) return { label: text, test: wrap((c) => c.traits.expression === "sad") };
  return null;
}

function loadSoloRecord() {
  try {
    const saved = JSON.parse(localStorage.getItem(SOLO_STORAGE_KEY) || "{}");
    state.soloRecord = {
      wins: saved.wins || 0,
      losses: saved.losses || 0,
      robotGuesses: saved.robotGuesses || 0,
    };
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
  return checked ? checked.value : "rookie";
}

let soloEventCounter = 0;
function soloEventId() {
  soloEventCounter += 1;
  return `solo-${soloEventCounter}`;
}

function soloPushEvent(event) {
  state.solo.events.push(event);
  state.game.events = state.solo.events;
}

function startSolo(event) {
  event.preventDefault();
  if (state.eventSource) state.eventSource.close();
  state.eventSource = null;
  state.streamKey = "";
  if (state.soloTimer) clearTimeout(state.soloTimer);
  const tier = soloDifficulty();
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const pool = window.WhoAmI.generatePool(seed, 24);
  const yourIndex = Math.floor(Math.random() * pool.length);
  let robotIndex = Math.floor(Math.random() * pool.length);
  if (robotIndex === yourIndex) robotIndex = (robotIndex + 1) % pool.length;

  state.entryMode = "solo";
  state.playerId = "you";
  state.solo = {
    tier,
    tierLabel: SOLO_TIERS[tier].label,
    events: [],
    robotSecretIndex: robotIndex,
    robotBank: buildQuestionBank(pool),
    lastRobotBank: null,
    robotCandidates: new Set(pool.map((c) => c.index)),
    robotGuessCount: 0,
    robotTimer: null,
    finished: false,
  };
  state.pool = pool;
  state.eliminated = new Set();
  state.guessedThisRound = false;
  state.guessMode = false;
  state.showReveal = false;
  state.game = {
    code: "",
    seed,
    count: pool.length,
    status: "active",
    yourSecretIndex: yourIndex,
    yourTurn: true,
    players: [
      { id: "you", name: "You" },
      { id: "robot", name: "Robot" },
    ],
    opponents: [{ id: "robot", name: `the ${SOLO_TIERS[tier].label} Robot` }],
    events: state.solo.events,
    messages: [],
    winnerId: null,
  };
  soloPushEvent({
    id: soloEventId(),
    type: "system",
    text: `You are playing the ${SOLO_TIERS[tier].label} robot. Ask yes/no questions; it answers truthfully and asks its own.`,
  });
  els.setupView.hidden = true;
  els.lobbyPanel.hidden = true;
  els.playArea.hidden = false;
  els.resultBackdrop.hidden = true;
  els.chatPanel.hidden = true;
  els.playArea.classList.add("is-solo");
  els.connectionStatus.textContent = "Offline duel";
  renderSolo();
  revealYourCharacter();
}

function renderSolo() {
  const solo = state.solo;
  if (!solo) return;
  els.opponentName.textContent = `the ${solo.tierLabel} Robot`;
  const openForMe = solo.events.some((e) => e.type === "question" && e.askerId !== state.playerId && !e.answer);
  const last = solo.events[solo.events.length - 1];
  if (solo.finished) {
    els.gameMessage.textContent = "Round over — deal again for a rematch.";
  } else if (last?.type === "guess" && last.guesserId === "robot") {
    els.gameMessage.textContent = last.correct
      ? "The robot guessed your character!"
      : `The robot guessed wrong. Keep asking.`;
  } else if (last?.type === "question" && last.askerId === "robot" && !last.answer) {
    els.gameMessage.textContent = "The robot asked you a question.";
  } else if (last?.type === "question" && last.askerId === "you") {
    els.gameMessage.textContent = last.answer
      ? `The robot answered ${last.answer.toUpperCase()}.`
      : "Waiting for the robot…";
  } else {
    els.gameMessage.textContent = "Ask a yes/no question below, or flip cards to take notes.";
  }
  els.guessModeButton.textContent = state.guessMode ? "Cancel guess" : "Make a final guess";
  els.guessModeButton.classList.toggle("is-active", state.guessMode);
  els.guessModeButton.disabled = solo.finished || state.guessedThisRound;
  els.askInput.disabled = solo.finished || openForMe;
  els.askInput.placeholder = openForMe ? "Answer the robot's question first" : "Is your character wearing a hat?";
  renderBoard();
  renderYourCharacter();
  renderAsks();
  renderEventFeedSolo();
}

function renderEventFeedSolo() {
  const solo = state.solo;
  const last = solo.events[solo.events.length - 1];
  if (!last) return;
  if (last.type === "guess" && last.guesserId === "robot" && !last.correct) {
    els.gameMessage.textContent = `The robot guessed wrong (${solo.robotGuessCount} wrong so far).`;
  }
}

async function askSoloQuestion(event) {
  event.preventDefault();
  const solo = state.solo;
  if (!solo || solo.finished) return;
  const text = els.askInput.value.trim();
  if (!text) return;
  if (solo.events.some((e) => e.type === "question" && e.askerId !== state.playerId && !e.answer)) {
    els.gameMessage.textContent = "Answer the robot's question first.";
    return;
  }
  const parsed = parseSoloQuestion(text);
  const robotChar = state.pool[solo.robotSecretIndex];
  const openQuestion = { id: soloEventId(), type: "question", askerId: "you", label: text, answer: null, answeredByName: null };
  if (!parsed) {
    soloPushEvent({
      ...openQuestion,
      answer: "…",
      answeredByName: "Robot",
      unparseable: true,
    });
    els.askInput.value = "";
    renderSolo();
    soloScheduleRobotTurn(1400);
    return;
  }
  const answer = parsed.test(robotChar) ? "yes" : "no";
  soloPushEvent({ ...openQuestion, answer, answeredByName: "Robot" });
  els.askInput.value = "";
  GameHubJuice?.pop(answer === "yes" ? 420 : 240);
  renderSolo();
  soloScheduleRobotTurn(1100 + Math.random() * 700);
}

function soloRobotSecret() {
  return state.solo.robotSecretIndex;
}

function answerSoloQuestion(eventId, answer) {
  const solo = state.solo;
  if (!solo || solo.finished) return;
  const event = solo.events.find((e) => e.id === eventId);
  if (!event || event.answer) return;
  event.answer = answer;
  event.answeredByName = "You";
  // Narrow the robot's candidate set with the question's test.
  const candidates = solo.robotBank.filter((question) => question.label === event.label);
  const test = candidates[0]?.test;
  if (test) {
    for (const index of [...solo.robotCandidates]) {
      const result = test(state.pool[index]);
      if ((answer === "yes") !== result) solo.robotCandidates.delete(index);
    }
  }
  renderSolo();
  soloScheduleRobotTurn(900 + Math.random() * 600);
}

function soloScheduleRobotTurn(delay) {
  const solo = state.solo;
  if (solo.robotTimer) clearTimeout(solo.robotTimer);
  solo.robotTimer = setTimeout(soloRobotTurn, delay);
}

function soloRobotTurn() {
  const solo = state.solo;
  if (!solo || solo.finished) return;
  const tier = SOLO_TIERS[solo.tier];
  const remaining = [...solo.robotCandidates];
  // Guess once the candidate list is small enough for this tier.
  const shouldGuess = remaining.length <= tier.guessAt || (tier.guessAtThree && remaining.length === 3);
  if (shouldGuess && remaining.length) {
    const guessIndex = remaining[Math.floor(Math.random() * remaining.length)];
    solo.robotGuessCount += 1;
    state.soloRecord.robotGuesses += 1;
    persistSoloRecord();
    const correct = guessIndex === solo.robotSecretIndex;
    soloPushEvent({
      id: soloEventId(),
      type: "guess",
      guesserId: "robot",
      guesserName: `The ${solo.tierLabel} Robot`,
      targetName: "You",
      characterIndex: guessIndex,
      correct,
    });
    renderSolo();
    if (correct) {
      soloFinish(false);
    } else {
      solo.robotCandidates.delete(guessIndex);
      GameHubJuice?.tick();
      renderSolo();
    }
    return;
  }
  if (!remaining.length) {
    // Should not happen (a guess fires at 0/1/2 left), but stay safe.
    soloRobotGuessFallback();
    return;
  }
  // Pick the question with the most balanced split (greedy information gain).
  const bank = solo.robotBank;
  let best = null;
  let bestScore = Infinity;
  const slack = 1 - tier.askRange;
  for (const question of bank) {
    let yes = 0;
    for (const index of remaining) if (question.test(state.pool[index])) yes += 1;
    const no = remaining.length - yes;
    if (!yes || !no) continue;
    const score = (yes * yes + no * no) / remaining.length + Math.random() * slack * 6;
    if (score < bestScore) {
      bestScore = score;
      best = question;
    }
  }
  if (!best) {
    soloRobotGuessFallback();
    return;
  }
  soloPushEvent({
    id: soloEventId(),
    type: "question",
    askerId: "robot",
    askerName: `The ${solo.tierLabel} Robot`,
    label: best.label,
    answer: null,
    answeredByName: null,
  });
  renderSolo();
}

function soloRobotGuessFallback() {
  const solo = state.solo;
  const remaining = [...solo.robotCandidates];
  const guessIndex = remaining[Math.floor(Math.random() * remaining.length)];
  solo.robotGuessCount += 1;
  const correct = guessIndex === solo.robotSecretIndex;
  soloPushEvent({
    id: soloEventId(),
    type: "guess",
    guesserId: "robot",
    guesserName: `The ${solo.tierLabel} Robot`,
    targetName: "You",
    characterIndex: guessIndex,
    correct,
  });
  renderSolo();
  if (correct) soloFinish(false);
  else solo.robotCandidates.delete(guessIndex);
}

function soloSubmitGuess(characterIndex) {
  const solo = state.solo;
  if (!solo || solo.finished) return;
  state.guessedThisRound = true;
  state.guessMode = false;
  const correct = characterIndex === solo.robotSecretIndex;
  soloPushEvent({
    id: soloEventId(),
    type: "guess",
    guesserId: "you",
    guesserName: "You",
    targetName: `the ${solo.tierLabel} Robot`,
    characterIndex,
    correct,
  });
  renderSolo();
  if (correct) soloFinish(true);
  else {
    GameHubJuice?.drop();
    renderSolo();
  }
}

function soloFinish(youWon) {
  const solo = state.solo;
  solo.finished = true;
  state.game.status = "finished";
  state.game.winnerId = youWon ? "you" : "robot";
  if (solo.robotTimer) clearTimeout(solo.robotTimer);
  if (youWon) {
    state.soloRecord.wins += 1;
    const chips = solo.tier === "mastermind" ? 8 : solo.tier === "sleuth" ? 5 : 3;
    GameHubProfile?.achieve("whoami-robot-win");
    if (state.soloRecord.wins >= 5) GameHubProfile?.achieve("whoami-robot-5");
    GameHubProfile?.award("whoami", chips, `Cracked the ${solo.tierLabel} robot's character`, state.soloRecord.wins);
    GameHubJuice?.win();
  } else {
    state.soloRecord.losses += 1;
    GameHubProfile?.award("whoami", 1, "The detective robot read your face", 0);
    GameHubJuice?.lose();
  }
  persistSoloRecord();
  renderSolo();
  showSoloResult(youWon);
}

function showSoloResult(youWon) {
  const solo = state.solo;
  const lastGuess = [...solo.events].reverse().find((e) => e.type === "guess");
  els.resultTitle.textContent = youWon ? "You won!" : `The ${solo.tierLabel} Robot won`;
  els.resultBody.textContent = youWon
    ? `You picked the robot's secret character${lastGuess ? ` on guess ${solo.events.filter((e) => e.type === "guess" && e.guesserId === "you").length}` : ""}. Great detective work.`
    : `The robot guessed your character after ${solo.robotGuessCount} of its own guesses. Better luck next deal.`;
  els.resultBackdrop.hidden = false;
  state.guessedThisRound = false;
}

function soloRematch() {
  els.resultBackdrop.hidden = true;
  startSolo({ preventDefault() {} });
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
    return;
  }
  const me = state.pool[state.game.yourSecretIndex];
  if (!me) {
    return;
  }
  els.yourCharacterPortrait.append(window.WhoAmI.renderPortrait(me, { className: "your-portrait-svg" }));
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

function renderAsks() {
  els.askDisplay.innerHTML = "";
  const events = (state.game.events || []).filter((e) => e.type === "question");
  if (!events.length) {
    const empty = document.createElement("p");
    empty.className = "ask-empty";
    empty.textContent = "No questions yet. Type one below to start.";
    els.askDisplay.append(empty);
    return;
  }
  // Newest first so the live question sits at the top.
  const ordered = [...events].reverse();
  ordered.forEach((event) => {
    const row = document.createElement("div");
    const fromMe = event.askerId === state.playerId;
    row.className = `ask-row${fromMe ? " is-mine" : " is-theirs"}`;

    const meta = document.createElement("div");
    meta.className = "ask-meta";
    meta.textContent = fromMe ? "You asked" : `${event.askerName} asked you`;
    row.append(meta);

    const text = document.createElement("div");
    text.className = "ask-text";
    text.textContent = event.label;
    row.append(text);

    if (event.answer) {
      const pill = document.createElement("span");
      pill.className = `ask-answer answer-${event.answer}`;
      pill.textContent = event.answer.toUpperCase();
      row.append(pill);
      const answerer = document.createElement("div");
      answerer.className = "ask-meta";
      answerer.textContent = `Answered by ${event.answeredByName || "opponent"}`;
      row.append(answerer);
    } else if (!fromMe) {
      // Open question for me to answer.
      const pending = document.createElement("div");
      pending.className = "ask-pending";
      pending.textContent = "Waiting for your answer";
      row.append(pending);
      const actions = document.createElement("div");
      actions.className = "ask-actions";
      const yes = document.createElement("button");
      yes.type = "button";
      yes.className = "primary-button";
      yes.textContent = "Yes";
      yes.addEventListener("click", () => answerQuestion(event.id, "yes"));
      const no = document.createElement("button");
      no.type = "button";
      no.className = "secondary-button";
      no.textContent = "No";
      no.addEventListener("click", () => answerQuestion(event.id, "no"));
      actions.append(yes, no);
      row.append(actions);
    } else {
      const pending = document.createElement("div");
      pending.className = "ask-pending";
      pending.textContent = "Waiting for opponent to answer";
      row.append(pending);
    }
    els.askDisplay.append(row);
  });
  els.askDisplay.scrollTop = 0;
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
  const last = events[events.length - 1];
  if (last.type === "system") {
    els.gameMessage.textContent = last.text;
  } else if (last.type === "question") {
    if (last.askerId === state.playerId) {
      els.gameMessage.textContent = last.answer
        ? `${last.answeredByName} answered: ${last.answer.toUpperCase()}.`
        : `You asked: "${last.label}"`;
    } else {
      els.gameMessage.textContent = last.answer
        ? `You answered ${last.answer.toUpperCase()} to ${last.askerName}.`
        : `${last.askerName} is asking: "${last.label}"`;
    }
  } else if (last.type === "guess") {
    const correctWord = last.correct ? "guessed correctly" : "guessed wrong";
    els.gameMessage.textContent = `${last.guesserName} ${correctWord} about ${last.targetName}'s character.`;
  }
}

function renderPlayArea() {
  if (!state.game) return;
  const inPlay = state.game.status !== "lobby";
  els.playArea.hidden = !inPlay;
  els.lobbyPanel.hidden = inPlay;
  if (!inPlay) {
    state.guessMode = false;
    return;
  }
  els.opponentName.textContent = opponentName();
  if (state.game.status !== "active") {
    state.guessMode = false;
  }
  if (els.guessModeButton) {
    els.guessModeButton.disabled = state.game.status !== "active" || state.guessedThisRound;
  }
  if (els.askInput) {
    const openForMe = (state.game.events || []).some(
      (e) => e.type === "question" && e.askerId !== state.playerId && !e.answer
    );
    els.askInput.disabled = state.game.status !== "active" || openForMe;
    els.askInput.placeholder = openForMe
      ? "Answer the question above first"
      : "Is your character wearing a hat?";
  }
  renderBoard();
  renderYourCharacter();
  renderAsks();
  renderChat();
  renderEventFeed();
}

function render() {
  if (state.entryMode === "solo" && state.solo) {
    renderSolo();
    return;
  }
  if (!state.game) return;
  const inLobby = state.game.status === "lobby";
  if (inLobby) {
    els.playArea.hidden = true;
    els.lobbyPanel.hidden = false;
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
    if (state.entryMode === "solo" && state.solo) soloRematch();
    else showStartMode("create");
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

// Right-click / long-press as a power-user shortcut for the final guess.
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
}

function showStartMode(mode) {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  if (state.solo?.robotTimer) clearTimeout(state.solo.robotTimer);
  state.streamKey = "";
  state.game = null;
  state.solo = null;
  state.pool = [];
  state.eliminated = new Set();
  state.entryMode = mode || "choice";
  els.setupView.hidden = false;
  els.playArea.hidden = true;
  els.lobbyPanel.hidden = true;
  els.modalBackdrop.hidden = true;
  els.guessBackdrop.hidden = true;
  els.resultBackdrop.hidden = true;
  els.choicePanel.hidden = mode !== "choice";
  els.createForm.hidden = mode !== "create";
  els.joinForm.hidden = mode !== "join";
  els.soloForm.hidden = mode !== "solo";
  if (mode === "join") els.joinCode.focus();
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
  els.soloForm.addEventListener("submit", startSolo);
  els.showSolo.addEventListener("click", () => showStartMode("solo"));
  els.nameForm.addEventListener("submit", joinTable);
  els.readyButton.addEventListener("click", setReady);
  els.startButton.addEventListener("click", startGame);
  els.guessModeButton.addEventListener("click", () => {
    if (state.game?.status !== "active") return;
    state.guessMode = !state.guessMode;
    renderBoard();
  });
  els.askForm.addEventListener("submit", sendAsk);
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
loadSoloRecord();
const params = new URLSearchParams(window.location.search);
const gameCode = params.get("game");
if (gameCode) loadGame(gameCode.toUpperCase(), { entryMode: "join" });
