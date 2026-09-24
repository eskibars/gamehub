/*
 * Solitaire (Klondike) for Game Hub — pure vanilla JS, fully offline.
 *
 * Structure:
 *   1. Pure rules engine (no DOM) — exported to Node via module.exports so a
 *      headless harness can fuzz it.
 *   2. Browser app — rendering, drag & drop (Pointer Events), tap-to-move,
 *      undo, timer, persistence, auto-complete and the win celebration.
 *
 * localStorage keys are prefixed "solitaire-". All storage access is wrapped
 * in try/catch so private-mode or blocked storage never breaks the game.
 */
(function () {
  'use strict';

  /* =====================================================================
   * 1. Pure rules engine (runs in browser and Node alike)
   * ===================================================================== */

  const SUITS = ['S', 'H', 'D', 'C'];
  const RED_SUITS = { H: true, D: true };
  const SUIT_SYMBOL = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' };
  const RANK_LABEL = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  const TABLEAU_COUNT = 7;
  const FOUNDATION_COUNT = 4;

  function rankLabel(rank) {
    return RANK_LABEL[rank] || String(rank);
  }

  function isRed(card) {
    return !!RED_SUITS[card.suit];
  }

  function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({ id: suit + rank, suit, rank, faceUp: false });
      }
    }
    return deck;
  }

  function shuffle(cards, rng) {
    const rand = typeof rng === 'function' ? rng : Math.random;
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = cards[i];
      cards[i] = cards[j];
      cards[j] = tmp;
    }
    return cards;
  }

  function emptyState() {
    return {
      stock: [],
      waste: [],
      foundations: [[], [], [], []],
      tableau: [[], [], [], [], [], [], []],
    };
  }

  function dealGame(rng) {
    const deck = shuffle(createDeck(), rng);
    const state = emptyState();
    for (let i = 0; i < TABLEAU_COUNT; i++) {
      for (let j = 0; j <= i; j++) {
        const card = deck.pop();
        card.faceUp = j === i;
        state.tableau[i].push(card);
      }
    }
    state.stock = deck;
    return state;
  }

  /* A run is face-up, strictly descending, alternating colors. */
  function isValidRun(cards) {
    if (!cards || !cards.length) return false;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (!card || !card.faceUp) return false;
      if (i > 0) {
        const prev = cards[i - 1];
        if (card.rank !== prev.rank - 1 || isRed(card) === isRed(prev)) return false;
      }
    }
    return true;
  }

  function canDropTableau(card, pile) {
    if (!card || !card.faceUp) return false;
    if (!pile) return false;
    if (!pile.length) return card.rank === 13;
    const top = pile[pile.length - 1];
    if (!top.faceUp) return false;
    return top.rank === card.rank + 1 && isRed(top) !== isRed(card);
  }

  function canDropFoundation(card, pile) {
    if (!card || !card.faceUp || !pile) return false;
    if (!pile.length) return card.rank === 1;
    const top = pile[pile.length - 1];
    return top.suit === card.suit && card.rank === top.rank + 1;
  }

  function pileGet(state, loc) {
    if (!state || !loc) return null;
    if (loc.k === 'stock') return state.stock;
    if (loc.k === 'waste') return state.waste;
    if (loc.k === 'foundation') return state.foundations[loc.i] || null;
    if (loc.k === 'tableau') return state.tableau[loc.i] || null;
    return null;
  }

  /* loc = {k:'tableau'|'foundation'|'waste', i} ; mv = {from, fromIndex, to} */
  function validateMove(state, mv) {
    if (!state || !mv || !mv.from || !mv.to) return false;
    if (mv.from.k === 'stock' || mv.to.k === 'stock' || mv.to.k === 'waste') return false;
    const src = pileGet(state, mv.from);
    const dest = pileGet(state, mv.to);
    if (!src || !dest || src === dest) return false;
    if (!src.length) return false;
    let start;
    if (mv.from.k === 'tableau') {
      start = mv.fromIndex;
      if (!Number.isInteger(start) || start < 0 || start >= src.length) return false;
      if (!isValidRun(src.slice(start))) return false;
    } else {
      start = src.length - 1;
      if (mv.fromIndex != null && mv.fromIndex !== start) return false;
    }
    const lead = src[start];
    if (mv.to.k === 'foundation') {
      if (start !== src.length - 1) return false;
      if (!canDropFoundation(lead, dest)) return false;
    } else if (mv.to.k === 'tableau') {
      if (!canDropTableau(lead, dest)) return false;
    } else {
      return false;
    }
    return true;
  }

  function applyMove(state, mv) {
    if (!validateMove(state, mv)) return false;
    const src = pileGet(state, mv.from);
    const dest = pileGet(state, mv.to);
    const start = mv.from.k === 'tableau' ? mv.fromIndex : src.length - 1;
    const moved = src.splice(start);
    for (const card of moved) dest.push(card);
    if (mv.from.k === 'tableau' && src.length) {
      const top = src[src.length - 1];
      if (!top.faceUp) top.faceUp = true;
    }
    return true;
  }

  function drawFromStock(state, count) {
    if (!state || !state.stock) return 0;
    const n = Math.max(0, Math.min(count | 0, state.stock.length));
    for (let i = 0; i < n; i++) {
      const card = state.stock.pop();
      card.faceUp = true;
      state.waste.push(card);
    }
    return n;
  }

  function recycleStock(state) {
    if (!state || state.stock.length || !state.waste.length) return false;
    while (state.waste.length) {
      const card = state.waste.pop();
      card.faceUp = false;
      state.stock.push(card);
    }
    return true;
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function isWon(state) {
    if (!state || !state.foundations) return false;
    for (const pile of state.foundations) {
      if (!pile || pile.length !== 13) return false;
    }
    return true;
  }

  function allCardsFaceUp(state) {
    if (!state) return false;
    if (state.stock.length || state.waste.length) return false;
    for (const pile of state.tableau) {
      for (const card of pile) {
        if (!card.faceUp) return false;
      }
    }
    return true;
  }

  /* Export the engine for headless testing; skip all DOM code in Node. */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      SUITS, SUIT_SYMBOL, rankLabel, isRed, createDeck, shuffle, emptyState,
      dealGame, isValidRun, canDropTableau, canDropFoundation, pileGet,
      validateMove, applyMove, drawFromStock, recycleStock, cloneState,
      isWon, allCardsFaceUp,
    };
    return;
  }

  /* =====================================================================
   * 2. Browser app
   * ===================================================================== */

  const KEY_SETTINGS = 'solitaire-settings';
  const KEY_GAME = 'solitaire-game';
  const KEY_STATS = 'solitaire-stats';

  const byId = (id) => document.getElementById(id);
  const board = byId('board');
  const cardLayer = byId('cardLayer');
  const timeEl = byId('time');
  const movesEl = byId('moves');
  const bestTimeEl = byId('bestTime');
  const undoBtn = byId('undo');
  const autoCompleteBtn = byId('autoComplete');
  const newDealBtn = byId('newDeal');
  const drawToggleBtn = byId('drawToggle');
  const winOverlay = byId('winOverlay');
  const winStatsEl = byId('winStats');
  const winNewDealBtn = byId('winNewDeal');
  const fxCanvas = byId('fxCanvas');
  const stockCountEl = byId('stockCount');

  const slotEls = {};
  for (let f = 0; f < FOUNDATION_COUNT; f++) slotEls['foundation' + f] = byId('slot-found' + f);
  for (let t = 0; t < TABLEAU_COUNT; t++) slotEls['tableau' + t] = byId('slot-tab' + t);
  slotEls.stock = byId('slot-stock');
  slotEls.waste = byId('slot-waste');

  const cardEls = {};
  const T = (x, y) => 'translate3d(' + x + 'px,' + y + 'px,0)';

  /* ---------- storage helpers (all guarded) ---------- */

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      /* storage unavailable — keep playing in memory */
    }
  }

  /* ---------- state ---------- */

  let settings = loadJSON(KEY_SETTINGS, null);
  if (!settings || (settings.drawMode !== 1 && settings.drawMode !== 3)) {
    settings = { drawMode: 1 };
  }

  let stats = loadJSON(KEY_STATS, null);
  if (!stats || typeof stats !== 'object') stats = {};
  stats.won = Number.isInteger(stats.won) ? stats.won : 0;
  stats.bestTimeMs = typeof stats.bestTimeMs === 'number' ? stats.bestTimeMs : null;
  stats.fewestMoves = Number.isInteger(stats.fewestMoves) ? stats.fewestMoves : null;

  let game = { state: null, drawMode: settings.drawMode, moves: 0, started: false, won: false };
  let history = [];
  let locked = false;
  let selection = null;
  let drag = null;
  let fx = null;
  let L = null; // layout metrics

  const timer = { elapsedMs: 0, since: null };

  function currentElapsed() {
    return timer.elapsedMs + (timer.since != null ? Date.now() - timer.since : 0);
  }

  function startTimer() {
    if (game.won) return;
    game.started = true;
    if (timer.since == null) timer.since = Date.now();
  }

  function pauseTimer() {
    if (timer.since != null) {
      timer.elapsedMs += Date.now() - timer.since;
      timer.since = null;
    }
  }

  function formatTime(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function updateTime() {
    timeEl.textContent = formatTime(currentElapsed());
  }

  function renderStats() {
    bestTimeEl.textContent = stats.bestTimeMs == null ? '\u2014' : formatTime(stats.bestTimeMs);
  }

  /* ---------- layout ---------- */

  function computeLayout() {
    const width = board.clientWidth;
    const gap = Math.max(5, Math.round(width * 0.016));
    const cardW = (width - gap * 6) / 7;
    const cardH = cardW * 1.42;
    const topY = 8;
    const tabY = topY + cardH + Math.max(12, cardH * 0.16);

    let fanUp = cardH * 0.27;
    let fanDown = Math.min(cardH * 0.13, fanUp * 0.6);
    const TAB_STEPS = 12; // worst case: 13-card run
    const needed = tabY + cardH + TAB_STEPS * fanUp + 14;

    const boardTop = board.getBoundingClientRect().top;
    const availH = window.innerHeight - boardTop - 84; // leave room for the hint line
    let height = needed;
    const minHeight = tabY + cardH * 2;
    const maxH = Math.max(minHeight, availH);
    if (height > maxH) {
      height = maxH;
      fanUp = Math.max(cardH * 0.115, (height - tabY - cardH - 14) / TAB_STEPS);
      fanDown = Math.min(fanDown, fanUp * 0.6);
    }

    board.style.height = Math.round(height) + 'px';
    board.style.setProperty('--card-w', cardW + 'px');
    board.style.setProperty('--card-h', cardH + 'px');

    const colX = (i) => i * (cardW + gap);
    for (let f = 0; f < FOUNDATION_COUNT; f++) {
      placeSlot('foundation' + f, colX(3 + f), topY, cardW, cardH);
    }
    for (let t = 0; t < TABLEAU_COUNT; t++) {
      placeSlot('tableau' + t, colX(t), tabY, cardW, cardH);
    }
    placeSlot('stock', colX(0), topY, cardW, cardH);
    placeSlot('waste', colX(1), topY, cardW, cardH);

    L = { gap, cardW, cardH, topY, tabY, fanUp, fanDown, wasteFan: cardW * 0.36, colX };
  }

  function placeSlot(key, x, y, w, h) {
    const el = slotEls[key];
    if (!el) return;
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.style.transform = T(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
  }

  function tableauPos(pile, col, index) {
    let y = L.tabY;
    for (let i = 0; i < index; i++) {
      y += pile[i].faceUp ? L.fanUp : L.fanDown;
    }
    return { x: L.colX(col), y };
  }

  /* ---------- DOM cards ---------- */

  function buildCards() {
    const frag = document.createDocumentFragment();
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank++) {
        const id = suit + rank;
        const el = document.createElement('div');
        el.className = 'card face-down' + (isRed({ suit }) ? ' red' : '');
        el.dataset.id = id;
        const label = rankLabel(rank);
        const sym = SUIT_SYMBOL[suit];
        const corner = '<span class="corner">' + label + '<span class="csuit">' + sym + '</span></span>';
        const pip = rank >= 11
          ? '<span class="pip court">' + label + '</span>'
          : '<span class="pip">' + sym + '</span>';
        el.innerHTML =
          '<div class="card-inner">' +
          '<div class="card-face card-front">' + corner + pip + corner.replace('class="corner"', 'class="corner bottom"') + '</div>' +
          '<div class="card-face card-back"></div>' +
          '</div>';
        frag.appendChild(el);
        cardEls[id] = el;
      }
    }
    cardLayer.appendChild(frag);
  }

  /* ---------- rendering ---------- */

  function render(opts) {
    if (!game.state || !L) return;
    const st = game.state;
    const instant = !!(opts && opts.instant);
    const batch = [];

    st.stock.forEach((card, i) => {
      batch.push({ card, x: L.colX(0) - Math.min(i * 0.1, 2.5), y: L.topY - Math.min(i * 0.1, 2.5), z: i });
    });

    const wLen = st.waste.length;
    const fanN = game.drawMode === 3 ? Math.min(3, wLen) : 1;
    const fanStart = wLen - fanN;
    st.waste.forEach((card, i) => {
      const fi = Math.max(0, i - fanStart);
      batch.push({ card, x: L.colX(1) + fi * (game.drawMode === 3 ? L.wasteFan : 0), y: L.topY, z: i });
    });

    st.foundations.forEach((pile, f) => {
      pile.forEach((card, i) => batch.push({ card, x: L.colX(3 + f), y: L.topY, z: i }));
    });

    st.tableau.forEach((pile, t) => {
      let y = L.tabY;
      pile.forEach((card, i) => {
        batch.push({ card, x: L.colX(t), y, z: i });
        y += card.faceUp ? L.fanUp : L.fanDown;
      });
    });

    if (instant) {
      for (const b of batch) cardEls[b.card.id].classList.add('no-anim');
    }
    for (const b of batch) {
      const el = cardEls[b.card.id];
      el.classList.toggle('face-down', !b.card.faceUp);
      el.style.zIndex = String(b.z + 1);
      el.style.transform = T(Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10);
    }
    if (instant) {
      requestAnimationFrame(() => {
        for (const b of batch) cardEls[b.card.id].classList.remove('no-anim');
      });
    }
    updateButtons();
  }

  function posOfCard(cid) {
    const st = game.state;
    let idx = st.stock.findIndex((c) => c.id === cid);
    if (idx >= 0) return { x: L.colX(0) - Math.min(idx * 0.1, 2.5), y: L.topY - Math.min(idx * 0.1, 2.5) };
    idx = st.waste.findIndex((c) => c.id === cid);
    if (idx >= 0) {
      const fanN = game.drawMode === 3 ? Math.min(3, st.waste.length) : 1;
      const fi = Math.max(0, idx - (st.waste.length - fanN));
      return { x: L.colX(1) + fi * (game.drawMode === 3 ? L.wasteFan : 0), y: L.topY };
    }
    for (let f = 0; f < FOUNDATION_COUNT; f++) {
      idx = st.foundations[f].findIndex((c) => c.id === cid);
      if (idx >= 0) return { x: L.colX(3 + f), y: L.topY };
    }
    for (let t = 0; t < TABLEAU_COUNT; t++) {
      idx = st.tableau[t].findIndex((c) => c.id === cid);
      if (idx >= 0) return tableauPos(st.tableau[t], t, idx);
    }
    return { x: 0, y: 0 };
  }

  function updateButtons() {
    const st = game.state;
    if (!st) return;
    movesEl.textContent = String(game.moves);
    undoBtn.disabled = game.won || locked || !history.length;
    autoCompleteBtn.hidden = !canAutoComplete();
    if (st.stock.length) {
      stockCountEl.hidden = false;
      stockCountEl.textContent = String(st.stock.length);
    } else {
      stockCountEl.hidden = true;
    }
    updateDrawToggle();
  }

  function updateDrawToggle() {
    let label = 'Draw ' + settings.drawMode;
    if (game.state && !game.won && game.drawMode !== settings.drawMode) label += ' (next)';
    drawToggleBtn.textContent = label;
    drawToggleBtn.title = 'Cards drawn per stock trip \u2014 applies to the next deal';
  }

  function canAutoComplete() {
    return !!game.state && !game.won && !locked && allCardsFaceUp(game.state) && !isWon(game.state);
  }

  /* ---------- persistence ---------- */

  function persistGame() {
    if (!game.state) return;
    saveJSON(KEY_GAME, {
      v: 1,
      drawMode: game.drawMode,
      moves: game.moves,
      elapsedMs: Math.round(currentElapsed()),
      started: game.started,
      won: game.won,
      piles: game.state,
    });
  }

  function loadSavedGame() {
    const raw = loadJSON(KEY_GAME, null);
    if (!raw || raw.v !== 1 || !raw.piles) return null;
    if (raw.drawMode !== 1 && raw.drawMode !== 3) return null;
    const st = raw.piles;
    if (!st || !Array.isArray(st.stock) || !Array.isArray(st.waste) ||
        !Array.isArray(st.foundations) || !Array.isArray(st.tableau) ||
        st.foundations.length !== FOUNDATION_COUNT || st.tableau.length !== TABLEAU_COUNT) {
      return null;
    }
    const seen = new Set();
    const validCard = (c) => {
      return c && typeof c.id === 'string' && SUITS.includes(c.suit) &&
        Number.isInteger(c.rank) && c.rank >= 1 && c.rank <= 13 &&
        typeof c.faceUp === 'boolean' && c.id === c.suit + c.rank && !seen.has(c.id) && seen.add(c.id);
    };
    let total = 0;
    const walk = (pile) => {
      if (!Array.isArray(pile)) return false;
      for (const c of pile) {
        total++;
        if (!validCard(c)) return false;
      }
      return true;
    };
    if (!walk(st.stock) || !walk(st.waste)) return null;
    for (const p of st.foundations) if (!walk(p)) return null;
    for (const p of st.tableau) if (!walk(p)) return null;
    if (total !== 52) return null;
    return {
      state: st,
      drawMode: raw.drawMode,
      moves: Number.isInteger(raw.moves) && raw.moves >= 0 ? raw.moves : 0,
      elapsedMs: typeof raw.elapsedMs === 'number' && raw.elapsedMs >= 0 ? raw.elapsedMs : 0,
      started: !!raw.started,
      won: !!raw.won,
    };
  }

  /* ---------- undo ---------- */

  function pushSnapshot() {
    history.push({ state: cloneState(game.state), moves: game.moves });
    if (history.length > 400) history.shift();
  }

  undoBtn.addEventListener('click', () => {
    if (locked || game.won || !history.length) return;
    const snap = history.pop();
    game.state = snap.state;
    game.moves = snap.moves;
    clearSelection();
    render();
    persistGame();
    updateTime();
  });

  /* ---------- moves ---------- */

  function doMove(mv) {
    if (locked || game.won) return false;
    startTimer();
    pushSnapshot();
    if (!applyMove(game.state, mv)) {
      history.pop();
      return false;
    }
    game.moves++;
    popDestCard(mv.to);
    afterAction();
    return true;
  }

  function afterAction() {
    clearSelection();
    render();
    persistGame();
    updateTime();
    checkWin();
  }

  function popDestCard(destLoc) {
    const pile = pileGet(game.state, destLoc);
    if (!pile || !pile.length) return;
    const el = cardEls[pile[pile.length - 1].id];
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    setTimeout(() => el.classList.remove('pop'), 300);
  }

  /* ---------- selection / taps ---------- */

  function locateCard(cid) {
    const st = game.state;
    let idx = st.stock.findIndex((c) => c.id === cid);
    if (idx >= 0) return { k: 'stock', i: 0, index: idx };
    idx = st.waste.findIndex((c) => c.id === cid);
    if (idx >= 0) return { k: 'waste', i: 0, index: idx };
    for (let f = 0; f < FOUNDATION_COUNT; f++) {
      idx = st.foundations[f].findIndex((c) => c.id === cid);
      if (idx >= 0) return { k: 'foundation', i: f, index: idx };
    }
    for (let t = 0; t < TABLEAU_COUNT; t++) {
      idx = st.tableau[t].findIndex((c) => c.id === cid);
      if (idx >= 0) return { k: 'tableau', i: t, index: idx };
    }
    return null;
  }

  function grabbableRun(loc) {
    const pile = pileGet(game.state, loc);
    if (!pile || !pile.length || loc.k === 'stock') return null;
    if (loc.k === 'waste' || loc.k === 'foundation') {
      if (loc.index !== pile.length - 1) return null;
      const card = pile[loc.index];
      return card.faceUp ? [card] : null;
    }
    const card = pile[loc.index];
    if (!card || !card.faceUp) return null;
    const run = pile.slice(loc.index);
    return isValidRun(run) ? run : null;
  }

  function setSelection(loc, at) {
    clearSelection();
    const run = grabbableRun(loc);
    if (!run) return false;
    selection = {
      loc: { k: loc.k, i: loc.i, index: loc.index },
      ids: run.map((c) => c.id),
      at,
    };
    for (const id of selection.ids) cardEls[id].classList.add('selected');
    return true;
  }

  function clearSelection() {
    if (!selection) return;
    for (const id of selection.ids) {
      const el = cardEls[id];
      if (el) el.classList.remove('selected');
    }
    selection = null;
  }

  function handleTap(d) {
    if (d.isStock) {
      drawAction();
      return;
    }
    const now = performance.now();
    if (selection && selection.ids.includes(d.id)) {
      if (now - selection.at < 550) {
        const sel = selection;
        clearSelection();
        tryAutoMove(sel.loc);
      } else {
        clearSelection();
      }
      return;
    }
    if (selection) {
      const mv = {
        from: { k: selection.loc.k, i: selection.loc.i },
        fromIndex: selection.loc.index,
        to: { k: d.loc.k, i: d.loc.i },
      };
      if (validateMove(game.state, mv)) {
        doMove(mv);
        return;
      }
    }
    if (!setSelection(d.loc, now)) clearSelection();
  }

  /* Double-tap: send the tapped pile's top card to its most useful home —
     foundation first, then a legal tableau pile (kings prefer empty columns). */
  function tryAutoMove(loc) {
    const st = game.state;
    const src = pileGet(st, loc);
    if (!src || !src.length || loc.index !== src.length - 1 || loc.k === 'stock') return false;
    const card = src[loc.index];
    for (let f = 0; f < FOUNDATION_COUNT; f++) {
      const mv = { from: { k: loc.k, i: loc.i }, fromIndex: loc.index, to: { k: 'foundation', i: f } };
      if (validateMove(st, mv)) return doMove(mv);
    }
    const empties = [];
    const nonEmpty = [];
    for (let t = 0; t < TABLEAU_COUNT; t++) {
      if (loc.k === 'tableau' && loc.i === t) continue;
      (st.tableau[t].length ? nonEmpty : empties).push(t);
    }
    const order = card.rank === 13 ? empties.concat(nonEmpty) : nonEmpty.concat(empties);
    for (const t of order) {
      const mv = { from: { k: loc.k, i: loc.i }, fromIndex: loc.index, to: { k: 'tableau', i: t } };
      if (validateMove(st, mv)) return doMove(mv);
    }
    return false;
  }

  /* ---------- stock ---------- */

  function drawAction() {
    if (locked || game.won || !game.state) return;
    const st = game.state;
    if (!st.stock.length && !st.waste.length) return;
    startTimer();
    pushSnapshot();
    if (!st.stock.length) {
      recycleStock(st);
    } else {
      drawFromStock(st, game.drawMode);
    }
    game.moves++;
    const el = slotEls.stock;
    el.classList.remove('stock-pulse');
    void el.offsetWidth;
    el.classList.add('stock-pulse');
    setTimeout(() => el.classList.remove('stock-pulse'), 550);
    afterAction();
  }

  /* ---------- drag & drop (Pointer Events) ---------- */

  function parseKey(key) {
    const dot = key.indexOf('foundation') === 0 ? key.slice('foundation'.length) : null;
    if (dot != null) return { k: 'foundation', i: Number(dot) };
    return { k: 'tableau', i: Number(key.slice('tableau'.length)) };
  }

  function computeDropZones() {
    const st = game.state;
    const zones = [];
    const rectOf = (el) => el.getBoundingClientRect();
    for (let t = 0; t < TABLEAU_COUNT; t++) {
      const r = rectOf(slotEls['tableau' + t]);
      const pile = st.tableau[t];
      let bottom = r.bottom;
      if (pile.length) {
        bottom = Math.max(bottom, rectOf(cardEls[pile[pile.length - 1].id]).bottom);
      }
      zones.push({ key: 'tableau' + t, x: r.left, y: r.top, w: r.width, h: bottom - r.top });
    }
    for (let f = 0; f < FOUNDATION_COUNT; f++) {
      const r = rectOf(slotEls['foundation' + f]);
      zones.push({ key: 'foundation' + f, x: r.left, y: r.top, w: r.width, h: r.height });
    }
    return zones;
  }

  function bestDropFor(d) {
    if (!d.zones || !d.run.length) return null;
    const bx = d.boardRect.left + d.origins[0].x + d.dx;
    const by = d.boardRect.top + d.origins[0].y + d.dy;
    const cw = L.cardW;
    const ch = L.cardH;
    const minArea = 0.15 * cw * ch;
    let best = null;
    let bestArea = minArea;
    const lead = pileGet(game.state, d.loc)[d.fromIndex];
    for (const z of d.zones) {
      const ix = Math.max(0, Math.min(bx + cw, z.x + z.w) - Math.max(bx, z.x));
      const iy = Math.max(0, Math.min(by + ch, z.y + z.h) - Math.max(by, z.y));
      const area = ix * iy;
      if (area <= bestArea) continue;
      const dest = parseKey(z.key);
      const destPile = pileGet(game.state, dest);
      const ok = dest.k === 'foundation'
        ? d.run.length === 1 && canDropFoundation(lead, destPile)
        : canDropTableau(lead, destPile);
      if (ok) {
        best = z;
        bestArea = area;
      }
    }
    return best;
  }

  function setDropHint(d, zone) {
    const key = zone ? zone.key : null;
    if (d.hint === key) return;
    if (d.hint) slotEls[d.hint].classList.remove('drop-hint');
    d.hint = key;
    if (key) slotEls[key].classList.add('drop-hint');
  }

  cardLayer.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (locked || game.won || drag || !game.state) return;
    const el = e.target.closest('.card');
    if (!el) return;
    const cid = el.dataset.id;
    const loc = locateCard(cid);
    if (!loc) return;
    const isStock = loc.k === 'stock';
    const run = isStock ? null : grabbableRun(loc);
    if (!isStock && !run) return;
    e.preventDefault();
    try {
      el.setPointerCapture(e.pointerId);
    } catch (err) {
      /* capture unsupported — drag still works via element listeners */
    }
    drag = {
      pointerId: e.pointerId,
      el,
      id: cid,
      loc,
      isStock,
      fromIndex: loc.index,
      run: run ? run.map((c) => c.id) : [],
      origins: run ? run.map((c) => posOfCard(c.id)) : [],
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      moved: false,
      zones: null,
      hint: null,
      boardRect: board.getBoundingClientRect(),
    };

    const onMove = (ev) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      drag.dx = ev.clientX - drag.startX;
      drag.dy = ev.clientY - drag.startY;
      if (!drag.moved && Math.hypot(drag.dx, drag.dy) < 6) return;
      if (!drag.moved) {
        drag.moved = true;
        drag.zones = computeDropZones();
        drag.run.forEach((id, j) => {
          const cEl = cardEls[id];
          cEl.classList.add('dragging');
          cEl.style.zIndex = String(600 + j);
        });
      }
      drag.run.forEach((id, j) => {
        const o = drag.origins[j];
        cardEls[id].style.transform = T(o.x + drag.dx, o.y + drag.dy);
      });
      setDropHint(drag, bestDropFor(drag));
    };

    const cleanup = () => {
      drag.el.removeEventListener('pointermove', onMove);
      drag.el.removeEventListener('pointerup', onUp);
      drag.el.removeEventListener('pointercancel', onCancel);
    };

    const finishDrag = () => {
      const d = drag;
      drag = null;
      if (d.hint) slotEls[d.hint].classList.remove('drop-hint');
      d.run.forEach((id) => {
        const cEl = cardEls[id];
        cEl.classList.remove('dragging');
        void cEl.offsetWidth; // restore transitions before re-render
      });
      return d;
    };

    const onUp = (ev) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      cleanup();
      if (!drag.moved) {
        const tapped = drag;
        drag = null;
        handleTap(tapped);
        return;
      }
      const best = bestDropFor(drag);
      const d = finishDrag();
      if (best) {
        doMove({
          from: { k: d.loc.k, i: d.loc.i },
          fromIndex: d.fromIndex,
          to: parseKey(best.key),
        });
      } else {
        render(); // snap back
      }
    };

    const onCancel = () => {
      if (!drag) return;
      cleanup();
      finishDrag();
      render(); // snap back
    };

    drag.el.addEventListener('pointermove', onMove);
    drag.el.addEventListener('pointerup', onUp);
    drag.el.addEventListener('pointercancel', onCancel);
  });

  /* Empty-slot taps act as drop destinations for tap-to-move. */
  for (const key of Object.keys(slotEls)) {
    slotEls[key].addEventListener('click', () => {
      if (locked || game.won || !game.state) return;
      if (key === 'stock') {
        drawAction();
        return;
      }
      if (!selection) return;
      const mv = {
        from: { k: selection.loc.k, i: selection.loc.i },
        fromIndex: selection.loc.index,
        to: parseKey(key),
      };
      if (validateMove(game.state, mv)) doMove(mv);
    });
  }

  board.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------- auto-complete ---------- */

  autoCompleteBtn.addEventListener('click', () => {
    if (!canAutoComplete()) return;
    locked = true;
    updateButtons();
    startTimer();
    pushSnapshot();
    const step = () => {
      const st = game.state;
      let movedAny = false;
      for (let t = 0; t < TABLEAU_COUNT && !movedAny; t++) {
        const pile = st.tableau[t];
        if (!pile.length) continue;
        for (let f = 0; f < FOUNDATION_COUNT; f++) {
          const mv = { from: { k: 'tableau', i: t }, fromIndex: pile.length - 1, to: { k: 'foundation', i: f } };
          if (validateMove(st, mv)) {
            applyMove(st, mv);
            game.moves++;
            popDestCard(mv.to);
            movedAny = true;
            break;
          }
        }
      }
      render();
      persistGame();
      updateTime();
      if (isWon(st)) {
        locked = false;
        updateButtons();
        checkWin();
        return;
      }
      if (movedAny) {
        setTimeout(step, 100);
      } else {
        locked = false;
        updateButtons();
      }
    };
    setTimeout(step, 80);
  });

  /* ---------- win ---------- */

  function checkWin() {
    if (game.won || !isWon(game.state)) return;
    game.won = true;
    pauseTimer();
    const elapsed = currentElapsed();
    const secs = Math.floor(elapsed / 1000);
    const movesBeyond = Math.max(0, game.moves - 50);
    let chips = 50 - Math.floor(secs / 12) - Math.floor(movesBeyond / 4);
    chips = Math.max(5, Math.min(50, chips));

    const newBestTime = stats.bestTimeMs == null || elapsed < stats.bestTimeMs;
    const newFewest = stats.fewestMoves == null || game.moves < stats.fewestMoves;
    stats.won++;
    if (newBestTime) stats.bestTimeMs = Math.round(elapsed);
    if (newFewest) stats.fewestMoves = game.moves;
    saveJSON(KEY_STATS, stats);
    renderStats();
    persistGame();
    updateButtons();

    if (window.GameHubProfile) {
      try {
        window.GameHubProfile.award('solitaire', chips, 'Won solitaire in ' + formatTime(elapsed), chips);
      } catch (err) {
        /* profile integration must never block the win */
      }
    }

    const recordNote = newBestTime ? '<br>New best time!' + (newFewest ? ' New fewest moves!' : '') : '';
    winStatsEl.innerHTML =
      'Time <b>' + formatTime(elapsed) + '</b> \u00b7 <b>' + game.moves + '</b> moves<br>' +
      '<b>+' + chips + '</b> chips' + recordNote;
    setTimeout(() => {
      winOverlay.hidden = false;
      startCelebration();
    }, 550);
  }

  /* ---------- celebration (cascading cards on canvas) ---------- */

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function startCelebration() {
    stopCelebration();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    fxCanvas.width = Math.round(window.innerWidth * dpr);
    fxCanvas.height = Math.round(window.innerHeight * dpr);
    fxCanvas.hidden = false;
    const ctx = fxCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const origins = [];
    for (let f = 0; f < FOUNDATION_COUNT; f++) {
      origins.push(slotEls['foundation' + f].getBoundingClientRect());
    }
    const fw = Math.max(34, Math.min(64, L ? L.cardW : 60));
    const fh = fw * 1.42;
    const seq = [];
    for (let rank = 13; rank >= 1; rank--) {
      for (let f = 0; f < FOUNDATION_COUNT; f++) seq.push({ f, rank });
    }
    const sprites = [];
    let idx = 0;
    let lastSpawn = 0;
    const stopAt = performance.now() + 12000;
    const session = { stopped: false, raf: 0 };
    fx = session;

    const spawn = () => {
      const s = seq[idx % seq.length];
      idx++;
      const o = origins[s.f];
      sprites.push({
        x: o.left,
        y: o.top,
        vx: (Math.random() * 4.2 + 1.4) * (Math.random() < 0.5 ? -1 : 1),
        vy: -(Math.random() * 4.5 + 1),
        rank: s.rank,
        suit: SUITS[s.f],
      });
    };

    const drawSprite = (s) => {
      ctx.beginPath();
      roundRectPath(ctx, s.x, s.y, fw, fh, 6);
      ctx.fillStyle = '#fffdf7';
      ctx.fill();
      ctx.strokeStyle = 'rgba(32,35,31,0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = isRed(s) ? '#c84e4e' : '#20231f';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = '900 ' + Math.round(fw * 0.34) + 'px Inter, system-ui, sans-serif';
      ctx.fillText(rankLabel(s.rank), s.x + fw * 0.1, s.y + fh * 0.07);
      ctx.font = Math.round(fw * 0.42) + 'px Inter, system-ui, sans-serif';
      ctx.fillText(SUIT_SYMBOL[s.suit], s.x + fw * 0.1, s.y + fh * 0.42);
    };

    const frame = (t) => {
      if (session.stopped) return;
      if (t < stopAt && idx < seq.length && t - lastSpawn > 140) {
        spawn();
        lastSpawn = t;
      }
      const floor = window.innerHeight - 16;
      for (const s of sprites) {
        const px = s.x;
        const py = s.y;
        s.vy += 0.42;
        s.x += s.vx;
        s.y += s.vy;
        if (s.y > floor - fh) {
          s.y = floor - fh;
          s.vy = -Math.abs(s.vy) * 0.78;
          if (Math.abs(s.vy) < 1.1) s.vy = 0;
        }
        if (s.x !== px || s.y !== py) drawSprite(s);
      }
      if (t >= stopAt) {
        session.stopped = true;
        fxCanvas.hidden = true;
        return;
      }
      session.raf = requestAnimationFrame(frame);
    };
    session.raf = requestAnimationFrame(frame);
  }

  function stopCelebration() {
    if (fx) {
      fx.stopped = true;
      cancelAnimationFrame(fx.raf);
      fx = null;
    }
    fxCanvas.hidden = true;
  }

  /* ---------- new deal ---------- */

  function newDeal(opts) {
    const animate = !(opts && opts.animate === false);
    stopCelebration();
    winOverlay.hidden = true;
    clearSelection();
    history = [];
    game.drawMode = settings.drawMode;
    game.state = dealGame();
    game.moves = 0;
    game.started = false;
    game.won = false;
    timer.elapsedMs = 0;
    timer.since = null;
    updateTime();
    persistGame();
    if (animate) {
      animateDeal();
    } else {
      render({ instant: true });
    }
  }

  function animateDeal() {
    locked = true;
    updateButtons();
    const st = game.state;
    const stockX = L.colX(0);
    for (const id of Object.keys(cardEls)) {
      const el = cardEls[id];
      el.classList.add('no-anim', 'face-down');
      el.style.zIndex = '1';
      el.style.transform = T(stockX, L.topY);
    }
    void board.offsetWidth; // commit starting positions
    for (const id of Object.keys(cardEls)) cardEls[id].classList.remove('no-anim');

    const order = [];
    for (let r = 0; r < TABLEAU_COUNT; r++) {
      for (let p = r; p < TABLEAU_COUNT; p++) order.push([p, r]);
    }
    const stepMs = 30;
    order.forEach(([p, i], k) => {
      setTimeout(() => {
        const pile = st.tableau[p];
        const card = pile[i];
        const pos = tableauPos(pile, p, i);
        const el = cardEls[card.id];
        el.style.zIndex = String(i + 1);
        el.style.transform = T(pos.x, pos.y);
        if (card.faceUp) el.classList.remove('face-down');
      }, 60 + k * stepMs);
    });
    setTimeout(() => {
      locked = false;
      render();
    }, 60 + order.length * stepMs + 340);
  }

  newDealBtn.addEventListener('click', () => newDeal({ animate: true }));
  winNewDealBtn.addEventListener('click', () => newDeal({ animate: true }));

  drawToggleBtn.addEventListener('click', () => {
    settings.drawMode = settings.drawMode === 3 ? 1 : 3;
    saveJSON(KEY_SETTINGS, settings);
    updateDrawToggle();
  });

  /* ---------- timer + lifecycle ---------- */

  setInterval(() => {
    if (game.started) updateTime();
  }, 500);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseTimer();
      persistGame();
    } else if (game.started && !game.won) {
      timer.since = Date.now();
    }
  });

  window.addEventListener('beforeunload', persistGame);

  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      computeLayout();
      render({ instant: true });
    });
  });

  /* ---------- boot ---------- */

  buildCards();
  computeLayout();
  renderStats();

  const saved = loadSavedGame();
  if (saved) {
    game.state = saved.state;
    game.drawMode = saved.drawMode;
    game.moves = saved.moves;
    game.started = saved.started;
    game.won = saved.won;
    timer.elapsedMs = saved.elapsedMs;
    render({ instant: true });
    updateTime();
    if (game.won) {
      winOverlay.hidden = false;
      winStatsEl.innerHTML = 'Time <b>' + formatTime(timer.elapsedMs) + '</b> \u00b7 <b>' + game.moves + '</b> moves';
    } else if (game.started && document.visibilityState === 'visible') {
      timer.since = Date.now();
    }
  } else {
    newDeal({ animate: true });
  }
})();
