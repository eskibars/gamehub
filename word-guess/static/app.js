const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const DAILY_KEY = "gamehub-wordguess-daily";
const PRACTICE_KEY = "gamehub-wordguess-practice";
const STATS_KEY = "gamehub-wordguess-stats";
const SETTINGS_KEY = "gamehub-wordguess-settings";

const VALID = new Set([...WORD_GUESS_ANSWERS, ...WORD_GUESS_EXTRA]);
const ROWS = [...document.querySelectorAll("[data-row]")];
const els = {
  board: document.querySelector("#board"),
  message: document.querySelector("#message"),
  keyboard: document.querySelector("#keyboard"),
  helpOverlay: document.querySelector("#helpOverlay"),
  statsOverlay: document.querySelector("#statsOverlay"),
  helpButton: document.querySelector("#helpButton"),
  statsButton: document.querySelector("#statsButton"),
  hardMode: document.querySelector("#hardMode"),
  shareButton: document.querySelector("#shareButton"),
  statPlayed: document.querySelector("#statPlayed"),
  statWin: document.querySelector("#statWin"),
  statStreak: document.querySelector("#statStreak"),
  statMax: document.querySelector("#statMax"),
  dist: document.querySelector("#dist"),
};

const state = {
  mode: "daily",
  answer: "",
  dayKey: "",
  guesses: [],
  current: "",
  status: "playing", // playing | won | lost
  revealed: false,
  lastWonDaily: "",
};

function dayNumber(date = new Date()) {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
}

function dailyAnswer() {
  return WORD_GUESS_ANSWERS[dayNumber() % WORD_GUESS_ANSWERS.length];
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable; the round just lives in memory.
  }
}

function stateKey() {
  return state.mode === "daily" ? DAILY_KEY : PRACTICE_KEY;
}

function persistState() {
  if (state.mode === "daily" && state.dayKey !== new Date().toISOString().slice(0, 10)) return;
  saveJson(stateKey(), {
    dayKey: state.dayKey,
    answer: state.answer,
    guesses: state.guesses,
    status: state.status,
  });
}

function restoreState() {
  const saved = loadJson(stateKey(), null);
  if (!saved || !saved.answer) return false;
  if (state.mode === "daily" && saved.dayKey !== new Date().toISOString().slice(0, 10)) return false;
  state.dayKey = saved.dayKey || "";
  state.answer = saved.answer;
  state.guesses = Array.isArray(saved.guesses) ? saved.guesses : [];
  state.status = saved.status || "playing";
  return VALID.has(state.answer) && state.guesses.every((g) => typeof g === "string" && g.length === WORD_LENGTH);
}

function startRound(fresh) {
  els.message.textContent = "";
  els.message.classList.remove("win");
  state.current = "";
  state.revealed = false;
  if (!fresh && restoreState()) {
    render(true);
    if (state.status !== "playing") finishUi(true);
    return;
  }
  if (state.mode === "daily") {
    state.dayKey = new Date().toISOString().slice(0, 10);
    state.answer = dailyAnswer();
  } else {
    state.dayKey = "";
    let next;
    do {
      next = WORD_GUESS_ANSWERS[Math.floor(Math.random() * WORD_GUESS_ANSWERS.length)];
    } while (next === state.answer && WORD_GUESS_ANSWERS.length > 1);
    state.answer = next;
  }
  state.guesses = [];
  state.status = "playing";
  render(true);
  persistState();
}

function evaluate(guess, answer) {
  const result = Array(WORD_LENGTH).fill("absent");
  const remaining = {};
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (guess[i] === answer[i]) result[i] = "correct";
    else remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (result[i] === "correct") continue;
    if (remaining[guess[i]] > 0) {
      result[i] = "present";
      remaining[guess[i]] -= 1;
    }
  }
  return result;
}

function hardModeViolation(guess) {
  const prior = state.guesses[state.guesses.length - 1];
  if (!prior) return null;
  const marks = evaluate(prior, state.answer);
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (marks[i] === "correct" && guess[i] !== prior[i]) {
      return `Letter ${i + 1} must be ${prior[i]}`;
    }
  }
  const priorLetters = {};
  marks.forEach((mark, i) => {
    if (mark !== "absent") priorLetters[prior[i]] = true;
  });
  for (const letter of Object.keys(priorLetters)) {
    if (!guess.includes(letter)) return `Guess must contain ${letter}`;
  }
  return null;
}

function ordinal(index) {
  return ["st", "nd", "rd", "th", "th"][index];
}

function submitGuess() {
  if (state.status !== "playing" || state.revealed) return;
  const guess = state.current;
  if (guess.length < WORD_LENGTH) return showTemporary("Not enough letters");
  const violation = els.hardMode.checked ? hardModeViolation(guess) : null;
  if (violation) return showTemporary(violation);
  state.revealed = true;
  state.guesses.push(guess);
  state.current = "";
  revealRow(state.guesses.length - 1, guess, () => {
    state.revealed = false;
    if (guess === state.answer) {
      state.status = "won";
      persistState();
      recordResult(true);
      finishUi(false);
    } else if (state.guesses.length >= MAX_GUESSES) {
      state.status = "lost";
      persistState();
      recordResult(false);
      finishUi(false);
    } else {
      persistState();
    }
  });
  renderKeyboard();
}

function revealRow(rowIndex, guess, done) {
  const cells = [...ROWS[rowIndex].children];
  const marks = evaluate(guess, state.answer);
  cells.forEach((cell, i) => {
    setTimeout(() => {
      cell.classList.remove("filled");
      cell.classList.add("reveal", marks[i]);
      void cell.offsetWidth;
      if (i === WORD_LENGTH - 1) setTimeout(done, 300);
    }, i * 260);
  });
}

function recordResult(won) {
  const stats = loadJson(STATS_KEY, { played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0] });
  stats.played += 1;
  if (won) {
    stats.wins += 1;
    stats.streak += 1;
    stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
    stats.dist[state.guesses.length - 1] += 1;
  } else {
    stats.streak = 0;
  }
  saveJson(STATS_KEY, stats);
  window.GameHubProfile?.award(
    "word-guess",
    won ? 8 + (MAX_GUESSES - state.guesses.length) : 1,
    won ? `Won in ${state.guesses.length}` : "Better luck tomorrow",
    stats.wins
  );
}

function finishUi(silent) {
  const won = state.status === "won";
  els.message.textContent = won
    ? ["Genius!", "Magnificent!", "Impressive!", "Splendid!", "Great!", "Phew!"][state.guesses.length - 1]
    : `The word was ${state.answer}`;
  els.message.classList.toggle("win", won);
  if (!silent) setTimeout(() => openStats(true), 900);
}

function showTemporary(text) {
  els.message.textContent = text;
  ROWS[state.guesses.length]?.classList.add("shake");
  setTimeout(() => {
    if (state.status === "playing") els.message.textContent = "";
    ROWS.forEach((row) => row.classList.remove("shake"));
  }, 900);
}

function render(instant) {
  for (let r = 0; r < MAX_GUESSES; r += 1) {
    const row = ROWS[r];
    row.innerHTML = "";
    const submitted = state.guesses[r];
    const letters = submitted || (r === state.guesses.length ? state.current : "");
    for (let c = 0; c < WORD_LENGTH; c += 1) {
      const tile = document.createElement("div");
      tile.className = "tile";
      if (letters[c]) {
        tile.textContent = letters[c];
        if (submitted) {
          const marks = evaluate(submitted, state.answer);
          tile.classList.add(marks[c]);
        } else {
          tile.classList.add("filled");
        }
      }
      row.append(tile);
    }
  }
  renderKeyboard();
}

function letterStates() {
  const best = {};
  const rank = { absent: 1, present: 2, correct: 3 };
  state.guesses.forEach((guess) => {
    evaluate(guess, state.answer).forEach((mark, i) => {
      const letter = guess[i];
      if (!best[letter] || rank[mark] > rank[best[letter]]) best[letter] = mark;
    });
  });
  return best;
}

function renderKeyboard() {
  const states = letterStates();
  els.keyboard.innerHTML = "";
  ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].forEach((rowLetters, index) => {
    const row = document.createElement("div");
    row.className = "key-row";
    if (index === 2) row.append(keyEl("Enter", "wide"));
    for (const letter of rowLetters) {
      const key = keyEl(letter);
      if (states[letter]) key.classList.add(states[letter]);
      row.append(key);
    }
    if (index === 2) row.append(keyEl("Back", "wide"));
    els.keyboard.append(row);
  });
}

function keyEl(label, extra = "") {
  const key = document.createElement("button");
  key.type = "button";
  key.className = `key ${extra}`.trim();
  key.textContent = label === "Back" ? "⌫" : label;
  key.addEventListener("click", () => handleKey(label));
  return key;
}

function handleKey(key) {
  if (state.status !== "playing" || state.revealed) return;
  if (key === "Enter") return submitGuess();
  if (key === "Back") {
    state.current = state.current.slice(0, -1);
  } else if (/^[A-Z]$/.test(key) && state.current.length < WORD_LENGTH) {
    state.current += key;
  } else {
    return;
  }
  render(false);
}

function renderStats(shared) {
  const stats = loadJson(STATS_KEY, { played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0] });
  els.statPlayed.textContent = stats.played;
  els.statWin.textContent = `${stats.played ? Math.round((stats.wins / stats.played) * 100) : 0}%`;
  els.statStreak.textContent = stats.streak;
  els.statMax.textContent = stats.maxStreak;
  const max = Math.max(...stats.dist, 1);
  els.dist.innerHTML = "";
  stats.dist.forEach((count, i) => {
    const rowEl = document.createElement("div");
    rowEl.className = "dist-row";
    const label = document.createElement("span");
    label.textContent = i + 1;
    const bar = document.createElement("span");
    bar.className = "dist-bar" + (shared && won() && state.guesses.length - 1 === i ? " hit" : "");
    bar.textContent = count;
    if (count > 0) bar.style.width = `${Math.max(18, (count / max) * 88)}%`;
    rowEl.append(label, bar);
    els.dist.append(rowEl);
  });
  els.shareButton.hidden = !shared;
}

function won() {
  return state.status === "won";
}

function shareResult() {
  const marks = state.guesses.map((guess) =>
    evaluate(guess, state.answer)
      .map((mark) => ({ correct: "🟩", present: "🟨", absent: "⬛" })[mark])
      .join("")
  );
  const label = state.mode === "daily"
    ? `Word Guess Daily ${state.dayKey}`
    : "Word Guess Practice";
  const scoreLine = won() ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const text = `${label} ${scoreLine}\n${marks.join("\n")}`;
  navigator.clipboard?.writeText(text).then(
    () => showCopied(),
    () => window.alert(text)
  );
}

function showCopied() {
  els.shareButton.textContent = "Copied!";
  setTimeout(() => {
    els.shareButton.textContent = "Share result";
  }, 1200);
}

function openStats(shared) {
  renderStats(shared);
  els.statsOverlay.hidden = false;
}

function bindEvents() {
  document.addEventListener("keydown", (event) => {
    if (!els.helpOverlay.hidden || !els.statsOverlay.hidden) {
      if (event.key === "Escape") {
        els.helpOverlay.hidden = true;
        els.statsOverlay.hidden = true;
      }
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Enter") handleKey("Enter");
    else if (event.key === "Backspace") handleKey("Back");
    else if (/^[a-zA-Z]$/.test(event.key)) handleKey(event.key.toUpperCase());
  });

  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.target.closest(".overlay").hidden = true;
    });
  });
  els.helpButton.addEventListener("click", () => {
    els.helpOverlay.hidden = false;
  });
  els.statsButton.addEventListener("click", () => openStats(false));
  els.shareButton.addEventListener("click", shareResult);
  els.hardMode.addEventListener("change", () => {
    saveJson(SETTINGS_KEY, { hard: els.hardMode.checked });
  });

  document.querySelectorAll('input[name="mode"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      state.mode = input.value;
      startRound(false);
    });
  });
}

const settings = loadJson(SETTINGS_KEY, { hard: false });
els.hardMode.checked = Boolean(settings.hard);
startRound(false);
bindEvents();
