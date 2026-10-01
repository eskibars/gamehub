const STORAGE_KEY = "word-find-creator-state-v1";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DEFAULT_WORDS = ["STORM", "UMBRELLA", "PUDDLE", "RAINCOAT", "THUNDER", "DRIZZLE", "BOOTS", "CLOUD"];
const DIRECTIONS = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
  { row: -1, col: -1 },
  { row: -1, col: 1 },
  { row: 1, col: -1 },
  { row: 1, col: 1 },
];

const state = {
  title: "Rainy Day Word Find",
  size: 12,
  fillStyle: "random",
  wordsText: DEFAULT_WORDS.join("\n"),
  puzzle: null,
  play: null, // { cells-for-word map, found, selection, seconds, won }
};

// Rotating highlight colors for found words in play mode.
const FOUND_COLORS = ["#236c5a", "#b8434e", "#356eb8", "#8a4a8c", "#b8702a", "#1f6e8e", "#7a8a2a", "#8a3568"];

const els = {
  saveStatus: document.querySelector("#saveStatus"),
  categorySelect: document.querySelector("#categorySelect"),
  playPuzzle: document.querySelector("#playPuzzle"),
  playOverlay: document.querySelector("#playOverlay"),
  exitPlay: document.querySelector("#exitPlay"),
  playTitle: document.querySelector("#playTitle"),
  playClock: document.querySelector("#playClock"),
  playMessage: document.querySelector("#playMessage"),
  playGrid: document.querySelector("#playGrid"),
  playBank: document.querySelector("#playBank"),
  playWon: document.querySelector("#playWon"),
  playWonStats: document.querySelector("#playWonStats"),
  playAgain: document.querySelector("#playAgain"),
  puzzleTitle: document.querySelector("#puzzleTitle"),
  gridSize: document.querySelector("#gridSize"),
  fillStyle: document.querySelector("#fillStyle"),
  wordInput: document.querySelector("#wordInput"),
  wordCount: document.querySelector("#wordCount"),
  clearWords: document.querySelector("#clearWords"),
  buildPuzzle: document.querySelector("#buildPuzzle"),
  shufflePuzzle: document.querySelector("#shufflePuzzle"),
  printPuzzle: document.querySelector("#printPuzzle"),
  buildMessage: document.querySelector("#buildMessage"),
  previewTitle: document.querySelector("#previewTitle"),
  previewStats: document.querySelector("#previewStats"),
  letterGrid: document.querySelector("#letterGrid"),
  wordBank: document.querySelector("#wordBank"),
};

function saveLocal() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      title: state.title,
      size: state.size,
      fillStyle: state.fillStyle,
      wordsText: state.wordsText,
    })
  );
  els.saveStatus.textContent = "Saved locally";
}

function loadLocal() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    state.title = parsed.title || state.title;
    state.size = cleanGridSize(parsed.size);
    state.fillStyle = parsed.fillStyle || state.fillStyle;
    state.wordsText = parsed.wordsText || state.wordsText;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function cleanGridSize(value) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 12;
  return Math.min(Math.max(parsed, 5), 30);
}

function normalizeWords() {
  const seen = new Set();
  return state.wordsText
    .split(/\n+/)
    .map((word) => {
      const label = word.toUpperCase().replace(/[^A-Z ]/g, "").replace(/\s+/g, " ").trim();
      const compact = label.replace(/[^A-Z]/g, "");
      return { label, compact };
    })
    .filter((word) => word.compact)
    .filter((word) => {
      if (seen.has(word.compact)) return false;
      seen.add(word.compact);
      return true;
    });
}

function emptyGrid(size) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => ""));
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const next = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[next]] = [shuffled[next], shuffled[index]];
  }
  return shuffled;
}

function canPlace(grid, word, row, col, direction) {
  for (let index = 0; index < word.length; index += 1) {
    const nextRow = row + direction.row * index;
    const nextCol = col + direction.col * index;
    if (nextRow < 0 || nextRow >= state.size || nextCol < 0 || nextCol >= state.size) return false;
    const current = grid[nextRow][nextCol];
    if (current && current !== word[index]) return false;
  }
  return true;
}

function overlapScore(grid, word, row, col, direction) {
  let score = 0;
  for (let index = 0; index < word.length; index += 1) {
    const current = grid[row + direction.row * index][col + direction.col * index];
    if (current === word[index]) score += 1;
  }
  return score;
}

function placementOptions(grid, word) {
  const options = [];
  DIRECTIONS.forEach((direction) => {
    for (let row = 0; row < state.size; row += 1) {
      for (let col = 0; col < state.size; col += 1) {
        if (canPlace(grid, word, row, col, direction)) {
          options.push({ row, col, direction, score: overlapScore(grid, word, row, col, direction) });
        }
      }
    }
  });
  return options;
}

function placeWord(grid, word, option) {
  const cells = [];
  for (let index = 0; index < word.length; index += 1) {
    const row = option.row + option.direction.row * index;
    const col = option.col + option.direction.col * index;
    grid[row][col] = word[index];
    cells.push(`${row}-${col}`);
  }
  return cells;
}

function randomFillLetter(words) {
  if (state.fillStyle !== "word-heavy") return ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  const source = words.join("") || ALPHABET;
  return source[Math.floor(Math.random() * source.length)];
}

function buildPuzzle({ alertOnMissed = false } = {}) {
  const normalized = normalizeWords();
  const usable = normalized.filter((word) => word.compact.length <= state.size);
  const tooLong = normalized.filter((word) => word.compact.length > state.size);
  const sorted = [...usable].sort((first, second) => second.compact.length - first.compact.length);
  let best = null;

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const grid = emptyGrid(state.size);
    const placements = [];
    const missed = [];
    let overlapCount = 0;

    sorted.forEach((word) => {
      const options = placementOptions(grid, word.compact);
      if (!options.length) {
        missed.push(word);
        return;
      }
      options.sort((first, second) => second.score - first.score);
      const topScore = options[0].score;
      const preferred = topScore > 0 ? options.filter((option) => option.score === topScore) : options;
      const option = shuffle(preferred).at(0);
      const cells = placeWord(grid, word.compact, option);
      overlapCount += option.score;
      placements.push({ word, cells });
    });

    const attemptResult = { grid, placements, missed, overlapCount };
    if (
      !best ||
      placements.length > best.placements.length ||
      (placements.length === best.placements.length && overlapCount > best.overlapCount)
    ) {
      best = attemptResult;
    }
    if (!missed.length && overlapCount > 0) break;
  }

  best.missed = [...new Set([...best.missed, ...tooLong])];
  best.grid = best.grid.map((row) => row.map((letter) => letter || randomFillLetter(usable.map((word) => word.compact))));
  state.puzzle = best;
  renderAll();

  if (alertOnMissed && best.missed.length) {
    window.alert(`Could not fit: ${best.missed.map((word) => word.label).join(", ")}. Try a larger grid size.`);
  }
}

function renderGrid() {
  const puzzle = state.puzzle;
  els.letterGrid.innerHTML = "";
  els.letterGrid.style.setProperty("--grid-size", state.size);

  (puzzle?.grid || emptyGrid(state.size)).forEach((row) => {
    row.forEach((letter) => {
      const cell = document.createElement("span");
      cell.className = "grid-cell";
      cell.textContent = letter || "";
      els.letterGrid.append(cell);
    });
  });
}

function renderWordBank() {
  const words = normalizeWords();
  const placed = new Set(state.puzzle?.placements.map((placement) => placement.word.compact) || []);
  els.wordBank.innerHTML = "";
  words.forEach((word) => {
    const item = document.createElement("li");
    item.textContent = word.label;
    if (state.puzzle && !placed.has(word.compact)) item.classList.add("not-placed");
    els.wordBank.append(item);
  });
}

function updateMessage() {
  const words = normalizeWords();
  els.wordCount.textContent = `${words.length} word${words.length === 1 ? "" : "s"} ready`;
  if (!state.puzzle) {
    els.buildMessage.textContent = "Add words and build a puzzle.";
    return;
  }
  const missed = state.puzzle.missed;
  if (missed.length) {
    els.buildMessage.textContent = `${state.puzzle.placements.length} placed. Could not fit: ${missed
      .map((word) => word.label)
      .join(", ")}.`;
  } else {
    const intersections = state.puzzle.overlapCount || 0;
    els.buildMessage.textContent = `${state.puzzle.placements.length} words hidden with ${intersections} intersection${
      intersections === 1 ? "" : "s"
    }.`;
  }
}

function renderAll() {
  els.puzzleTitle.value = state.title;
  els.gridSize.value = String(state.size);
  els.fillStyle.value = state.fillStyle;
  els.wordInput.value = state.wordsText;
  els.previewTitle.textContent = state.title.trim() ? state.title : "Untitled Word Find";
  els.previewStats.textContent = `${state.size} x ${state.size} puzzle`;
  renderGrid();
  renderWordBank();
  updateMessage();
}

function bindEvents() {
  els.puzzleTitle.addEventListener("input", () => {
    state.title = els.puzzleTitle.value;
    saveLocal();
    renderAll();
  });

  els.gridSize.addEventListener("change", () => {
    state.size = cleanGridSize(els.gridSize.value);
    saveLocal();
    buildPuzzle();
  });

  els.gridSize.addEventListener("input", () => {
    state.size = cleanGridSize(els.gridSize.value);
    saveLocal();
  });

  els.fillStyle.addEventListener("change", () => {
    state.fillStyle = els.fillStyle.value;
    saveLocal();
    buildPuzzle();
  });

  els.wordInput.addEventListener("input", () => {
    state.wordsText = els.wordInput.value;
    saveLocal();
    updateMessage();
    renderWordBank();
  });

  els.wordInput.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") buildPuzzle({ alertOnMissed: true });
  });

  els.clearWords.addEventListener("click", () => {
    state.wordsText = "";
    state.puzzle = null;
    saveLocal();
    renderAll();
  });

  els.buildPuzzle.addEventListener("click", () => buildPuzzle({ alertOnMissed: true }));
  els.shufflePuzzle.addEventListener("click", buildPuzzle);
  els.printPuzzle.addEventListener("click", () => window.print());
  els.categorySelect?.addEventListener("change", () => applyCategory(els.categorySelect.value));
  els.playPuzzle?.addEventListener("click", startPlay);
  els.exitPlay?.addEventListener("click", exitPlay);
  els.playAgain?.addEventListener("click", () => {
    startPlay();
  });
}

function populateCategories() {
  if (!els.categorySelect || !window.GameHubDictionaries) return;
  window.GameHubDictionaries.NAMES.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = `${name} (${window.GameHubDictionaries.words(name).length} words)`;
    els.categorySelect.append(option);
  });
}

function applyCategory(name) {
  if (!name || !window.GameHubDictionaries?.has(name)) return;
  const words = window.GameHubDictionaries.words(name);
  state.title = `${name} Word Find`;
  state.wordsText = words.join("\n");
  saveLocal();
  buildPuzzle({ alertOnMissed: false });
}

// ----- On-screen play mode -----
//
// A fresh shuffle of the current puzzle, played by dragging (or tap-tap)
// across the grid. Found words lock in with their own color; the bank
// strikes them off; the clock stops when the last word lands.

let playTimer = null;

function startPlay() {
  if (!normalizeWords().length) {
    els.buildMessage.textContent = "Add some words first — or pick a theme.";
    return;
  }
  // Fresh shuffle so the preview grid is not the one being played.
  buildPuzzle({ alertOnMissed: false });
  if (!state.puzzle?.placements?.length) {
    els.buildMessage.textContent = "Could not build a playable puzzle from these words.";
    return;
  }
  state.play = {
    colors: new Map(), // word.compact -> color index
    found: new Set(), // word.compact
    selection: new Map(), // "r-c" -> cell element
    anchor: null, // sticky tap anchor "r-c"
    dragging: false,
    seconds: 0,
    won: false,
  };
  els.playTitle.textContent = state.title.trim() ? state.title : "Word Find";
  els.playWon.hidden = true;
  els.playMessage.textContent = "Drag from the first letter to the last — any direction.";
  els.playOverlay.hidden = false;
  renderPlayBank();
  renderPlayGrid();
  if (playTimer) clearInterval(playTimer);
  playTimer = setInterval(() => {
    if (!state.play || state.play.won) return;
    state.play.seconds += 1;
    els.playClock.textContent = formatPlayClock(state.play.seconds);
  }, 1000);
  els.playClock.textContent = "0:00";
}

function exitPlay() {
  els.playOverlay.hidden = true;
  if (playTimer) clearInterval(playTimer);
  playTimer = null;
  state.play = null;
}

function formatPlayClock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function playWords() {
  return state.puzzle?.placements || [];
}

function renderPlayBank() {
  els.playBank.innerHTML = "";
  playWords().forEach((placement) => {
    const item = document.createElement("li");
    item.textContent = placement.word.label;
    item.dataset.word = placement.word.compact;
    if (state.play.found.has(placement.word.compact)) item.classList.add("is-found");
    els.playBank.append(item);
  });
}

function renderPlayGrid() {
  const play = state.play;
  els.playGrid.innerHTML = "";
  els.playGrid.style.setProperty("--grid-size", state.size);
  // Cell -> the words covering it, so found coloring handles overlaps.
  const cellWords = new Map();
  playWords().forEach((placement) => {
    placement.cells.forEach((key) => {
      if (!cellWords.has(key)) cellWords.set(key, []);
      cellWords.get(key).push(placement.word.compact);
    });
  });
  const foundCells = new Set();
  for (const [key, words] of cellWords) {
    if (words.every((word) => play.found.has(word))) foundCells.add(key);
  }
  const colorOf = new Map();
  let colorIndex = 0;
  for (const placement of playWords()) {
    if (play.found.has(placement.word.compact) && !colorOf.has(placement.word.compact)) {
      colorOf.set(placement.word.compact, FOUND_COLORS[colorIndex++ % FOUND_COLORS.length]);
    }
  }
  state.puzzle.grid.forEach((row, r) => {
    row.forEach((letter, c) => {
      const key = `${r}-${c}`;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "play-cell";
      cell.textContent = letter;
      cell.dataset.key = key;
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      if (play.selection.has(key) || play.anchor === key) cell.classList.add("is-sel");
      if (play.found.has(key)) {
        cell.classList.add("is-found");
        const words = cellWords.get(key) || [];
        const color = words.map((w) => colorOf.get(w)).find(Boolean) || FOUND_COLORS[0];
        cell.style.background = color;
      }
      cell.addEventListener("pointerdown", onPlayPointerDown);
      cell.addEventListener("pointerenter", onPlayPointerEnter);
      els.playGrid.append(cell);
    });
  });
}

// Selection model: press a cell and drag (touch or mouse) to extend a
// straight line; releasing on a single cell leaves it "sticky" so a second
// tap can complete the word tap-tap style.
function onPlayPointerDown(event) {
  const play = state.play;
  if (!play || play.won) return;
  event.preventDefault();
  const key = event.currentTarget.dataset.key;
  if (play.anchor && play.anchor !== key) {
    const [r0, c0] = play.anchor.split("-").map(Number);
    const [r1, c1] = key.split("-").map(Number);
    const line = lineCells(r0, c0, r1, c1);
    if (line) {
      play.anchor = null;
      play.selection = new Map(line.map((k) => [k, null]));
      renderPlayGrid();
      checkPlaySelection();
      return;
    }
  }
  play.anchor = null;
  play.dragging = true;
  play.dragStart = key;
  play.selection = new Map([[key, null]]);
  renderPlayGrid();
}

function onPlayPointerEnter(event) {
  const play = state.play;
  if (!play || play.won || !play.dragging) return;
  const [r0, c0] = play.dragStart.split("-").map(Number);
  const [r1, c1] = event.currentTarget.dataset.key.split("-").map(Number);
  const line = lineCells(r0, c0, r1, c1) || [play.dragStart];
  play.selection = new Map(line.map((key) => [key, null]));
  renderPlayGrid();
}

document.addEventListener("pointerup", () => {
  const play = state.play;
  if (!play || !play.dragging) return;
  play.dragging = false;
  const keys = [...play.selection.keys()];
  if (keys.length <= 1) {
    play.anchor = keys[0] || null;
    return;
  }
  checkPlaySelection();
});

function checkPlaySelection() {
  const play = state.play;
  if (!play || play.won) return;
  const letters = [...play.selection.keys()]
    .map((key) => {
      const [r, c] = key.split("-").map(Number);
      return state.puzzle.grid[r][c];
    })
    .join("");
  const reversed = [...letters].reverse().join("");
  const match = playWords().find(
    (placement) =>
      !play.found.has(placement.word.compact) &&
      (placement.word.compact === letters || placement.word.compact === reversed)
  );
  if (match) {
    play.found.add(match.word.compact);
    GameHubJuice?.pop(360);
    renderPlayBank();
    renderPlayGrid();
    els.playMessage.textContent = `Found ${match.word.label}!`;
    if (play.found.size === playWords().length) winPlay();
  } else {
    GameHubJuice?.drop();
    els.playMessage.textContent = "Not on the list — keep looking.";
    play.selection = new Map();
    renderPlayGrid();
  }
}

function lineCells(r0, c0, r1, c1) {
  const dr = Math.sign(r1 - r0);
  const dc = Math.sign(c1 - c0);
  const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
  const straight = r1 === r0 || c1 === c0 || Math.abs(r1 - r0) === Math.abs(c1 - c0);
  if (!straight) return null;
  const cells = [];
  for (let i = 0; i <= steps; i += 1) cells.push(`${r0 + dr * i}-${c0 + dc * i}`);
  return cells;
}

function winPlay() {
  const play = state.play;
  play.won = true;
  if (playTimer) clearInterval(playTimer);
  GameHubJuice?.win();
  const sizeBonus = state.size >= 15 ? 6 : state.size >= 10 ? 4 : 2;
  GameHubProfile?.achieve("word-find-played");
  GameHubProfile?.award("word-find", sizeBonus,
    `Solved a ${state.size}×${state.size} word find in ${formatPlayClock(play.seconds)}`, 0);
  els.playWonStats.textContent =
    `${playWords().length} words in ${formatPlayClock(play.seconds)} on a ${state.size}×${state.size} grid.`;
  els.playWon.hidden = false;
}

loadLocal();
populateCategories();
bindEvents();
buildPuzzle();
