const STORAGE_KEY = "local-first-game-hub-v1";

const icons = {
  bingo: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="8" width="44" height="48" rx="4"></rect>
      <path d="M18 18h28M18 28h28M18 38h28M27 18v28M37 18v28"></path>
      <circle cx="27" cy="28" r="4"></circle>
      <circle cx="37" cy="38" r="4"></circle>
    </svg>`,
  dice: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="9" y="12" width="34" height="34" rx="7"></rect>
      <rect x="25" y="22" width="30" height="30" rx="7"></rect>
      <circle cx="20" cy="23" r="2.5"></circle>
      <circle cx="32" cy="35" r="2.5"></circle>
      <circle cx="36" cy="31" r="2.5"></circle>
      <circle cx="46" cy="43" r="2.5"></circle>
    </svg>`,
  mastermind: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="14" y="7" width="36" height="50" rx="5"></rect>
      <path d="M24 17h16M24 28h16M24 39h16"></path>
      <circle cx="21" cy="17" r="3"></circle>
      <circle cx="43" cy="28" r="3"></circle>
      <circle cx="32" cy="39" r="3"></circle>
      <path d="M22 49h20"></path>
    </svg>`,
  cards: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="14" y="10" width="28" height="40" rx="4"></rect>
      <rect x="23" y="15" width="28" height="40" rx="4"></rect>
      <path d="M32 30c2.8-5.1 10.2-5.1 13 0-2.8 5.1-10.2 5.1-13 0z"></path>
      <circle cx="38.5" cy="30" r="2"></circle>
    </svg>`,
  letters: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="10" width="18" height="18" rx="3"></rect>
      <rect x="36" y="10" width="18" height="18" rx="3"></rect>
      <rect x="10" y="36" width="18" height="18" rx="3"></rect>
      <rect x="36" y="36" width="18" height="18" rx="3"></rect>
      <path d="M17 23l2-8 2 8M18 20h2"></path>
      <path d="M42 16h4a3 3 0 0 1 0 6h-4V16zM42 22h5"></path>
      <path d="M23 42a5 5 0 1 0 0 6"></path>
      <path d="M43 42v10h3a5 5 0 0 0 0-10h-3z"></path>
    </svg>`,
  wordfind: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="9" y="9" width="46" height="46" rx="5"></rect>
      <path d="M20 9v46M32 9v46M44 9v46M9 20h46M9 32h46M9 44h46"></path>
      <path d="M18 18l28 28"></path>
      <circle cx="18" cy="18" r="4"></circle>
      <circle cx="46" cy="46" r="4"></circle>
      <path d="M18 18h28"></path>
    </svg>`,
};

const games = [
  {
    id: "bingo",
    title: "Bingo Card Builder",
    type: "Card maker",
    status: "ready",
    category: "cards",
    href: "/bingo/",
    accent: "#356eb8",
    tilt: "-1.6deg",
    description: "Create printable bingo cards with text or image tiles. Build locally first; sign in only to create share links.",
    features: {
      Mode: "Builder",
      Storage: "Local first, share optional",
      Players: "Any group",
    },
    icon: "bingo",
  },
  {
    id: "yahtzee",
    title: "Yahtzee Scorepad",
    type: "Score tracker",
    status: "ready",
    category: "score",
    href: "/yahtzee/",
    accent: "#c84e4e",
    tilt: "1.4deg",
    description: "Track scores for players, or roll five lockable dice and fill legal category scores.",
    features: {
      Mode: "Scorepad or dice",
      Storage: "Local browser",
      Players: "1-8",
    },
    icon: "dice",
  },
  {
    id: "mastermind",
    title: "Color Guesser",
    type: "Board game",
    status: "ready",
    category: "board",
    href: "/color-guesser/",
    accent: "#6e5cb8",
    tilt: "-0.7deg",
    description: "A Mastermind-style code breaker with anonymous share codes and live server-sent updates.",
    features: {
      Mode: "Live code guessing",
      Storage: "In-memory share code",
      Players: "1-2",
    },
    icon: "mastermind",
  },
  {
    id: "boggle",
    title: "Boggle Table",
    type: "Word board",
    status: "ready",
    category: "board",
    href: "/boggle/",
    accent: "#236c5a",
    tilt: "0.8deg",
    description: "Create a live word board, share a table link, ready up, race the timer, and compare lists together.",
    features: {
      Mode: "Live word hunt",
      Storage: "In-memory share code",
      Players: "Group table",
    },
    icon: "letters",
  },
  {
    id: "word-find",
    title: "Word Find Creator",
    type: "Puzzle maker",
    status: "ready",
    category: "board",
    href: "/word-find/",
    accent: "#a15a2f",
    tilt: "-1.1deg",
    description: "Build printable word-find puzzles from your own word list with overlapping hidden words in every direction.",
    features: {
      Mode: "Puzzle builder",
      Storage: "Local browser",
      Players: "Print or solve",
    },
    icon: "wordfind",
  },
  {
    id: "cards",
    title: "Table Card Tools",
    type: "Support tools",
    status: "soon",
    category: "cards",
    href: "",
    accent: "#266f5f",
    tilt: "1deg",
    description: "Simple decks, turn order, prompts, timers, and draw piles for games that only need a little help.",
    features: {
      Mode: "Utility tray",
      Storage: "Local presets",
      Players: "Flexible",
    },
    icon: "cards",
  },
];

const state = {
  selectedId: "bingo",
  filter: "all",
  pinned: new Set(),
  lastPlayed: {},
};

const els = {
  gameStack: document.querySelector("#gameStack"),
  selectedArt: document.querySelector("#selectedArt"),
  selectedType: document.querySelector("#selectedType"),
  selectedTitle: document.querySelector("#selectedTitle"),
  selectedDescription: document.querySelector("#selectedDescription"),
  featureList: document.querySelector("#featureList"),
  launchGame: document.querySelector("#launchGame"),
  markFavorite: document.querySelector("#markFavorite"),
  gameStatus: document.querySelector("#gameStatus"),
  lastPlayed: document.querySelector("#lastPlayed"),
  resetHub: document.querySelector("#resetHub"),
  filters: document.querySelectorAll(".filter-pill"),
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    state.selectedId = saved.selectedId || state.selectedId;
    state.filter = saved.filter || state.filter;
    state.pinned = new Set(saved.pinned || []);
    state.lastPlayed = saved.lastPlayed || {};
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      selectedId: state.selectedId,
      filter: state.filter,
      pinned: [...state.pinned],
      lastPlayed: state.lastPlayed,
    })
  );
}

function selectedGame() {
  return games.find((game) => game.id === state.selectedId) || games[0];
}

function statusLabel(status) {
  return status === "ready" ? "Ready locally" : "On the table";
}

function matchesFilter(game) {
  if (state.filter === "all") return true;
  if (state.filter === "ready") return game.status === "ready";
  return game.category === state.filter;
}

function renderCards() {
  els.gameStack.innerHTML = "";
  const sorted = [...games].sort((first, second) => {
    const firstPinned = state.pinned.has(first.id) ? -1 : 0;
    const secondPinned = state.pinned.has(second.id) ? -1 : 0;
    return firstPinned - secondPinned;
  });

  sorted.forEach((game) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "game-card";
    card.style.setProperty("--tilt", game.tilt);
    card.style.setProperty("--accent", game.accent);
    card.dataset.gameId = game.id;
    if (!matchesFilter(game)) card.classList.add("is-hidden");
    if (game.id === state.selectedId) card.classList.add("is-selected");

    card.innerHTML = `
      <header>
        <div>
          <p class="kicker">${game.type}</p>
          <h3>${game.title}</h3>
        </div>
        <div class="game-art">${icons[game.icon]}</div>
      </header>
      <p>${game.description}</p>
      <div class="card-meta">
        <span class="chip ${game.status}">${statusLabel(game.status)}</span>
        <span class="chip">${state.pinned.has(game.id) ? "Pinned" : game.features.Mode}</span>
      </div>
    `;

    card.addEventListener("click", () => {
      state.selectedId = game.id;
      saveState();
      render();
    });

    els.gameStack.append(card);
  });
}

function renderSelected() {
  const game = selectedGame();
  els.selectedArt.style.color = game.accent;
  els.selectedArt.innerHTML = icons[game.icon];
  els.selectedType.textContent = game.type;
  els.selectedTitle.textContent = game.title;
  els.selectedDescription.textContent = game.description;
  els.gameStatus.textContent = statusLabel(game.status);
  els.lastPlayed.textContent = state.lastPlayed[game.id] ? `Last opened ${state.lastPlayed[game.id]}` : "No recent launch";
  els.markFavorite.classList.toggle("is-pinned", state.pinned.has(game.id));
  els.markFavorite.querySelector("span").textContent = state.pinned.has(game.id) ? "Pinned" : "Pin";

  els.featureList.innerHTML = "";
  Object.entries(game.features).forEach(([label, value]) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    els.featureList.append(term, detail);
  });

  if (game.href) {
    els.launchGame.href = game.href;
    els.launchGame.removeAttribute("aria-disabled");
    els.launchGame.querySelector("span").textContent = "Open";
  } else {
    els.launchGame.href = "#";
    els.launchGame.setAttribute("aria-disabled", "true");
    els.launchGame.querySelector("span").textContent = "Planned";
  }
}

function renderFilters() {
  els.filters.forEach((filter) => {
    filter.classList.toggle("is-active", filter.dataset.filter === state.filter);
  });
}

function render() {
  renderCards();
  renderSelected();
  renderFilters();
}

function bindEvents() {
  els.filters.forEach((filter) => {
    filter.addEventListener("click", () => {
      state.filter = filter.dataset.filter;
      const visibleSelected = matchesFilter(selectedGame());
      if (!visibleSelected) {
        const next = games.find(matchesFilter);
        if (next) state.selectedId = next.id;
      }
      saveState();
      render();
    });
  });

  els.markFavorite.addEventListener("click", () => {
    const game = selectedGame();
    if (state.pinned.has(game.id)) state.pinned.delete(game.id);
    else state.pinned.add(game.id);
    saveState();
    render();
  });

  els.launchGame.addEventListener("click", (event) => {
    const game = selectedGame();
    if (!game.href) {
      event.preventDefault();
      return;
    }
    state.lastPlayed[game.id] = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date());
    saveState();
  });

  els.resetHub.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    state.selectedId = "bingo";
    state.filter = "all";
    state.pinned = new Set();
    state.lastPlayed = {};
    render();
  });
}

loadState();
bindEvents();
render();
