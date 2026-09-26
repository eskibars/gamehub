/*
 * Battleship Solo — the classic fleet duel against a robot admiral. Place
 * five ships (tap-rotate or auto-place), then trade salvos. The robot hunts
 * on a checkerboard pattern and switches to pursuit mode on every hit,
 * walking the ship's axis until it sinks.
 */
(() => {
  "use strict";

  const SIZE = 10;
  const FLEET = [
    { name: "Carrier", size: 5 },
    { name: "Battleship", size: 4 },
    { name: "Cruiser", size: 3 },
    { name: "Submarine", size: 3 },
    { name: "Destroyer", size: 2 },
  ];

  const els = {
    enemyGrid: document.querySelector("#enemyGrid"),
    playerGrid: document.querySelector("#playerGrid"),
    statusLine: document.querySelector("#statusLine"),
    fleetNote: document.querySelector("#fleetNote"),
    enemyHint: document.querySelector("#enemyHint"),
    overlay: document.querySelector("#overlay"),
    overlayTitle: document.querySelector("#overlayTitle"),
    overlaySub: document.querySelector("#overlaySub"),
    playButton: document.querySelector("#playButton"),
    rotateButton: document.querySelector("#rotateButton"),
    autoPlace: document.querySelector("#autoPlace"),
    placementActions: document.querySelector("#placementActions"),
    shotsFired: document.querySelector("#shotsFired"),
    battlesWon: document.querySelector("#battlesWon"),
    soundButton: document.querySelector("#soundButton"),
  };

  const STATE_KEY = "gamehub-battleship-solo-v1";

  const game = {
    phase: "menu", // menu | placing | salvo | over
    playerFleet: [],  // { name, cells: [idx], hits: Set }
    enemyFleet: [],
    playerShots: new Set(),  // indexes fired at enemy
    enemyShots: new Set(),
    placing: { shipIndex: 0, horizontal: true, hover: -1 },
    horizontal: true,
    shots: 0,
    battlesWon: 0,
    battlesPlayed: 0,
    robotQueue: [],   // pursuit targets
    robotTimer: null,
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    game.battlesWon = saved.battlesWon || 0;
    game.battlesPlayed = saved.battlesPlayed || 0;
  } catch {
    // Fresh install.
  }
  els.battlesWon.textContent = game.battlesWon;

  function persist() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        battlesWon: game.battlesWon,
        battlesPlayed: game.battlesPlayed,
      }));
    } catch {
      // Storage unavailable.
    }
  }

  const idx = (x, y) => y * SIZE + x;
  const xOf = (i) => i % SIZE;
  const yOf = (i) => Math.floor(i / SIZE);

  /* ------------------------------------------------------------------ *
   * Placement                                                           *
   * ------------------------------------------------------------------ */

  function shipCells(start, size, horizontal) {
    const cells = [];
    for (let i = 0; i < size; i += 1) {
      const x = horizontal ? xOf(start) + i : xOf(start);
      const y = horizontal ? yOf(start) : yOf(start) + i;
      if (x >= SIZE || y >= SIZE) return null;
      cells.push(idx(x, y));
    }
    return cells;
  }

  function overlaps(fleet, cells) {
    const taken = new Set(fleet.flatMap((ship) => ship.cells));
    return cells.some((cell) => taken.has(cell));
  }

  function autoPlaceFleet(target) {
    target.length = 0;
    for (const ship of FLEET) {
      for (let attempt = 0; attempt < 300; attempt += 1) {
        const horizontal = Math.random() < 0.5;
        const start = Math.floor(Math.random() * SIZE * SIZE);
        const cells = shipCells(start, ship.size, horizontal);
        if (cells && !overlaps(target, cells)) {
          target.push({ name: ship.name, size: ship.size, cells, hits: new Set() });
          break;
        }
      }
    }
    return target.length === FLEET.length;
  }

  /* ------------------------------------------------------------------ *
   * Fire resolution                                                     *
   * ------------------------------------------------------------------ */

  function fireAt(fleet, target, shots) {
    let hitShip = null;
    for (const ship of fleet) {
      if (ship.cells.includes(target)) {
        ship.hits.add(target);
        hitShip = ship;
        break;
      }
    }
    shots.add(target);
    const sunk = hitShip ? hitShip.hits.size === hitShip.cells.length : false;
    return { hit: Boolean(hitShip), ship: hitShip, sunk };
  }

  function fleetDestroyed(fleet) {
    return fleet.every((ship) => ship.hits.size === ship.cells.length);
  }

  function remainingShips(fleet) {
    return fleet.filter((ship) => ship.hits.size < ship.cells.length).length;
  }

  /* ------------------------------------------------------------------ *
   * Robot admiral                                                       *
   * ------------------------------------------------------------------ */

  function robotChooseTarget() {
    // Pursuit: walk queued neighbors of un-sunk hits.
    while (game.robotQueue.length) {
      const candidate = game.robotQueue.shift();
      if (!game.enemyShots.has(candidate) && !game.playerShots.has(candidate)) {
        return candidate;
      }
    }
    // Hunt: checkerboard random over unshot cells.
    const pool = [];
    for (let i = 0; i < SIZE * SIZE; i += 1) {
      if (game.enemyShots.has(i)) continue;
      if ((xOf(i) + yOf(i)) % 2 === 0) pool.push(i);
    }
    if (!pool.length) {
      for (let i = 0; i < SIZE * SIZE; i += 1) {
        if (!game.enemyShots.has(i)) pool.push(i);
      }
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function robotTrackHit(target) {
    // Queue orthogonal neighbors; if two hits share an axis, extend that line.
    const hits = [];
    for (const ship of game.playerFleet) {
      for (const cell of ship.hits) hits.push(cell);
    }
    const hitSet = new Set(hits);
    const neighbors = [];
    const x = xOf(target), y = yOf(target);
    if (x > 0) neighbors.push(idx(x - 1, y));
    if (x < SIZE - 1) neighbors.push(idx(x + 1, y));
    if (y > 0) neighbors.push(idx(x, y - 1));
    if (y < SIZE - 1) neighbors.push(idx(x, y + 1));
    // Prefer continuing a line: neighbors adjacent to another hit.
    neighbors.sort((a, b) => {
      const aLine = neighborsOf(a).some((n) => hitSet.has(n));
      const bLine = neighborsOf(b).some((n) => hitSet.has(n));
      return (bLine ? 1 : 0) - (aLine ? 1 : 0);
    });
    game.robotQueue.unshift(...neighbors);
  }

  function neighborsOf(i) {
    const out = [];
    const x = xOf(i), y = yOf(i);
    if (x > 0) out.push(idx(x - 1, y));
    if (x < SIZE - 1) out.push(idx(x + 1, y));
    if (y > 0) out.push(idx(x, y - 1));
    if (y < SIZE - 1) out.push(idx(x, y + 1));
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Flow                                                                *
   * ------------------------------------------------------------------ */

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function startBattle() {
    if (game.robotTimer) clearTimeout(game.robotTimer);
    els.overlay.hidden = true;
    game.playerFleet = [];
    game.enemyFleet = [];
    game.playerShots = new Set();
    game.enemyShots = new Set();
    game.robotQueue = [];
    game.shots = 0;
    game.placing = { shipIndex: 0, hover: -1 };
    game.phase = "placing";
    autoPlaceFleet(game.enemyFleet);
    // Pre-place the player's fleet is NOT done: invite manual or auto.
    els.placementActions.hidden = false;
    els.enemyGrid.classList.add("locked");
    els.fleetNote.textContent = `Placing: ${FLEET[0].name} (${FLEET[0].size})`;
    els.statusLine.textContent = "Tap a ship, then the water, to place it. Or auto-place the whole fleet.";
    render();
  }

  async function beginSalvo() {
    if (game.playerFleet.length < FLEET.length) return;
    game.phase = "salvo";
    els.placementActions.hidden = true;
    els.enemyGrid.classList.remove("locked");
    els.fleetNote.textContent = "Fleet engaged";
    els.statusLine.textContent = "Fire at will — tap the enemy waters.";
    render();
  }

  async function playerFire(target) {
    if (game.phase !== "salvo" || game.playerShots.has(target)) return;
    game.shots += 1;
    els.shotsFired.textContent = game.shots;
    const result = fireAt(game.enemyFleet, target, game.playerShots);
    if (result.hit) GameHubJuice.pop(result.sunk ? 260 : 420);
    else GameHubJuice.drop();
    els.statusLine.textContent = result.sunk
      ? `You sank the enemy ${result.ship.name}!`
      : result.hit ? "Direct hit!" : "Splash — a miss.";
    markLastShot(target);
    render();

    if (fleetDestroyed(game.enemyFleet)) {
      endGame(true);
      return;
    }
    game.phase = "robot";
    els.enemyGrid.classList.add("locked");
    await sleep(850);
    robotSalvo();
  }

  function markLastShot(target) {
    game.lastShot = target;
  }

  async function robotSalvo() {
    if (game.phase !== "robot") return;
    const target = robotChooseTarget();
    const result = fireAt(game.playerFleet, target, game.enemyShots);
    if (result.hit) {
      GameHubJuice.boom();
      if (!result.sunk) robotTrackHit(target);
    } else {
      GameHubJuice.drop();
    }
    els.statusLine.textContent = result.sunk
      ? `Your ${result.ship.name} was sunk!`
      : result.hit ? "You were hit!" : "The robot misses.";
    markLastShot(target);
    render();

    if (fleetDestroyed(game.playerFleet)) {
      endGame(false);
      return;
    }
    game.phase = "salvo";
    els.enemyGrid.classList.remove("locked");
    render();
  }

  function endGame(playerWon) {
    game.phase = "over";
    if (game.robotTimer) clearTimeout(game.robotTimer);
    els.enemyGrid.classList.add("locked");
    game.battlesPlayed += 1;
    const chips = playerWon ? Math.max(3, 12 - game.shots / 2) | 0 : 1;
    if (playerWon) {
      game.battlesWon += 1;
      els.battlesWon.textContent = game.battlesWon;
      GameHubProfile?.achieve("battleship-solo-win");
      if (game.battlesWon >= 5) GameHubProfile?.achieve("battleship-solo-5");
      GameHubProfile?.award("battleship-solo", chips, `Enemy fleet sunk in ${game.shots} shots`, game.battlesWon);
      GameHubJuice.win();
    } else {
      GameHubProfile?.award("battleship-solo", 1, "Went down fighting", game.battlesWon);
      GameHubJuice.lose();
    }
    persist();
    els.overlayTitle.textContent = playerWon ? "Enemy fleet destroyed! 💥" : "Your fleet went down";
    els.overlaySub.textContent = playerWon
      ? `Victory in ${game.shots} shots · +${chips} chips · ${game.battlesWon} battles won`
      : `The robot admiral sank all five ships in ${game.shots} exchanges. +1 chip.`;
    els.playButton.textContent = "New battle";
    els.overlay.hidden = false;
  }

  /* ------------------------------------------------------------------ *
   * Rendering                                                           *
   * ------------------------------------------------------------------ */

  function sunkShipCells(fleet) {
    const sunk = new Set();
    for (const ship of fleet) {
      if (ship.hits.size === ship.cells.length) {
        ship.cells.forEach((cell) => sunk.add(cell));
      }
    }
    return sunk;
  }

  function render() {
    // Enemy grid: show shots (hit/miss) only.
    els.enemyGrid.innerHTML = "";
    const enemySunk = sunkShipCells(game.enemyFleet);
    for (let i = 0; i < SIZE * SIZE; i += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      const shot = game.playerShots.has(i);
      if (shot) {
        const hit = game.enemyFleet.some((ship) => ship.cells.includes(i));
        cell.classList.add(hit ? "hit" : "miss");
        if (hit && enemySunk.has(i)) cell.classList.add("ship-sunk");
      }
      if (game.lastShot === i) cell.classList.add("last-shot");
      if (game.phase === "salvo" && !shot) {
        cell.classList.add("clickable");
        cell.addEventListener("click", () => playerFire(i));
      }
      els.enemyGrid.append(cell);
    }
    const left = remainingShips(game.enemyFleet);
    els.enemyHint.textContent = game.phase === "salvo" ? `· ${left} ship${left === 1 ? "" : "s"} afloat` : "";

    // Player grid: ships, enemy shots (hit/miss), placement previews.
    els.playerGrid.innerHTML = "";
    const shipCellsMap = new Map();
    game.playerFleet.forEach((ship, shipIndex) => {
      ship.cells.forEach((cell) => shipCellsMap.set(cell, { shipIndex, ship }));
    });
    const playerSunk = sunkShipCells(game.playerFleet);
    const previewCells = placementPreview();
    for (let i = 0; i < SIZE * SIZE; i += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      const info = shipCellsMap.get(i);
      if (info) {
        cell.classList.add(info.ship.hits.size === info.ship.cells.length ? "ship-sunk" : "ship-part");
        if (game.enemyShots.has(i)) cell.classList.add("hit");
        if (playerSunk.has(i)) cell.classList.add("ship-sunk");
      } else if (game.enemyShots.has(i)) {
        cell.classList.add("miss");
      }
      if (game.lastShot === i && game.enemyShots.has(i)) cell.classList.add("last-shot");
      if (previewCells.has(i)) {
        cell.classList.add(previewCells.get(i) ? "preview-ok" : "preview-bad");
      }
      if (game.phase === "placing") {
        cell.addEventListener("click", () => onPlacementClick(i));
        cell.addEventListener("pointerenter", () => {
          game.placing.hover = i;
          render();
        });
      }
      els.playerGrid.append(cell);
    }
  }

  function placementPreview() {
    const preview = new Map();
    if (game.phase !== "placing" || game.placing.hover < 0) return preview;
    const ship = FLEET[game.placing.shipIndex];
    const cells = shipCells(game.placing.hover, ship.size, game.horizontal);
    const ok = cells && !overlaps(game.playerFleet, cells);
    (cells || shipCells(game.placing.hover, ship.size, true) || []).forEach((c) => preview.set(c, Boolean(ok)));
    return preview;
  }

  function onPlacementClick(i) {
    const ship = FLEET[game.placing.shipIndex];
    const cells = shipCells(i, ship.size, game.horizontal);
    if (!cells || overlaps(game.playerFleet, cells)) {
      els.statusLine.textContent = "No room there — try another spot or rotate.";
      GameHubJuice.tick();
      return;
    }
    game.playerFleet.push({ name: ship.name, size: ship.size, cells, hits: new Set() });
    GameHubJuice.pop(430);
    game.placing.shipIndex += 1;
    if (game.placing.shipIndex >= FLEET.length) {
      els.fleetNote.textContent = "Fleet ready";
      beginSalvo();
    } else {
      els.fleetNote.textContent = `Placing: ${FLEET[game.placing.shipIndex].name} (${FLEET[game.placing.shipIndex].size})`;
      render();
    }
  }

  /* ------------------------------------------------------------------ *
   * Boot                                                                *
   * ------------------------------------------------------------------ */

  els.rotateButton.addEventListener("click", () => {
    game.horizontal = !game.horizontal;
    GameHubJuice.tick();
    render();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "h" || event.key === "H" || event.key === "r" || event.key === "R") {
      if (game.phase === "placing") {
        game.horizontal = !game.horizontal;
        render();
      }
    }
  });
  els.autoPlace.addEventListener("click", () => {
    if (game.phase !== "placing") return;
    autoPlaceFleet(game.playerFleet);
    GameHubJuice.sweep();
    els.fleetNote.textContent = "Fleet ready";
    beginSalvo();
  });
  els.playButton.addEventListener("click", startBattle);
  els.soundButton.addEventListener("click", () => {
    if (!window.GameHubJuice) return;
    GameHubJuice.muted = !GameHubJuice.muted;
    els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  });

  if (window.GameHubJuice) els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  render();
})();
