/*
 * Mahjong Solitaire — the 144-tile tile-matching classic on a three-layer
 * ziggurat layout. Two matching free tiles come off the board; a tile is
 * free when nothing covers it and at least one long side is open. Flowers
 * match any flower and seasons any season. Hint, undo, and reshuffle keep
 * every deal winnable.
 */
(() => {
  "use strict";

  // --- Full mahjong deck: suits x4, honors x4, flowers/seasons singles ----
  const SUITS = [
    ...Array.from({ length: 9 }, (_, i) => String.fromCodePoint(0x1f007 + i)),  // characters
    ...Array.from({ length: 9 }, (_, i) => String.fromCodePoint(0x1f010 + i)),  // bamboo
    ...Array.from({ length: 9 }, (_, i) => String.fromCodePoint(0x1f019 + i)),  // dots
  ].flatMap((face) => [face, face, face, face]);
  const HONORS = [
    ...Array.from({ length: 4 }, () => String.fromCodePoint(0x1f000)), // E winds
    ...Array.from({ length: 4 }, () => String.fromCodePoint(0x1f001)),
    ...Array.from({ length: 4 }, () => String.fromCodePoint(0x1f002)),
    ...Array.from({ length: 4 }, () => String.fromCodePoint(0x1f003)),
    ...Array.from({ length: 4 }, () => String.fromCodePoint(0x1f004)), // red dragon
    ...Array.from({ length: 4 }, () => String.fromCodePoint(0x1f005)),
    ...Array.from({ length: 4 }, () => String.fromCodePoint(0x1f006)),
  ];
  const FLOWERS = ["🌸", "🌿", "🍀", "🌼"];   // match any flower
  const SEASONS = ["☀️", "🍂", "❄️", "🌧️"];   // match any season

  const RED_DRAGON = String.fromCodePoint(0x1f004);

  function buildDeck() {
    const deck = [...SUITS, ...HONORS, ...FLOWERS, ...SEASONS];
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  // --- Layout: 96 base + 32 ring + 16 cap = 144 ---------------------------
  function buildSpots() {
    const spots = [];
    const baseRows = [
      [0, 11], [2, 9], [1, 10], [0, 11], [0, 11], [0, 11], [1, 10], [2, 9], [0, 11],
    ];
    baseRows.forEach(([from, to], y) => {
      for (let x = from; x <= to; x += 1) spots.push({ x, y, layer: 0 });
    });
    // Layer 1: 6x6 ring at x3..8, y2..7 with the 2x2 center removed.
    for (let y = 2; y <= 7; y += 1) {
      for (let x = 3; x <= 8; x += 1) {
        const inCenter = x >= 5 && x <= 6 && y >= 4 && y <= 5;
        if (!inCenter) spots.push({ x, y, layer: 1 });
      }
    }
    // Layer 2: 4x4 cap at x4..7, y3..6.
    for (let y = 3; y <= 6; y += 1) {
      for (let x = 4; x <= 7; x += 1) spots.push({ x, y, layer: 2 });
    }
    return spots;
  }

  // --- Elements ------------------------------------------------------------
  const els = {
    board: document.querySelector("#board"),
    remaining: document.querySelector("#remaining"),
    score: document.querySelector("#score"),
    clock: document.querySelector("#clock"),
    overlay: document.querySelector("#overlay"),
    overlayTitle: document.querySelector("#overlayTitle"),
    overlaySub: document.querySelector("#overlaySub"),
    playButton: document.querySelector("#playButton"),
    undo: document.querySelector("#undoButton"),
    hint: document.querySelector("#hintButton"),
    shuffle: document.querySelector("#shuffleButton"),
    newDeal: document.querySelector("#newButton"),
    soundButton: document.querySelector("#soundButton"),
  };

  const BEST_KEY = "gamehub-mahjong-best";

  const game = {
    tiles: [],       // { face, group, x, y, layer, el, matched }
    selected: null,
    history: [],     // [tileA, tileB]
    score: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0),
    playing: false,
    startedAt: 0,
    elapsed: 0,
    clockTimer: null,
    hintPair: null,
  };

  /* ------------------------------------------------------------------ *
   * Free logic                                                          *
   * ------------------------------------------------------------------ */

  function covered(tile) {
    return game.tiles.some((other) =>
      !other.matched &&
      other !== tile &&
      other.layer === tile.layer + 1 &&
      Math.abs(other.x - tile.x) <= 0.5 &&
      Math.abs(other.y - tile.y) <= 0.5);
  }

  function sideOpen(tile) {
    const leftBlocked = game.tiles.some((other) =>
      !other.matched && other !== tile && other.layer === tile.layer &&
      other.y === tile.y && other.x === tile.x - 1);
    const rightBlocked = game.tiles.some((other) =>
      !other.matched && other !== tile && other.layer === tile.layer &&
      other.y === tile.y && other.x === tile.x + 1);
    return !leftBlocked || !rightBlocked;
  }

  function isFree(tile) {
    return !tile.matched && !covered(tile) && sideOpen(tile);
  }

  function facesMatch(a, b) {
    if (a.group === "flower" && b.group === "flower") return true;
    if (a.group === "season" && b.group === "season") return true;
    return a.face === b.face;
  }

  function freeTiles() {
    return game.tiles.filter(isFree);
  }

  function findHintPair() {
    const free = freeTiles();
    for (let i = 0; i < free.length; i += 1) {
      for (let j = i + 1; j < free.length; j += 1) {
        if (facesMatch(free[i], free[j])) return [free[i], free[j]];
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Rendering                                                           *
   * ------------------------------------------------------------------ */

  function tileMetrics() {
    const available = Math.min(els.board.clientWidth || 700, 700);
    const tw = Math.max(22, Math.min(38, Math.floor((available - 60) / 13)));
    return { tw, th: Math.round(tw * 1.32) };
  }

  function positionTile(tile, { tw, th }) {
    const lift = tile.layer * Math.round(th * 0.16);
    tile.el.style.width = `${tw}px`;
    tile.el.style.height = `${th}px`;
    tile.el.style.left = `${tile.x * (tw + 2) + lift + 22}px`;
    tile.el.style.top = `${tile.y * (th + 2) - lift + 40}px`;
    tile.el.style.zIndex = String(tile.layer * 500 + tile.y * 30 + tile.x + 10);
  }

  function renderAll() {
    const metrics = tileMetrics();
    els.board.style.setProperty("--th", `${metrics.th}px`);
    for (const tile of game.tiles) {
      if (tile.matched) continue;
      positionTile(tile, metrics);
      const free = isFree(tile);
      tile.el.classList.toggle("blocked", !free);
      tile.el.classList.toggle("selected", game.selected === tile);
      tile.el.classList.toggle("hinted", Boolean(game.hintPair?.includes(tile)));
    }
  }

  function makeTileEl(tile) {
    const el = document.createElement("div");
    el.className = "tile";
    const face = document.createElement("span");
    face.className = "face";
    face.textContent = tile.face;
    if (tile.face === RED_DRAGON) face.classList.add("red");
    if (tile.group === "season") face.classList.add("blue");
    el.append(face);
    el.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      onTileClick(tile);
    });
    tile.el = el;
    return el;
  }

  /* ------------------------------------------------------------------ *
   * Play                                                                *
   * ------------------------------------------------------------------ */

  function onTileClick(tile) {
    if (!game.playing || tile.matched) return;
    if (!isFree(tile)) {
      tile.el.classList.add("shake");
      setTimeout(() => tile.el.classList.remove("shake"), 320);
      GameHubJuice.tick();
      return;
    }
    if (game.selected === tile) {
      game.selected = null;
      renderAll();
      return;
    }
    if (game.selected && facesMatch(game.selected, tile)) {
      removePair(game.selected, tile);
      return;
    }
    game.selected = tile;
    game.hintPair = null;
    GameHubJuice.tick();
    renderAll();
  }

  function removePair(a, b) {
    a.matched = true;
    b.matched = true;
    game.history.push([a, b]);
    game.selected = null;
    game.hintPair = null;
    game.score += 10;
    els.score.textContent = game.score;
    GameHubJuice.pop(460 + Math.min(game.history.length, 12) * 20);
    a.el.classList.add("matched");
    b.el.classList.add("matched");
    const left = game.tiles.filter((t) => !t.matched).length;
    els.remaining.textContent = left;
    game.selected = null;
    renderAll();

    if (left === 0) {
      winGame();
      return;
    }
    if (!findHintPair()) {
      setTimeout(() => offerShuffle(), 350);
    }
  }

  function restorePair(a, b) {
    a.matched = false;
    b.matched = false;
    a.el.classList.remove("matched");
    b.el.classList.remove("matched");
    game.score = Math.max(0, game.score - 10);
    els.score.textContent = game.score;
    const left = game.tiles.filter((t) => !t.matched).length;
    els.remaining.textContent = left;
  }

  function undo() {
    if (!game.history.length || !game.playing) return;
    const [a, b] = game.history.pop();
    restorePair(a, b);
    game.selected = null;
    GameHubJuice.tick();
    renderAll();
  }

  function useHint() {
    if (!game.playing) return;
    const pair = findHintPair();
    if (!pair) {
      offerShuffle();
      return;
    }
    game.hintPair = pair;
    game.selected = null;
    GameHubJuice.coin();
    renderAll();
    setTimeout(() => {
      game.hintPair = null;
      renderAll();
    }, 2200);
  }

  function offerShuffle() {
    if (!game.playing) return;
    GameHubJuice.lose();
    els.overlayTitle.textContent = "No matches left!";
    els.overlaySub.textContent = "A shuffle remixes the remaining tiles (−25 points).";
    els.playButton.textContent = "🔀 Shuffle";
    els.overlay.hidden = false;
    game.playing = false;
    game.pendingAction = "shuffle";
  }

  function shuffleRemaining() {
    const alive = game.tiles.filter((t) => !t.matched);
    do {
      const faces = alive.map((t) => t.face);
      const groups = alive.map((t) => t.group);
      for (let i = faces.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [faces[i], faces[j]] = [faces[j], faces[i]];
        [groups[i], groups[j]] = [groups[j], groups[i]];
      }
      alive.forEach((tile, index) => {
        tile.face = faces[index];
        tile.group = groups[index];
        tile.el.querySelector(".face").textContent = faces[index];
      });
    } while (!findHintPair() && alive.length >= 4);
    game.score = Math.max(0, game.score - 25);
    els.score.textContent = game.score;
    els.overlay.hidden = true;
    game.playing = true;
    renderAll();
  }

  function winGame() {
    game.playing = false;
    clearInterval(game.clockTimer);
    const seconds = Math.floor((Date.now() - game.startedAt) / 1000);
    const timeBonus = Math.max(0, 720 - seconds) * 2;
    game.score += timeBonus;
    els.score.textContent = game.score;
    const isRecord = game.score > game.best;
    if (isRecord) {
      game.best = game.score;
      localStorage.setItem(BEST_KEY, String(game.best));
    }
    GameHubProfile?.achieve("mahjong-clear");
    GameHubProfile?.award("mahjong", 8, "Cleared the board!", game.score);
    GameHubJuice.confetti(180);
    GameHubJuice.win();
    els.overlayTitle.textContent = "Board cleared! 🀄";
    els.overlaySub.textContent =
      `${game.score} points (${timeBonus} time bonus)${isRecord ? " · new best!" : ""}`;
    els.playButton.textContent = "New deal";
    els.overlay.hidden = false;
    game.pendingAction = "new";
  }

  function newDeal() {
    els.overlay.hidden = true;
    els.board.innerHTML = "";
    game.tiles = buildSpots().map((spot) => ({ ...spot, matched: false, el: null }));
    const deck = buildDeck();
    const groups = (face) =>
      FLOWERS.includes(face) ? "flower"
        : SEASONS.includes(face) ? "season"
        : "suit";
    game.tiles.forEach((tile, index) => {
      tile.face = deck[index];
      tile.group = groups(deck[index]);
      els.board.append(makeTileEl(tile));
    });
    game.history = [];
    game.selected = null;
    game.hintPair = null;
    game.score = 0;
    els.score.textContent = "0";
    els.remaining.textContent = "144";
    game.playing = true;
    game.startedAt = Date.now();
    clearInterval(game.clockTimer);
    game.clockTimer = setInterval(() => {
      if (!game.playing) return;
      const seconds = Math.floor((Date.now() - game.startedAt) / 1000);
      els.clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }, 1000);
    // A deal with no opening pair is vanishingly rare but not impossible —
    // silently reshuffle until there is at least one move.
    let guard = 0;
    while (!findHintPair() && guard < 40) {
      const faces = game.tiles.map((t) => t.face);
      for (let i = faces.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [faces[i], faces[j]] = [faces[j], faces[i]];
      }
      game.tiles.forEach((tile, index) => {
        tile.face = faces[index];
        tile.group = groups(tile.face);
        tile.el.querySelector(".face").textContent = tile.face;
      });
      guard += 1;
    }
    renderAll();
  }

  /* ------------------------------------------------------------------ *
   * Boot                                                                *
   * ------------------------------------------------------------------ */

  els.playButton.addEventListener("click", () => {
    if (game.pendingAction === "shuffle") {
      game.pendingAction = null;
      shuffleRemaining();
    } else {
      game.pendingAction = null;
      newDeal();
    }
  });
  els.undo.addEventListener("click", undo);
  els.hint.addEventListener("click", useHint);
  els.shuffle.addEventListener("click", () => {
    if (game.playing) shuffleRemaining();
  });
  els.newDeal.addEventListener("click", newDeal);
  els.soundButton.addEventListener("click", () => {
    if (!window.GameHubJuice) return;
    GameHubJuice.muted = !GameHubJuice.muted;
    els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  });
  window.addEventListener("resize", renderAll);

  // Static preview behind the start overlay.
  game.tiles = buildSpots().map((spot) => ({ ...spot, matched: false, el: null }));
  const previewDeck = buildDeck();
  game.tiles.forEach((tile, index) => {
    tile.face = previewDeck[index];
    tile.group = "suit";
    els.board.append(makeTileEl(tile));
  });
  renderAll();
})();
