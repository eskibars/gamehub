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
  showAnswers: false,
  wordsText: DEFAULT_WORDS.join("\n"),
  puzzle: null,
};

const els = {
  saveStatus: document.querySelector("#saveStatus"),
  puzzleTitle: document.querySelector("#puzzleTitle"),
  gridSize: document.querySelector("#gridSize"),
  fillStyle: document.querySelector("#fillStyle"),
  showAnswers: document.querySelector("#showAnswers"),
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
      showAnswers: state.showAnswers,
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
    state.size = Number(parsed.size) || state.size;
    state.fillStyle = parsed.fillStyle || state.fillStyle;
    state.showAnswers = Boolean(parsed.showAnswers);
    state.wordsText = parsed.wordsText || state.wordsText;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function normalizeWords() {
  const seen = new Set();
  return state.wordsText
    .split(/\n+/)
    .map((word) => word.toUpperCase().replace(/[^A-Z]/g, ""))
    .filter(Boolean)
    .filter((word) => {
      if (seen.has(word)) return false;
      seen.add(word);
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

function buildPuzzle() {
  const normalized = normalizeWords();
  const usable = normalized.filter((word) => word.length <= state.size);
  const tooLong = normalized.filter((word) => word.length > state.size);
  const sorted = [...usable].sort((first, second) => second.length - first.length);
  let best = null;

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const grid = emptyGrid(state.size);
    const placements = [];
    const missed = [];

    sorted.forEach((word) => {
      const options = placementOptions(grid, word);
      if (!options.length) {
        missed.push(word);
        return;
      }
      options.sort((first, second) => second.score - first.score);
      const topScore = options[0].score;
      const preferred = options.filter((option) => option.score >= Math.max(0, topScore - 1));
      const option = shuffle(preferred).at(0);
      const cells = placeWord(grid, word, option);
      placements.push({ word, cells });
    });

    if (!best || placements.length > best.placements.length) best = { grid, placements, missed };
    if (!missed.length) break;
  }

  best.missed = [...new Set([...best.missed, ...tooLong])];
  best.grid = best.grid.map((row) => row.map((letter) => letter || randomFillLetter(usable)));
  state.puzzle = best;
  renderAll();
}

function renderGrid() {
  const puzzle = state.puzzle;
  const answerCells = new Set(puzzle?.placements.flatMap((placement) => placement.cells) || []);
  els.letterGrid.innerHTML = "";
  els.letterGrid.style.setProperty("--grid-size", state.size);

  (puzzle?.grid || emptyGrid(state.size)).forEach((row, rowIndex) => {
    row.forEach((letter, colIndex) => {
      const cell = document.createElement("span");
      cell.className = "grid-cell";
      if (state.showAnswers && answerCells.has(`${rowIndex}-${colIndex}`)) cell.classList.add("is-answer");
      cell.textContent = letter || "";
      els.letterGrid.append(cell);
    });
  });
}

function renderWordBank() {
  const words = normalizeWords();
  const placed = new Set(state.puzzle?.placements.map((placement) => placement.word) || []);
  els.wordBank.innerHTML = "";
  words.forEach((word) => {
    const item = document.createElement("li");
    item.textContent = word;
    if (state.puzzle && !placed.has(word)) item.classList.add("not-placed");
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
    els.buildMessage.textContent = `${state.puzzle.placements.length} placed. Could not fit: ${missed.join(", ")}.`;
  } else {
    els.buildMessage.textContent = `${state.puzzle.placements.length} words hidden across the grid.`;
  }
}

function renderAll() {
  els.puzzleTitle.value = state.title;
  els.gridSize.value = String(state.size);
  els.fillStyle.value = state.fillStyle;
  els.showAnswers.checked = state.showAnswers;
  els.wordInput.value = state.wordsText;
  els.previewTitle.textContent = state.title || "Untitled Word Find";
  els.previewStats.textContent = `${state.size} x ${state.size} puzzle`;
  renderGrid();
  renderWordBank();
  updateMessage();
}

function bindEvents() {
  els.puzzleTitle.addEventListener("input", () => {
    state.title = els.puzzleTitle.value.trim();
    saveLocal();
    renderAll();
  });

  els.gridSize.addEventListener("change", () => {
    state.size = Number(els.gridSize.value);
    saveLocal();
    buildPuzzle();
  });

  els.fillStyle.addEventListener("change", () => {
    state.fillStyle = els.fillStyle.value;
    saveLocal();
    buildPuzzle();
  });

  els.showAnswers.addEventListener("change", () => {
    state.showAnswers = els.showAnswers.checked;
    saveLocal();
    renderGrid();
  });

  els.wordInput.addEventListener("input", () => {
    state.wordsText = els.wordInput.value;
    saveLocal();
    updateMessage();
    renderWordBank();
  });

  els.wordInput.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") buildPuzzle();
  });

  els.clearWords.addEventListener("click", () => {
    state.wordsText = "";
    state.puzzle = null;
    saveLocal();
    renderAll();
  });

  els.buildPuzzle.addEventListener("click", buildPuzzle);
  els.shufflePuzzle.addEventListener("click", buildPuzzle);
  els.printPuzzle.addEventListener("click", () => window.print());
}

loadLocal();
bindEvents();
buildPuzzle();
