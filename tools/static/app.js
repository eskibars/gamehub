const STORAGE_KEY = "local-first-game-hub-tools-v1";

const SUITS = [
  { symbol: "♠", red: false },
  { symbol: "♥", red: true },
  { symbol: "♦", red: true },
  { symbol: "♣", red: false },
];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function freshDeck(includeJokers) {
  const cards = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) cards.push({ rank, suit: suit.symbol, red: suit.red });
  }
  if (includeJokers) {
    cards.push({ rank: "Joker", suit: "★", red: false }, { rank: "Joker", suit: "★", red: true });
  }
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function isCard(value) {
  return Boolean(value) && typeof value === "object" && typeof value.rank === "string" && typeof value.suit === "string";
}

const defaultState = {
  timerView: "digital",
  timerSeconds: 300,
  diceCount: 2,
  diceSides: 6,
  diceModifier: 0,
  history: [],
  drawCount: 3,
  includeJokers: false,
  cardHistory: [],
  coinTally: { heads: 0, tails: 0 },
};

const state = {
  ...defaultState,
  remainingSeconds: defaultState.timerSeconds,
  running: false,
  intervalId: null,
  startedAt: 0,
  endsAt: 0,
  dice: [],
  deck: freshDeck(defaultState.includeJokers),
  hand: [],
  lastCoin: null,
  coinFlipping: false,
};

const els = {
  timerDisplay: document.querySelector("#timerDisplay"),
  timeReadout: document.querySelector("#timeReadout"),
  timerStatus: document.querySelector("#timerStatus"),
  topSand: document.querySelector("#topSand"),
  bottomSand: document.querySelector("#bottomSand"),
  sandStream: document.querySelector("#sandStream"),
  digitalMode: document.querySelector("#digitalMode"),
  sandMode: document.querySelector("#sandMode"),
  minutesInput: document.querySelector("#minutesInput"),
  secondsInput: document.querySelector("#secondsInput"),
  timerForm: document.querySelector("#timerForm"),
  startPauseTimer: document.querySelector("#startPauseTimer"),
  resetTimer: document.querySelector("#resetTimer"),
  presetButtons: document.querySelectorAll(".preset-button:not(.joker-toggle)"),
  diceForm: document.querySelector("#diceForm"),
  diceCount: document.querySelector("#diceCount"),
  diceSides: document.querySelector("#diceSides"),
  diceModifier: document.querySelector("#diceModifier"),
  diceTotal: document.querySelector("#diceTotal"),
  diceTray: document.querySelector("#diceTray"),
  rollHistory: document.querySelector("#rollHistory"),
  clearHistory: document.querySelector("#clearHistory"),
  cardsForm: document.querySelector("#cardsForm"),
  drawCount: document.querySelector("#drawCount"),
  shuffleDeck: document.querySelector("#shuffleDeck"),
  jokersToggle: document.querySelector("#jokersToggle"),
  deckRemaining: document.querySelector("#deckRemaining"),
  deckNote: document.querySelector("#deckNote"),
  cardTray: document.querySelector("#cardTray"),
  cardHistory: document.querySelector("#cardHistory"),
  clearCardHistory: document.querySelector("#clearCardHistory"),
  coinDisplay: document.querySelector("#coinDisplay"),
  coin: document.querySelector("#coin"),
  coinFace: document.querySelector("#coinFace"),
  coinResult: document.querySelector("#coinResult"),
  coinTally: document.querySelector("#coinTally"),
  flipCoin: document.querySelector("#flipCoin"),
  resetCoin: document.querySelector("#resetCoin"),
};

function clamp(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      timerView: state.timerView,
      timerSeconds: state.timerSeconds,
      diceCount: state.diceCount,
      diceSides: state.diceSides,
      diceModifier: state.diceModifier,
      history: state.history,
      drawCount: state.drawCount,
      includeJokers: state.includeJokers,
      deck: state.deck,
      hand: state.hand,
      cardHistory: state.cardHistory,
      coinTally: state.coinTally,
      lastCoin: state.lastCoin,
    })
  );
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    state.timerView = saved.timerView === "sand" ? "sand" : "digital";
    state.timerSeconds = clamp(saved.timerSeconds, 1, 59999);
    state.remainingSeconds = state.timerSeconds;
    state.diceCount = clamp(saved.diceCount, 1, 30);
    state.diceSides = clamp(saved.diceSides, 2, 1000);
    state.diceModifier = clamp(saved.diceModifier, -999, 999);
    state.history = Array.isArray(saved.history) ? saved.history.slice(0, 10) : [];
    state.drawCount = clamp(saved.drawCount, 1, 10);
    state.includeJokers = saved.includeJokers === true;
    state.deck = Array.isArray(saved.deck) && saved.deck.every(isCard)
      ? saved.deck
      : freshDeck(state.includeJokers);
    state.hand = Array.isArray(saved.hand) && saved.hand.every(isCard) ? saved.hand.slice(0, 10) : [];
    state.cardHistory = Array.isArray(saved.cardHistory) ? saved.cardHistory.slice(0, 10) : [];
    if (saved.coinTally && typeof saved.coinTally === "object") {
      state.coinTally = {
        heads: clamp(saved.coinTally.heads, 0, 1e9),
        tails: clamp(saved.coinTally.tails, 0, 1e9),
      };
    }
    state.lastCoin = saved.lastCoin === "Heads" || saved.lastCoin === "Tails" ? saved.lastCoin : null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function setTimer(seconds) {
  state.timerSeconds = clamp(seconds, 1, 59999);
  state.remainingSeconds = state.timerSeconds;
  state.running = false;
  clearInterval(state.intervalId);
  state.intervalId = null;
  saveState();
  renderTimer();
}

function timerProgress() {
  if (state.timerSeconds <= 0) return 1;
  return 1 - state.remainingSeconds / state.timerSeconds;
}

function renderTimer() {
  els.timeReadout.textContent = formatTime(state.remainingSeconds);
  els.timerStatus.textContent = state.running ? "Running" : state.remainingSeconds === 0 ? "Done" : "Ready";
  els.startPauseTimer.textContent = state.running ? "Pause" : state.remainingSeconds === 0 ? "Restart" : "Start";
  els.timerDisplay.classList.toggle("sand-view", state.timerView === "sand");
  els.timerDisplay.classList.toggle("digital-view", state.timerView === "digital");
  els.digitalMode.classList.toggle("is-active", state.timerView === "digital");
  els.sandMode.classList.toggle("is-active", state.timerView === "sand");

  const progress = timerProgress();
  // Sand surfaces in the SVG hourglass (viewBox 0 0 200 300): the top bulb's
  // surface descends from y=40 to the waist at y=148, the bottom bulb's rises
  // from y=260 to just below the waist.
  const topSurface = 40 + (148 - 40) * progress;
  els.topSand.setAttribute("y", topSurface.toFixed(1));
  els.topSand.setAttribute("height", Math.max(0, 148 - topSurface).toFixed(1));
  const bottomSurface = 260 - (260 - 152) * progress;
  els.bottomSand.setAttribute("y", bottomSurface.toFixed(1));
  els.bottomSand.setAttribute("height", Math.max(0, 260 - bottomSurface).toFixed(1));
  const streamHeight = Math.max(0, bottomSurface - 148);
  els.sandStream.setAttribute("height", streamHeight.toFixed(1));
  els.sandStream.style.opacity = state.running && state.remainingSeconds > 0 ? "1" : "0";

  const minutes = Math.floor(state.timerSeconds / 60);
  const seconds = state.timerSeconds % 60;
  els.minutesInput.value = minutes;
  els.secondsInput.value = seconds;
  els.presetButtons.forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.seconds) === state.timerSeconds);
  });
}

function tickTimer() {
  state.remainingSeconds = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
  if (state.remainingSeconds <= 0) {
    state.running = false;
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  renderTimer();
}

function startTimer() {
  if (state.remainingSeconds === 0) state.remainingSeconds = state.timerSeconds;
  state.running = true;
  state.endsAt = Date.now() + state.remainingSeconds * 1000;
  clearInterval(state.intervalId);
  state.intervalId = window.setInterval(tickTimer, 250);
  tickTimer();
}

function pauseTimer() {
  state.running = false;
  clearInterval(state.intervalId);
  state.intervalId = null;
  renderTimer();
}

function setTimerView(view) {
  state.timerView = view === "sand" ? "sand" : "digital";
  saveState();
  renderTimer();
}

function rollDice() {
  state.diceCount = clamp(els.diceCount.value, 1, 30);
  state.diceSides = clamp(els.diceSides.value, 2, 1000);
  state.diceModifier = clamp(els.diceModifier.value, -999, 999);
  state.dice = Array.from({ length: state.diceCount }, () => Math.floor(Math.random() * state.diceSides) + 1);
  const diceSum = state.dice.reduce((sum, value) => sum + value, 0);
  const total = diceSum + state.diceModifier;
  const modifierText = state.diceModifier === 0 ? "" : ` ${state.diceModifier > 0 ? "+" : "-"} ${Math.abs(state.diceModifier)}`;
  state.history.unshift({
    notation: `${state.diceCount}d${state.diceSides}${modifierText}`,
    dice: state.dice.join(", "),
    total,
  });
  state.history = state.history.slice(0, 10);
  saveState();
  renderDice();
}

function renderDice() {
  els.diceCount.value = state.diceCount;
  els.diceSides.value = state.diceSides;
  els.diceModifier.value = state.diceModifier;
  const total = state.dice.reduce((sum, value) => sum + value, 0) + state.diceModifier;
  els.diceTotal.textContent = state.dice.length ? total : "0";
  els.diceTray.innerHTML = "";
  const diceToShow = state.dice.length ? state.dice : Array.from({ length: state.diceCount }, () => "-");
  diceToShow.forEach((value) => {
    const die = document.createElement("div");
    die.className = "die";
    die.textContent = value;
    els.diceTray.append(die);
  });

  els.rollHistory.innerHTML = "";
  state.history.forEach((roll) => {
    const item = document.createElement("li");
    item.innerHTML = `<span><strong>${roll.total}</strong> ${roll.notation}</span><span>${roll.dice}</span>`;
    els.rollHistory.append(item);
  });
}

function cardLabel(card) {
  return `${card.rank}${card.suit}`;
}

function cardEl(card, faceDown) {
  const el = document.createElement("div");
  el.className = "playing-card";
  if (faceDown) {
    el.classList.add("is-back");
    return el;
  }
  if (card.red) el.classList.add("is-red");
  const isJoker = card.rank === "Joker";
  const corner = document.createElement("span");
  corner.className = "corner";
  corner.textContent = isJoker ? "J★" : `${card.rank}${card.suit}`;
  const cornerBottom = corner.cloneNode(true);
  cornerBottom.classList.add("bottom");
  const pip = document.createElement("span");
  pip.className = "pip";
  pip.textContent = isJoker ? "★" : card.suit;
  el.append(corner, pip, cornerBottom);
  return el;
}

function renderCards() {
  els.drawCount.value = state.drawCount;
  els.jokersToggle.textContent = `Jokers: ${state.includeJokers ? "on" : "off"}`;
  els.jokersToggle.classList.toggle("is-active", state.includeJokers);
  els.jokersToggle.setAttribute("aria-pressed", String(state.includeJokers));

  const deckEmpty = state.deck.length === 0;
  els.deckRemaining.textContent = state.deck.length;
  els.deckNote.textContent = deckEmpty
    ? "Deck empty — shuffle for a fresh deck"
    : state.includeJokers ? "54-card deck with jokers" : "Standard 52-card deck";
  els.shuffleDeck.disabled = false;
  document.querySelector("#cardsForm .primary-button").disabled = deckEmpty;

  els.cardTray.innerHTML = "";
  const cardsToShow = state.hand.length
    ? state.hand.map((card) => cardEl(card, false))
    : Array.from({ length: state.drawCount }, () => cardEl(null, true));
  cardsToShow.forEach((el) => els.cardTray.append(el));

  els.cardHistory.innerHTML = "";
  state.cardHistory.forEach((draw) => {
    const item = document.createElement("li");
    item.innerHTML = `<span><strong>${draw.count} drawn</strong> ${draw.cards}</span><span>${draw.left} left</span>`;
    els.cardHistory.append(item);
  });
}

function drawCards() {
  const count = clamp(els.drawCount.value, 1, 10);
  state.drawCount = count;
  if (!state.deck.length) {
    renderCards();
    return;
  }
  state.hand = state.deck.splice(-count, count);
  state.cardHistory.unshift({
    count: state.hand.length,
    cards: state.hand.map(cardLabel).join("  "),
    left: state.deck.length,
  });
  state.cardHistory = state.cardHistory.slice(0, 10);
  saveState();
  renderCards();
}

function shuffleDeck() {
  state.deck = freshDeck(state.includeJokers);
  state.hand = [];
  saveState();
  renderCards();
}

function setIncludeJokers(includeJokers) {
  state.includeJokers = includeJokers === true;
  state.deck = freshDeck(state.includeJokers);
  state.hand = [];
  saveState();
  renderCards();
}

function renderCoin() {
  if (state.lastCoin) {
    els.coinFace.textContent = state.lastCoin === "Heads" ? "H" : "T";
    els.coinResult.textContent = `${state.lastCoin}!`;
  } else {
    els.coinFace.textContent = "?";
    els.coinResult.textContent = "Ready to flip";
  }
  els.coinTally.textContent = `Heads ${state.coinTally.heads} · Tails ${state.coinTally.tails}`;
}

function flipCoin() {
  if (state.coinFlipping) return;
  state.coinFlipping = true;
  const result = Math.random() < 0.5 ? "Heads" : "Tails";
  els.coin.classList.remove("is-flipping");
  void els.coin.offsetWidth;
  els.coin.classList.add("is-flipping");
  window.setTimeout(() => {
    state.lastCoin = result;
    state.coinTally[result.toLowerCase()] += 1;
    state.coinFlipping = false;
    saveState();
    renderCoin();
  }, 450);
}

function bindEvents() {
  els.digitalMode.addEventListener("click", () => setTimerView("digital"));
  els.sandMode.addEventListener("click", () => setTimerView("sand"));

  els.presetButtons.forEach((button) => {
    button.addEventListener("click", () => setTimer(button.dataset.seconds));
  });

  els.timerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const minutes = clamp(els.minutesInput.value, 0, 999);
    const seconds = clamp(els.secondsInput.value, 0, 59);
    setTimer(minutes * 60 + seconds || 1);
  });

  els.startPauseTimer.addEventListener("click", () => {
    if (state.running) pauseTimer();
    else startTimer();
  });

  els.resetTimer.addEventListener("click", () => setTimer(state.timerSeconds));

  els.diceForm.addEventListener("submit", (event) => {
    event.preventDefault();
    rollDice();
  });

  els.clearHistory.addEventListener("click", () => {
    state.history = [];
    saveState();
    renderDice();
  });

  els.cardsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    drawCards();
  });

  els.shuffleDeck.addEventListener("click", shuffleDeck);

  els.jokersToggle.addEventListener("click", () => setIncludeJokers(!state.includeJokers));

  els.clearCardHistory.addEventListener("click", () => {
    state.cardHistory = [];
    saveState();
    renderCards();
  });

  els.flipCoin.addEventListener("click", flipCoin);

  els.resetCoin.addEventListener("click", () => {
    state.coinTally = { heads: 0, tails: 0 };
    state.lastCoin = null;
    saveState();
    renderCoin();
  });
}

loadState();
bindEvents();
renderTimer();
renderDice();
renderCards();
renderCoin();
