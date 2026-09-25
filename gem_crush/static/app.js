/*
 * Gem Crush — a match-3 with striped blasts, bombs, rainbows, and cascade
 * multipliers. Eight-by-eight board, level goals with move budgets, auto
 * hints, and auto-shuffle when the board dries up.
 */
(() => {
  "use strict";

  const SIZE = 8;
  const TYPES = ["🍒", "🍋", "🫐", "🍇", "🍉", "⭐"];
  const STATE_KEY = "gamehub-gem-crush-v1";

  const els = {
    board: document.querySelector("#board"),
    level: document.querySelector("#level"),
    score: document.querySelector("#score"),
    goal: document.querySelector("#goal"),
    moves: document.querySelector("#moves"),
    progress: document.querySelector("#progressFill"),
    overlay: document.querySelector("#overlay"),
    overlayTitle: document.querySelector("#overlayTitle"),
    overlaySub: document.querySelector("#overlaySub"),
    overlayButton: document.querySelector("#overlayButton"),
    soundButton: document.querySelector("#soundButton"),
  };

  const run = {
    level: 1,
    score: 0,
    goal: 2000,
    moves: 20,
    active: false,
    busy: false,
    selected: null,
    hint: null,
    hintTimer: null,
    bestLevel: 1,
    pendingLevel: 1,
  };

  let grid = [];
  let cellSeq = 0;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function goalFor(level) {
    return 2000 + (level - 1) * 1500;
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
      if (saved.bestLevel) run.bestLevel = saved.bestLevel;
    } catch {
      // Fresh install.
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({ bestLevel: run.bestLevel }));
    } catch {
      // Storage unavailable; the run still plays.
    }
  }

  /* ------------------------------------------------------------------ *
   * Board model                                                         *
   * ------------------------------------------------------------------ */

  // Deals a full board with no starting matches and at least one legal move.
  function dealBoard() {
    let candidate;
    do {
      candidate = [];
      for (let r = 0; r < SIZE; r += 1) {
        const row = [];
        for (let c = 0; c < SIZE; c += 1) {
          let type;
          for (;;) {
            type = Math.floor(Math.random() * TYPES.length);
            const left1 = row[c - 1], left2 = row[c - 2];
            const up1 = candidate[r - 1]?.[c], up2 = candidate[r - 2]?.[c];
            if (left1?.type === type && left2?.type === type) continue;
            if (up1?.type === type && up2?.type === type) continue;
            break;
          }
          row.push({ type, special: null, el: null, id: ++cellSeq });
        }
        candidate.push(row);
      }
    } while (!boardHasMove(candidate));
    grid = candidate;
  }

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  // Returns runs: [{cells: [{r,c}], horizontal}]
  function findRunsOn(board) {
    const runs = [];
    for (let r = 0; r < SIZE; r += 1) {
      let start = 0;
      for (let c = 1; c <= SIZE; c += 1) {
        const prev = board[r][c - 1];
        const cur = c < SIZE ? board[r][c] : null;
        if (!cur || !prev || cur.type !== prev.type) {
          if (c - start >= 3) {
            const cells = [];
            for (let i = start; i < c; i += 1) cells.push({ r, c: i });
            runs.push({ cells, horizontal: true });
          }
          start = c;
        }
      }
    }
    for (let c = 0; c < SIZE; c += 1) {
      let start = 0;
      for (let r = 1; r <= SIZE; r += 1) {
        const prev = board[r - 1][c];
        const cur = r < SIZE ? board[r][c] : null;
        if (!cur || !prev || cur.type !== prev.type) {
          if (r - start >= 3) {
            const cells = [];
            for (let i = start; i < r; i += 1) cells.push({ r: i, c });
            runs.push({ cells, horizontal: false });
          }
          start = r;
        }
      }
    }
    return runs;
  }

  function swapOn(board, a, b) {
    const tmp = board[a.r][a.c];
    board[a.r][a.c] = board[b.r][b.c];
    board[b.r][b.c] = tmp;
  }

  // Any legal swap that produces a match (or uses a rainbow)? Returns pair.
  function boardHasMove(board) {
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const a = { r, c };
          const b = { r: r + dr, c: c + dc };
          if (!inBounds(b.r, b.c)) continue;
          const cellA = board[r][c], cellB = board[b.r][b.c];
          if (!cellA || !cellB) continue;
          if (cellA.special === "rainbow" || cellB.special === "rainbow") return [a, b];
          swapOn(board, a, b);
          const matched = findRunsOn(board).length > 0;
          swapOn(board, a, b);
          if (matched) return [a, b];
        }
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Rendering                                                           *
   * ------------------------------------------------------------------ */

  const PCT = 100 / SIZE;

  function positionGem(el, r, c) {
    el.style.left = `${c * PCT}%`;
    el.style.top = `${r * PCT}%`;
    el.style.width = `${PCT}%`;
    el.style.height = `${PCT}%`;
  }

  function classFor(cell) {
    let cls = "gem";
    if (cell.special === "rowBlast") cls += " special-stripes-h";
    else if (cell.special === "colBlast") cls += " special-stripes-v";
    else if (cell.special === "bomb") cls += " special-bomb";
    else if (cell.special === "rainbow") cls += " special-rainbow";
    return cls;
  }

  function glyphText(cell) {
    return cell.special === "rainbow" ? "🌈" : TYPES[cell.type];
  }

  function makeGemEl(cell, r, c, spawnFromRow) {
    const el = document.createElement("div");
    el.className = classFor(cell);
    const glyph = document.createElement("span");
    glyph.className = "glyph";
    glyph.textContent = glyphText(cell);
    el.append(glyph);
    cell.el = el;
    els.board.append(el);
    if (spawnFromRow !== undefined && spawnFromRow !== r) {
      el.style.transition = "none";
      positionGem(el, spawnFromRow, c);
      requestAnimationFrame(() => {
        el.style.transition = "";
        positionGem(el, r, c);
      });
    } else {
      positionGem(el, r, c);
    }
    return el;
  }

  function refreshGemEl(cell, r, c) {
    if (!cell.el) {
      makeGemEl(cell, r, c);
      return;
    }
    cell.el.className = classFor(cell);
    const glyph = cell.el.querySelector(".glyph");
    if (glyph) glyph.textContent = glyphText(cell);
    positionGem(cell.el, r, c);
  }

  function render() {
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        const cell = grid[r][c];
        if (!cell) continue;
        refreshGemEl(cell, r, c);
        cell.el.classList.toggle("selected", Boolean(run.selected && run.selected.r === r && run.selected.c === c));
        const hinted = Boolean(run.hint && run.hint.some((p) => p.r === r && p.c === c));
        cell.el.classList.toggle("hint-glow", hinted);
      }
    }
    els.level.textContent = run.level;
    els.score.textContent = run.score;
    els.goal.textContent = run.goal;
    els.moves.textContent = run.moves;
    els.progress.style.width = `${Math.min(100, (run.score / run.goal) * 100)}%`;
  }

  /* ------------------------------------------------------------------ *
   * Match resolution                                                    *
   * ------------------------------------------------------------------ */

  function planClears(runs, swapCells) {
    const clear = new Map(); // "r,c" -> cell
    const promotions = [];
    const inRun = new Map(); // "r,c" -> {row, col}

    for (const runEntry of runs) {
      for (const { r, c } of runEntry.cells) {
        const key = `${r},${c}`;
        const entry = inRun.get(key) || { row: null, col: null };
        if (runEntry.horizontal) entry.row = runEntry;
        else entry.col = runEntry;
        inRun.set(key, entry);
      }
    }

    const promoted = new Set();
    for (const [key, entry] of inRun) {
      if (promoted.has(key)) continue;
      const rowLen = entry.row ? entry.row.cells.length : 0;
      const colLen = entry.col ? entry.col.cells.length : 0;
      const total = Math.max(rowLen, colLen);
      let special = null;
      if (total >= 5) special = "rainbow";
      else if (rowLen && colLen) special = "bomb";
      else if (total === 4) special = entry.row ? "rowBlast" : "colBlast";
      if (special) {
        let at = key.split(",").map(Number);
        if (swapCells) {
          const hit = swapCells.find((p) => inRun.has(`${p.r},${p.c}`));
          if (hit) at = [hit.r, hit.c];
        }
        promotions.push({ r: at[0], c: at[1], special });
        promoted.add(`${at[0]},${at[1]}`);
      }
    }

    for (const runEntry of runs) {
      for (const { r, c } of runEntry.cells) {
        clear.set(`${r},${c}`, grid[r][c]);
      }
    }
    for (const promotion of promotions) {
      clear.delete(`${promotion.r},${promotion.c}`);
    }
    return { clear, promotions };
  }

  // Specials chain: any cleared special blasts more cells, recursively.
  function expandSpecials(clear, rainbowType) {
    const queue = [...clear.entries()];
    while (queue.length) {
      const [key, cell] = queue.shift();
      if (!cell || !cell.special) continue;
      const [r, c] = key.split(",").map(Number);
      const add = (rr, cc) => {
        if (!inBounds(rr, cc) || !grid[rr][cc]) return;
        const k2 = `${rr},${cc}`;
        if (clear.has(k2)) return;
        clear.set(k2, grid[rr][cc]);
        queue.push([k2, grid[rr][cc]]);
      };
      if (cell.special === "rowBlast") {
        for (let cc = 0; cc < SIZE; cc += 1) add(r, cc);
      } else if (cell.special === "colBlast") {
        for (let rr = 0; rr < SIZE; rr += 1) add(rr, c);
      } else if (cell.special === "bomb") {
        for (let rr = r - 1; rr <= r + 1; rr += 1) {
          for (let cc = c - 1; cc <= c + 1; cc += 1) add(rr, cc);
        }
      } else if (cell.special === "rainbow") {
        if (rainbowType === "ALL") {
          for (let rr = 0; rr < SIZE; rr += 1) {
            for (let cc = 0; cc < SIZE; cc += 1) add(rr, cc);
          }
        } else {
          const type = rainbowType ?? Math.floor(Math.random() * TYPES.length);
          for (let rr = 0; rr < SIZE; rr += 1) {
            for (let cc = 0; cc < SIZE; cc += 1) {
              if (grid[rr][cc]?.type === type) add(rr, cc);
            }
          }
        }
      }
    }
  }

  async function resolveBoard(swapCells, rainbowType) {
    let cascade = 0;
    for (;;) {
      const runs = findRunsOn(grid);
      const rainbowSwap = cascade === 1 && swapCells &&
        (grid[swapCells[0].r][swapCells[0].c]?.special === "rainbow" ||
         grid[swapCells[1].r][swapCells[1].c]?.special === "rainbow");
      if (!runs.length && !rainbowSwap) break;
      cascade += 1;

      let clear;
      let promotions = [];
      if (rainbowSwap) {
        clear = new Map();
        for (const p of swapCells) {
          const cell = grid[p.r][p.c];
          if (cell) clear.set(`${p.r},${p.c}`, cell);
        }
        expandSpecials(clear, rainbowType);
      } else {
        ({ clear, promotions } = planClears(runs, cascade === 1 ? swapCells : null));
        expandSpecials(clear);
      }

      run.score += clear.size * 20 * cascade + promotions.length * 50;
      GameHubJuice.pop(cascade === 1 ? 520 : 420 + cascade * 90);
      render();

      for (const [key, cell] of clear) {
        if (cell?.el) cell.el.classList.add("clearing");
      }
      await sleep(190);

      for (const [key, cell] of clear) {
        const [r, c] = key.split(",").map(Number);
        if (cell?.el) cell.el.remove();
        grid[r][c] = null;
      }
      for (const promotion of promotions) {
        const cell = grid[promotion.r][promotion.c];
        if (cell) {
          cell.special = promotion.special;
          GameHubJuice.coin();
        }
      }

      // Gravity: compact columns down, then refill from above the board.
      for (let c = 0; c < SIZE; c += 1) {
        let write = SIZE - 1;
        for (let r = SIZE - 1; r >= 0; r -= 1) {
          if (grid[r][c]) {
            if (write !== r) {
              grid[write][c] = grid[r][c];
              grid[r][c] = null;
            }
            write -= 1;
          }
        }
        let spawnRow = -1;
        for (let r = write; r >= 0; r -= 1) {
          grid[r][c] = { type: Math.floor(Math.random() * TYPES.length), special: null, el: null, id: ++cellSeq };
          makeGemEl(grid[r][c], r, c, spawnRow);
          spawnRow -= 1;
        }
      }
      render();
      await sleep(240);
    }
  }

  /* ------------------------------------------------------------------ *
   * Turns                                                               *
   * ------------------------------------------------------------------ */

  function areNeighbors(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  async function trySwap(a, b) {
    run.busy = true;
    clearHint();
    const cellA = grid[a.r][a.c];
    const cellB = grid[b.r][b.c];
    const rainbows = (cellA?.special === "rainbow" ? 1 : 0) + (cellB?.special === "rainbow" ? 1 : 0);

    swapOn(grid, a, b);
    refreshGemEl(grid[a.r][a.c], a.r, a.c);
    refreshGemEl(grid[b.r][b.c], b.r, b.c);
    GameHubJuice.swap();
    await sleep(180);

    const runs = findRunsOn(grid);
    if (!runs.length && rainbows === 0) {
      swapOn(grid, a, b);
      refreshGemEl(grid[a.r][a.c], a.r, a.c);
      refreshGemEl(grid[b.r][b.c], b.r, b.c);
      GameHubJuice.tick();
      await sleep(180);
      run.busy = false;
      armHint();
      return;
    }

    run.moves -= 1;
    run.selected = null;
    render();

    let rainbowType = null;
    if (rainbows === 1) {
      const other = cellA.special === "rainbow" ? cellB : cellA;
      rainbowType = other ? other.type : null;
    } else if (rainbows === 2) {
      rainbowType = "ALL";
    }

    await resolveBoard([a, b], rainbowType);

    if (run.score >= run.goal) {
      levelComplete();
    } else if (run.moves <= 0) {
      runOutOfMoves();
    } else {
      if (!boardHasMove(grid)) await shuffleBoard();
      run.busy = false;
      armHint();
    }
  }

  async function shuffleBoard() {
    els.board.classList.add("shuffling");
    GameHubJuice.sweep();
    await sleep(280);
    do {
      const cells = [];
      for (let r = 0; r < SIZE; r += 1) {
        for (let c = 0; c < SIZE; c += 1) cells.push(grid[r][c]);
      }
      for (let i = cells.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
      }
      let k = 0;
      for (let r = 0; r < SIZE; r += 1) {
        for (let c = 0; c < SIZE; c += 1) grid[r][c] = cells[k++];
      }
    } while (findRunsOn(grid).length || !boardHasMove(grid));
    els.board.classList.remove("shuffling");
    render();
  }

  function levelComplete() {
    run.active = false;
    run.busy = false;
    clearHint();
    run.pendingLevel = run.level + 1;
    const earned = 2 + run.level;
    run.bestLevel = Math.max(run.bestLevel, run.level + 1);
    if (run.bestLevel >= 5) GameHubProfile?.achieve("gem-5");
    if (run.bestLevel >= 10) GameHubProfile?.achieve("gem-10");
    saveState();
    GameHubProfile?.award("gem-crush", earned, `Level ${run.level} clear!`, run.bestLevel);
    GameHubJuice.win();
    els.overlayTitle.textContent = `Level ${run.level} clear! 🎉`;
    els.overlaySub.textContent = `+${earned} chips · Next goal: ${goalFor(run.level + 1)} points`;
    els.overlayButton.textContent = `Level ${run.level + 1} →`;
    els.overlay.hidden = false;
  }

  function runOutOfMoves() {
    run.active = false;
    run.busy = false;
    clearHint();
    const chips = Math.max(1, Math.floor(run.score / 150));
    run.pendingLevel = 1;
    GameHubProfile?.award("gem-crush", chips, `Crushed ${run.score} points`, run.bestLevel);
    GameHubJuice.lose();
    els.overlayTitle.textContent = "Out of moves!";
    els.overlaySub.textContent = `Level ${run.level} · ${run.score} points · +${chips} chips. Best level: ${run.bestLevel}.`;
    els.overlayButton.textContent = "New run";
    els.overlay.hidden = false;
  }

  function startLevel() {
    els.overlay.hidden = true;
    clearHint();
    run.level = run.pendingLevel;
    run.score = 0;
    run.goal = goalFor(run.level);
    run.moves = 20;
    run.active = true;
    run.busy = false;
    run.selected = null;
    els.board.innerHTML = "";
    dealBoard();
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) makeGemEl(grid[r][c], r, c, r - SIZE);
    }
    render();
    armHint();
  }

  /* ------------------------------------------------------------------ *
   * Input                                                               *
   * ------------------------------------------------------------------ */

  function boardCoords(event) {
    const rect = els.board.getBoundingClientRect();
    const c = Math.floor(((event.clientX - rect.left) / rect.width) * SIZE);
    const r = Math.floor(((event.clientY - rect.top) / rect.height) * SIZE);
    return { r, c };
  }

  function onGemPointer(event) {
    if (run.busy || !run.active) return;
    const pick = boardCoords(event);
    if (!inBounds(pick.r, pick.c)) return;
    if (run.selected && areNeighbors(run.selected, pick)) {
      const a = run.selected;
      run.selected = null;
      trySwap(a, pick);
      return;
    }
    run.selected = run.selected && run.selected.r === pick.r && run.selected.c === pick.c
      ? null
      : pick;
    GameHubJuice.tick();
    render();
  }

  els.board.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    onGemPointer(event);
  });

  // Drag-to-swap: press a gem, then drag half a cell toward a neighbor.
  let dragStart = null;
  els.board.addEventListener("pointerdown", (event) => {
    dragStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  els.board.addEventListener("pointermove", (event) => {
    if (!dragStart || dragStart.id !== event.pointerId || run.busy || !run.active || !run.selected) return;
    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    const threshold = els.board.clientWidth / SIZE / 2;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    dragStart = null;
    const from = run.selected;
    const to = Math.abs(dx) > Math.abs(dy)
      ? { r: from.r, c: from.c + (dx > 0 ? 1 : -1) }
      : { r: from.r + (dy > 0 ? 1 : -1), c: from.c };
    if (!inBounds(to.r, to.c)) return;
    run.selected = null;
    trySwap(from, to);
  });
  window.addEventListener("pointerup", () => {
    dragStart = null;
  });

  /* ------------------------------------------------------------------ *
   * Hints                                                               *
   * ------------------------------------------------------------------ */

  function clearHint() {
    run.hint = null;
    if (run.hintTimer) clearTimeout(run.hintTimer);
  }

  function armHint() {
    clearHint();
    run.hintTimer = setTimeout(() => {
      if (run.busy || !run.active) return;
      const move = boardHasMove(grid);
      if (move) {
        run.hint = move;
        render();
      }
    }, 6000);
  }

  /* ------------------------------------------------------------------ *
   * Boot                                                                *
   * ------------------------------------------------------------------ */

  els.overlayButton.addEventListener("click", startLevel);

  els.soundButton.addEventListener("click", () => {
    if (!window.GameHubJuice) return;
    GameHubJuice.muted = !GameHubJuice.muted;
    els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  });

  function showStart() {
    // Deal a live board behind the start overlay so the shelf looks alive.
    els.board.innerHTML = "";
    dealBoard();
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) makeGemEl(grid[r][c], r, c, r - SIZE);
    }
    els.overlayTitle.textContent = "Gem Crush";
    els.overlaySub.textContent = `Match gems, chase combos, clear the goal. Best level: ${run.bestLevel}.`;
    els.overlayButton.textContent = "Start";
    els.overlay.hidden = false;
    run.pendingLevel = 1;
  }

  loadState();
  if (window.GameHubJuice) els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  showStart();
})();
