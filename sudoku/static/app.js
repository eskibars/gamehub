/*
 * Sudoku — generator with unique-solution guarantee, pencil notes, hints,
 * undo, timer, and resume. Everything runs locally; progress lives in
 * localStorage under the "sudoku-" prefix.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "sudoku-state-v1";
  const BESTS_KEY = "sudoku-bests-v1";
  const DIFFICULTIES = {
    Easy: { clues: 40, chips: 10 },
    Medium: { clues: 33, chips: 20 },
    Hard: { clues: 28, chips: 35 },
    Expert: { clues: 25, chips: 50 },
  };
  const MAX_HINTS = 3;
  const HINT_CHIP_COST = 5;

  // --- Pure puzzle logic -------------------------------------------------

  const cellIndex = (row, col) => row * 9 + col;

  const PEERS = (() => {
    const peers = [];
    for (let i = 0; i < 81; i += 1) {
      const set = new Set();
      const r = Math.floor(i / 9);
      const c = i % 9;
      for (let k = 0; k < 9; k += 1) {
        set.add(cellIndex(r, k));
        set.add(cellIndex(k, c));
      }
      const br = Math.floor(r / 3) * 3;
      const bc = Math.floor(c / 3) * 3;
      for (let dr = 0; dr < 3; dr += 1) {
        for (let dc = 0; dc < 3; dc += 1) {
          set.add(cellIndex(br + dr, bc + dc));
        }
      }
      set.delete(i);
      peers.push([...set]);
    }
    return peers;
  })();

  function shuffled(values) {
    const out = values.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function findEmpty(grid) {
    for (let i = 0; i < 81; i += 1) {
      if (!grid[i]) return i;
    }
    return -1;
  }

  function candidatesFor(grid, index) {
    const used = new Set();
    for (const p of PEERS[index]) {
      if (grid[p]) used.add(grid[p]);
    }
    const out = [];
    for (let d = 1; d <= 9; d += 1) {
      if (!used.has(d)) out.push(d);
    }
    return out;
  }

  function fillGrid(grid) {
    const index = findEmpty(grid);
    if (index === -1) return true;
    for (const digit of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (candidatesFor(grid, index).includes(digit)) {
        grid[index] = digit;
        if (fillGrid(grid)) return true;
        grid[index] = 0;
      }
    }
    return false;
  }

  function countSolutions(grid, limit) {
    const index = findEmpty(grid);
    if (index === -1) return 1;
    let found = 0;
    for (const digit of candidatesFor(grid, index)) {
      grid[index] = digit;
      found += countSolutions(grid, limit - found);
      grid[index] = 0;
      if (found >= limit) break;
    }
    return found;
  }

  function makePuzzle(targetClues) {
    const solution = new Array(81).fill(0);
    if (!fillGrid(solution)) return null;
    const puzzle = solution.slice();
    const order = shuffled([...Array(81).keys()]);
    let clues = 81;
    for (const index of order) {
      if (clues <= targetClues) break;
      const backup = puzzle[index];
      puzzle[index] = 0;
      if (countSolutions(puzzle, 2) !== 1) {
        puzzle[index] = backup;
      } else {
        clues -= 1;
      }
    }
    return { solution, puzzle, clues };
  }

  // --- State --------------------------------------------------------------

  const state = {
    givens: new Array(81).fill(0),
    values: new Array(81).fill(0),
    notes: Array.from({ length: 81 }, () => []),
    solution: new Array(81).fill(0),
    difficulty: "Easy",
    selected: -1,
    notesMode: false,
    history: [],
    hintsLeft: MAX_HINTS,
    mistakes: 0,
    elapsed: 0,
    paused: false,
    solved: false,
  };

  let bests = loadBests();
  let timerId = null;

  function loadBests() {
    try {
      return JSON.parse(localStorage.getItem(BESTS_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveBests() {
    try {
      localStorage.setItem(BESTS_KEY, JSON.stringify(bests));
    } catch {
      // Session-only bests when storage is unavailable.
    }
  }

  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          givens: state.givens,
          values: state.values,
          notes: state.notes,
          solution: state.solution,
          difficulty: state.difficulty,
          history: state.history.slice(-200),
          hintsLeft: state.hintsLeft,
          mistakes: state.mistakes,
          elapsed: state.elapsed,
          solved: state.solved,
        })
      );
    } catch {
      // Keep playing even if the state can't persist.
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.values) || saved.values.length !== 81) return false;
      state.givens = saved.givens;
      state.values = saved.values;
      state.notes = saved.notes;
      state.solution = saved.solution;
      state.difficulty = saved.difficulty in DIFFICULTIES ? saved.difficulty : "Easy";
      state.history = saved.history || [];
      state.hintsLeft = typeof saved.hintsLeft === "number" ? saved.hintsLeft : MAX_HINTS;
      state.mistakes = saved.mistakes || 0;
      state.elapsed = saved.elapsed || 0;
      state.solved = Boolean(saved.solved);
      return true;
    } catch {
      return false;
    }
  }

  function clearState() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
  }

  // --- Helpers ------------------------------------------------------------

  function conflicts() {
    const bad = new Set();
    for (let i = 0; i < 81; i += 1) {
      const value = state.values[i];
      if (!value) continue;
      for (const p of PEERS[i]) {
        if (state.values[p] === value) {
          bad.add(i);
          bad.add(p);
        }
      }
    }
    return bad;
  }

  function digitCount(digit) {
    let count = 0;
    for (const value of state.values) {
      if (value === digit) count += 1;
    }
    return count;
  }

  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  // --- DOM ----------------------------------------------------------------

  const els = {
    board: document.getElementById("board"),
    timer: document.getElementById("timer"),
    difficultyLabel: document.getElementById("difficultyLabel"),
    mistakes: document.getElementById("mistakes"),
    bestLabel: document.getElementById("bestLabel"),
    pauseButton: document.getElementById("pauseButton"),
    pauseOverlay: document.getElementById("pauseOverlay"),
    resumeButton: document.getElementById("resumeButton"),
    winOverlay: document.getElementById("winOverlay"),
    winTitle: document.getElementById("winTitle"),
    winSub: document.getElementById("winSub"),
    newAfterWin: document.getElementById("newAfterWin"),
    digitRow: document.getElementById("digitRow"),
    notesToggle: document.getElementById("notesToggle"),
    eraseButton: document.getElementById("eraseButton"),
    undoButton: document.getElementById("undoButton"),
    hintButton: document.getElementById("hintButton"),
    hintCount: document.getElementById("hintCount"),
    newGameButton: document.getElementById("newGameButton"),
    restartButton: document.getElementById("restartButton"),
    difficultyRow: document.getElementById("difficultyRow"),
  };

  const cells = [];

  function buildBoard() {
    els.board.innerHTML = "";
    cells.length = 0;
    for (let i = 0; i < 81; i += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cell";
      button.dataset.index = String(i);
      button.addEventListener("click", () => {
        state.selected = i;
        render();
      });
      els.board.append(button);
      cells.push(button);
    }
    els.digitRow.innerHTML = "";
    for (let digit = 1; digit <= 9; digit += 1) {
      const digitButton = document.createElement("button");
      digitButton.type = "button";
      digitButton.className = "digit";
      digitButton.textContent = String(digit);
      digitButton.dataset.digit = String(digit);
      digitButton.addEventListener("click", () => placeDigit(digit));
      els.digitRow.append(digitButton);
    }
  }

  function render() {
    const bad = conflicts();
    const selectedValue = state.selected >= 0 ? state.values[state.selected] : 0;
    const selRow = state.selected >= 0 ? Math.floor(state.selected / 9) : -1;
    const selCol = state.selected >= 0 ? state.selected % 9 : -1;

    for (let i = 0; i < 81; i += 1) {
      const cell = cells[i];
      const value = state.values[i];
      cell.classList.toggle("given", state.givens[i] !== 0);
      cell.classList.toggle("hinted", state.givens[i] !== 0 && state.solution[i] !== 0 && state.givens[i] === state.solution[i] && state.hintedCells && state.hintedCells.has(i));
      cell.classList.toggle("is-selected", i === state.selected);
      cell.classList.toggle("is-peer", isPeerOfSelection(i, selRow, selCol));
      cell.classList.toggle("is-same", selectedValue !== 0 && value === selectedValue && i !== state.selected);
      cell.classList.toggle("conflict", bad.has(i));

      if (value) {
        cell.textContent = String(value);
      } else {
        cell.textContent = "";
        renderNotes(cell, i);
      }
    }

    for (const digitButton of els.digitRow.children) {
      const digit = Number(digitButton.dataset.digit);
      digitButton.classList.toggle("is-exhausted", digitCount(digit) >= 9);
    }

    els.timer.textContent = formatTime(state.elapsed);
    els.difficultyLabel.textContent = state.difficulty;
    els.mistakes.textContent = String(state.mistakes);
    els.hintCount.textContent = `(${state.hintsLeft})`;
    els.hintButton.disabled = state.hintsLeft <= 0 || state.solved;
    els.undoButton.disabled = state.history.length === 0;
    els.notesToggle.setAttribute("aria-pressed", state.notesMode ? "true" : "false");

    const best = bests[state.difficulty];
    els.bestLabel.textContent = best ? formatTime(best) : "—";
  }

  function isPeerOfSelection(i, selRow, selCol) {
    if (selRow < 0) return false;
    const row = Math.floor(i / 9);
    const col = i % 9;
    const sameRow = row === selRow;
    const sameCol = col === selCol;
    const sameBox =
      Math.floor(row / 3) === Math.floor(selRow / 3) &&
      Math.floor(col / 3) === Math.floor(selCol / 3);
    return (sameRow || sameCol || sameBox) && i !== state.selected;
  }

  function renderNotes(cell, index) {
    let notes = cell.querySelector(".notes");
    const marks = state.notes[index];
    if (!marks || marks.length === 0) {
      if (notes) notes.remove();
      return;
    }
    if (!notes) {
      notes = document.createElement("div");
      notes.className = "notes";
      for (let i = 0; i < 9; i += 1) {
        notes.append(document.createElement("span"));
      }
      cell.append(notes);
    }
    const spans = notes.children;
    for (let digit = 1; digit <= 9; digit += 1) {
      spans[digit - 1].textContent = marks.includes(digit) ? String(digit) : "";
    }
  }

  // --- Actions --------------------------------------------------------------

  function peersOf(index) {
    return PEERS[index];
  }

  function placeDigit(digit) {
    if (state.solved || state.paused) return;
    const index = state.selected;
    if (index < 0 || state.givens[index] !== 0) return;

    if (state.notesMode) {
      if (state.values[index]) return;
      const marks = state.notes[index];
      const at = marks.indexOf(digit);
      if (at >= 0) marks.splice(at, 1);
      else marks.push(digit);
      state.history.push({ index, value: 0, notes: marks.slice(), notesOnly: true });
      saveState();
      render();
      return;
    }

    const previousValue = state.values[index];
    const previousNotes = state.notes[index].slice();
    if (previousValue === digit) return;

    state.values[index] = digit;
    state.notes[index] = [];

    // Clear this digit from peer notes and snapshot them for undo.
    const clearedPeers = [];
    for (const p of peersOf(index)) {
      const marks = state.notes[p];
      const at = marks.indexOf(digit);
      if (at >= 0) {
        clearedPeers.push({ index: p, notes: marks.slice() });
        marks.splice(at, 1);
      }
    }
    state.history.push({ index, value: previousValue, notes: previousNotes, clearedPeers });

    if (digit !== state.solution[index]) {
      state.mistakes += 1;
    } else {
      popCell(index);
      checkWin();
    }
    saveState();
    render();
  }

  function popCell(index) {
    const cell = cells[index];
    cell.classList.remove("pop");
    void cell.offsetWidth;
    cell.classList.add("pop");
  }

  function eraseCell() {
    if (state.solved || state.paused) return;
    const index = state.selected;
    if (index < 0 || state.givens[index] !== 0) return;
    const previousValue = state.values[index];
    const previousNotes = state.notes[index].slice();
    if (!previousValue && previousNotes.length === 0) return;
    state.values[index] = 0;
    state.notes[index] = [];
    state.history.push({ index, value: previousValue, notes: previousNotes });
    saveState();
    render();
  }

  function undo() {
    if (state.solved || state.paused) return;
    const entry = state.history.pop();
    if (!entry) return;
    if (entry.notesOnly) {
      state.notes[entry.index] = entry.notes.slice();
    } else {
      state.values[entry.index] = entry.value;
      state.notes[entry.index] = entry.notes.slice();
      if (entry.value !== 0 && entry.value === state.solution[entry.index]) {
        state.mistakes = Math.max(0, state.mistakes);
      }
      for (const peer of entry.clearedPeers || []) {
        state.notes[peer.index] = peer.notes.slice();
      }
    }
    saveState();
    render();
  }

  function useHint() {
    if (state.solved || state.paused || state.hintsLeft <= 0) return;
    let index = state.selected;
    const needsHelp = (i) => state.values[i] !== state.solution[i];
    if (index < 0 || state.givens[index] !== 0 || !needsHelp(index)) {
      const candidates = [];
      for (let i = 0; i < 81; i += 1) {
        if (needsHelp(i)) candidates.push(i);
      }
      if (!candidates.length) return;
      index = candidates[Math.floor(Math.random() * candidates.length)];
    }
    state.values[index] = state.solution[index];
    state.notes[index] = [];
    state.givens[index] = state.solution[index];
    state.hintedCells = (state.hintedCells || new Set());
    state.hintedCells.add(index);
    state.hintsLeft -= 1;
    state.selected = index;
    popCell(index);
    checkWin();
    saveState();
    render();
  }

  function checkWin() {
    for (let i = 0; i < 81; i += 1) {
      if (state.values[i] !== state.solution[i]) return;
    }
    state.solved = true;
    stopTimer();

    const info = DIFFICULTIES[state.difficulty];
    const chips = Math.max(5, info.chips - (MAX_HINTS - state.hintsLeft) * HINT_CHIP_COST);
    const best = bests[state.difficulty];
    const isRecord = best === undefined || state.elapsed < best;
    if (isRecord) {
      bests[state.difficulty] = state.elapsed;
      saveBests();
    }
    if (window.GameHubProfile) {
      GameHubProfile.award("sudoku", chips, `Solved ${state.difficulty} sudoku`, chips);
    }

    els.winTitle.textContent = isRecord ? "Solved — new best time!" : "Solved!";
    els.winSub.textContent =
      `${state.difficulty} · ${formatTime(state.elapsed)} · ${state.mistakes} mistake${state.mistakes === 1 ? "" : "s"} · +${chips} chips`;
    els.winOverlay.hidden = false;
    clearState();
    render();
  }

  // --- Game lifecycle ---------------------------------------------------

  function newGame(difficulty) {
    state.difficulty = difficulty;
    const target = DIFFICULTIES[difficulty].clues;
    const deal = makePuzzle(target);
    state.givens = deal.puzzle.slice();
    state.values = deal.puzzle.slice();
    state.solution = deal.solution.slice();
    state.notes = Array.from({ length: 81 }, () => []);
    state.history = [];
    state.hintsLeft = MAX_HINTS;
    state.mistakes = 0;
    state.elapsed = 0;
    state.selected = -1;
    state.notesMode = false;
    state.solved = false;
    state.hintedCells = new Set();
    els.winOverlay.hidden = true;
    els.pauseOverlay.hidden = true;
    state.paused = false;
    els.pauseButton.textContent = "Pause";
    syncDifficultyRadios();
    saveState();
    render();
  }

  function restartGame() {
    for (let i = 0; i < 81; i += 1) {
      state.values[i] = state.givens[i];
      state.notes[i] = [];
    }
    state.history = [];
    state.mistakes = 0;
    state.selected = -1;
    state.solved = false;
    state.hintedCells = new Set();
    els.winOverlay.hidden = true;
    saveState();
    render();
  }

  function syncDifficultyRadios() {
    const radio = els.difficultyRow.querySelector(`input[value="${state.difficulty}"]`);
    if (radio) radio.checked = true;
  }

  // --- Timer ----------------------------------------------------------------

  function tick() {
    if (state.paused || state.solved || document.hidden) return;
    state.elapsed += 1;
    els.timer.textContent = formatTime(state.elapsed);
    if (state.elapsed % 10 === 0) saveState();
  }

  function startTimer() {
    stopTimer();
    timerId = setInterval(tick, 1000);
  }

  function stopTimer() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function setPaused(paused) {
    state.paused = paused;
    els.pauseOverlay.hidden = !paused;
    els.pauseButton.textContent = paused ? "Resume" : "Pause";
    if (!paused) render();
  }

  // --- Events ----------------------------------------------------------------

  function bindEvents() {
    els.pauseButton.addEventListener("click", () => setPaused(!state.paused));
    els.resumeButton.addEventListener("click", () => setPaused(false));
    els.newAfterWin.addEventListener("click", () => newGame(state.difficulty));
    els.newGameButton.addEventListener("click", () => {
      const chosen = els.difficultyRow.querySelector("input:checked");
      newGame(chosen ? chosen.value : "Easy");
    });
    els.restartButton.addEventListener("click", restartGame);
    els.notesToggle.addEventListener("click", () => {
      state.notesMode = !state.notesMode;
      render();
    });
    els.eraseButton.addEventListener("click", eraseCell);
    els.undoButton.addEventListener("click", undo);
    els.hintButton.addEventListener("click", useHint);
    els.difficultyRow.addEventListener("change", () => {
      const chosen = els.difficultyRow.querySelector("input:checked");
      if (chosen) {
        state.difficulty = chosen.value;
        render();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key;
      if (key >= "1" && key <= "9") {
        placeDigit(Number(key));
      } else if (key === "Backspace" || key === "Delete" || key === "0") {
        event.preventDefault();
        eraseCell();
      } else if (key === "n" || key === "N") {
        state.notesMode = !state.notesMode;
        render();
      } else if (key === "h" || key === "H") {
        useHint();
      } else if (key === "p" || key === "P") {
        setPaused(!state.paused);
      } else if (key.startsWith("Arrow")) {
        event.preventDefault();
        moveSelection(key);
      } else if (key === "w" || key === "W") {
        moveSelection("ArrowUp");
      } else if (key === "s" || key === "S") {
        moveSelection("ArrowDown");
      } else if (key === "a" || key === "A") {
        moveSelection("ArrowLeft");
      } else if (key === "d" || key === "D") {
        moveSelection("ArrowRight");
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) render();
    });
  }

  function moveSelection(direction) {
    if (state.selected < 0) {
      state.selected = 40;
      render();
      return;
    }
    let row = Math.floor(state.selected / 9);
    let col = state.selected % 9;
    if (direction === "ArrowUp") row = Math.max(0, row - 1);
    if (direction === "ArrowDown") row = Math.min(8, row + 1);
    if (direction === "ArrowLeft") col = Math.max(0, col - 1);
    if (direction === "ArrowRight") col = Math.min(8, col + 1);
    state.selected = cellIndex(row, col);
    render();
  }

  // --- Boot -------------------------------------------------------------------

  buildBoard();
  if (!loadState() || state.solved) {
    newGame("Easy");
  } else {
    syncDifficultyRadios();
    render();
  }
  bindEvents();
  startTimer();
})();
