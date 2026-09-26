/*
 * Mancala (Kalah) — sow seeds counter-clockwise, land in your store for an
 * extra turn, land in an empty pit on your side to capture the opposite
 * pit. First to empty their row sweeps the rest. Two robot strengths: Easy
 * plays with feel, Sharp runs a short greedy search with capture/extra-turn
 * awareness.
 */
(() => {
  "use strict";

  const els = {
    board: document.querySelector("#board"),
    pitsTop: document.querySelector("#pitsTop"),
    pitsBottom: document.querySelector("#pitsBottom"),
    storeTopCount: document.querySelector("#storeTopCount"),
    storeBottomCount: document.querySelector("#storeBottomCount"),
    statusLine: document.querySelector("#statusLine"),
    topPips: document.querySelector("#topPips"),
    bottomPips: document.querySelector("#bottomPips"),
    overlay: document.querySelector("#overlay"),
    overlayTitle: document.querySelector("#overlayTitle"),
    overlaySub: document.querySelector("#overlaySub"),
    playButton: document.querySelector("#playButton"),
    newGameButton: document.querySelector("#newGameButton"),
    soundButton: document.querySelector("#soundButton"),
    diffRow: document.querySelector("#diffRow"),
    gamesWon: document.querySelector("#gamesWon"),
  };

  const STATE_KEY = "gamehub-mancala-v1";
  const PLAYER_STORE = 6;
  const ROBOT_STORE = 13;

  const game = {
    pits: new Array(14).fill(4),
    turn: 0, // 0 = player (bottom), 1 = robot (top)
    difficulty: "easy",
    running: false,
    busy: false,
    gamesWon: 0,
    gamesPlayed: 0,
    robotTimer: null,
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    game.gamesWon = saved.gamesWon || 0;
    game.gamesPlayed = saved.gamesPlayed || 0;
  } catch {
    // Fresh install.
  }
  els.gamesWon.textContent = game.gamesWon;

  function persist() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        gamesWon: game.gamesWon,
        gamesPlayed: game.gamesPlayed,
      }));
    } catch {
      // Storage unavailable.
    }
  }

  /* ------------------------------------------------------------------ *
   * Rules (pure helpers, shared with the robot's simulations)           *
   * ------------------------------------------------------------------ */

  const isOwn = (index, player) =>
    player === 0 ? index >= 0 && index <= 5 : index >= 7 && index <= 12;

  const ownStore = (player) => (player === 0 ? PLAYER_STORE : ROBOT_STORE);
  const oppStore = (player) => (player === 0 ? ROBOT_STORE : PLAYER_STORE);

  // Sow one seed clockwise from `index`; returns the resting pit.
  function sowStep(pits, index, player) {
    let cursor = (index + 1) % 14;
    while (cursor === oppStore(player)) {
      cursor = (cursor + 1) % 14;
    }
    pits[cursor] += 1;
    return cursor;
  }

  // Full move on a copied board: returns { pits, extraTurn } or null if illegal.
  function simulateMove(pits, player, pit) {
    if (pits[pit] === 0 || !isOwn(pit, player)) return null;
    const next = pits.slice();
    next[pit] = 0;
    let remaining = pits[pit];
    let cursor = pit;
    while (remaining > 0) {
      cursor = (cursor + 1) % 14;
      if (cursor === oppStore(player)) continue;
      next[cursor] += 1;
      remaining -= 1;
    }
    const last = cursor;
    let extraTurn = false;
    if (last === ownStore(player)) {
      extraTurn = true;
    } else if (isOwn(last, player) && next[last] === 1) {
      const opposite = 12 - last; // 0↔12, 1↔11, … 5↔7
      if (next[opposite] > 0) {
        next[ownStore(player)] += next[opposite] + 1;
        next[opposite] = 0;
        next[last] = 0;
      }
    }
    return { pits: next, extraTurn };
  }

  function sweepIfEnded(pits) {
    const playerEmpty = pits.slice(0, 6).every((v) => v === 0);
    const robotEmpty = pits.slice(7, 13).every((v) => v === 0);
    if (!playerEmpty && !robotEmpty) return false;
    if (playerEmpty) {
      for (let i = 7; i <= 12; i += 1) { pits[ROBOT_STORE] += pits[i]; pits[i] = 0; }
    }
    if (robotEmpty) {
      for (let i = 0; i <= 5; i += 1) { pits[PLAYER_STORE] += pits[i]; pits[i] = 0; }
    }
    return true;
  }

  function legalMoves(pits, player) {
    const moves = [];
    const from = player === 0 ? 0 : 7;
    for (let i = from; i < from + 6; i += 1) {
      if (pits[i] > 0) moves.push(i);
    }
    return moves;
  }

  /* ------------------------------------------------------------------ *
   * Robot                                                               *
   * ------------------------------------------------------------------ */

  function chooseRobotMove() {
    const moves = legalMoves(game.pits, 1);
    if (!moves.length) return null;
    if (game.difficulty === "easy") {
      const extra = moves.filter((pit) => {
        const result = simulateMove(game.pits, 1, pit);
        return result && result.extraTurn;
      });
      if (extra.length && Math.random() < 0.4) {
        return extra[Math.floor(Math.random() * extra.length)];
      }
      return moves[Math.floor(Math.random() * moves.length)];
    }
    // Sharp: greedy 1-ply plus follow-up value; small randomness for variety.
    let best = null;
    let bestScore = -Infinity;
    for (const pit of moves) {
      const result = simulateMove(game.pits, 1, pit);
      if (!result) continue;
      let score = result.pits[ROBOT_STORE] - result.pits[PLAYER_STORE];
      if (result.extraTurn) {
        let follow = 0;
        for (const pit2 of legalMoves(result.pits, 1)) {
          const r2 = simulateMove(result.pits, 1, pit2);
          if (!r2) continue;
          follow = Math.max(follow, r2.pits[ROBOT_STORE] - r2.pits[PLAYER_STORE] + (r2.extraTurn ? 2 : 0));
        }
        score += 3 + follow;
      }
      let ownSeeds = 0;
      for (let i = 7; i <= 12; i += 1) ownSeeds += result.pits[i];
      score += ownSeeds * 0.05;
      score += Math.random() * 0.8;
      if (score > bestScore) { bestScore = score; best = pit; }
    }
    return best;
  }

  /* ------------------------------------------------------------------ *
   * Turn flow                                                           *
   * ------------------------------------------------------------------ */

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function playMove(player, pit) {
    game.busy = true;
    render();

    const seeds = game.pits[pit];
    game.pits[pit] = 0;
    render();
    let last = pit;
    for (let s = 0; s < seeds; s += 1) {
      last = sowStep(game.pits, last, player);
      render();
      GameHubJuice.pop(330 + (s % 5) * 35);
      await sleep(90);
    }
    let extraTurn = false;
    let captured = false;
    if (last === ownStore(player)) {
      extraTurn = true;
      GameHubJuice.coin();
    } else if (isOwn(last, player) && game.pits[last] === 1) {
      const opposite = 12 - last;
      if (game.pits[opposite] > 0) {
        game.pits[ownStore(player)] += game.pits[opposite] + 1;
        game.pits[opposite] = 0;
        game.pits[last] = 0;
        captured = true;
        GameHubJuice.sweep();
      }
    }
    render();

    if (sweepIfEnded(game.pits)) {
      render();
      endGame();
      return;
    }

    if (extraTurn) {
      els.statusLine.textContent = player === 0
        ? "Landed in your store — go again!"
        : "Robot lands in its store — extra turn";
      game.busy = false;
      render();
      if (player === 1) scheduleRobot();
      return;
    }

    game.turn = player === 0 ? 1 : 0;
    game.busy = false;
    render();
    if (game.turn === 1) {
      scheduleRobot();
    } else {
      els.statusLine.textContent = "Your move";
    }
  }

  function scheduleRobot() {
    if (game.robotTimer) clearTimeout(game.robotTimer);
    if (!game.running || game.turn !== 1) return;
    game.robotTimer = setTimeout(() => {
      if (!game.running) return;
      const pit = chooseRobotMove();
      if (pit === null) return;
      playMove(1, pit);
    }, 650);
  }

  function endGame() {
    game.running = false;
    if (game.robotTimer) clearTimeout(game.robotTimer);
    const myScore = game.pits[PLAYER_STORE];
    const robotScore = game.pits[ROBOT_STORE];
    game.gamesPlayed += 1;
    const won = myScore > robotScore;
    const chips = won ? (game.difficulty === "hard" ? 6 : 3) : myScore === robotScore ? 2 : 1;
    if (won) {
      game.gamesWon += 1;
      els.gamesWon.textContent = game.gamesWon;
      GameHubProfile?.achieve("mancala-win");
      if (game.gamesWon >= 5) GameHubProfile?.achieve("mancala-5");
      GameHubProfile?.award("mancala", chips,
        `Won ${myScore}–${robotScore} vs ${game.difficulty === "hard" ? "Sharp" : "Easy"} robot`, game.gamesWon);
      GameHubJuice.win();
    } else if (myScore === robotScore) {
      GameHubProfile?.award("mancala", chips, `Tied ${myScore}–${robotScore}`, 0);
      GameHubJuice.levelUp();
    } else {
      GameHubProfile?.award("mancala", chips, `Lost ${myScore}–${robotScore}`, 0);
      GameHubJuice.lose();
    }
    persist();
    els.overlayTitle.textContent =
      won ? "You win the harvest! 🌾" : myScore === robotScore ? "Dead even!" : "Robot takes it";
    els.overlaySub.textContent = `${myScore} – ${robotScore} · +${chips} chips`;
    els.playButton.textContent = "Play again";
    els.overlay.hidden = false;
  }

  /* ------------------------------------------------------------------ *
   * Rendering                                                           *
   * ------------------------------------------------------------------ */

  function render() {
    const pits = game.pits;
    els.storeTopCount.textContent = pits[ROBOT_STORE];
    els.storeBottomCount.textContent = pits[PLAYER_STORE];
    els.topPips.textContent = pits[ROBOT_STORE];
    els.bottomPips.textContent = pits[PLAYER_STORE];

    renderRow(els.pitsTop, 7, 1);
    renderRow(els.pitsBottom, 0, 0);
  }

  function renderRow(rowEl, start, player) {
    const existing = rowEl.children;
    for (let i = 0; i < 6; i += 1) {
      const index = start + i;
      let pit = existing[i];
      if (!pit) {
        pit = document.createElement("div");
        pit.className = "pit";
        const count = document.createElement("span");
        count.className = "count";
        pit.append(count);
        pit.addEventListener("click", () => {
          if (!game.running || game.turn !== 0 || game.busy) return;
          if (game.pits[index] === 0) return;
          playMove(0, index);
        });
        rowEl.append(pit);
      }
      const count = pit.querySelector(".count");
      const value = game.pits[index];
      count.textContent = value;
      count.classList.toggle("zero", value === 0);
      const playable = game.running && game.turn === 0 && !game.busy &&
        player === 0 && value > 0;
      pit.classList.toggle("playable", Boolean(playable));
    }
  }

  /* ------------------------------------------------------------------ *
   * Boot                                                                *
   * ------------------------------------------------------------------ */

  function newGame() {
    if (game.robotTimer) clearTimeout(game.robotTimer);
    game.pits = new Array(14).fill(4);
    game.turn = 0;
    game.running = true;
    game.busy = false;
    game.difficulty = els.diffRow.querySelector("input[name=diff]:checked").value;
    els.overlay.hidden = true;
    els.statusLine.textContent = "Your move";
    render();
  }

  els.playButton.addEventListener("click", newGame);
  els.newGameButton.addEventListener("click", newGame);
  els.diffRow.addEventListener("change", () => {
    GameHubJuice.tick();
    if (game.running) newGame();
  });
  els.soundButton.addEventListener("click", () => {
    if (!window.GameHubJuice) return;
    GameHubJuice.muted = !GameHubJuice.muted;
    els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  });

  if (window.GameHubJuice) els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  render();
})();
