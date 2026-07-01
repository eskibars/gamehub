const STORAGE_KEY = "yahtzee-scorecard-v1";

const CATEGORIES = [
  { id: "ones", label: "Ones", section: "upper" },
  { id: "twos", label: "Twos", section: "upper" },
  { id: "threes", label: "Threes", section: "upper" },
  { id: "fours", label: "Fours", section: "upper" },
  { id: "fives", label: "Fives", section: "upper" },
  { id: "sixes", label: "Sixes", section: "upper" },
  { id: "threeKind", label: "Three of a Kind", section: "lower" },
  { id: "fourKind", label: "Four of a Kind", section: "lower" },
  { id: "fullHouse", label: "Full House", section: "lower" },
  { id: "smallStraight", label: "Small Straight", section: "lower" },
  { id: "largeStraight", label: "Large Straight", section: "lower" },
  { id: "yahtzee", label: "Yahtzee", section: "lower" },
  { id: "chance", label: "Chance", section: "lower" },
];

const UPPER_IDS = ["ones", "twos", "threes", "fours", "fives", "sixes"];

const state = {
  mode: "scores",
  setupPlayers: ["Player 1", "Player 2"],
  players: [],
  scores: {},
  activePlayer: 0,
  dice: [1, 1, 1, 1, 1],
  locked: [false, false, false, false, false],
  rollsLeft: 3,
  isRolling: false,
};

const els = {
  setupView: document.querySelector("#setupView"),
  gameView: document.querySelector("#gameView"),
  setupForm: document.querySelector("#setupForm"),
  playerCount: document.querySelector("#playerCount"),
  playerCountLabel: document.querySelector("#playerCountLabel"),
  playerEditor: document.querySelector("#playerEditor"),
  scorecard: document.querySelector("#scorecard"),
  dicePanel: document.querySelector("#dicePanel"),
  diceRow: document.querySelector("#diceRow"),
  rollDice: document.querySelector("#rollDice"),
  clearLocks: document.querySelector("#clearLocks"),
  rollStatus: document.querySelector("#rollStatus"),
  turnIndicator: document.querySelector("#turnIndicator"),
  resetGame: document.querySelector("#resetGame"),
};

function saveLocal() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      mode: state.mode,
      players: state.players,
      scores: state.scores,
      activePlayer: state.activePlayer,
      dice: state.dice,
      locked: state.locked,
      rollsLeft: state.rollsLeft,
    })
  );
}

function loadLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.players) || !saved.players.length) return false;
    state.mode = saved.mode === "dice" ? "dice" : "scores";
    state.players = saved.players;
    state.setupPlayers = [...saved.players];
    state.scores = saved.scores || {};
    state.activePlayer = Number(saved.activePlayer) || 0;
    state.dice = Array.isArray(saved.dice) ? saved.dice : state.dice;
    state.locked = Array.isArray(saved.locked) ? saved.locked : state.locked;
    state.rollsLeft = Number.isFinite(saved.rollsLeft) ? saved.rollsLeft : 3;
    return true;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return false;
  }
}

function syncPlayerSetup() {
  const count = Math.min(Math.max(Number(els.playerCount.value) || 1, 1), 8);
  els.playerCount.value = count;
  while (state.setupPlayers.length < count) state.setupPlayers.push(`Player ${state.setupPlayers.length + 1}`);
  state.setupPlayers = state.setupPlayers.slice(0, count);
  els.playerCountLabel.textContent = `${count} player${count === 1 ? "" : "s"}`;
}

function renderPlayerEditor() {
  syncPlayerSetup();
  els.playerEditor.innerHTML = "";
  state.setupPlayers.forEach((name, index) => {
    const label = document.createElement("label");
    label.className = "field";
    label.innerHTML = `<span>Player ${index + 1}</span>`;
    const input = document.createElement("input");
    input.type = "text";
    input.value = name;
    input.maxLength = 32;
    input.addEventListener("input", () => {
      state.setupPlayers[index] = input.value.trim() || `Player ${index + 1}`;
    });
    label.append(input);
    els.playerEditor.append(label);
  });
}

function renderDiePips(value) {
  const pipMap = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9],
  };
  const fragment = document.createDocumentFragment();
  for (let index = 1; index <= 9; index += 1) {
    const pip = document.createElement("span");
    pip.className = "pip";
    if (pipMap[value].includes(index)) pip.classList.add("is-on");
    fragment.append(pip);
  }
  return fragment;
}

function counts() {
  return state.dice.reduce((map, value) => {
    map[value] = (map[value] || 0) + 1;
    return map;
  }, {});
}

function diceTotal() {
  return state.dice.reduce((total, value) => total + value, 0);
}

function hasStraight(length) {
  const unique = [...new Set(state.dice)].sort((a, b) => a - b).join("");
  return length === 4 ? /1234|2345|3456/.test(unique) : /12345|23456/.test(unique);
}

function suggestedScore(categoryId) {
  const face = UPPER_IDS.indexOf(categoryId) + 1;
  if (face > 0) return state.dice.filter((value) => value === face).reduce((sum, value) => sum + value, 0);

  const values = Object.values(counts());
  if (categoryId === "threeKind") return values.some((count) => count >= 3) ? diceTotal() : 0;
  if (categoryId === "fourKind") return values.some((count) => count >= 4) ? diceTotal() : 0;
  if (categoryId === "fullHouse") return values.includes(3) && values.includes(2) ? 25 : 0;
  if (categoryId === "smallStraight") return hasStraight(4) ? 30 : 0;
  if (categoryId === "largeStraight") return hasStraight(5) ? 40 : 0;
  if (categoryId === "yahtzee") return values.includes(5) ? 50 : 0;
  return diceTotal();
}

function playerScore(playerIndex, categoryId) {
  return state.scores[playerIndex]?.[categoryId];
}

function setPlayerScore(playerIndex, categoryId, value) {
  state.scores[playerIndex] ||= {};
  if (value === "" || value === null || Number.isNaN(Number(value))) delete state.scores[playerIndex][categoryId];
  else state.scores[playerIndex][categoryId] = Math.max(0, Number(value));
  saveLocal();
  renderScorecard();
}

function upperTotal(playerIndex) {
  return UPPER_IDS.reduce((sum, id) => sum + (playerScore(playerIndex, id) || 0), 0);
}

function lowerTotal(playerIndex) {
  return CATEGORIES.filter((category) => category.section === "lower").reduce(
    (sum, category) => sum + (playerScore(playerIndex, category.id) || 0),
    0
  );
}

function grandTotal(playerIndex) {
  const upper = upperTotal(playerIndex);
  return upper + (upper >= 63 ? 35 : 0) + lowerTotal(playerIndex);
}

function resetDiceForTurn() {
  state.dice = [1, 1, 1, 1, 1];
  state.locked = [false, false, false, false, false];
  state.rollsLeft = 3;
  state.isRolling = false;
}

function advanceTurn() {
  state.activePlayer = (state.activePlayer + 1) % state.players.length;
  resetDiceForTurn();
}

function fillDiceScore(playerIndex, categoryId) {
  if (state.mode !== "dice" || playerIndex !== state.activePlayer || playerScore(playerIndex, categoryId) !== undefined) return;
  setPlayerScore(playerIndex, categoryId, suggestedScore(categoryId));
  advanceTurn();
  saveLocal();
  renderAll();
}

function renderScoreCell(playerIndex, category) {
  const value = playerScore(playerIndex, category.id);
  const cell = document.createElement("td");
  if (state.mode === "dice") {
    const hasRolled = state.rollsLeft < 3;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-button";
    if (value !== undefined) button.classList.add("is-filled");
    button.textContent = value !== undefined ? String(value) : playerIndex === state.activePlayer && hasRolled ? String(suggestedScore(category.id)) : "-";
    button.disabled = value !== undefined || playerIndex !== state.activePlayer || !hasRolled;
    button.addEventListener("click", () => fillDiceScore(playerIndex, category.id));
    cell.append(button);
  } else {
    const input = document.createElement("input");
    input.className = "score-input";
    input.type = "number";
    input.min = "0";
    input.value = value ?? "";
    input.addEventListener("change", () => setPlayerScore(playerIndex, category.id, input.value));
    cell.append(input);
  }
  return cell;
}

function renderScorecard() {
  els.scorecard.innerHTML = "";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.innerHTML = "<th>Category</th>";
  state.players.forEach((player, index) => {
    const th = document.createElement("th");
    th.textContent = player;
    if (index === state.activePlayer) th.classList.add("active-player");
    headRow.append(th);
  });
  thead.append(headRow);

  const tbody = document.createElement("tbody");
  addSectionRow(tbody, "Upper Section");
  CATEGORIES.filter((category) => category.section === "upper").forEach((category) => addCategoryRow(tbody, category));
  addTotalRow(tbody, "Upper Total", upperTotal);
  addTotalRow(tbody, "Bonus", (index) => (upperTotal(index) >= 63 ? 35 : 0));
  addSectionRow(tbody, "Lower Section");
  CATEGORIES.filter((category) => category.section === "lower").forEach((category) => addCategoryRow(tbody, category));
  addTotalRow(tbody, "Lower Total", lowerTotal);
  addTotalRow(tbody, "Grand Total", grandTotal);

  els.scorecard.append(thead, tbody);
}

function addSectionRow(tbody, label) {
  const row = document.createElement("tr");
  row.className = "section-row";
  const cell = document.createElement("td");
  cell.colSpan = state.players.length + 1;
  cell.textContent = label;
  row.append(cell);
  tbody.append(row);
}

function addCategoryRow(tbody, category) {
  const row = document.createElement("tr");
  const label = document.createElement("td");
  label.textContent = category.label;
  row.append(label);
  state.players.forEach((_, index) => row.append(renderScoreCell(index, category)));
  tbody.append(row);
}

function addTotalRow(tbody, label, getter) {
  const row = document.createElement("tr");
  row.className = "total-row";
  const name = document.createElement("td");
  name.textContent = label;
  row.append(name);
  state.players.forEach((_, index) => {
    const cell = document.createElement("td");
    cell.textContent = String(getter(index));
    row.append(cell);
  });
  tbody.append(row);
}

function renderDice() {
  els.dicePanel.hidden = state.mode !== "dice";
  if (state.mode !== "dice") {
    els.diceRow.innerHTML = "";
    return;
  }
  els.diceRow.innerHTML = "";
  state.dice.forEach((value, index) => {
    const die = document.createElement("button");
    die.type = "button";
    die.className = "die";
    die.classList.toggle("is-locked", state.locked[index]);
    die.classList.toggle("is-rolling", state.isRolling && !state.locked[index]);
    die.append(renderDiePips(value));
    die.ariaLabel = `Die ${index + 1}, ${value}${state.locked[index] ? ", locked" : ""}`;
    die.addEventListener("click", () => {
      if (state.isRolling) return;
      state.locked[index] = !state.locked[index];
      saveLocal();
      renderDice();
    });
    els.diceRow.append(die);
  });
  els.rollStatus.textContent = `${state.rollsLeft} roll${state.rollsLeft === 1 ? "" : "s"} left`;
  els.rollDice.disabled = state.rollsLeft <= 0 || state.isRolling;
}

function renderAll() {
  els.turnIndicator.textContent = state.players[state.activePlayer] || "";
  renderScorecard();
  renderDice();
}

function startGame(event) {
  event.preventDefault();
  state.mode = new FormData(els.setupForm).get("mode") === "dice" ? "dice" : "scores";
  syncPlayerSetup();
  state.players = state.setupPlayers.map((name, index) => name.trim() || `Player ${index + 1}`);
  state.scores = {};
  state.activePlayer = 0;
  resetDiceForTurn();
  els.setupView.hidden = true;
  els.gameView.hidden = false;
  saveLocal();
  renderAll();
}

function rollDice() {
  if (state.rollsLeft <= 0 || state.isRolling) return;
  state.isRolling = true;
  renderDice();
  window.setTimeout(() => {
    state.dice = state.dice.map((value, index) => (state.locked[index] ? value : Math.floor(Math.random() * 6) + 1));
    state.rollsLeft -= 1;
    state.isRolling = false;
    saveLocal();
    renderAll();
  }, 520);
}

function resetGame() {
  localStorage.removeItem(STORAGE_KEY);
  state.players = [];
  state.scores = {};
  state.activePlayer = 0;
  state.setupPlayers = ["Player 1", "Player 2"];
  resetDiceForTurn();
  els.setupView.hidden = false;
  els.gameView.hidden = true;
  els.playerCount.value = 2;
  renderPlayerEditor();
}

function bindEvents() {
  els.setupForm.addEventListener("submit", startGame);
  els.playerCount.addEventListener("change", renderPlayerEditor);
  els.rollDice.addEventListener("click", rollDice);
  els.clearLocks.addEventListener("click", () => {
    state.locked = [false, false, false, false, false];
    saveLocal();
    renderDice();
  });
  els.resetGame.addEventListener("click", resetGame);
}

function init() {
  bindEvents();
  renderPlayerEditor();
  if (loadLocal()) {
    els.setupView.hidden = true;
    els.gameView.hidden = false;
    renderAll();
  }
}

init();

window.addEventListener("pageshow", () => {
  if (!els.setupView.hidden) renderPlayerEditor();
});
