const DEFAULT_COLORS = [
  "#d94f4f",
  "#2f80ed",
  "#27ae60",
  "#f2c94c",
  "#9b51e0",
  "#f2994a",
  "#56ccf2",
  "#eb5757",
  "#6fcf97",
  "#bb6bd9",
];
const LOCAL_SECRET_KEY = "bulls-and-cows-maker-secrets-v1";
const SOLO_STORAGE_KEY = "bulls-and-cows-solo-v1";
// Solo duels always play over the first N fixed colors so the robot's
// candidate space stays sane at higher peg counts.
const SOLO_COLOR_COUNT = 8;

const state = {
  colors: DEFAULT_COLORS.slice(0, 6),
  selectedColor: DEFAULT_COLORS[0],
  setupSecret: [],
  currentGuess: [],
  game: null,
  eventSource: null,
  makerSecrets: {},
  shareToken: "",
  entryMode: "choice",
  solo: null,
  soloTimer: null,
  soloStats: { wins: 0, losses: 0, ties: 0 },
};

const els = {
  startView: document.querySelector("#startView"),
  choicePanel: document.querySelector("#choicePanel"),
  collapsedActions: document.querySelector("#collapsedActions"),
  playView: document.querySelector("#playView"),
  createForm: document.querySelector("#createForm"),
  joinForm: document.querySelector("#joinForm"),
  soloForm: document.querySelector("#soloForm"),
  showJoin: document.querySelector("#showJoin"),
  showCreate: document.querySelector("#showCreate"),
  showSolo: document.querySelector("#showSolo"),
  newGameButton: document.querySelector("#newGameButton"),
  joinAnotherButton: document.querySelector("#joinAnotherButton"),
  soloDiffRow: document.querySelector("#soloDiffRow"),
  soloPegCount: document.querySelector("#soloPegCount"),
  soloMaxRounds: document.querySelector("#soloMaxRounds"),
  soloPalette: document.querySelector("#soloPalette"),
  soloSlots: document.querySelector("#soloSlots"),
  soloRandomize: document.querySelector("#soloRandomize"),
  addColor: document.querySelector("#addColor"),
  colorEditor: document.querySelector("#colorEditor"),
  secretPalette: document.querySelector("#secretPalette"),
  secretSlots: document.querySelector("#secretSlots"),
  randomizeSecret: document.querySelector("#randomizeSecret"),
  pegCount: document.querySelector("#pegCount"),
  maxRounds: document.querySelector("#maxRounds"),
  joinCode: document.querySelector("#joinCode"),
  connectionStatus: document.querySelector("#connectionStatus"),
  invitePanel: document.querySelector("#invitePanel"),
  shareCode: document.querySelector("#shareCode"),
  copyShare: document.querySelector("#copyShare"),
  factPegs: document.querySelector("#factPegs"),
  factRounds: document.querySelector("#factRounds"),
  factStatus: document.querySelector("#factStatus"),
  makerSecret: document.querySelector("#makerSecret"),
  secretPreview: document.querySelector("#secretPreview"),
  gameMessage: document.querySelector("#gameMessage"),
  guessBoard: document.querySelector("#guessBoard"),
  guessPanel: document.querySelector("#guessPanel"),
  guessPalette: document.querySelector("#guessPalette"),
  guessSlots: document.querySelector("#guessSlots"),
  submitGuess: document.querySelector("#submitGuess"),
  robotPanel: document.querySelector("#robotPanel"),
  robotBoard: document.querySelector("#robotBoard"),
  robotMessage: document.querySelector("#robotMessage"),
};

let entryControls = null;

function normalizeHex(color) {
  return color.toLowerCase();
}

function loadMakerSecrets() {
  try {
    state.makerSecrets = JSON.parse(localStorage.getItem(LOCAL_SECRET_KEY)) || {};
  } catch {
    localStorage.removeItem(LOCAL_SECRET_KEY);
  }
}

function saveMakerSecret(code, secret) {
  state.makerSecrets[code] = secret;
  localStorage.setItem(LOCAL_SECRET_KEY, JSON.stringify(state.makerSecrets));
}

// ----- Solo duel vs the robot -----
//
// The robot hides a code while you build one; you alternate guesses and the
// first side to crack the rival code wins. Codes are represented internally
// as arrays of palette indices to keep the solver allocation-free.

function loadSoloStats() {
  try {
    const saved = JSON.parse(localStorage.getItem(SOLO_STORAGE_KEY) || "{}");
    state.soloStats = {
      wins: saved.wins || 0,
      losses: saved.losses || 0,
      ties: saved.ties || 0,
    };
  } catch {
    // Fresh install.
  }
}

function persistSoloStats() {
  try {
    localStorage.setItem(SOLO_STORAGE_KEY, JSON.stringify(state.soloStats));
  } catch {
    // Storage unavailable.
  }
}

function feedbackScore(secret, guess) {
  let exact = 0;
  const secretCounts = new Map();
  const guessCounts = new Map();
  for (let i = 0; i < secret.length; i += 1) {
    if (secret[i] === guess[i]) {
      exact += 1;
    } else {
      secretCounts.set(secret[i], (secretCounts.get(secret[i]) || 0) + 1);
      guessCounts.set(guess[i], (guessCounts.get(guess[i]) || 0) + 1);
    }
  }
  let misplaced = 0;
  for (const [color, count] of guessCounts) {
    misplaced += Math.min(count, secretCounts.get(color) || 0);
  }
  return { exact, misplaced };
}

function soloPalette() {
  return DEFAULT_COLORS.slice(0, SOLO_COLOR_COUNT);
}

function soloDifficulty() {
  const checked = els.soloDiffRow.querySelector("input[name=soloDiff]:checked");
  return checked ? checked.value : "casual";
}

function randomSoloCode(pegs, paletteSize) {
  return Array.from({ length: pegs }, () => Math.floor(Math.random() * paletteSize));
}

// The robot brain. It keeps every code still consistent with the answers
// it has seen, then picks its next guess by tier: Casual plays any random
// code, Sharp never repeats refuted information, and Oracle picks the
// consistent code whose worst-case feedback partitions the pool smallest
// (Knuth minimax, sampled once the full code space grows past ~40k).
const SOLO_ROBOT = (() => {
  function fastFeedback(secret, guess, pegs, counts) {
    let exact = 0;
    counts.fill(0);
    for (let i = 0; i < pegs; i += 1) {
      if (secret[i] === guess[i]) {
        exact += 1;
      } else {
        counts[secret[i]] -= 1;
        counts[guess[i]] += 1;
      }
    }
    let misplaced = 0;
    for (let c = 0; c < counts.length; c += 1) {
      if (counts[c] > 0) misplaced += counts[c];
    }
    return exact * 16 + misplaced;
  }

  function scoreGuess(guess, pool, pegs, paletteSize) {
    const counts = new Int8Array(paletteSize);
    const buckets = new Map();
    for (const candidate of pool) {
      const key = fastFeedback(candidate, guess, pegs, counts);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    let worst = 0;
    for (const size of buckets.values()) worst = Math.max(worst, size);
    return worst;
  }

  function chooseGuess(robot, roundNumber) {
    const pegs = robot.pegs;
    const paletteSize = robot.paletteSize;
    const pool = robot.candidates;
    if (robot.difficulty === "casual") {
      return randomSoloCode(pegs, paletteSize);
    }
    if (robot.difficulty === "sharp") {
      return pool[Math.floor(Math.random() * pool.length)].slice();
    }
    // Oracle tier: fixed strong opener, then minimax over the pool.
    if (roundNumber <= 1) {
      const opener = [];
      for (let p = 0; p < pegs; p += 1) opener.push(Math.floor(p / 2) % paletteSize);
      return opener;
    }
    if (pool.length <= 4096) {
      let best = null;
      let bestScore = Infinity;
      for (const guess of pool) {
        const worst = scoreGuess(guess, pool, pegs, paletteSize);
        if (worst < bestScore) {
          bestScore = worst;
          best = guess;
        }
      }
      return best.slice();
    }
    // Sampled minimax for big spaces: score a spread of candidate guesses
    // against the live pool and play the safest.
    const sampleCount = Math.min(pool.length, 220);
    const stride = Math.max(1, Math.floor(pool.length / sampleCount));
    let best = pool[0].slice();
    let bestScore = Infinity;
    for (let i = 0; i < pool.length; i += stride) {
      const worst = scoreGuess(pool[i], pool, pegs, paletteSize);
      if (worst < bestScore) {
        bestScore = worst;
        best = pool[i].slice();
      }
    }
    return best;
  }

  return { chooseGuess };
})();

function startSoloDuel(event) {
  event.preventDefault();
  const pegs = Math.min(Math.max(Number(els.soloPegCount.value) || 4, 3), 6);
  const rounds = Math.min(Math.max(Number(els.soloMaxRounds.value) || 10, 5), 16);
  els.soloPegCount.value = pegs;
  els.soloMaxRounds.value = rounds;
  const paletteSize = SOLO_COLOR_COUNT;
  const poolSize = Math.pow(paletteSize, pegs);
  const robotSecret = randomSoloCode(pegs, paletteSize);
  state.solo = {
    difficulty: soloDifficulty(),
    pegs,
    maxRounds: rounds,
    paletteSize,
    yourCode: randomSoloCode(pegs, paletteSize),
    yourGuesses: [],
    robotGuesses: [],
    robotSecret,
    robot: {
      pegs,
      paletteSize,
      difficulty: soloDifficulty(),
      candidates: [],
    },
    round: 1,
    status: "active",
    thinking: false,
  };
  // Enumerate the robot's initial candidate pool (all paletteSize^pegs codes).
  const codes = [];
  const code = new Array(pegs).fill(0);
  for (let i = 0; i < poolSize; i += 1) {
    codes.push(code.slice());
    for (let p = pegs - 1; p >= 0; p -= 1) {
      code[p] += 1;
      if (code[p] < paletteSize) break;
      code[p] = 0;
    }
  }
  state.solo.robot.candidates = codes;
  state.currentGuess = new Array(pegs).fill(0);
  state.selectedColor = DEFAULT_COLORS[0];
  state.entryMode = "solo";
  collapseStartControls();
  els.playView.hidden = false;
  els.connectionStatus.textContent = "Offline duel";
  renderGame();
}

function soloColorFor(index) {
  return soloPalette()[index];
}

function renderSoloPalette() {
  const palette = soloPalette();
  els.soloPalette.innerHTML = "";
  palette.forEach((color) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch";
    swatch.style.setProperty("--swatch-color", color);
    swatch.classList.toggle("is-selected", color === state.selectedColor);
    swatch.ariaLabel = `Select ${color}`;
    swatch.addEventListener("click", () => {
      state.selectedColor = color;
      renderSoloSetup();
    });
    els.soloPalette.append(swatch);
  });

  const pegs = Math.min(Math.max(Number(els.soloPegCount.value) || 4, 3), 6);
  if (!Array.isArray(state.soloDraft) || state.soloDraft.length !== pegs) {
    state.soloDraft = new Array(pegs).fill(0);
  }
  els.soloSlots.innerHTML = "";
  state.soloDraft.forEach((colorIndex, index) => {
    const slot = makePeg(soloColorFor(colorIndex), "slot");
    slot.title = `Code peg ${index + 1}`;
    slot.addEventListener("click", () => {
      state.soloDraft[index] = soloPalette().indexOf(state.selectedColor);
      if (state.soloDraft[index] < 0) state.soloDraft[index] = 0;
      renderSoloSetup();
    });
    els.soloSlots.append(slot);
  });
}

function renderSoloSetup() {
  renderSoloPalette();
}

function renderSoloBoard() {
  const solo = state.solo;
  els.guessBoard.innerHTML = "";
  els.robotBoard.innerHTML = "";

  const buildBoard = (container, guesses, codeLength) => {
    for (let round = 1; round <= solo.maxRounds; round += 1) {
      const row = document.createElement("article");
      row.className = "round-row";
      const number = document.createElement("div");
      number.className = "round-number";
      number.textContent = String(round);
      const pegs = document.createElement("div");
      pegs.className = "round-pegs";
      const entry = guesses.find((guess) => guess.round === round);
      const colors = entry
        ? entry.code.map(soloColorFor)
        : Array(codeLength).fill("");
      colors.forEach((color) => pegs.append(makePeg(color)));
      const feedback = document.createElement("div");
      feedback.className = "feedback";
      if (entry) {
        feedback.innerHTML = `<span><strong>${entry.score.exact}</strong> exact</span><span><strong>${entry.score.misplaced}</strong> misplaced</span>`;
      } else {
        feedback.textContent = "Open";
      }
      row.append(number, pegs, feedback);
      container.append(row);
    }
  };

  buildBoard(els.guessBoard, solo.yourGuesses, solo.pegs);
  buildBoard(els.robotBoard, solo.robotGuesses, solo.pegs);
}

function renderSoloControls() {
  const solo = state.solo;
  els.guessPalette.innerHTML = "";
  soloPalette().forEach((color) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch";
    swatch.style.setProperty("--swatch-color", color);
    swatch.classList.toggle("is-selected", color === state.selectedColor);
    swatch.ariaLabel = `Select ${color}`;
    swatch.addEventListener("click", () => {
      state.selectedColor = color;
      renderSoloControls();
    });
    els.guessPalette.append(swatch);
  });
  els.guessSlots.innerHTML = "";
  state.currentGuess.forEach((colorIndex, index) => {
    const slot = makePeg(soloColorFor(colorIndex), "slot");
    slot.title = `Guess peg ${index + 1}`;
    slot.addEventListener("click", () => {
      const picked = soloPalette().indexOf(state.selectedColor);
      state.currentGuess[index] = picked >= 0 ? picked : 0;
      renderSoloControls();
    });
    els.guessSlots.append(slot);
  });
  els.submitGuess.disabled = solo.status !== "active" || solo.thinking;
}

const SOLO_TIER_NAMES = { casual: "Casual", sharp: "Sharp", oracle: "Oracle" };

function renderSoloGame() {
  const solo = state.solo;
  els.playView.classList.add("has-robot");
  els.invitePanel.hidden = true;
  els.newGameButton.hidden = false;
  els.joinAnotherButton.hidden = false;
  els.guessPanel.hidden = solo.status !== "active" || solo.thinking ? false : false;
  els.robotPanel.hidden = false;
  els.factPegs.textContent = String(solo.pegs);
  els.factRounds.textContent = String(solo.maxRounds);
  els.factStatus.textContent =
    solo.status === "won" ? "Cracked it" : solo.status === "lost" ? "Code held" : solo.status === "tied" ? "Dead heat" : "Active";
  els.makerSecret.hidden = false;
  els.secretPreview.innerHTML = "";
  solo.yourCode.forEach((colorIndex) => els.secretPreview.append(makePeg(soloColorFor(colorIndex))));

  const used = solo.yourGuesses.length;
  if (solo.status === "active") {
    els.gameMessage.textContent = solo.thinking
      ? "The robot is thinking…"
      : `Round ${solo.round}: ${solo.maxRounds - used + 1} guess${solo.maxRounds - used === 0 ? "" : "es"} left on your board.`;
  } else if (solo.status === "won") {
    els.gameMessage.textContent = `You cracked the robot's code in ${used} rounds — it needed ${solo.robotGuesses.length}.`;
  } else if (solo.status === "lost") {
    els.gameMessage.textContent = `The ${SOLO_TIER_NAMES[solo.difficulty]} robot cracked your code in ${solo.robotGuesses.length} rounds.`;
  } else {
    els.gameMessage.textContent = "Both codes fell on the same round — a dead heat.";
  }
  els.robotMessage.textContent =
    solo.status === "active"
      ? `Round ${solo.round} · ${SOLO_TIER_NAMES[solo.difficulty]} robot`
      : solo.status === "won" || solo.status === "tied"
        ? `Robot's code: ${solo.robotSecret.map(soloColorFor).join(" ")}`
        : `Your code was ${solo.yourCode.map(soloColorFor).join(" ")}`;

  renderSoloBoard();
  renderSoloControls();
}

function soloFinish(status) {
  const solo = state.solo;
  solo.status = status;
  if (status === "won") {
    state.soloStats.wins += 1;
    const chips = solo.difficulty === "oracle" ? 6 : solo.difficulty === "sharp" ? 4 : 2;
    GameHubProfile?.achieve("bulls-cows-win");
    if (state.soloStats.wins >= 5) GameHubProfile?.achieve("bulls-cows-5");
    GameHubProfile?.award("bulls-and-cows", chips,
      `Cracked a ${SOLO_TIER_NAMES[solo.difficulty]} robot code in ${solo.yourGuesses.length}`, state.soloStats.wins);
    GameHubJuice?.win();
  } else if (status === "lost") {
    state.soloStats.losses += 1;
    GameHubProfile?.award("bulls-and-cows", 1, "The robot cracked your code first", 0);
    GameHubJuice?.lose();
  } else {
    state.soloStats.ties += 1;
    GameHubProfile?.award("bulls-and-cows", 2, "Dead heat with the robot", 0);
    GameHubJuice?.levelUp();
  }
  persistSoloStats();
}

function submitSoloGuess() {
  const solo = state.solo;
  if (!solo || solo.status !== "active" || solo.thinking) return;
  const guess = state.currentGuess.slice();
  const score = feedbackScore(solo.robotSecret, guess);
  solo.yourGuesses.push({ round: solo.round, code: guess, score });
  solo.thinking = true;
  renderGame();

  const playerSolved = score.exact === solo.pegs;
  const delay = playerSolved ? 650 : 950 + Math.random() * 500;
  setTimeout(() => {
    if (playerSolved) {
      // The robot still gets its reply for this round; a same-round solve ties.
      robotTakeGuess(() => {
        const robotSolvedThisRound = solo.robotGuesses.some(
          (entry) => entry.round === solo.round && entry.score.exact === solo.pegs
        );
        if (robotSolvedThisRound) soloFinish("tied");
        else soloFinish("won");
        solo.thinking = false;
        renderGame();
      });
    } else {
      robotTakeGuess(() => {
        const entry = solo.robotGuesses[solo.robotGuesses.length - 1];
        if (entry.score.exact === solo.pegs) {
          soloFinish("lost");
          solo.thinking = false;
          renderGame();
        } else {
          solo.thinking = false;
          solo.round += 1;
          if (solo.yourGuesses.length >= solo.maxRounds && solo.robotGuesses.length >= solo.maxRounds) {
            soloFinish("lost");
          }
          renderGame();
        }
      });
    }
  }, delay);
}

function robotTakeGuess(done) {
  const solo = state.solo;
  // Trim the candidate pool against every answer so far, then pick by tier.
  const pool = solo.robot.candidates.filter(
    (candidate) => solo.robotGuesses.every(
      (entry) => {
        const score = feedbackScore(entry.code, candidate);
        return score.exact === entry.score.exact && score.misplaced === entry.score.misplaced;
      }
    )
  );
  if (pool.length) solo.robot.candidates = pool;
  const guess = SOLO_ROBOT.chooseGuess(solo.robot, solo.robotGuesses.length + 1);
  const score = feedbackScore(solo.yourCode, guess);
  solo.robotGuesses.push({ round: solo.round, code: guess.slice(), score });
  done();
}


function clampSettings() {
  const pegCount = Math.min(Math.max(Number(els.pegCount.value) || 4, 3), 8);
  const maxRounds = Math.min(Math.max(Number(els.maxRounds.value) || 10, 4), 20);
  els.pegCount.value = pegCount;
  els.maxRounds.value = maxRounds;
  state.colors = state.colors.slice(0, 10);
  while (state.colors.length < 2) state.colors.push(DEFAULT_COLORS[state.colors.length]);
  state.setupSecret = state.setupSecret.slice(0, pegCount).filter((color) => state.colors.includes(color));
  while (state.setupSecret.length < pegCount) state.setupSecret.push(randomSetupColor());
}

function randomSetupColor() {
  return state.colors[Math.floor(Math.random() * state.colors.length)];
}

function randomizeSetupSecret() {
  clampSettings();
  state.setupSecret = Array.from({ length: Number(els.pegCount.value) }, randomSetupColor);
}

function makePeg(color, className = "peg") {
  const peg = document.createElement("span");
  peg.className = className;
  if (color) peg.style.setProperty("--slot-color", color);
  else peg.classList.add("is-empty");
  return peg;
}

function renderColorEditor() {
  clampSettings();
  els.colorEditor.innerHTML = "";
  state.colors.forEach((color, index) => {
    const row = document.createElement("div");
    row.className = "color-row";

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = color;
    colorInput.ariaLabel = `Color ${index + 1}`;
    colorInput.addEventListener("input", () => {
      const nextColor = normalizeHex(colorInput.value);
      const previousColor = state.colors[index];
      state.colors[index] = nextColor;
      state.setupSecret = state.setupSecret.map((color) => (color === previousColor ? nextColor : color));
      state.selectedColor = nextColor;
      renderSetup();
    });

    const remove = document.createElement("button");
    remove.className = "remove-color";
    remove.type = "button";
    remove.textContent = "x";
    remove.ariaLabel = `Remove color ${index + 1}`;
    remove.disabled = state.colors.length <= 2;
    remove.addEventListener("click", () => {
      const removedColor = state.colors[index];
      state.colors.splice(index, 1);
      state.setupSecret = state.setupSecret.map((color) => (color === removedColor ? state.colors[0] : color));
      state.selectedColor = state.colors[0];
      renderSetup();
    });

    row.append(colorInput, remove);
    els.colorEditor.append(row);
  });
}

function renderSecretControls() {
  els.secretPalette.innerHTML = "";
  state.colors.forEach((color) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch";
    swatch.style.setProperty("--swatch-color", color);
    swatch.classList.toggle("is-selected", color === state.selectedColor);
    swatch.ariaLabel = `Select ${color}`;
    swatch.addEventListener("click", () => {
      state.selectedColor = color;
      renderSecretControls();
    });
    els.secretPalette.append(swatch);
  });

  els.secretSlots.innerHTML = "";
  state.setupSecret.forEach((color, index) => {
    const slot = makePeg(color, "slot");
    slot.title = `Code peg ${index + 1}`;
    slot.addEventListener("click", () => {
      state.setupSecret[index] = state.selectedColor;
      renderSecretControls();
    });
    els.secretSlots.append(slot);
  });
}

function renderSetup() {
  renderColorEditor();
  renderSecretControls();
}

function showStartMode(mode) {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  if (state.soloTimer) {
    clearTimeout(state.soloTimer);
    state.soloTimer = null;
  }
  state.game = null;
  state.solo = null;
  state.shareToken = "";
  state.entryMode = mode || "choice";
  els.startView.hidden = false;
  els.collapsedActions.hidden = true;
  els.playView.hidden = true;
  els.playView.classList.remove("has-robot");
  if (mode === "solo") {
    els.choicePanel.hidden = true;
    els.createForm.hidden = true;
    els.joinForm.hidden = true;
    els.soloForm.hidden = false;
    renderSoloSetup();
    return;
  }
  els.soloForm.hidden = true;
  entryControls.showMode(mode || "choice");
}

function collapseStartControls() {
  els.startView.hidden = true;
  els.collapsedActions.hidden = false;
}

function statusText(status) {
  if (status === "won") return "Solved";
  if (status === "lost") return "Code held";
  return "Active";
}

function openGame(game, options = {}) {
  state.game = game;
  state.entryMode = options.entryMode || state.entryMode;
  state.shareToken = options.shareToken || state.shareToken;
  state.currentGuess = Array(game.pegCount).fill(game.colors[0]);
  state.selectedColor = game.colors[0];
  if (options.creatorSecret) saveMakerSecret(game.code, options.creatorSecret);
  collapseStartControls();
  els.playView.hidden = false;
  renderGame();
  connectEvents(game.code);
}

function connectEvents(code) {
  if (state.eventSource) state.eventSource.close();
  state.eventSource = new EventSource(`/api/bulls-and-cows/games/${code}/events`);
  els.connectionStatus.textContent = "Live";
  state.eventSource.addEventListener("game", (event) => {
    state.game = JSON.parse(event.data);
    renderGame();
  });
  state.eventSource.addEventListener("error", () => {
    els.connectionStatus.textContent = "Reconnecting";
  });
}

function renderSecretPreview() {
  const secret = state.makerSecrets[state.game.code] || state.game.secret;
  els.secretPreview.innerHTML = "";
  if (!secret) {
    els.makerSecret.hidden = true;
    return;
  }
  els.makerSecret.hidden = false;
  secret.forEach((color) => els.secretPreview.append(makePeg(color)));
}

function renderBoard() {
  els.guessBoard.innerHTML = "";
  const guessesByRound = new Map(state.game.guesses.map((guess) => [guess.round, guess]));

  for (let round = 1; round <= state.game.maxRounds; round += 1) {
    const guess = guessesByRound.get(round);
    const row = document.createElement("article");
    row.className = "round-row";

    const number = document.createElement("div");
    number.className = "round-number";
    number.textContent = String(round);

    const pegs = document.createElement("div");
    pegs.className = "round-pegs";
    const colors = guess ? guess.guess : Array(state.game.pegCount).fill("");
    colors.forEach((color) => pegs.append(makePeg(color)));

    const feedback = document.createElement("div");
    feedback.className = "feedback";
    if (guess) {
      feedback.innerHTML = `<span><strong>${guess.feedback.exact}</strong> exact</span><span><strong>${guess.feedback.misplaced}</strong> misplaced</span>`;
    } else {
      feedback.textContent = "Open";
    }

    row.append(number, pegs, feedback);
    els.guessBoard.append(row);
  }
}

function renderGuessControls() {
  els.guessPalette.innerHTML = "";
  state.game.colors.forEach((color) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch";
    swatch.style.setProperty("--swatch-color", color);
    swatch.classList.toggle("is-selected", color === state.selectedColor);
    swatch.ariaLabel = `Select ${color}`;
    swatch.addEventListener("click", () => {
      state.selectedColor = color;
      renderGuessControls();
    });
    els.guessPalette.append(swatch);
  });

  els.guessSlots.innerHTML = "";
  state.currentGuess.forEach((color, index) => {
    const slot = makePeg(color, "slot");
    slot.title = `Guess peg ${index + 1}`;
    slot.addEventListener("click", () => {
      state.currentGuess[index] = state.selectedColor;
      renderGuessControls();
    });
    els.guessSlots.append(slot);
  });

  els.submitGuess.disabled = state.game.status !== "active";
}

function renderGame() {
  if (state.entryMode === "solo") {
    renderSoloGame();
    return;
  }
  const canInvite = state.entryMode === "create" || Boolean(state.makerSecrets[state.game.code]);
  const isHost = canInvite;
  els.shareCode.textContent = state.game.code;
  els.invitePanel.hidden = !canInvite;
  els.newGameButton.hidden = !canInvite;
  els.guessPanel.hidden = isHost;
  els.factPegs.textContent = String(state.game.pegCount);
  els.factRounds.textContent = String(state.game.maxRounds);
  els.factStatus.textContent = statusText(state.game.status);

  const usedRounds = state.game.guesses.length;
  if (state.game.status === "won") {
    els.gameMessage.textContent = `Solved in ${usedRounds} round${usedRounds === 1 ? "" : "s"}.`;
  } else if (state.game.status === "lost") {
    els.gameMessage.textContent = "No rounds left.";
  } else {
    els.gameMessage.textContent = `${state.game.maxRounds - usedRounds} round${state.game.maxRounds - usedRounds === 1 ? "" : "s"} left.`;
  }

  renderSecretPreview();
  renderBoard();
  if (!isHost) renderGuessControls();
}

async function createGame(event) {
  event.preventDefault();
  clampSettings();
  const response = await fetch("/api/bulls-and-cows/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      colors: state.colors,
      pegCount: Number(els.pegCount.value),
      maxRounds: Number(els.maxRounds.value),
      secret: state.setupSecret,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    els.connectionStatus.textContent = data.error || "Could not create game";
    return;
  }
  openGame(data.game, { creatorSecret: data.creatorSecret, shareToken: data.shareToken, entryMode: "create" });
}

async function joinGame(event) {
  event.preventDefault();
  const parsed = parseShareInput(els.joinCode.value);
  if (parsed.token) await loadGameFromToken(parsed.token);
  else if (parsed.code) await loadGame(parsed.code);
}

function parseShareInput(value) {
  const trimmed = value.trim();
  if (!trimmed) return {};
  try {
    const url = new URL(trimmed, window.location.origin);
    return {
      token: url.searchParams.get("token") || "",
      code: (url.searchParams.get("game") || "").toUpperCase(),
    };
  } catch {
    if (trimmed.length > 24) return { token: trimmed };
    return { code: trimmed.toUpperCase() };
  }
}

async function loadGame(code) {
  const response = await fetch(`/api/bulls-and-cows/games/${code}`);
  const data = await response.json();
  if (!response.ok) {
    els.connectionStatus.textContent = data.error || "Game not found";
    return;
  }
  openGame(data.game, { entryMode: "join" });
}

async function loadGameFromToken(token) {
  const response = await fetch("/api/bulls-and-cows/games/from-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const data = await response.json();
  if (!response.ok) {
    els.connectionStatus.textContent = data.error || "Share link not valid";
    return;
  }
  openGame(data.game, { shareToken: data.shareToken, entryMode: "join" });
}

async function submitGuess() {
  if (state.entryMode === "solo") {
    submitSoloGuess();
    return;
  }
  if (!state.game || state.game.status !== "active") return;
  const response = await fetch(`/api/bulls-and-cows/games/${state.game.code}/guesses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guess: state.currentGuess }),
  });
  const data = await response.json();
  if (!response.ok) {
    els.connectionStatus.textContent = data.error || "Could not submit guess";
    return;
  }
  state.game = data.game;
  renderGame();
}

function bindEvents() {
  entryControls = window.GameEntry.setup({
    choicePanel: els.choicePanel,
    createForm: els.createForm,
    joinForm: els.joinForm,
    showCreate: els.showCreate,
    showJoin: els.showJoin,
    joinInput: els.joinCode,
  });
  els.createForm.addEventListener("submit", createGame);
  els.joinForm.addEventListener("submit", joinGame);
  els.soloForm.addEventListener("submit", startSoloDuel);
  els.showSolo.addEventListener("click", () => showStartMode("solo"));
  els.soloRandomize.addEventListener("click", () => {
    const pegs = Math.min(Math.max(Number(els.soloPegCount.value) || 4, 3), 6);
    state.soloDraft = randomSoloCode(pegs, SOLO_COLOR_COUNT);
    renderSoloSetup();
  });
  els.soloPegCount.addEventListener("change", renderSoloSetup);
  els.newGameButton.addEventListener("click", () => showStartMode(state.entryMode === "solo" ? "solo" : "create"));
  els.joinAnotherButton.addEventListener("click", () => showStartMode(state.entryMode === "solo" ? "solo" : "join"));
  els.addColor.addEventListener("click", () => {
    if (state.colors.length >= 10) return;
    state.colors.push(DEFAULT_COLORS[state.colors.length % DEFAULT_COLORS.length]);
    renderSetup();
  });
  els.pegCount.addEventListener("change", renderSetup);
  els.maxRounds.addEventListener("change", clampSettings);
  els.randomizeSecret.addEventListener("click", () => {
    randomizeSetupSecret();
    renderSetup();
  });
  els.submitGuess.addEventListener("click", submitGuess);
  els.copyShare.addEventListener("click", async () => {
    const query = state.shareToken ? `token=${encodeURIComponent(state.shareToken)}` : `game=${state.game.code}`;
    const url = new URL(`/bulls-and-cows/?${query}`, window.location.origin).toString();
    await navigator.clipboard?.writeText(url).catch(() => {});
    els.connectionStatus.textContent = "Copied";
  });
}

function init() {
  loadMakerSecrets();
  loadSoloStats();
  bindEvents();
  renderSetup();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const gameCode = params.get("game");
  if (token) {
    els.joinCode.value = token;
    loadGameFromToken(token);
  } else if (gameCode) {
    els.joinCode.value = gameCode.toUpperCase();
    loadGame(gameCode.toUpperCase());
  }
}

init();
