const STORAGE_KEY = "find-em-state-v1";
const CARD_DATA_URL = "cards.json";

const state = {
  data: null,
  categoryId: "",
  deck: [],
  index: 0,
  history: [],
};

const els = {
  resetGame: document.querySelector("#resetGame"),
  categoryList: document.querySelector("#categoryList"),
  deckCount: document.querySelector("#deckCount"),
  shuffleDeck: document.querySelector("#shuffleDeck"),
  categoryLabel: document.querySelector("#categoryLabel"),
  cardProgress: document.querySelector("#cardProgress"),
  cardCategory: document.querySelector("#cardCategory"),
  cardNumber: document.querySelector("#cardNumber"),
  cardPrompt: document.querySelector("#cardPrompt"),
  followOns: document.querySelector("#followOns"),
  previousCard: document.querySelector("#previousCard"),
  nextCard: document.querySelector("#nextCard"),
  findCard: document.querySelector("#findCard"),
  foundCount: document.querySelector("#foundCount"),
  foundList: document.querySelector("#foundList"),
};

function loadSavedState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    state.categoryId = saved.categoryId || "";
    state.deck = Array.isArray(saved.deck) ? saved.deck : [];
    state.index = Number.isInteger(saved.index) ? saved.index : 0;
    state.history = Array.isArray(saved.history) ? saved.history : [];
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      categoryId: state.categoryId,
      deck: state.deck,
      index: state.index,
      history: state.history.slice(0, 20),
    })
  );
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function allCards() {
  if (!state.data) return [];
  return state.data.categories.flatMap((category) =>
    category.cards.map((card) => ({ ...card, category }))
  );
}

function categoryCards(categoryId = state.categoryId) {
  if (!state.data) return [];
  if (categoryId === "all") return allCards();
  const category = state.data.categories.find((item) => item.id === categoryId);
  if (!category) return [];
  return category.cards.map((card) => ({ ...card, category }));
}

function selectedCategory() {
  if (!state.data) return null;
  if (state.categoryId === "all") {
    return {
      id: "all",
      name: "All Decks",
      description: "Every Find 'em card mixed together.",
      accent: "#c19638",
    };
  }
  return state.data.categories.find((category) => category.id === state.categoryId) || null;
}

function cardById(cardId) {
  return categoryCards().find((card) => card.id === cardId) || null;
}

function currentCard() {
  return cardById(state.deck[state.index]) || categoryCards()[0] || null;
}

function buildDeck(categoryId = state.categoryId) {
  const cards = categoryCards(categoryId);
  state.deck = shuffle(cards.map((card) => card.id));
  state.index = 0;
  state.history = [];
  recordCurrentCard();
  saveState();
}

function ensureUsableDeck() {
  const categoryIds = new Set(["all", ...state.data.categories.map((category) => category.id)]);
  if (!categoryIds.has(state.categoryId)) {
    state.categoryId = state.data.categories[0]?.id || "all";
  }

  const validCardIds = new Set(categoryCards().map((card) => card.id));
  const hasValidDeck = state.deck.length > 0 && state.deck.every((cardId) => validCardIds.has(cardId));
  if (!hasValidDeck) {
    buildDeck(state.categoryId);
    return;
  }

  state.index = Math.min(Math.max(state.index, 0), state.deck.length - 1);
  state.history = state.history.filter((cardId) => validCardIds.has(cardId));
  recordCurrentCard();
  saveState();
}

function recordCurrentCard() {
  const card = currentCard();
  if (!card) return;
  state.history = [card.id, ...state.history.filter((cardId) => cardId !== card.id)].slice(0, 20);
}

function setCategory(categoryId) {
  if (state.categoryId === categoryId) return;
  state.categoryId = categoryId;
  buildDeck(categoryId);
  render();
}

function showNextCard() {
  if (!state.deck.length) return;
  if (state.index >= state.deck.length - 1) {
    state.deck = shuffle(state.deck);
    state.index = 0;
  } else {
    state.index += 1;
  }
  recordCurrentCard();
  saveState();
  animateCard();
  render();
}

function showPreviousCard() {
  if (state.index <= 0) return;
  state.index -= 1;
  recordCurrentCard();
  saveState();
  animateCard("back");
  render();
}

function animateCard(direction = "next") {
  els.findCard.classList.remove("draw-next", "draw-back");
  void els.findCard.offsetWidth;
  els.findCard.classList.add(direction === "back" ? "draw-back" : "draw-next");
}

function renderCategories() {
  const categories = [
    {
      id: "all",
      name: "All Decks",
      description: "Mixed set",
      accent: "#c19638",
      count: allCards().length,
    },
    ...state.data.categories.map((category) => ({
      ...category,
      count: category.cards.length,
    })),
  ];

  els.categoryList.innerHTML = "";
  categories.forEach((category) => {
    const button = document.createElement("button");
    const swatch = document.createElement("span");
    const label = document.createElement("span");
    const name = document.createElement("strong");
    const count = document.createElement("small");

    button.type = "button";
    button.className = "category-button";
    button.style.setProperty("--accent", category.accent);
    button.classList.toggle("is-active", category.id === state.categoryId);
    swatch.className = "category-swatch";
    swatch.setAttribute("aria-hidden", "true");
    name.textContent = category.name;
    count.textContent = `${category.count} cards`;
    label.append(name, count);
    button.append(swatch, label);
    button.addEventListener("click", () => setCategory(category.id));
    els.categoryList.append(button);
  });
}

function renderCard() {
  const category = selectedCategory();
  const card = currentCard();
  const cards = categoryCards();

  if (!category || !card) {
    els.categoryLabel.textContent = "No cards";
    els.cardProgress.textContent = "0 of 0";
    els.cardCategory.textContent = "Find 'em";
    els.cardNumber.textContent = "Card";
    els.cardPrompt.textContent = "No cards were found.";
    els.followOns.innerHTML = "";
    els.previousCard.disabled = true;
    els.nextCard.disabled = true;
    return;
  }

  document.documentElement.style.setProperty("--deck-accent", category.accent);
  els.deckCount.textContent = `${cards.length} ${cards.length === 1 ? "card" : "cards"}`;
  els.categoryLabel.textContent = category.name;
  els.cardProgress.textContent = `${state.index + 1} of ${state.deck.length}`;
  els.cardCategory.textContent = card.category.name;
  els.cardNumber.textContent = `Card ${state.index + 1}`;
  els.cardPrompt.textContent = card.prompt;
  els.previousCard.disabled = state.index === 0;
  els.nextCard.querySelector("span").textContent = state.index >= state.deck.length - 1 ? "Reshuffle" : "Next Card";

  els.followOns.innerHTML = "";
  (card.followOns || []).forEach((question, index) => {
    const item = document.createElement("p");
    const number = document.createElement("span");
    item.className = "follow-on";
    number.textContent = String(index + 1);
    item.append(number, document.createTextNode(question));
    els.followOns.append(item);
  });
}

function renderHistory() {
  els.foundCount.textContent = String(state.history.length);
  els.foundList.innerHTML = "";

  state.history.slice(0, 8).forEach((cardId) => {
    const card = allCards().find((item) => item.id === cardId);
    if (!card) return;
    const item = document.createElement("li");
    const prompt = document.createElement("strong");
    const category = document.createElement("span");
    prompt.textContent = card.prompt;
    category.textContent = card.category.name;
    item.append(prompt, category);
    els.foundList.append(item);
  });
}

function render() {
  renderCategories();
  renderCard();
  renderHistory();
}

async function loadDeckData() {
  const response = await fetch(CARD_DATA_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error("Card deck could not be loaded.");
  state.data = await response.json();
}

function bindEvents() {
  els.shuffleDeck.addEventListener("click", () => {
    buildDeck();
    animateCard();
    render();
  });
  els.nextCard.addEventListener("click", showNextCard);
  els.previousCard.addEventListener("click", showPreviousCard);
  els.resetGame.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    state.categoryId = state.data.categories[0]?.id || "all";
    buildDeck();
    animateCard();
    render();
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

async function init() {
  loadSavedState();
  bindEvents();
  registerServiceWorker();

  try {
    await loadDeckData();
    ensureUsableDeck();
    render();
  } catch (error) {
    els.categoryLabel.textContent = "Offline";
    els.cardProgress.textContent = "Deck unavailable";
    els.cardPrompt.textContent = error.message;
  }
}

init();
