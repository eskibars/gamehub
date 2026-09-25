/*
 * Sokoban — the classic warehouse keeper. Push every crate onto a target;
 * crates can never be pulled, so corners are forever. Ten handcrafted levels
 * (each machine-verified solvable by tools/verify_sokoban.py), full undo,
 * move/push counters, and best-push records per level.
 */
(() => {
  "use strict";

  const els = {
    board: document.querySelector("#board"),
    levelNum: document.querySelector("#levelNum"),
    levelName: document.querySelector("#levelName"),
    moves: document.querySelector("#moves"),
    pushes: document.querySelector("#pushes"),
    bestPushes: document.querySelector("#bestPushes"),
    overlay: document.querySelector("#overlay"),
    overlayTitle: document.querySelector("#overlayTitle"),
    overlaySub: document.querySelector("#overlaySub"),
    nextButton: document.querySelector("#nextButton"),
    replayButton: document.querySelector("#replayButton"),
    undo: document.querySelector("#undoButton"),
    restart: document.querySelector("#restartButton"),
    prev: document.querySelector("#prevLevel"),
    next: document.querySelector("#nextLevel"),
    soundButton: document.querySelector("#soundButton"),
    dpad: document.querySelector("#dpad"),
  };

  const STATE_KEY = "gamehub-sokoban-v1";

  const game = {
    level: 0,
    width: 0,
    height: 0,
    walls: new Set(),
    targets: new Set(),
    boxes: new Set(),
    player: { x: 0, y: 0 },
    history: [], // { player, box? } per move
    moves: 0,
    pushes: 0,
    done: false,
    unlocked: 0,
    bests: {},
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    game.unlocked = saved.unlocked || 0;
    game.bests = saved.bests || {};
  } catch {
    // Fresh install.
  }

  function persist() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        unlocked: game.unlocked,
        bests: game.bests,
      }));
    } catch {
      // Storage unavailable.
    }
  }

  const key = (x, y) => `${x},${y}`;

  function loadLevel(index) {
    const level = LEVELS[index];
    game.level = index;
    game.walls = new Set();
    game.targets = new Set();
    game.boxes = new Set();
    game.history = [];
    game.moves = 0;
    game.pushes = 0;
    game.done = false;
    game.height = level.map.length;
    game.width = Math.max(...level.map.map((row) => row.length));
    level.map.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        const ch = row[x];
        if (ch === "#") game.walls.add(key(x, y));
        if (ch === "." || ch === "*" || ch === "+") game.targets.add(key(x, y));
        if (ch === "$" || ch === "*") game.boxes.add(key(x, y));
        if (ch === "@" || ch === "+") game.player = { x, y };
      }
    });
    els.overlay.hidden = true;
    els.levelNum.textContent = index + 1;
    els.levelName.textContent = level.name;
    const best = game.bests[index];
    els.bestPushes.textContent = best === undefined ? "—" : best;
    els.prev.disabled = index === 0;
    els.next.disabled = index >= LEVELS.length - 1 || index >= game.unlocked;
    render();
  }

  /* ------------------------------------------------------------------ *
   * Moves                                                               *
   * ------------------------------------------------------------------ */

  function tryMove(dx, dy) {
    if (game.done) return;
    const from = { ...game.player };
    const to = { x: from.x + dx, y: from.y + dy };
    if (game.walls.has(key(to.x, to.y))) {
      bump();
      return;
    }
    if (game.boxes.has(key(to.x, to.y))) {
      const beyond = { x: to.x + dx, y: to.y + dy };
      if (game.walls.has(key(beyond.x, beyond.y)) || game.boxes.has(key(beyond.x, beyond.y))) {
        bump();
        return;
      }
      // Push
      game.history.push({
        player: { ...from },
        box: { from: { ...to }, to: { ...beyond } },
      });
      game.boxes.delete(key(to.x, to.y));
      game.boxes.add(key(beyond.x, beyond.y));
      game.pushes += 1;
      GameHubJuice.pop(220);
    } else {
      game.history.push({ player: { ...from } });
      GameHubJuice.tick();
    }
    game.player = to;
    game.moves += 1;
    render();
    checkWin();
  }

  function bump() {
    const playerEl = els.board.querySelector(".player");
    if (playerEl) {
      playerEl.classList.remove("bump");
      void playerEl.offsetWidth;
      playerEl.classList.add("bump");
    }
    GameHubJuice.tick();
  }

  function undo() {
    if (game.done || !game.history.length) return;
    const last = game.history.pop();
    game.player = last.player;
    if (last.box) {
      game.boxes.delete(key(last.box.to.x, last.box.to.y));
      game.boxes.add(key(last.box.from.x, last.box.from.y));
      game.pushes -= 1;
    }
    game.moves -= 1;
    GameHubJuice.tick();
    render();
  }

  function checkWin() {
    for (const spot of game.targets) {
      if (!game.boxes.has(spot)) return;
    }
    game.done = true;
    const index = game.level;
    const best = game.bests[index];
    const isRecord = best === undefined || game.pushes < best;
    if (isRecord) {
      game.bests[index] = game.pushes;
      els.bestPushes.textContent = game.pushes;
    }
    game.unlocked = Math.max(game.unlocked, index + 1);
    persist();
    const chips = 2 + Math.min(4, Math.floor(game.pushes / 4));
    GameHubProfile?.award("sokoban", chips, `Level ${index + 1} in ${game.pushes} pushes`, game.pushes);
    if (game.unlocked >= 5) GameHubProfile?.achieve("sokoban-5");
    if (index === LEVELS.length - 1) GameHubProfile?.achieve("sokoban-all");
    GameHubJuice.win();
    const lastLevel = index === LEVELS.length - 1;
    els.overlayTitle.textContent = lastLevel ? "Warehouse mastered! 🏆" : "Cleared! 📦";
    els.overlaySub.textContent =
      `${game.pushes} pushes · ${game.moves} moves${isRecord ? " · best!" : ""} · +${chips} chips`;
    els.nextButton.textContent = lastLevel ? "Free play" : "Next level →";
    els.overlay.hidden = false;
  }

  /* ------------------------------------------------------------------ *
   * Rendering                                                           *
   * ------------------------------------------------------------------ */

  function render() {
    els.board.style.gridTemplateColumns = `repeat(${game.width}, 1fr)`;
    els.board.innerHTML = "";
    els.moves.textContent = game.moves;
    els.pushes.textContent = game.pushes;

    for (let y = 0; y < game.height; y += 1) {
      for (let x = 0; x < game.width; x += 1) {
        const cell = document.createElement("div");
        const spot = key(x, y);
        if (game.walls.has(spot)) {
          cell.className = "cell wall";
        } else if (game.targets.has(spot)) {
          cell.className = "cell target";
        } else {
          cell.className = "cell floor";
        }
        if (game.boxes.has(spot)) {
          const boxEl = document.createElement("div");
          boxEl.className = game.targets.has(spot) ? "box on-target" : "box";
          cell.append(boxEl);
        }
        if (game.player.x === x && game.player.y === y) {
          const playerEl = document.createElement("div");
          playerEl.className = "player";
          cell.append(playerEl);
        }
        els.board.append(cell);
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Input                                                               *
   * ------------------------------------------------------------------ */

  const KEY_DIRS = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
    W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
  };

  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "z" || event.key === "Z") {
      undo();
      return;
    }
    if (event.key === "r" || event.key === "R") {
      loadLevel(game.level);
      return;
    }
    const dir = KEY_DIRS[event.key];
    if (!dir) return;
    event.preventDefault();
    tryMove(dir[0], dir[1]);
  });

  els.dpad.querySelectorAll("button[data-dir]").forEach((button) => {
    button.addEventListener("click", () => {
      const dirs = {
        up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
      };
      const dir = dirs[button.dataset.dir];
      tryMove(dir[0], dir[1]);
    });
  });

  // Swipe
  let swipeStart = null;
  els.board.addEventListener("pointerdown", (event) => {
    swipeStart = { x: event.clientX, y: event.clientY };
  });
  els.board.addEventListener("pointerup", (event) => {
    if (!swipeStart) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    if (Math.abs(dx) > Math.abs(dy)) tryMove(dx > 0 ? 1 : -1, 0);
    else tryMove(0, dy > 0 ? 1 : -1);
  });

  els.undo.addEventListener("click", undo);
  els.restart.addEventListener("click", () => loadLevel(game.level));
  els.replayButton.addEventListener("click", () => loadLevel(game.level));
  els.nextButton.addEventListener("click", () => {
    loadLevel(Math.min(game.level + 1, LEVELS.length - 1));
  });
  els.prev.addEventListener("click", () => loadLevel(Math.max(0, game.level - 1)));
  els.next.addEventListener("click", () => {
    if (game.level < game.unlocked && game.level < LEVELS.length - 1) {
      loadLevel(game.level + 1);
    }
  });
  els.soundButton.addEventListener("click", () => {
    if (!window.GameHubJuice) return;
    GameHubJuice.muted = !GameHubJuice.muted;
    els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  });

  loadLevel(Math.min(game.unlocked, LEVELS.length - 1));
})();
