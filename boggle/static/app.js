const PLAYER_KEY_PREFIX = "boggle-table-player-";
const SOLO_STORAGE_KEY = "boggle-robot-v1";
const SOLO_TIER_NAMES = { casual: "Casual", sharp: "Sharp", master: "Master" };
// Robot strength tiers. Every tier hunts only from the everyday-word list
// (never the raw board dictionary), so no setting races you to words like
// "iao" or "roka". band = how far into the familiarity-ordered list the tier
// may reach, maxLength caps the words it bothers with, and finds is the
// number of words it will have found on a 3:00 round (scaled by the timer).
const SOLO_TIERS = {
  casual: { band: 0.4, maxLength: 5, finds: { 4: 6, 5: 8, 6: 9 } },
  sharp: { band: 0.75, maxLength: 7, finds: { 4: 11, 5: 13, 6: 15 } },
  master: { band: 1, maxLength: 10, finds: { 4: 17, 5: 21, 6: 24 } },
};
// Tier counts above are quoted for this round length; other timers scale.
const SOLO_REFERENCE_SECONDS = 180;
// Mirrors the server's weighted letter pool so solo boards play the same.
const SOLO_LETTER_DISTRIBUTION = (
  "E".repeat(12) + "A".repeat(9) + "I".repeat(9) + "O".repeat(8) +
  "N".repeat(6) + "R".repeat(6) + "T".repeat(6) + "L".repeat(4) +
  "S".repeat(4) + "U".repeat(4) + "D".repeat(4) + "G".repeat(3) +
  "BCMPFHVWY".repeat(2) + "KJXQZ"
).split("");

const state = {
  game: null,
  playerId: "",
  eventSource: null,
  clock: null,
  entryMode: "choice",
  solo: null,
  soloTimer: null,
  soloRecord: { wins: 0, losses: 0 },
  boardSignature: "",
  boardRotations: [],
};

const els = {
  setupView: document.querySelector("#setupView"),
  choicePanel: document.querySelector("#choicePanel"),
  gameView: document.querySelector("#gameView"),
  createForm: document.querySelector("#createForm"),
  joinByCodeForm: document.querySelector("#joinByCodeForm"),
  soloForm: document.querySelector("#soloForm"),
  showJoin: document.querySelector("#showJoin"),
  showCreate: document.querySelector("#showCreate"),
  showSolo: document.querySelector("#showSolo"),
  soloDiffRow: document.querySelector("#soloDiffRow"),
  soloBoardSize: document.querySelector("#soloBoardSize"),
  soloTimerSeconds: document.querySelector("#soloTimerSeconds"),
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

// ----- Solo hunt vs the word robot -----
//
// The board and the full robot word list are computed locally: the sorted
// dictionary supports prefix membership by binary search, so the DFS that
// solves the board costs no extra memory. The robot "finds" its words on a
// schedule during the round so it feels like a live rival.

function soloDictionary() {
  if (state.solo?.words) return state.solo.words;
  const raw = window.BoggleWords?.RAW || "";
  const words = raw.split("\n").filter((w) => w.length >= 3);
  words.sort();
  if (state.solo) state.solo.words = words;
  return words;
}

// The everyday words (most common first) the robot is allowed to hunt. Built
// by tools/gen_boggle_common.py, so no tier can play a word a person would
// not recognise.
function soloCommonList() {
  if (state.solo?.common) return state.solo.common;
  const words = window.BoggleCommon?.WORDS || [];
  if (state.solo) state.solo.common = words;
  return words;
}

function soloCommonRank() {
  if (state.solo?.commonRank) return state.solo.commonRank;
  const rank = new Map();
  soloCommonList().forEach((word, index) => rank.set(word, index));
  if (state.solo) state.solo.commonRank = rank;
  return rank;
}

function soloLowerBound(list, target) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function soloIsWord(list, word) {
  const lower = word.toLowerCase();
  const index = soloLowerBound(list, lower);
  return list[index] === lower;
}

function soloHasPrefix(list, prefix) {
  const index = soloLowerBound(list, prefix);
  return index < list.length && list[index].startsWith(prefix);
}

// Match a board tile ("Qu" counts as one tile) against the next letters of
// word; word may arrive in any case (the UI normalizes to uppercase).
function tileMatches(tile, word, position) {
  if (tile === "Qu") return word.toLowerCase().startsWith("qu", position);
  const char = word[position];
  return Boolean(char) && char.toLowerCase() === tile.toLowerCase();
}

function soloWordReachable(board, word) {
  const size = board.length;
  const seen = new Set();
  const search = (r, c, position) => {
    if (position >= word.length) return true;
    for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const key = nr * size + nc;
      if (seen.has(key)) continue;
      const tile = board[nr][nc];
      const step = tile === "Qu" ? 2 : 1;
      if (!tileMatches(tile, word, position)) continue;
      seen.add(key);
      if (search(nr, nc, position + step)) { seen.delete(key); return true; }
      seen.delete(key);
    }
    return false;
  };
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const tile = board[r][c];
      const step = tile === "Qu" ? 2 : 1;
      if (!tileMatches(tile, word, 0)) continue;
      seen.add(r * size + c);
      if (search(r, c, step)) return true;
      seen.delete(r * size + c);
    }
  }
  return false;
}

// Find every dictionary word on the board.
function soloSolveBoard(board) {
  const list = soloDictionary();
  const size = board.length;
  const found = new Set();
  const walk = (r, c, prefix, seen) => {
    for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const key = nr * size + nc;
      if (seen.has(key)) continue;
      const tile = board[nr][nc];
      const next = prefix + (tile === "Qu" ? "qu" : tile.toLowerCase());
      if (next.length > 10 || !soloHasPrefix(list, next)) continue;
      if (next.length >= 3 && soloIsWord(list, next)) found.add(next);
      seen.add(key);
      walk(nr, nc, next, seen);
      seen.delete(key);
    }
  };
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const tile = board[r][c];
      const start = tile === "Qu" ? "qu" : tile.toLowerCase();
      if (!soloHasPrefix(list, start)) continue;
      walk(r, c, start, new Set([r * size + c]));
    }
  }
  return [...found];
}

function randomSoloBoard(size) {
  const cells = [];
  for (let i = 0; i < size * size; i += 1) {
    const letter = SOLO_LETTER_DISTRIBUTION[Math.floor(Math.random() * SOLO_LETTER_DISTRIBUTION.length)];
    cells.push(letter === "Q" ? "Qu" : letter);
  }
  const board = [];
  for (let r = 0; r < size; r += 1) board.push(cells.slice(r * size, (r + 1) * size));
  return board;
}

function boggleWordPoints(word) {
  const length = word.length;
  if (length <= 4) return 1;
  if (length === 5) return 2;
  if (length === 6) return 3;
  if (length === 7) return 5;
  return 11;
}

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

function soloDifficulty() {
  const checked = els.soloDiffRow?.querySelector("input[name=soloDiff]:checked");
  return checked ? checked.value : "casual";
}

function startSolo(event) {
  event.preventDefault();
  if (state.eventSource) state.eventSource.close();
  state.eventSource = null;
  if (state.soloTimer) clearTimeout(state.soloTimer);
  const size = Number(els.soloBoardSize.value) || 4;
  const timerSeconds = Number(els.soloTimerSeconds.value) || 180;
  const difficulty = soloDifficulty();
  const board = randomSoloBoard(size);
  state.entryMode = "solo";
  state.playerId = "you";
  state.solo = {
    difficulty,
    words: null, // full board dictionary, parsed lazily on first use
    common: null, // everyday-word list, parsed lazily on first use
    commonRank: null,
    robotPlan: [],
    robotTimer: null,
    finishTimer: null,
  };
  state.game = {
    code: "ROBOT",
    hostId: "you",
    size,
    timerSeconds,
    status: "active",
    board,
    startsAt: Date.now() / 1000,
    endsAt: Date.now() / 1000 + timerSeconds,
    players: [
      { id: "you", name: "You", ready: true, wordCount: 0, words: [] },
      { id: "robot", name: `${SOLO_TIER_NAMES[difficulty]} Robot`, ready: true, wordCount: 0, words: [] },
    ],
    duplicateWords: [],
    challenges: [],
  };
  // Plan the robot's hunt, then pace its finds across the round.
  state.solo.robotPlan = soloRobotPlan(board, difficulty, timerSeconds);
  els.setupView.hidden = true;
  els.gameView.hidden = false;
  els.connectionStatus.textContent = "Offline hunt";
  els.gameMessage.textContent = "Find words. Press Enter to submit.";
  render();
  if (state.game.status === "active" && state.game.board.length) {
    // Board is hidden in lobbies only; force it visible for solo.
    els.letterBoard.hidden = false;
  }
  scheduleSoloRobotReveal();
  state.solo.finishTimer = setTimeout(soloFinish, timerSeconds * 1000);
}

// Choose the words the robot will find this round. Candidates are the board's
// everyday words inside the tier's familiarity band, and the count is capped
// for the round length, so a long hunt cannot become a dictionary dump.
function soloRobotPlan(board, difficulty, timerSeconds) {
  const tier = SOLO_TIERS[difficulty] || SOLO_TIERS.casual;
  const rank = soloCommonRank();
  const bandEnd = Math.ceil(soloCommonList().length * tier.band);
  const eligible = soloSolveBoard(board).filter((word) => {
    const index = rank.get(word);
    return index !== undefined && index < bandEnd && word.length <= tier.maxLength;
  });
  for (let i = eligible.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  const base = tier.finds[board.length] || tier.finds[4];
  const target = Math.max(1, Math.round(base * (timerSeconds / SOLO_REFERENCE_SECONDS)));
  return eligible.slice(0, target);
}

function scheduleSoloRobotReveal() {
  const solo = state.solo;
  const game = state.game;
  if (!solo || !game || game.status !== "active") return;
  if (!solo.robotPlan.length) return;
  const remaining = (game.endsAt - Date.now() / 1000) * 1000;
  const finds = solo.robotPlan.length;
  const delay = Math.max(450, (remaining / (finds + 1)) * (0.6 + Math.random() * 0.8));
  solo.robotTimer = setTimeout(() => {
    if (!state.game || state.game.status !== "active" || !solo.robotPlan.length) return;
    const word = solo.robotPlan.shift();
    const robot = state.game.players.find((player) => player.id === "robot");
    robot.words.push(word);
    robot.wordCount = robot.words.length;
    render();
    scheduleSoloRobotReveal();
  }, delay);
}

function soloSubmitWord(event) {
  event.preventDefault();
  const game = state.game;
  if (!game || game.status !== "active") return;
  const word = normalizeWord(els.wordInput.value);
  if (!word) return;
  const you = game.players.find((player) => player.id === "you");
  const reject = (reason) => {
    els.gameMessage.textContent = reason;
    GameHubJuice?.tick();
  };
  if (word.length < 3) return reject("Words need at least 3 letters.");
  if (you.words.some((existing) => normalizeWord(existing) === word)) return reject("You already found that word.");
  const list = soloDictionary();
  if (!soloIsWord(list, word)) return reject(`${word} isn't in the dictionary.`);
  if (!soloWordReachable(game.board, word)) return reject(`${word} can't be traced on this board.`);
  you.words.push(word);
  you.wordCount = you.words.length;
  els.wordInput.value = "";
  els.gameMessage.textContent = `Found ${word.toUpperCase()} — ${boggleWordPoints(word.toLowerCase())} point${boggleWordPoints(word.toLowerCase()) === 1 ? "" : "s"}.`;
  GameHubJuice?.pop(300 + word.length * 40);
  render();
}

function soloDuplicateSet() {
  const game = state.game;
  const counts = new Map();
  for (const player of game.players) {
    for (const word of player.words) {
      const key = normalizeWord(word);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([word]) => word));
}

function soloScores() {
  const game = state.game;
  const duplicates = soloDuplicateSet();
  return game.players.map((player) => {
    const unique = player.words.filter((word) => !duplicates.has(normalizeWord(word)));
    return {
      player,
      score: unique.reduce((sum, word) => sum + boggleWordPoints(normalizeWord(word)), 0),
      words: unique.length,
    };
  });
}

function soloFinish() {
  const game = state.game;
  const solo = state.solo;
  if (!game || game.status !== "active") return;
  clearTimeout(solo.robotTimer);
  game.status = "finished";
  // Whatever the robot had not revealed by the buzzer goes unclaimed: its
  // score is what it actually found during the round, not a backlog dump.
  solo.robotPlan = [];
  game.duplicateWords = [...soloDuplicateSet()];
  const scores = soloScores();
  const you = scores.find((entry) => entry.player.id === "you");
  const bot = scores.find((entry) => entry.player.id === "robot");
  const youWon = you.score > bot.score;
  if (youWon) {
    state.soloRecord.wins += 1;
    const chips = solo.difficulty === "master" ? 8 : solo.difficulty === "sharp" ? 5 : 3;
    GameHubProfile?.achieve("boggle-robot-win");
    if (state.soloRecord.wins >= 5) GameHubProfile?.achieve("boggle-robot-5");
    GameHubProfile?.award("boggle", chips,
      `Out-worded the ${SOLO_TIER_NAMES[solo.difficulty]} robot ${you.score} to ${bot.score}`, state.soloRecord.wins);
    GameHubJuice?.win();
  } else {
    state.soloRecord.losses += 1;
    GameHubProfile?.award("boggle", 1, `Lost the word race ${you.score} to ${bot.score}`, 0);
    GameHubJuice?.lose();
  }
  persistSoloRecord();
  els.gameMessage.textContent = youWon
    ? `You win ${you.score} to ${bot.score}! (${you.words} words to the robot's ${bot.words})`
    : `The ${SOLO_TIER_NAMES[solo.difficulty]} robot wins ${bot.score} to ${you.score}.`;
  render();
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
  if (state.entryMode === "solo" && state.solo) {
    soloSubmitWord(event);
    return;
  }
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

// Dice orientation is random but fixed per board: re-rolling on every render
// would make the letters visibly spin whenever a game event re-renders.
function boardRotations(board) {
  const signature = JSON.stringify(board);
  if (state.boardSignature !== signature) {
    state.boardSignature = signature;
    state.boardRotations = board.flat().map(() => `${Math.floor(Math.random() * 4) * 90}deg`);
  }
  return state.boardRotations;
}

function renderBoard() {
  els.letterBoard.innerHTML = "";
  const size = state.game.size;
  els.letterBoard.style.setProperty("--board-size", size);
  const rotations = boardRotations(state.game.board);
  state.game.board.flat().forEach((letter, index) => {
    const cell = document.createElement("div");
    cell.className = "letter-cell";
    cell.textContent = letter;
    cell.style.setProperty("--tile-rotation", rotations[index]);
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
  // Duplicates are only known once the round ends, so nothing may be crossed
  // out while the clock runs — otherwise a shared word would spoil the result
  // the moment the other hunter found it.
  const finished = state.game.status === "finished";
  const duplicates = !finished
    ? new Set()
    : state.entryMode === "solo"
      ? soloDuplicateSet()
      : new Set(state.game.duplicateWords || []);
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

      if (state.game.status === "finished" && listOwner.id !== state.playerId && state.entryMode !== "solo") {
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
  els.shareTools.hidden = !canInvite || state.entryMode === "solo";
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
    if (state.entryMode !== "solo") els.gameMessage.textContent = "Find words. Press Enter to submit.";
  } else if (state.entryMode !== "solo") {
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
    onModeChange: (mode) => {
      if (mode !== "solo") els.soloForm.hidden = true;
    },
  });
  els.createForm.addEventListener("submit", createGame);
  els.joinByCodeForm.addEventListener("submit", joinByCode);
  els.soloForm.addEventListener("submit", startSolo);
  els.showSolo.addEventListener("click", () => {
    els.choicePanel.hidden = true;
    els.createForm.hidden = true;
    els.joinByCodeForm.hidden = true;
    els.soloForm.hidden = false;
  });
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
    if (state.soloTimer) clearTimeout(state.soloTimer);
    if (state.solo?.robotTimer) clearTimeout(state.solo.robotTimer);
    if (state.solo?.finishTimer) clearTimeout(state.solo.finishTimer);
    els.setupView.hidden = false;
    els.gameView.hidden = true;
    state.game = null;
    state.solo = null;
    state.playerId = "";
    state.entryMode = "choice";
    els.connectionStatus.textContent = "Ready";
    els.choicePanel.hidden = false;
    els.createForm.hidden = true;
    els.joinByCodeForm.hidden = true;
    els.soloForm.hidden = true;
  });
}

bindEvents();
loadSoloRecord();
const params = new URLSearchParams(window.location.search);
const gameCode = params.get("game");
if (gameCode) loadGame(gameCode.toUpperCase(), { entryMode: "join" });
