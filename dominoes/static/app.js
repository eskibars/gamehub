/*
 * Dominoes — the classic blocking game against one to three robots on a
 * double-six set. Match an open end, draw from the boneyard when stuck,
 * and win by going out first or by holding the fewest pips when the game
 * blocks. Doubles sit crosswise on the line.
 */
(() => {
  "use strict";

  const els = {
    opponents: document.querySelector("#opponents"),
    chain: document.querySelector("#chain"),
    boneyard: document.querySelector("#boneyard"),
    statusLine: document.querySelector("#statusLine"),
    hand: document.querySelector("#hand"),
    handLabel: document.querySelector("#endHints"),
    overlay: document.querySelector("#overlay"),
    overlayTitle: document.querySelector("#overlayTitle"),
    overlaySub: document.querySelector("#overlaySub"),
    playButton: document.querySelector("#playButton"),
    soundButton: document.querySelector("#soundButton"),
    oppRow: document.querySelector("#oppRow"),
    roundsWon: document.querySelector("#roundsWon"),
  };

  const STATE_KEY = "gamehub-dominoes-v1";

  const game = {
    boneyard: [],
    chain: [],       // [{a, b, double, flipped}] laid left→right; open ends chain[0].a and chain.at(-1).b
    players: [],     // { id, name, robot, hand: [{a,b}] }
    turn: 0,
    roundsWon: 0,
    roundsPlayed: 0,
    running: false,
    selected: null,  // tile index in human hand
    robotTimer: null,
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    game.roundsWon = saved.roundsWon || 0;
    game.roundsPlayed = saved.roundsPlayed || 0;
  } catch {
    // Fresh install.
  }
  els.roundsWon.textContent = game.roundsWon;

  function persist() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        roundsWon: game.roundsWon,
        roundsPlayed: game.roundsPlayed,
      }));
    } catch {
      // Storage unavailable.
    }
  }

  /* ------------------------------------------------------------------ *
   * Setup                                                               *
   * ------------------------------------------------------------------ */

  function buildSet() {
    const tiles = [];
    for (let a = 0; a <= 6; a += 1) {
      for (let b = a; b <= 6; b += 1) tiles.push({ a, b });
    }
    for (let i = tiles.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    return tiles;
  }

  function pips(player) {
    return player.hand.reduce((sum, t) => sum + t.a + t.b, 0);
  }

  function deal() {
    const oppCount = Number(els.oppRow.querySelector("input[name=opps]:checked").value);
    const deck = buildSet();
    game.players = [{ id: 0, name: "You", robot: false, hand: [] }];
    for (let i = 0; i < oppCount; i += 1) {
      game.players.push({ id: i + 1, name: `Robot ${i + 1}`, robot: true, hand: [] });
    }
    const perHand = game.players.length === 2 ? 7 : 5;
    for (let round = 0; round < perHand; round += 1) {
      for (const player of game.players) player.hand.push(deck.pop());
    }
    game.boneyard = deck;
    game.chain = [];
    game.selected = null;

    // Highest double opens; otherwise the heaviest tile.
    let opener = 0;
    let bestKey = -1;
    game.players.forEach((player, index) => {
      for (const tile of player.hand) {
        const key = tile.a === tile.b ? 100 + tile.a : tile.a + tile.b;
        if (key > bestKey) { bestKey = key; opener = index; }
      }
    });
    game.turn = opener;
    game.running = true;
    els.overlay.hidden = true;
    render();
    if (game.players[opener].robot) scheduleRobot();
    else els.statusLine.textContent = "You hold the opener — play any tile";
  }

  /* ------------------------------------------------------------------ *
   * Rules                                                               *
   * ------------------------------------------------------------------ */

  function openEnds() {
    if (!game.chain.length) return null; // opening move: any tile
    return { left: game.chain[0].a, right: game.chain[game.chain.length - 1].b };
  }

  function legalPlacements(tile) {
    const ends = openEnds();
    if (!ends) return ["left"]; // first tile of the round
    const spots = [];
    if (tile.a === ends.left || tile.b === ends.left) spots.push("left");
    if (tile.a === ends.right || tile.b === ends.right) spots.push("right");
    return [...new Set(spots)];
  }

  function place(tile, side, byIndex) {
    const player = game.players[byIndex];
    const handIndex = player.hand.indexOf(tile);
    if (handIndex === -1) return false;
    const spots = legalPlacements(tile);
    if (!spots.length) return false;
    const chosen = spots.includes(side) ? side : spots[0];

    if (!game.chain.length) {
      game.chain.push({ a: tile.a, b: tile.b, double: tile.a === tile.b });
    } else if (chosen === "left") {
      const end = game.chain[0].a;
      if (tile.b === end) game.chain.unshift({ a: tile.a, b: tile.b, double: tile.a === tile.b });
      else game.chain.unshift({ a: tile.b, b: tile.a, double: tile.a === tile.b });
    } else {
      const end = game.chain[game.chain.length - 1].b;
      if (tile.a === end) game.chain.push({ a: tile.a, b: tile.b, double: tile.a === tile.b });
      else game.chain.push({ a: tile.b, b: tile.a, double: tile.a === tile.b });
    }
    player.hand.splice(handIndex, 1);
    return true;
  }

  function drawUntilPlayable(player) {
    let drew = 0;
    for (;;) {
      if (!game.boneyard.length) return drew;
      const tile = game.boneyard.pop();
      player.hand.push(tile);
      drew += 1;
      if (legalPlacements(tile).length) return drew;
    }
  }

  /* ------------------------------------------------------------------ *
   * Turns                                                               *
   * ------------------------------------------------------------------ */

  function advance() {
    game.turn = (game.turn + 1) % game.players.length;
    render();
    const player = game.players[game.turn];
    if (player.robot) {
      scheduleRobot();
    } else {
      const anyLegal = player.hand.some((t) => legalPlacements(t).length);
      els.statusLine.textContent = anyLegal || game.boneyard.length
        ? "Your move — tap a glowing tile"
        : "No plays and the boneyard is dry — pass";
    }
  }

  function scheduleRobot() {
    if (game.robotTimer) clearTimeout(game.robotTimer);
    if (!game.running) return;
    const player = game.players[game.turn];
    if (!player.robot) return;
    game.robotTimer = setTimeout(() => {
      if (!game.running) return;
      robotMove(player);
    }, 800 + Math.random() * 500);
  }

  function robotMove(player) {
    const playable = player.hand
      .map((tile) => ({ tile, spots: legalPlacements(tile) }))
      .filter((entry) => entry.spots.length);
    if (playable.length) {
      // Heaviest tile first, doubles preferred as openers of long lines.
      playable.sort((x, y) => {
        const vx = x.tile.a + x.tile.b + (x.tile.a === x.tile.b ? 2 : 0);
        const vy = y.tile.a + y.tile.b + (y.tile.a === y.tile.b ? 2 : 0);
        return vy - vx;
      });
      const pick = playable[0];
      const side = pick.spots.includes("right") ? "right" : pick.spots[0];
      place(pick.tile, side, player.id);
      GameHubJuice.pop(300);
      render();
      afterPlay(player);
      return;
    }
    if (game.boneyard.length) {
      const drew = drawUntilPlayable(player);
      els.statusLine.textContent = `${player.name} draws ${drew} from the boneyard`;
      GameHubJuice.tick();
      render();
      setTimeout(() => {
        if (game.running) robotMove(player);
      }, 650);
      return;
    }
    els.statusLine.textContent = `${player.name} passes`;
    setTimeout(advance, 600);
  }

  function afterPlay(player) {
    if (!player.hand.length) {
      endRound(player, "domino");
      return;
    }
    advance();
  }

  function checkBlocked() {
    if (game.boneyard.length) return false;
    return game.players.every((player) =>
      !player.hand.some((tile) => legalPlacements(tile).length));
  }

  function endRound(winner, how) {
    game.running = false;
    game.roundsPlayed += 1;
    if (game.robotTimer) clearTimeout(game.robotTimer);
    if (winner.id === 0) {
      game.roundsWon += 1;
      els.roundsWon.textContent = game.roundsWon;
    }
    persist();

    const chips = winner.id === 0 ? 3 + game.players.length - 1 : 1;
    if (winner.id === 0) {
      GameHubProfile?.achieve("dominoes-win");
      if (game.roundsWon >= 5) GameHubProfile?.achieve("dominoes-5");
      GameHubProfile?.award("dominoes", chips,
        how === "domino" ? "Went domino!" : "Won the block", game.roundsWon);
      GameHubJuice.win();
    } else {
      GameHubProfile?.award("dominoes", 1, "Played a round of Dominoes", game.roundsWon);
      GameHubJuice.lose();
    }

    const blocked = how === "block";
    const standings = [...game.players]
      .map((p) => `${p.name}: ${pips(p)} pips`)
      .join(" · ");
    els.overlayTitle.textContent =
      winner.id === 0 ? (how === "domino" ? "Domino! 🁣" : "You win the block!") : `${winner.name} wins`;
    els.overlaySub.textContent = blocked
      ? `Game blocked. ${standings}`
      : `${winner.name} emptied the hand. +${chips} chips`;
    els.playButton.textContent = "Deal again";
    els.overlay.hidden = false;
  }

  /* ------------------------------------------------------------------ *
   * Rendering                                                           *
   * ------------------------------------------------------------------ */

  function dominoElement(tile, { horizontal = false, back = false, faceClass = "" } = {}) {
    const el = document.createElement("div");
    el.className = `domino${horizontal ? " horizontal" : ""}${back ? " back" : ""}${faceClass ? " " + faceClass : ""}`;
    if (back) return el;
    const pipHTML = (value) => {
      const layout = {
        0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
        5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
      }[value];
      const cells = [];
      for (let i = 0; i < 9; i += 1) {
        cells.push(`<span class="pip${layout.includes(i) ? "" : " hidden-pip"}"></span>`);
      }
      return cells.join("");
    };
    el.innerHTML = `<span class="half">${pipHTML(tile.a)}</span><span class="half">${pipHTML(tile.b)}</span>`;
    return el;
  }

  function render() {
    // Opponents
    els.opponents.innerHTML = "";
    for (const player of game.players) {
      if (!player.robot) continue;
      const div = document.createElement("div");
      div.className = player.id === game.turn && game.running ? "opp active" : "opp";
      const name = document.createElement("span");
      name.textContent = player.name;
      const count = document.createElement("span");
      count.textContent = `${player.hand.length} tile${player.hand.length === 1 ? "" : "s"} · ${pips(player)} pips`;
      div.append(name, count);
      els.opponents.append(div);
    }

    // Chain: doubles render crosswise (vertical) between horizontal tiles.
    els.chain.innerHTML = "";
    for (const link of game.chain) {
      const el = dominoElement(link, { horizontal: !link.double });
      els.chain.append(el);
    }
    els.boneyard.textContent = `🁫 ${game.boneyard.length} in boneyard`;

    // Ends hint
    const ends = openEnds();
    els.handLabel.textContent = ends ? `· open ends ${ends.left} and ${ends.right}` : "· opening move";

    // Hand
    els.hand.innerHTML = "";
    const human = game.players[0];
    if (!human) return;
    human.hand.forEach((tile, index) => {
      const spots = game.running ? legalPlacements(tile) : [];
      const isPlaying = game.selected === index;
      const el = dominoElement(tile, {
        faceClass: isPlaying ? "playing" : spots.length && game.turn === 0 ? "playable" : "dead",
      });
      el.addEventListener("click", () => onHandClick(index));
      els.hand.append(el);
    });

    if (game.running) {
      const player = game.players[game.turn];
      if (player.robot) els.statusLine.textContent = `${player.name} is thinking…`;
    }
  }

  function onHandClick(index) {
    if (!game.running || game.turn !== 0) return;
    const human = game.players[0];
    const tile = human.hand[index];
    const spots = legalPlacements(tile);
    if (!spots.length) {
      GameHubJuice.tick();
      els.statusLine.textContent = game.boneyard.length
        ? "That tile doesn't match — tap the boneyard to draw"
        : "That tile doesn't match either end";
      return;
    }
    if (spots.length === 1 && !game.chain.length) {
      commitHuman(tile, "left");
      return;
    }
    if (spots.length === 1) {
      commitHuman(tile, spots[0]);
      return;
    }
    // Both ends possible — ask.
    game.selected = index;
    render();
    askEnd(tile, spots);
  }

  function askEnd(tile, spots) {
    const existing = document.querySelector(".end-choice");
    if (existing) existing.remove();
    const wrap = document.createElement("div");
    wrap.className = "end-choice";
    const dialog = document.createElement("div");
    dialog.className = "end-dialog";
    const title = document.createElement("h3");
    title.textContent = "Build on which end?";
    const row = document.createElement("div");
    row.className = "end-buttons";
    const ends = openEnds();
    for (const side of ["left", "right"]) {
      if (!spots.includes(side)) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `<span style="font-size:1.3rem">${side === "left" ? "◀" : "▶"}</span><span>${side} · ${side === "left" ? ends.left : ends.right}</span>`;
      button.addEventListener("click", () => {
        wrap.remove();
        commitHuman(tile, side);
      });
      row.append(button);
    }
    dialog.append(title, row);
    wrap.append(dialog);
    document.body.append(wrap);
    wrap.addEventListener("click", (event) => {
      if (event.target === wrap) {
        wrap.remove();
        game.selected = null;
        render();
      }
    });
  }

  function commitHuman(tile, side) {
    const human = game.players[0];
    if (!place(tile, side, 0)) return;
    game.selected = null;
    GameHubJuice.pop(520);
    render();
    if (!human.hand.length) {
      endRound(human, "domino");
      return;
    }
    advance();
  }

  /* ------------------------------------------------------------------ *
   * Human draw / pass                                                   *
   * ------------------------------------------------------------------ */

  function humanNeedsDraw() {
    const human = game.players[0];
    return !human.hand.some((tile) => legalPlacements(tile).length);
  }

  els.boneyard.addEventListener("click", () => {
    if (!game.running || game.turn !== 0) return;
    if (!humanNeedsDraw()) {
      els.statusLine.textContent = "You have a play — no need to draw";
      return;
    }
    if (!game.boneyard.length) {
      els.statusLine.textContent = "Boneyard is empty — pass";
      game.turn = (game.turn + 1) % game.players.length;
      render();
      scheduleRobot();
      return;
    }
    const drew = drawUntilPlayable(game.players[0]);
    GameHubJuice.drop();
    els.statusLine.textContent = drew === 1 ? "Drew 1 tile" : `Drew ${drew} tiles until a play`;
    render();
  });

  els.playButton.addEventListener("click", deal);
  els.oppRow.addEventListener("change", () => {
    GameHubJuice.tick();
    showMenu();
  });
  els.soundButton.addEventListener("click", () => {
    if (!window.GameHubJuice) return;
    GameHubJuice.muted = !GameHubJuice.muted;
    els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  });

  function showMenu() {
    game.running = false;
    if (game.robotTimer) clearTimeout(game.robotTimer);
    els.overlayTitle.textContent = "Dominoes";
    els.overlaySub.textContent = "Match the open ends, draw when stuck, go out first — or win the block with the lowest pip count.";
    els.playButton.textContent = game.roundsPlayed ? "Deal again" : "Deal";
    els.overlay.hidden = false;
    // Face-down table behind the menu.
    game.players = [];
    game.chain = [];
    game.boneyard = [];
    render();
    els.statusLine.textContent = "";
  }

  if (window.GameHubJuice) els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  showMenu();
})();
