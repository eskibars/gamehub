const STORAGE_KEY = "local-first-game-hub-tools-v1";

const defaultState = {
  timerView: "digital",
  timerSeconds: 300,
  diceCount: 2,
  diceSides: 6,
  diceModifier: 0,
  history: [],
};

const state = {
  ...defaultState,
  remainingSeconds: defaultState.timerSeconds,
  running: false,
  intervalId: null,
  startedAt: 0,
  endsAt: 0,
  dice: [],
};

const els = {
  timerDisplay: document.querySelector("#timerDisplay"),
  timeReadout: document.querySelector("#timeReadout"),
  timerStatus: document.querySelector("#timerStatus"),
  topSand: document.querySelector("#topSand"),
  bottomSand: document.querySelector("#bottomSand"),
  digitalMode: document.querySelector("#digitalMode"),
  sandMode: document.querySelector("#sandMode"),
  minutesInput: document.querySelector("#minutesInput"),
  secondsInput: document.querySelector("#secondsInput"),
  timerForm: document.querySelector("#timerForm"),
  startPauseTimer: document.querySelector("#startPauseTimer"),
  resetTimer: document.querySelector("#resetTimer"),
  presetButtons: document.querySelectorAll(".preset-button"),
  diceForm: document.querySelector("#diceForm"),
  diceCount: document.querySelector("#diceCount"),
  diceSides: document.querySelector("#diceSides"),
  diceModifier: document.querySelector("#diceModifier"),
  diceTotal: document.querySelector("#diceTotal"),
  diceTray: document.querySelector("#diceTray"),
  rollHistory: document.querySelector("#rollHistory"),
  clearHistory: document.querySelector("#clearHistory"),
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
  els.topSand.style.setProperty("--sand-level", `${Math.max(0, 100 - progress * 100)}%`);
  els.bottomSand.style.setProperty("--sand-level", `${Math.min(100, progress * 100)}%`);

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
}

loadState();
bindEvents();
renderTimer();
renderDice();
