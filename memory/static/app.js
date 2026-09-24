const THEMES = {
  animals: ["🐶", "🐱", "🦊", "🐼", "🐸", "🦉", "🐬", "🦋", "🐝", "🦜", "🐢", "🦔"],
  food: ["🍎", "🍕", "🍩", "🍓", "🥑", "🌮", "🍦", "🍇", "🧁", "🥕", "🍿", "🍔"],
  space: ["🚀", "🌕", "⭐", "🪐", "☄️", "🛸", "👽", "🔭", "🌌", "🌞", "🌍", "🛰️"],
};
const SIZES = {
  easy: { pairs: 6, cols: 4 },
  medium: { pairs: 8, cols: 4 },
  hard: { pairs: 12, cols: 6 },
};
const PLAYER_COLORS = ["#236c5a", "#c84e4e", "#356eb8", "#dfb44e"];

const els = {
  setupView: document.querySelector("#setupView"),
  setupForm: document.querySelector("#setupForm"),
  gameView: document.querySelector("#gameView"),
  board: document.querySelector("#board"),
  scoreStrip: document.querySelector("#scoreStrip"),
  statusLine: document.querySelector("#statusLine"),
  restartButton: document.querySelector("#restartButton"),
};

const state = {
  players: 1,
  size: "easy",
  theme: "animals",
  deck: [],
  flipped: [],
  scores: [],
  current: 0,
  lock: false,
  matchedPairs: 0,
};

function startGame() {
  const size = SIZES[state.size];
  const emojis = [...THEMES[state.theme]].slice(0, size.pairs);
  state.deck = [...emojis, ...emojis]
    .map((emoji, index) => ({ id: index, emoji, matched: false }))
    .sort(() => Math.random() - 0.5);
  state.flipped = [];
  state.scores = Array(state.players).fill(0);
  state.current = 0;
  state.lock = false;
  state.matchedPairs = 0;

  els.board.style.gridTemplateColumns = `repeat(${size.cols}, var(--card, 86px))`;
  fitCards(size.cols);
  els.board.innerHTML = "";
  state.deck.forEach((card, index) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "card";
    el.dataset.index = index;
    const inner = document.createElement("div");
    inner.className = "card-inner";
    const back = document.createElement("div");
    back.className = "face back";
    const front = document.createElement("div");
    front.className = "face front";
    front.textContent = card.emoji;
    inner.append(back, front);
    el.append(inner);
    els.board.append(el);
  });
  renderScores();
  els.statusLine.textContent = state.players === 1 ? "Find all the pairs!" : "Player 1 goes first";
}

function fitCards(cols) {
  const available = Math.min(window.innerWidth - 48, 640);
  const gapTotal = (cols - 1) * 10;
  const size = Math.max(52, Math.min(96, Math.floor((available - gapTotal) / cols)));
  els.board.style.setProperty("--card", `${size}px`);
}

function renderScores() {
  els.scoreStrip.innerHTML = "";
  for (let i = 0; i < state.players; i += 1) {
    const pill = document.createElement("span");
    pill.className = "player-pill" + (i === state.current ? " active" : "");
    const dot = document.createElement("span");
    dot.className = "player-dot";
    dot.style.background = PLAYER_COLORS[i];
    pill.append(dot, document.createTextNode(` P${i + 1} · ${state.scores[i]}`));
    els.scoreStrip.append(pill);
  }
}

function cardEl(index) {
  return els.board.children[index];
}

function onCardClick(event) {
  const cardButton = event.target.closest(".card");
  if (!cardButton || state.lock) return;
  const index = Number(cardButton.dataset.index);
  const card = state.deck[index];
  if (card.matched || state.flipped.includes(index)) return;

  cardButton.classList.add("flipped");
  state.flipped.push(index);

  if (state.flipped.length < 2) return;
  state.lock = true;
  const [first, second] = state.flipped.map((i) => state.deck[i]);
  const match = first.emoji === second.emoji;

  setTimeout(() => {
    if (match) {
      state.flipped.forEach((i) => {
        state.deck[i].matched = true;
        cardEl(i).classList.add("matched");
      });
      state.scores[state.current] += 1;
      state.matchedPairs += 1;
      state.flipped = [];
      state.lock = false;
      renderScores();
      if (state.matchedPairs === SIZES[state.size].pairs) endGame();
      else els.statusLine.textContent = `Nice pair, Player ${state.current + 1}! Go again.`;
    } else {
      state.flipped.forEach((i) => cardEl(i).classList.remove("flipped"));
      state.flipped = [];
      state.current = (state.current + 1) % state.players;
      state.lock = false;
      renderScores();
      els.statusLine.textContent = state.players === 1
        ? "No match — keep going!"
        : `No match. Player ${state.current + 1}'s turn`;
    }
  }, match ? 420 : 950);
}

function endGame() {
  window.GameHubProfile?.award("memory", 4 + SIZES[state.size].pairs, "Board cleared", SIZES[state.size].pairs);
  const best = Math.max(...state.scores);
  const winners = state.scores
    .map((score, i) => ({ score, player: i + 1 }))
    .filter((entry) => entry.score === best);
  if (state.players === 1) {
    els.statusLine.textContent = "You cleared the board! 🎉";
  } else if (winners.length > 1) {
    els.statusLine.textContent = `It's a tie between ${winners.map((w) => `P${w.player}`).join(" and ")}!`;
  } else {
    els.statusLine.textContent = `Player ${winners[0].player} wins with ${best} pairs! 🏆`;
  }
}

els.board.addEventListener("click", onCardClick);

els.setupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.players = Number(document.querySelector('input[name="players"]:checked').value);
  state.size = document.querySelector('input[name="size"]:checked').value;
  state.theme = document.querySelector('input[name="theme"]:checked').value;
  els.setupView.hidden = true;
  els.gameView.hidden = false;
  startGame();
});

els.restartButton.addEventListener("click", () => {
  if (!els.gameView.hidden) startGame();
});

window.addEventListener("resize", () => {
  if (!els.gameView.hidden) fitCards(SIZES[state.size].cols);
});
