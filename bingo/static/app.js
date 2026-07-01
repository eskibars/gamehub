const STORAGE_KEY = "bingo-card-builder-state-v1";

const state = {
  title: "Movie Night Bingo",
  gridSize: 5,
  includeFreeSpace: true,
  tiles: [],
  currentCard: [],
  user: null,
  apiAvailable: true,
};

const els = {
  accountStatus: document.querySelector("#accountStatus"),
  openAuth: document.querySelector("#openAuth"),
  cardTitle: document.querySelector("#cardTitle"),
  gridSize: document.querySelector("#gridSize"),
  freeSpace: document.querySelector("#freeSpace"),
  printCount: document.querySelector("#printCount"),
  textTiles: document.querySelector("#textTiles"),
  addTextTiles: document.querySelector("#addTextTiles"),
  imageTiles: document.querySelector("#imageTiles"),
  clearImages: document.querySelector("#clearImages"),
  pasteZone: document.querySelector("#pasteZone"),
  tileLibrary: document.querySelector("#tileLibrary"),
  tileCount: document.querySelector("#tileCount"),
  clearTiles: document.querySelector("#clearTiles"),
  shuffleCard: document.querySelector("#shuffleCard"),
  printCards: document.querySelector("#printCards"),
  saveShare: document.querySelector("#saveShare"),
  bingoCard: document.querySelector("#bingoCard"),
  cardMessage: document.querySelector("#cardMessage"),
  authDialog: document.querySelector("#authDialog"),
  authEmail: document.querySelector("#authEmail"),
  authName: document.querySelector("#authName"),
  devLogin: document.querySelector("#devLogin"),
  shareBox: document.querySelector("#shareBox"),
  shareLink: document.querySelector("#shareLink"),
  printArea: document.querySelector("#printArea"),
};

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function saveLocal() {
  const localState = {
    title: state.title,
    gridSize: state.gridSize,
    includeFreeSpace: state.includeFreeSpace,
    tiles: state.tiles,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(localState));
}

function loadLocal() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    state.title = parsed.title || state.title;
    state.gridSize = Number(parsed.gridSize) || state.gridSize;
    state.includeFreeSpace = parsed.includeFreeSpace ?? state.includeFreeSpace;
    state.tiles = Array.isArray(parsed.tiles) ? parsed.tiles : [];
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function requiredTileCount() {
  const total = state.gridSize * state.gridSize;
  return state.includeFreeSpace ? total - 1 : total;
}

function freeSpaceIndex() {
  if (!state.includeFreeSpace) return -1;
  const center = Math.floor(state.gridSize / 2);
  const row = state.gridSize % 2 === 0 ? center - 1 : center;
  const column = state.gridSize % 2 === 0 ? center - 1 : center;
  return row * state.gridSize + column;
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const next = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[next]] = [shuffled[next], shuffled[index]];
  }
  return shuffled;
}

function makeCard() {
  const needed = requiredTileCount();
  const selected = shuffle(state.tiles).slice(0, needed);
  const total = state.gridSize * state.gridSize;
  const freeIndex = freeSpaceIndex();
  const card = [];
  let tileIndex = 0;

  for (let index = 0; index < total; index += 1) {
    if (index === freeIndex) {
      card.push({ id: "free-space", type: "free", text: "Free Space" });
    } else {
      card.push(selected[tileIndex] || { id: `empty-${index}`, type: "empty", text: "Add more tiles" });
      tileIndex += 1;
    }
  }

  state.currentCard = card;
}

function renderCard(target = els.bingoCard, card = state.currentCard) {
  target.innerHTML = "";
  target.style.setProperty("--grid-size", state.gridSize);

  const title = document.createElement("h2");
  title.textContent = state.title || "Untitled Bingo";
  target.append(title);

  const grid = document.createElement("div");
  grid.className = "bingo-grid";
  grid.style.setProperty("--grid-size", state.gridSize);

  card.forEach((tile) => {
    const cell = document.createElement("div");
    cell.className = `bingo-cell ${tile.type}`;
    if (tile.type === "image" || tile.type === "mixed") {
      const image = document.createElement("img");
      image.alt = tile.text || "Bingo tile image";
      image.src = tile.image;
      cell.append(image);
    }
    if (tile.text || tile.type === "empty") {
      const text = document.createElement("span");
      text.textContent = tile.text || "Image tile";
      cell.append(text);
    }
    grid.append(cell);
  });

  target.append(grid);
}

function renderLibrary() {
  els.tileLibrary.innerHTML = "";
  els.tileCount.textContent = `${state.tiles.length} tile${state.tiles.length === 1 ? "" : "s"} ready`;

  state.tiles.forEach((tile) => {
    const item = document.createElement("article");
    item.className = `library-tile ${tile.type}`;

    if (tile.image) {
      const image = document.createElement("img");
      image.alt = tile.text || "Tile image";
      image.src = tile.image;
      item.append(image);
    }

    const label = document.createElement("input");
    label.value = tile.text || "";
    label.placeholder = tile.image ? "Optional caption" : "Tile text";
    label.addEventListener("input", () => {
      tile.text = label.value.trim();
      tile.type = tile.image && tile.text ? "mixed" : tile.image ? "image" : "text";
      saveLocal();
      makeCard();
      renderCard();
    });
    item.append(label);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button";
    remove.title = "Remove tile";
    remove.textContent = "x";
    remove.addEventListener("click", () => {
      state.tiles = state.tiles.filter((candidate) => candidate.id !== tile.id);
      saveLocal();
      makeCard();
      renderAll();
    });
    item.append(remove);
    els.tileLibrary.append(item);
  });
}

function updateMessage() {
  const needed = requiredTileCount();
  const shortage = Math.max(0, needed - state.tiles.length);
  if (shortage > 0) {
    els.cardMessage.textContent = `Add ${shortage} more tile${shortage === 1 ? "" : "s"} for a full random card.`;
  } else {
    els.cardMessage.textContent = `${needed} tiles are selected at random for each shuffle.`;
  }
}

function renderAccount() {
  if (state.user) {
    els.accountStatus.textContent = `Signed in as ${state.user.name}`;
    els.openAuth.textContent = "Sign out";
    els.openAuth.hidden = false;
  } else {
    els.accountStatus.textContent = state.apiAvailable ? "Saved on this device" : "Saved on this device";
    els.openAuth.textContent = "Sync/share";
    els.openAuth.hidden = !state.apiAvailable;
  }
}

function renderAll() {
  els.cardTitle.value = state.title;
  els.gridSize.value = String(state.gridSize);
  els.freeSpace.checked = state.includeFreeSpace;
  renderLibrary();
  renderCard();
  updateMessage();
  renderAccount();
}

function addTextTiles() {
  const lines = els.textTiles.value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((text) => state.tiles.push({ id: uid(), type: "text", text }));
  els.textTiles.value = "";
  saveLocal();
  makeCard();
  renderAll();
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

async function addImageFiles(files) {
  const images = [...files].filter((file) => file.type.startsWith("image/"));
  if (!images.length) return;
  for (const file of images) {
    const image = await readImageFile(file);
    state.tiles.push({ id: uid(), type: "image", text: "", image });
  }
  saveLocal();
  makeCard();
  renderAll();
}

function bindImageTarget(target) {
  target.addEventListener("paste", (event) => {
    const files = [...event.clipboardData.files];
    if (files.length) addImageFiles(files);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    target.addEventListener(eventName, (event) => {
      event.preventDefault();
      target.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    target.addEventListener(eventName, () => {
      target.classList.remove("is-dragging");
    });
  });

  target.addEventListener("drop", (event) => {
    event.preventDefault();
    addImageFiles(event.dataTransfer.files);
  });
}

function snapshotCard() {
  return {
    title: state.title,
    gridSize: state.gridSize,
    includeFreeSpace: state.includeFreeSpace,
    tiles: state.tiles,
  };
}

async function loadSharedCard() {
  const shareParam = new URLSearchParams(window.location.search).get("share");
  const match = window.location.pathname.match(/^\/share\/([^/]+)/);
  const shareId = shareParam || match?.[1];
  if (!shareId || !state.apiAvailable) return;

  const response = await fetch(`/api/shared/${shareId}`);
  if (!response.ok) {
    els.cardMessage.textContent = "Shared card was not found.";
    return;
  }
  const data = await response.json();
  Object.assign(state, data.card);
  saveLocal();
  makeCard();
  renderAll();
  els.cardMessage.textContent = "Loaded a shared card. Changes are local until you share again.";
}

async function refreshUser() {
  try {
    const response = await fetch("/api/me");
    if (!response.ok) throw new Error("API unavailable");
    const data = await response.json();
    state.user = data.user;
    state.apiAvailable = true;
  } catch {
    state.user = null;
    state.apiAvailable = false;
  }
  renderAccount();
}

async function saveSharedCard() {
  if (!state.apiAvailable) {
    els.cardMessage.textContent = "Run the Flask app to create share links. Local editing and printing still work.";
    return;
  }

  if (!state.user) {
    els.authDialog.showModal();
    return;
  }

  const response = await fetch("/api/cards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ card: snapshotCard() }),
  });
  const data = await response.json();
  if (!response.ok) {
    els.cardMessage.textContent = data.error || "Could not share this card.";
    return;
  }

  const url = new URL(data.shareUrl, window.location.origin).toString();
  els.shareBox.hidden = false;
  els.shareLink.value = url;
  els.shareLink.select();
  await navigator.clipboard?.writeText(url).catch(() => {});
  els.cardMessage.textContent = "Share link created and copied.";
}

function printCards() {
  const count = Math.min(Math.max(Number(els.printCount.value) || 1, 1), 50);
  els.printArea.innerHTML = "";

  for (let index = 0; index < count; index += 1) {
    const printCard = document.createElement("section");
    printCard.className = "bingo-card print-card";
    makeCard();
    renderCard(printCard, state.currentCard);
    els.printArea.append(printCard);
  }

  renderCard();
  window.print();
}

function bindEvents() {
  els.cardTitle.addEventListener("input", () => {
    state.title = els.cardTitle.value.trim();
    saveLocal();
    renderCard();
  });

  els.gridSize.addEventListener("change", () => {
    state.gridSize = Number(els.gridSize.value);
    saveLocal();
    makeCard();
    renderAll();
  });

  els.freeSpace.addEventListener("change", () => {
    state.includeFreeSpace = els.freeSpace.checked;
    saveLocal();
    makeCard();
    renderAll();
  });

  els.addTextTiles.addEventListener("click", addTextTiles);
  els.textTiles.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") addTextTiles();
  });
  els.imageTiles.addEventListener("change", async (event) => {
    await addImageFiles(event.target.files);
    event.target.value = "";
  });

  bindImageTarget(els.pasteZone);
  bindImageTarget(els.bingoCard);

  els.clearImages.addEventListener("click", () => {
    state.tiles = state.tiles.filter((tile) => !tile.image);
    saveLocal();
    makeCard();
    renderAll();
  });

  els.clearTiles.addEventListener("click", () => {
    state.tiles = [];
    saveLocal();
    makeCard();
    renderAll();
  });

  els.shuffleCard.addEventListener("click", () => {
    makeCard();
    renderCard();
  });

  els.printCards.addEventListener("click", printCards);
  els.saveShare.addEventListener("click", saveSharedCard);

  els.openAuth.addEventListener("click", async () => {
    if (state.user) {
      await fetch("/auth/logout", { method: "POST" });
      await refreshUser();
    } else {
      els.authDialog.showModal();
    }
  });

  els.devLogin.addEventListener("click", async () => {
    const response = await fetch("/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: els.authEmail.value, name: els.authName.value }),
    });
    const data = await response.json();
    if (!response.ok) {
      els.cardMessage.textContent = data.error || "Could not sign in.";
      return;
    }
    state.user = data.user;
    els.authDialog.close();
    renderAccount();
  });
}

async function init() {
  loadLocal();
  bindEvents();
  makeCard();
  renderAll();
  await refreshUser();
  await loadSharedCard();
}

init();
