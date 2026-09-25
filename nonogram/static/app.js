/*
 * Nonogram (Picross) — paint cells from run-length clues to reveal a hidden
 * picture. Every puzzle is generated at random and then verified by a line
 * solver, so each deal provably has exactly one solution reachable by pure
 * row/column logic.
 */
(() => {
  "use strict";

  const els = {
    puzzle: document.querySelector("#puzzle"),
    clock: document.querySelector("#clock"),
    best: document.querySelector("#best"),
    overlay: document.querySelector("#overlay"),
    overlayTitle: document.querySelector("#overlayTitle"),
    overlaySub: document.querySelector("#overlaySub"),
    nextButton: document.querySelector("#nextButton"),
    hintButton: document.querySelector("#hintButton"),
    hintsLeft: document.querySelector("#hintsLeft"),
    clearButton: document.querySelector("#clearButton"),
    newButton: document.querySelector("#newButton"),
    soundButton: document.querySelector("#soundButton"),
    sizeRow: document.querySelector("#sizeRow"),
    paintRow: document.querySelector("#paintRow"),
  };

  const STATE_KEY = "gamehub-nonogram-v1";
  const SIZES = [5, 10, 15];
  const CHIPS = { 5: 2, 10: 5, 15: 9 };

  const game = {
    n: 5,
    solution: null,   // 2D of 0/1
    rowClues: [],
    colClues: [],
    marks: null,      // 2D of "empty" | "filled" | "marked"
    dragValue: null,  // value being painted during a drag
    hintCell: null,
    wrongCell: null,
    hints: 3,
    solvedCount: 0,
    startedAt: 0,
    timer: null,
    solving: false,
    done: false,
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    game.solvedCount = saved.solvedCount || 0;
    game.bests = saved.bests || {};
  } catch {
    game.bests = {};
  }

  function persist() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        solvedCount: game.solvedCount,
        bests: game.bests,
      }));
    } catch {
      // Storage unavailable; play continues in memory.
    }
  }

  /* ------------------------------------------------------------------ *
   * Clue + line-solver engine (also the generation verifier)            *
   * ------------------------------------------------------------------ */

  function cluesOf(line) {
    const runs = [];
    let count = 0;
    for (const v of line) {
      if (v) count += 1;
      else if (count) { runs.push(count); count = 0; }
    }
    if (count) runs.push(count);
    return runs;
  }

  // Deduce everything pure row/col logic allows. line: -1 unknown, 0/1 known.
  // Returns refined line, or null on contradiction.
  function solveLine(n, clues, line) {
    const runs = clues.length === 1 && clues[0] === 0 ? [] : clues;
    const fillCount = new Array(n).fill(0);
    const emptyCount = new Array(n).fill(0);
    let valid = 0;
    const pathCells = [];

    function rec(idx, start) {
      if (idx === runs.length) {
        for (let i = start; i < n; i += 1) {
          if (line[i] === 1) return;
        }
        for (const [i, kind] of pathCells) (kind ? fillCount : emptyCount)[i] += 1;
        for (let i = start; i < n; i += 1) emptyCount[i] += 1;
        valid += 1;
        return;
      }
      const len = runs[idx];
      let minSpan = 0;
      for (let k = idx; k < runs.length; k += 1) minSpan += runs[k] + 1;
      minSpan -= 1;
      const maxStart = n - minSpan;
      for (let p = start; p <= maxStart; p += 1) {
        let prefixBlocked = false;
        for (let i = start; i < p; i += 1) {
          if (line[i] === 1) { prefixBlocked = true; break; }
        }
        if (prefixBlocked) break; // every later start covers that filled cell too
        let runBlocked = false;
        for (let i = p; i < p + len; i += 1) {
          if (line[i] === 0) { runBlocked = true; break; }
        }
        if (runBlocked) continue;
        const markStart = pathCells.length;
        for (let i = start; i < p; i += 1) pathCells.push([i, 0]);
        for (let i = p; i < p + len; i += 1) pathCells.push([i, 1]);
        rec(idx + 1, p + len + 1);
        pathCells.length = markStart;
      }
    }

    rec(0, 0);
    if (!valid) return null;
    const out = line.slice();
    for (let i = 0; i < n; i += 1) {
      if (line[i] !== -1) continue;
      if (fillCount[i] && !emptyCount[i]) out[i] = 1;
      else if (!fillCount[i] && emptyCount[i]) out[i] = 0;
    }
    return out;
  }

  // Run the line solver to a fixpoint. Returns true if the puzzle resolves
  // fully (unique solution), false if it contradicts or stalls.
  function lineSolveFully(n, rowClues, colClues) {
    const grid = Array.from({ length: n }, () => new Array(n).fill(-1));
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r < n; r += 1) {
        const out = solveLine(n, rowClues[r], grid[r]);
        if (!out) return false;
        for (let c = 0; c < n; c += 1) {
          if (grid[r][c] === -1 && out[c] !== -1) { grid[r][c] = out[c]; changed = true; }
        }
      }
      for (let c = 0; c < n; c += 1) {
        const col = [];
        for (let r = 0; r < n; r += 1) col.push(grid[r][c]);
        const out = solveLine(n, colClues[c], col);
        if (!out) return false;
        for (let r = 0; r < n; r += 1) {
          if (col[r] === -1 && out[r] !== -1) { grid[r][c] = out[r]; changed = true; }
        }
      }
    }
    return grid.every((row) => row.every((v) => v !== -1));
  }

  function smooth(grid, n, iters) {
    for (let it = 0; it < iters; it += 1) {
      const out = grid.map((row) => [...row]);
      for (let r = 0; r < n; r += 1) {
        for (let c = 0; c < n; c += 1) {
          let sum = 0;
          for (let dr = -1; dr <= 1; dr += 1) {
            for (let dc = -1; dc <= 1; dc += 1) {
              const rr = r + dr, cc = c + dc;
              if (rr >= 0 && rr < n && cc >= 0 && cc < n) sum += grid[rr][cc];
            }
          }
          out[r][c] = sum >= 5 ? 1 : 0;
        }
      }
      grid = out;
    }
    return grid;
  }

  function generate(n) {
    // Random noise is almost never line-solvable; one or two rounds of
    // cellular-automata smoothing clump cells into blobby "pictures" that
    // very often are. Retry until the line solver proves a unique solution.
    const configs = { 5: [[0.55, 1], [0.45, 1], [0.35, 1]], 10: [[0.45, 1], [0.4, 1], [0.3, 1]], 15: [[0.4, 2], [0.35, 2], [0.3, 2]] };
    const attempts = configs[n] || configs[10];
    for (const [density, smoothIters] of attempts) {
      for (let attempt = 0; attempt < 250; attempt += 1) {
        let grid = Array.from({ length: n }, () =>
          Array.from({ length: n }, () => (Math.random() < density ? 1 : 0)));
        grid = smooth(grid, n, smoothIters);
        const filled = grid.flat().reduce((a, b) => a + b, 0);
        if (filled < n * n * 0.2 || filled > n * n * 0.7) continue;
        const rowClues = grid.map(cluesOf);
        const colClues = Array.from({ length: n }, (_, c) => cluesOf(grid.map((row) => row[c])));
        if (lineSolveFully(n, rowClues, colClues)) {
          return { solution: grid, rowClues, colClues };
        }
      }
    }
    // Practically unreachable; last resort keeps the game running with a
    // dense simple pattern that always solves.
    const grid = Array.from({ length: n }, (_, r) =>
      Array.from({ length: n }, (_, c) => (r % 2 === 0 ? 1 : 0)));
    return {
      solution: grid,
      rowClues: grid.map(cluesOf),
      colClues: Array.from({ length: n }, (_, c) => cluesOf(grid.map((row) => row[c]))),
    };
  }

  /* ------------------------------------------------------------------ *
   * Rendering                                                           *
   * ------------------------------------------------------------------ */

  function computeCell() {
    const available = els.puzzle.clientWidth || 500;
    const leftW = Math.max(2, game.rowClues[0]?.length || 1) * 12 + 14;
    return Math.max(14, Math.min(36, Math.floor((available - leftW - 6) / game.n)));
  }

  function clueSatisfied(clue, line) {
    return JSON.stringify(cluesOf(line.map((v) => (v === "filled" ? 1 : 0)))) === JSON.stringify(clue);
  }

  function render() {
    const n = game.n;
    const cell = computeCell();
    els.puzzle.style.setProperty("--cell", `${cell}px`);

    const maxColClue = Math.max(...game.colClues.map((c) => c.length), 1);
    const maxRowClue = Math.max(...game.rowClues.map((c) => c.length), 1);

    els.puzzle.innerHTML = "";

    const corner = document.createElement("div");
    corner.className = "corner";
    corner.style.width = `${maxRowClue * 14 + 10}px`;
    corner.style.height = `${maxColClue * (cell * 0.42 + 4) + 6}px`;
    els.puzzle.append(corner);

    const colWrap = document.createElement("div");
    colWrap.className = "col-clues";
    colWrap.style.gridTemplateColumns = `repeat(${n}, ${cell}px)`;
    colWrap.style.height = `${maxColClue * (cell * 0.42 + 4) + 6}px`;
    game.colClues.forEach((clue, c) => {
      const div = document.createElement("div");
      div.className = "col-clue";
      const column = [];
      for (let r = 0; r < n; r += 1) column.push(game.marks[r][c]);
      const satisfied = clueSatisfied(clue, column);
      clue.forEach((num) => {
        const span = document.createElement("span");
        span.textContent = num;
        if (satisfied) span.classList.add("satisfied");
        div.append(span);
      });
      colWrap.append(div);
    });
    els.puzzle.append(colWrap);

    const rowWrap = document.createElement("div");
    rowWrap.className = "row-clues";
    rowWrap.style.gridTemplateRows = `repeat(${n}, ${cell}px)`;
    game.rowClues.forEach((clue, r) => {
      const div = document.createElement("div");
      div.className = "row-clue";
      div.style.height = `${cell}px`;
      const satisfied = clueSatisfied(clue, game.marks[r]);
      clue.forEach((num) => {
        const span = document.createElement("span");
        span.textContent = num;
        if (satisfied) span.classList.add("satisfied");
        div.append(span);
      });
      rowWrap.append(div);
    });
    els.puzzle.append(rowWrap);

    const board = document.createElement("div");
    board.className = "board";
    board.style.gridTemplateColumns = `repeat(${n}, ${cell}px)`;
    board.style.gridTemplateRows = `repeat(${n}, ${cell}px)`;
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        const div = document.createElement("div");
        div.className = "cell";
        div.dataset.r = r;
        div.dataset.c = c;
        const mark = game.marks[r][c];
        if (mark === "filled") div.classList.add("filled");
        if (mark === "marked") div.classList.add("marked");
        if (game.hintCell && game.hintCell.r === r && game.hintCell.c === c) div.classList.add("hinted");
        if (game.wrongCell && game.wrongCell.r === r && game.wrongCell.c === c) div.classList.add("wrong-flash");
        // Thicker every-fifth separators read like graph paper.
        if (c % 5 === 4 && c !== n - 1) div.style.borderRight = "2px solid var(--ink)";
        if (r % 5 === 4 && r !== n - 1) div.style.borderBottom = "2px solid var(--ink)";
        board.append(div);
      }
    }
    els.puzzle.append(board);
  }

  /* ------------------------------------------------------------------ *
   * Input                                                               *
   * ------------------------------------------------------------------ */

  function paintMode() {
    return els.paintRow.querySelector('input[name=paint]:checked').value;
  }

  function applyPaint(r, c) {
    if (game.done) return;
    const current = game.marks[r][c];
    const target = paintMode();
    if (game.dragValue == null) {
      game.dragValue = current === target ? "empty" : target;
    }
    if (game.marks[r][c] !== game.dragValue) {
      game.marks[r][c] = game.dragValue;
      if (game.dragValue === "filled") GameHubJuice.pop(430 + ((r + c) % 4) * 40);
      else GameHubJuice.tick();
    }
    render();
    checkWin();
  }

  function cellFromEvent(event) {
    const cell = event.target.closest(".cell");
    if (!cell) return null;
    return { r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
  }

  let painting = false;
  els.puzzle.addEventListener("pointerdown", (event) => {
    if (game.done) return;
    const at = cellFromEvent(event);
    if (!at) return;
    event.preventDefault();
    if (event.button === 2) {
      // Right-click always marks, regardless of mode.
      game.marks[at.r][at.c] = game.marks[at.r][at.c] === "marked" ? "empty" : "marked";
      game.dragValue = null;
      GameHubJuice.tick();
      render();
      return;
    }
    painting = true;
    game.dragValue = null;
    applyPaint(at.r, at.c);
  });
  els.puzzle.addEventListener("pointermove", (event) => {
    if (!painting || game.done) return;
    const at = cellFromEvent(event);
    if (!at) return;
    if (game.marks[at.r][at.c] !== game.dragValue) {
      game.marks[at.r][at.c] = game.dragValue;
      render();
      checkWin();
    }
  });
  window.addEventListener("pointerup", () => {
    painting = false;
    game.dragValue = null;
  });
  els.puzzle.addEventListener("contextmenu", (event) => event.preventDefault());

  /* ------------------------------------------------------------------ *
   * Flow                                                                *
   * ------------------------------------------------------------------ */

  function startTimer() {
    clearInterval(game.timer);
    game.startedAt = Date.now();
    game.timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - game.startedAt) / 1000);
      els.clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }, 500);
  }

  function elapsedSeconds() {
    return Math.floor((Date.now() - game.startedAt) / 1000);
  }

  function checkWin() {
    if (game.done) return;
    const n = game.n;
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        const want = game.solution[r][c] === 1;
        const have = game.marks[r][c] === "filled";
        if (want !== have) return;
      }
    }
    game.done = true;
    clearInterval(game.timer);
    const seconds = elapsedSeconds();
    const key = String(game.n);
    const isRecord = game.bests[key] === undefined || seconds < game.bests[key];
    if (isRecord) {
      game.bests[key] = seconds;
      els.best.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }
    game.solvedCount += 1;
    persist();
    GameHubProfile?.award("nonogram", CHIPS[game.n], `${game.n}×${game.n} in ${seconds}s`, game.solvedCount);
    if (game.solvedCount >= 10) GameHubProfile?.achieve("nonogram-10");
    if (game.solvedCount >= 50) GameHubProfile?.achieve("nonogram-50");
    GameHubJuice.win();
    els.overlayTitle.textContent = isRecord ? "New record! 🖼" : "Solved! 🖼";
    els.overlaySub.textContent =
      `${game.n}×${game.n} in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} · +${CHIPS[game.n]} chips · ${game.solvedCount} solved`;
    els.nextButton.textContent = `Next ${game.n}×${game.n}`;
    els.overlay.hidden = false;
  }

  function newPuzzle() {
    els.overlay.hidden = true;
    game.n = Number(els.sizeRow.querySelector('input[name=size]:checked').value);
    game.hints = 3;
    els.hintsLeft.textContent = "3";
    game.hintCell = null;
    game.wrongCell = null;
    game.done = false;
    const deal = generate(game.n);
    game.solution = deal.solution;
    game.rowClues = deal.rowClues;
    game.colClues = deal.colClues;
    game.marks = Array.from({ length: game.n }, () => new Array(game.n).fill("empty"));
    const best = game.bests[String(game.n)];
    els.best.textContent = best === undefined ? "—" :
      `${Math.floor(best / 60)}:${String(best % 60).padStart(2, "0")}`;
    startTimer();
    render();
  }

  els.nextButton.addEventListener("click", newPuzzle);
  els.newButton.addEventListener("click", newPuzzle);
  els.sizeRow.addEventListener("change", newPuzzle);
  els.clearButton.addEventListener("click", () => {
    if (game.done) return;
    game.marks = Array.from({ length: game.n }, () => new Array(game.n).fill("empty"));
    GameHubJuice.sweep();
    render();
  });
  els.hintButton.addEventListener("click", () => {
    if (game.done || game.hints <= 0) return;
    // Reveal a random still-unknown correct cell, preferring ones that matter.
    const unknown = [];
    for (let r = 0; r < game.n; r += 1) {
      for (let c = 0; c < game.n; c += 1) {
        if (game.marks[r][c] !== "filled" && game.solution[r][c] === 1) unknown.push({ r, c });
      }
    }
    if (!unknown.length) {
      // Only fills remain wrong or everything done; flash a wrong fill if any.
      for (let r = 0; r < game.n; r += 1) {
        for (let c = 0; c < game.n; c += 1) {
          if (game.marks[r][c] === "filled" && game.solution[r][c] === 0) {
            game.wrongCell = { r, c };
            GameHubJuice.lose();
            render();
            setTimeout(() => { game.wrongCell = null; render(); }, 900);
            return;
          }
        }
      }
      return;
    }
    game.hints -= 1;
    els.hintsLeft.textContent = String(game.hints);
    const pick = unknown[Math.floor(Math.random() * unknown.length)];
    game.marks[pick.r][pick.c] = "filled";
    game.hintCell = pick;
    GameHubJuice.coin();
    render();
    setTimeout(() => { game.hintCell = null; render(); }, 1600);
    checkWin();
  });
  els.soundButton.addEventListener("click", () => {
    if (!window.GameHubJuice) return;
    GameHubJuice.muted = !GameHubJuice.muted;
    els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  });
  window.addEventListener("resize", () => {
    if (game.solution) render();
  });

  newPuzzle();
})();
