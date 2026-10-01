const STORAGE_KEY = "yacht-scorecard-v1";

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
  { id: "yacht", label: "Yacht", section: "lower" },
  { id: "chance", label: "Chance", section: "lower" },
];

const UPPER_IDS = ["ones", "twos", "threes", "fours", "fives", "sixes"];

const state = {
  mode: "scores",
  setupPlayers: ["Player 1"],
  players: [],
  robots: [], // player indices played by the robot
  robotSkill: "casual",
  scores: {},
  activePlayer: 0,
  dice: [1, 1, 1, 1, 1],
  locked: [false, false, false, false, false],
  rollsLeft: 3,
  isRolling: false,
  robotTimer: null,
  gameOverShown: false,
};

function isRobot(playerIndex) {
  return state.robots.includes(playerIndex);
}

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
      robots: state.robots,
      robotSkill: state.robotSkill,
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
    state.robots = Array.isArray(saved.robots) ? saved.robots : [];
    state.robotSkill = saved.robotSkill || "casual";
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

function robotCount() {
  return Math.min(Math.max(Number(els.robotCount?.value) || 0, 0), 3);
}

function syncPlayerSetup() {
  const count = Math.min(Math.max(Number(els.playerCount.value) || 1, 1), 8);
  els.playerCount.value = count;
  while (state.setupPlayers.length < count) state.setupPlayers.push(`Player ${state.setupPlayers.length + 1}`);
  state.setupPlayers = state.setupPlayers.slice(0, count);
  const bots = robotCount();
  els.playerCountLabel.textContent = `${count} player${count === 1 ? "" : "s"} + ${bots} robot${bots === 1 ? "" : "s"}`;
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

function countsOf(dice) {
  return dice.reduce((map, value) => {
    map[value] = (map[value] || 0) + 1;
    return map;
  }, {});
}

function counts() {
  return countsOf(state.dice);
}

function diceTotal(dice = state.dice) {
  return dice.reduce((total, value) => total + value, 0);
}

function hasStraight(length, dice = state.dice) {
  const unique = [...new Set(dice)].sort((a, b) => a - b).join("");
  return length === 4 ? /1234|2345|3456/.test(unique) : /12345|23456/.test(unique);
}

// Pure scoring so the robot brain can evaluate hypothetical dice.
function scoreDice(dice, categoryId) {
  const face = UPPER_IDS.indexOf(categoryId) + 1;
  if (face > 0) return dice.filter((value) => value === face).reduce((sum, value) => sum + value, 0);

  const values = Object.values(countsOf(dice));
  if (categoryId === "threeKind") return values.some((count) => count >= 3) ? diceTotal(dice) : 0;
  if (categoryId === "fourKind") return values.some((count) => count >= 4) ? diceTotal(dice) : 0;
  if (categoryId === "fullHouse") return values.includes(3) && values.includes(2) ? 25 : 0;
  if (categoryId === "smallStraight") return hasStraight(4, dice) ? 30 : 0;
  if (categoryId === "largeStraight") return hasStraight(5, dice) ? 40 : 0;
  if (categoryId === "yacht") return values.includes(5) ? 50 : 0;
  return diceTotal(dice);
}

function suggestedScore(categoryId) {
  return scoreDice(state.dice, categoryId);
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

function fillDiceScore(playerIndex, categoryId, value) {
  if (state.mode !== "dice" || playerIndex !== state.activePlayer || playerScore(playerIndex, categoryId) !== undefined) return;
  setPlayerScore(playerIndex, categoryId, value ?? suggestedScore(categoryId));
  advanceTurn();
  saveLocal();
  renderAll();
  if (checkGameOver()) return;
  maybeRobotTurn();
}

function allScored(playerIndex) {
  return CATEGORIES.every((category) => playerScore(playerIndex, category.id) !== undefined);
}

function checkGameOver() {
  if (state.gameOverShown) return false;
  if (!state.players.length || !state.players.every((_, index) => allScored(index))) return false;
  state.gameOverShown = true;
  const totals = state.players.map((_, index) => grandTotal(index));
  const best = Math.max(...totals);
  const winnerIndex = totals.indexOf(best);
  els.turnIndicator.textContent = `🏆 ${state.players[winnerIndex]} wins with ${best}!`;
  const robotsPlayed = state.robots.length > 0;
  const humanBeatRobots =
    robotsPlayed && state.robots.every((bot) => totals[winnerIndex] >= totals[bot]) && !isRobot(winnerIndex);
  if (humanBeatRobots) {
    GameHubProfile?.achieve("yacht-robot-win");
    GameHubProfile?.award("yacht", state.robotSkill === "master" ? 8 : state.robotSkill === "sharp" ? 5 : 3,
      `Beat ${state.robots.length} ${state.robotSkill} robot${state.robots.length === 1 ? "" : "s"} ${best}-${Math.max(...state.robots.map((bot) => totals[bot]))}`, 0);
    GameHubJuice?.win();
  } else if (robotsPlayed) {
    GameHubProfile?.award("yacht", 1, "Lost the dice duel to a robot", 0);
    GameHubJuice?.lose();
  }
  return true;
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
    button.textContent = value !== undefined ? String(value) : playerIndex === state.activePlayer && hasRolled && !isRobot(playerIndex) ? String(suggestedScore(category.id)) : "-";
    button.disabled =
      value !== undefined ||
      playerIndex !== state.activePlayer ||
      !hasRolled ||
      isRobot(state.activePlayer);
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
      if (state.isRolling || isRobot(state.activePlayer)) return;
      state.locked[index] = !state.locked[index];
      saveLocal();
      renderDice();
    });
    els.diceRow.append(die);
  });
  els.rollStatus.textContent = `${state.rollsLeft} roll${state.rollsLeft === 1 ? "" : "s"} left`;
  els.rollDice.disabled = state.rollsLeft <= 0 || state.isRolling || isRobot(state.activePlayer);
}

function renderAll() {
  els.turnIndicator.textContent = state.players[state.activePlayer] || "";
  renderScorecard();
  renderDice();
}

function startGame(event) {
  event.preventDefault();
  const bots = robotCount();
  state.robotSkill = els.robotSkill?.value || "casual";
  const chosenMode = new FormData(els.setupForm).get("mode") === "dice" ? "dice" : "scores";
  state.mode = bots > 0 ? "dice" : chosenMode;
  syncPlayerSetup();
  state.players = state.setupPlayers.map((name, index) => name.trim() || `Player ${index + 1}`);
  state.robots = [];
  for (let i = 0; i < bots; i += 1) {
    state.robots.push(state.players.length);
    state.players.push(`🤖 Robot ${i + 1}`);
  }
  state.scores = {};
  state.activePlayer = 0;
  state.gameOverShown = false;
  resetDiceForTurn();
  els.setupView.hidden = true;
  els.gameView.hidden = false;
  saveLocal();
  renderAll();
  maybeRobotTurn();
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
    maybeRobotTurn(700);
  }, 520);
}

function resetGame() {
  localStorage.removeItem(STORAGE_KEY);
  if (state.robotTimer) clearTimeout(state.robotTimer);
  state.players = [];
  state.robots = [];
  state.scores = {};
  state.activePlayer = 0;
  state.gameOverShown = false;
  state.setupPlayers = ["Player 1"];
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


// ----- Robot players -----
//
// Casual never holds dice and scores whatever is biggest at the end.
// Sharp holds toward the most promising pattern with a few rules of thumb.
// Master scores exactly: for every one of the 32 hold masks it enumerates
// all reroll outcomes and takes the expected best category value.

const ROBOT_SKILLS = { casual: "Casual", sharp: "Sharp", master: "Master" };
const evMemo = new Map();

function unfilledCategories(playerIndex) {
  return CATEGORIES.filter((category) => playerScore(playerIndex, category.id) === undefined).map((c) => c.id);
}

function bestScoreNow(dice, unfilled) {
  let best = -1;
  let bestId = unfilled[0];
  for (const id of unfilled) {
    const value = scoreDice(dice, id);
    if (value > best) {
      best = value;
      bestId = id;
    }
  }
  return { score: best, id: bestId };
}

function robotFinalScore(dice, unfilled) {
  const key = dice.slice().sort().join("") + "|" + unfilled.join(",");
  if (evMemo.has(key)) return evMemo.get(key);
  let best = 0;
  for (const id of unfilled) {
    const value = scoreDice(dice, id);
    if (value > best) best = value;
  }
  evMemo.set(key, best);
  return best;
}

// Expected final score, holding exactly `mask` (bit i set = keep die i)
// through one more roll.
function robotEvMask(dice, mask, unfilled) {
  const held = dice.filter((_, i) => mask & (1 << i));
  const rerolls = 5 - held.length;
  const combos = 6 ** rerolls;
  let total = 0;
  for (let code = 0; code < combos; code += 1) {
    const rolled = [];
    let rest = code;
    for (let i = 0; i < rerolls; i += 1) {
      rolled.push((rest % 6) + 1);
      rest = Math.floor(rest / 6);
    }
    total += robotFinalScore(held.concat(rolled), unfilled);
  }
  return total / combos;
}

function robotBestMask(dice, unfilled) {
  let bestMask = 0;
  let bestEv = -1;
  for (let mask = 0; mask < 32; mask += 1) {
    const ev = robotEvMask(dice, mask, unfilled);
    if (ev > bestEv) {
      bestEv = ev;
      bestMask = mask;
    }
  }
  return { mask: bestMask, ev: bestEv };
}

function robotChooseHolds() {
  const skill = state.robotSkill;
  const dice = state.dice;
  const robotIndex = state.activePlayer;
  const unfilled = unfilledCategories(robotIndex);
  if (skill === "master") {
    const { mask } = robotBestMask(dice, unfilled);
    return Array.from({ length: 5 }, (_, i) => Boolean(mask & (1 << i)));
  }
  if (skill === "sharp") {
    const entries = Object.entries(countsOf(dice)).sort((a, b) => b[1] - a[1]);
    const [topFace, topCount] = [Number(entries[0][0]), entries[0][1]];
    // Hold a made three-plus of a kind outright — chase four / yacht.
    if (topCount >= 3) return dice.map((v) => v === topFace);
    // Hold a 4-run toward a straight.
    const unique = [...new Set(dice)].sort((a, b) => a - b);
    for (const run of [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]]) {
      if (run.every((face) => unique.includes(face))) {
        return dice.map((v) => run.includes(v));
      }
    }
    if (topCount === 2) return dice.map((v) => v === topFace);
    return dice.map((v) => v === Math.max(...dice));
  }
  // Casual: never hold anything.
  return [false, false, false, false, false];
}

function robotStep() {
  if (state.mode !== "dice" || !isRobot(state.activePlayer)) return;
  if (state.gameOverShown) return;
  const robotIndex = state.activePlayer;
  const unfilled = unfilledCategories(robotIndex);
  if (!unfilled.length) {
    advanceTurn();
    saveLocal();
    renderAll();
    if (checkGameOver()) return;
    maybeRobotTurn();
    return;
  }
  const skill = state.robotSkill;
  const now = bestScoreNow(state.dice, unfilled);
  const skillName = ROBOT_SKILLS[skill] || "Casual";

  // Score immediately when out of rolls — or, for Sharp/Master, when the
  // points on the table beat the expected value of rolling again.
  const scoreNow =
    state.rollsLeft <= 0 ||
    (skill !== "casual" && now.score >= (skill === "master" ? robotBestMask(state.dice, unfilled).ev : 20));

  if (scoreNow) {
    els.turnIndicator.textContent = `🤖 ${state.players[robotIndex]} (${skillName}) scores ${now.score}`;
    fillDiceScore(robotIndex, now.id, now.score);
    return;
  }

  state.locked = robotChooseHolds();
  renderDice();
  els.turnIndicator.textContent = `🤖 ${state.players[robotIndex]} (${skillName}) rolls…`;
  rollDice();
}

function maybeRobotTurn(delay = 900) {
  if (state.robotTimer) clearTimeout(state.robotTimer);
  if (state.mode !== "dice" || !isRobot(state.activePlayer)) return;
  if (allScored(state.activePlayer)) return;
  state.robotTimer = setTimeout(robotStep, delay);
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
