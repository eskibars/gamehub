/*
 * Set — the pattern-matching card game. Eighty-one cards vary across four
 * attributes (count, color, shape, shading); a set is three cards where
 * every attribute is all-same or all-different. The table refills when no
 * set remains, hints flash a real set, and your pace is timed.
 */
(() => {
  "use strict";

  const COLORS = [
    { id: "red", css: "#c0392b" },
    { id: "green", css: "#2f8c5a" },
    { id: "purple", css: "#7b4fa6" },
  ];
  const SHAPES = ["oval", "diamond", "squiggle"];
  const SHADINGS = ["solid", "striped", "open"];
  const NUMBERS = [1, 2, 3];

  const els = {
    board: document.querySelector("#board"),
    setsFound: document.querySelector("#setsFound"),
    deckLeft: document.querySelector("#deckLeft"),
    clock: document.querySelector("#clock"),
    overlay: document.querySelector("#overlay"),
    overlayTitle: document.querySelector("#overlayTitle"),
    overlaySub: document.querySelector("#overlaySub"),
    playButton: document.querySelector("#playButton"),
    hintButton: document.querySelector("#hintButton"),
    addThree: document.querySelector("#addThree"),
    newGame: document.querySelector("#newGame"),
    soundButton: document.querySelector("#soundButton"),
  };

  const STATE_KEY = "gamehub-set-v1";

  const game = {
    deck: [],
    table: [],      // card objects with an id
    selected: [],   // ids
    setsFound: 0,
    best: 0,
    running: false,
    startedAt: 0,
    timer: null,
    busy: false,
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    game.best = saved.best || 0;
  } catch {
    // Fresh install.
  }

  function persist() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({ best: game.best }));
    } catch {
      // Storage unavailable.
    }
  }

  /* ------------------------------------------------------------------ *
   * Cards + set logic                                                   *
   * ------------------------------------------------------------------ */

  function buildDeck() {
    const deck = [];
    let id = 0;
    for (const number of NUMBERS) {
      for (let ci = 0; ci < 3; ci += 1) {
        for (const shape of SHAPES) {
          for (const shading of SHADINGS) {
            deck.push({ id: id++, number, color: ci, shape, shading });
          }
        }
      }
    }
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  // A set: for each attribute, all three values are equal or all different.
  function isSet(a, b, c) {
    const attrs = ["number", "color", "shape", "shading"];
    return attrs.every((attr) => {
      const values = new Set([a[attr], b[attr], c[attr]]);
      return values.size === 1 || values.size === 3;
    });
  }

  function findSetOnTable() {
    for (let i = 0; i < game.table.length; i += 1) {
      for (let j = i + 1; j < game.table.length; j += 1) {
        for (let k = j + 1; k < game.table.length; k += 1) {
          if (isSet(game.table[i], game.table[j], game.table[k])) {
            return [game.table[i], game.table[j], game.table[k]];
          }
        }
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Rendering                                                           *
   * ------------------------------------------------------------------ */

  function cardSVG(card) {
    const color = COLORS[card.color].css;
    const fill = card.shading === "solid" ? color
      : card.shading === "striped" ? `url(#stripes-${card.id})`
      : "none";
    const shapes = [];
    for (let i = 0; i < card.number; i += 1) {
      const x = 50 - (card.number - 1) * 26 + i * 26;
      const d = shapePath(card.shape, x, 50);
      shapes.push(`<path d="${d}" fill="${fill}" stroke="${color}" stroke-width="3.2"/>`);
    }
    const defs = card.shading === "striped"
      ? `<defs><pattern id="stripes-${card.id}" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="3.2" height="7" fill="${color}"/></pattern></defs>`
      : "";
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${defs}${shapes.join("")}</svg>`;
  }

  function shapePath(shape, cx, cy) {
    if (shape === "oval") {
      return `M ${cx - 11} ${cy} a 11 17 0 1 0 22 0 a 11 17 0 1 0 -22 0`;
    }
    if (shape === "diamond") {
      return `M ${cx} ${cy - 21} L ${cx + 13} ${cy} L ${cx} ${cy + 21} L ${cx - 13} ${cy} Z`;
    }
    // Squiggle
    return `M ${cx - 14} ${cy + 6}
      C ${cx - 18} ${cy - 8}, ${cx - 6} ${cy - 8}, ${cx - 2} ${cy - 2}
      C ${cx + 2} ${cy + 4}, ${cx + 8} ${cy + 6}, ${cx + 12} ${cy}
      C ${cx + 16} ${cy - 6}, ${cx + 10} ${cy - 12}, ${cx + 14} ${cy - 16}
      M ${cx - 14} ${cy + 6}
      C ${cx - 10} ${cy + 12}, ${cx - 18} ${cy + 12}, ${cx - 14} ${cy + 6}`;
  }

  function render() {
    els.board.innerHTML = "";
    for (const card of game.table) {
      const el = document.createElement("div");
      el.className = "set-card";
      el.dataset.id = card.id;
      if (game.selected.includes(card.id)) el.classList.add("selected");
      el.innerHTML = cardSVG(card);
      el.addEventListener("click", () => onCardClick(card.id));
      els.board.append(el);
    }
    els.setsFound.textContent = game.setsFound;
    els.deckLeft.textContent = game.deck.length;
  }

  /* ------------------------------------------------------------------ *
   * Play                                                                *
   * ------------------------------------------------------------------ */

  function refill(checkSets = true) {
    // Keep the table at 12 (or larger while sets are missing).
    while (game.table.length < 12 && game.deck.length) {
      game.table.push(game.deck.pop());
    }
    if (checkSets && !findSetOnTable() && game.deck.length) {
      for (let i = 0; i < 3 && game.deck.length; i += 1) {
        game.table.push(game.deck.pop());
      }
    }
    render();
  }

  function onCardClick(id) {
    if (!game.running || game.busy) return;
    if (game.selected.includes(id)) {
      game.selected = game.selected.filter((v) => v !== id);
      render();
      return;
    }
    game.selected.push(id);
    GameHubJuice.tick();
    if (game.selected.length < 3) {
      render();
      return;
    }
    const picked = game.selected
      .map((id) => game.table.find((card) => card.id === id))
      .filter(Boolean);
    if (picked.length === 3 && isSet(picked[0], picked[1], picked[2])) {
      game.busy = true;
      game.setsFound += 1;
      GameHubJuice.coin();
      const pickedIds = picked.map((c) => c.id);
      for (const el of els.board.children) {
        if (pickedIds.includes(Number(el.dataset.id))) el.classList.add("removing");
      }
      setTimeout(() => {
        game.table = game.table.filter((card) => !pickedIds.includes(card.id));
        game.selected = [];
        refill();
        game.busy = false;
        if (!findSetOnTable()) {
          finishGame();
        }
      }, 260);
    } else {
      GameHubJuice.lose();
      els.board.classList.add("shake");
      setTimeout(() => {
        els.board.classList.remove("shake");
        game.selected = [];
        render();
      }, 300);
    }
  }

  function finishGame() {
    game.running = false;
    clearInterval(game.timer);
    const seconds = Math.floor((Date.now() - game.startedAt) / 1000);
    const isRecord = game.setsFound > game.best;
    if (isRecord) {
      game.best = game.setsFound;
      persist();
    }
    const chips = Math.max(1, game.setsFound);
    GameHubProfile?.award("set", chips, `${game.setsFound} sets in ${Math.floor(seconds / 60)}m${seconds % 60}s`, game.setsFound);
    if (game.setsFound >= 10) GameHubProfile?.achieve("set-10");
    if (game.setsFound >= 27) GameHubProfile?.achieve("set-all");
    GameHubJuice.win();
    els.overlayTitle.textContent = "Deck cleared! 🧠";
    els.overlaySub.textContent =
      `${game.setsFound} sets in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} · +${chips} chips${isRecord ? " · new best!" : ""}`;
    els.playButton.textContent = "Play again";
    els.overlay.hidden = false;
  }

  function newGame() {
    els.overlay.hidden = true;
    game.deck = buildDeck();
    game.table = [];
    game.selected = [];
    game.setsFound = 0;
    game.running = true;
    game.busy = false;
    refill();
    game.startedAt = Date.now();
    clearInterval(game.timer);
    game.timer = setInterval(() => {
      if (!game.running) return;
      const seconds = Math.floor((Date.now() - game.startedAt) / 1000);
      els.clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }, 500);
  }

  els.playButton.addEventListener("click", newGame);
  els.newGame.addEventListener("click", newGame);
  els.addThree.addEventListener("click", () => {
    if (!game.running || game.busy) return;
    if (!game.deck.length) return;
    for (let i = 0; i < 3 && game.deck.length; i += 1) {
      game.table.push(game.deck.pop());
    }
    GameHubJuice.sweep();
    render();
  });
  els.hintButton.addEventListener("click", () => {
    if (!game.running || game.busy) return;
    const set = findSetOnTable();
    if (!set) return;
    GameHubJuice.coin();
    const ids = set.map((c) => c.id);
    for (const el of els.board.children) {
      if (ids.includes(Number(el.dataset.id))) el.classList.add("flash");
    }
    setTimeout(() => {
      for (const el of els.board.children) el.classList.remove("flash");
    }, 1900);
  });
  els.soundButton.addEventListener("click", () => {
    if (!window.GameHubJuice) return;
    GameHubJuice.muted = !GameHubJuice.muted;
    els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      game.selected = [];
      render();
    }
  });

  if (window.GameHubJuice) els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  // Idle preview table behind the start overlay.
  game.deck = buildDeck();
  refill(false);
})();
