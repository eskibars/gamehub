/*
 * Gomoku — five in a row on a 15×15 board. Black (you) opens in the
 * center; the robot answers with a threat-aware engine: it takes an
 * immediate win, blocks an immediate loss, then scores every candidate
 * cell by the patterns it would build or deny along all four axes.
 */
(() => {
  "use strict";

  const SIZE = 15;
  const EMPTY = 0;
  const BLACK = 1;  // player
  const WHITE = -1; // robot

  const els = {
    board: document.querySelector("#board"),
    statusLine: document.querySelector("#statusLine"),
    overlay: document.querySelector("#overlay"),
    overlayTitle: document.querySelector("#overlayTitle"),
    overlaySub: document.querySelector("#overlaySub"),
    playButton: document.querySelector("#playButton"),
    diffRow: document.querySelector("#diffRow"),
    gamesWon: document.querySelector("#gamesWon"),
    soundButton: document.querySelector("#soundButton"),
  };

  const STATE_KEY = "gamehub-gomoku-v1";

  const game = {
    board: new Int8Array(SIZE * SIZE),
    running: false,
    busy: false,
    difficulty: "easy",
    lastMove: -1,
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

  const idx = (x, y) => y * SIZE + x;
  const inBoard = (x, y) => x >= 0 && x < SIZE && y >= 0 && y < SIZE;

  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  function winAt(index, player) {
    const x = index % SIZE, y = Math.floor(index / SIZE);
    for (const [dx, dy] of DIRS) {
      let count = 1;
      for (let step = 1; step < 5; step += 1) {
        const nx = x + dx * step, ny = y + dy * step;
        if (!inBoard(nx, ny) || game.board[idx(nx, ny)] !== player) break;
        count += 1;
      }
      for (let step = 1; step < 5; step += 1) {
        const nx = x - dx * step, ny = y - dy * step;
        if (!inBoard(nx, ny) || game.board[idx(nx, ny)] !== player) break;
        count += 1;
      }
      if (count >= 5) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ *
   * Robot brain                                                         *
   * ------------------------------------------------------------------ */

  // Score what placing `player` at index contributes along all four axes.
  function lineScore(board, index, player) {
    const x = index % SIZE, y = Math.floor(index / SIZE);
    let total = 0;
    for (const [dx, dy] of DIRS) {
      let run = 1;
      let openEnds = 0;
      for (const sign of [1, -1]) {
        let step = 1;
        for (; step < 5; step += 1) {
          const nx = x + dx * step * sign, ny = y + dy * step * sign;
          if (!inBoard(nx, ny)) break;
          const cell = board[idx(nx, ny)];
          if (cell === player) { run += 1; continue; }
          if (cell === EMPTY) openEnds += 1;
          break;
        }
        if (step === 5) openEnds += 1;
      }
      if (run >= 5) total += 100000;
      else if (run === 4) total += openEnds >= 2 ? 12000 : openEnds === 1 ? 4000 : 0;
      else if (run === 3) total += openEnds >= 2 ? 2200 : openEnds === 1 ? 500 : 0;
      else if (run === 2) total += openEnds >= 2 ? 420 : openEnds === 1 ? 90 : 0;
      else total += openEnds * 12;
    }
    return total;
  }

  function immediateWin(board, player) {
    for (let i = 0; i < SIZE * SIZE; i += 1) {
      if (board[i] !== EMPTY) continue;
      board[i] = player;
      const won = winAtBoard(board, i, player);
      board[i] = EMPTY;
      if (won) return i;
    }
    return -1;
  }

  function winAtBoard(board, index, player) {
    const x = index % SIZE, y = Math.floor(index / SIZE);
    for (const [dx, dy] of DIRS) {
      let count = 1;
      for (const sign of [1, -1]) {
        for (let step = 1; step < 5; step += 1) {
          const nx = x + dx * step * sign, ny = y + dy * step * sign;
          if (!inBoard(nx, ny) || board[idx(nx, ny)] !== player) break;
          count += 1;
        }
      }
      if (count >= 5) return true;
    }
    return false;
  }

  function candidateMoves(board, radius = 2) {
    const candidates = new Set();
    let any = false;
    for (let i = 0; i < SIZE * SIZE; i += 1) {
      if (board[i] === EMPTY) continue;
      any = true;
      const x = i % SIZE, y = Math.floor(i / SIZE);
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx, ny = y + dy;
          if (inBoard(nx, ny) && board[idx(nx, ny)] === EMPTY) candidates.add(idx(nx, ny));
        }
      }
    }
    if (!any) return [idx(7, 7)]; // opening move
    return [...candidates];
  }

  function chooseRobotMove() {
    const board = game.board;
    // 1. Win now.
    const win = immediateWin(board, WHITE);
    if (win >= 0) return win;
    // 2. Block the player's immediate win.
    const block = immediateWin(board, BLACK);
    if (block >= 0) return block;
    // 3. Score candidates by what they build for white and deny from black.
    const moves = candidateMoves(board, game.difficulty === "sharp" ? 2 : 1);
    let best = moves[0];
    let bestScore = -Infinity;
    for (const move of moves) {
      board[move] = WHITE;
      const offense = lineScore(board, move, WHITE);
      board[move] = EMPTY;
      board[move] = BLACK;
      const defense = lineScore(board, move, BLACK);
      board[move] = EMPTY;
      let score = offense + defense * 0.92;
      if (game.difficulty === "easy") score += Math.random() * 1800;
      else score += Math.random() * 140;
      if (score > bestScore) { bestScore = score; best = move; }
    }
    return best;
  }

  /* ------------------------------------------------------------------ *
   * Flow                                                                *
   * ------------------------------------------------------------------ */

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function place(index, player) {
    game.board[index] = player;
    game.lastMove = index;
    if (player === BLACK) GameHubJuice.pop(380);
    else GameHubJuice.pop(260);
    render();
    if (winAt(index, player)) {
      endGame(player);
      return true;
    }
    if (game.board.every((v) => v !== EMPTY)) {
      endGame(EMPTY);
      return true;
    }
    return false;
  }

  async function playerMove(index) {
    if (!game.running || game.busy || game.board[index] !== EMPTY) return;
    if (place(index, BLACK)) return;
    game.busy = true;
    game.turnRobot = true;
    els.statusLine.textContent = "Robot is thinking…";
    render();
    game.robotTimer = setTimeout(async () => {
      const move = chooseRobotMove();
      if (move === undefined || move < 0) { game.busy = false; return; }
      if (place(move, WHITE)) { game.busy = false; return; }
      game.busy = false;
      els.statusLine.textContent = "Your move";
      render();
    }, 550);
  }

  function endGame(winner) {
    game.running = false;
    if (game.robotTimer) clearTimeout(game.robotTimer);
    game.gamesPlayed += 1;
    if (winner === BLACK) {
      game.gamesWon += 1;
      els.gamesWon.textContent = game.gamesWon;
      const chips = game.difficulty === "sharp" ? 6 : 3;
      GameHubProfile?.achieve("gomoku-win");
      if (game.gamesWon >= 5) GameHubProfile?.achieve("gomoku-5");
      GameHubProfile?.award("gomoku", chips,
        `Five in a row vs ${game.difficulty === "sharp" ? "Sharp" : "Easy"} robot`, game.gamesWon);
      GameHubJuice.win();
    } else if (winner === WHITE) {
      GameHubProfile?.award("gomoku", 1, "Fought the robot to a loss", 0);
      GameHubJuice.lose();
    } else {
      GameHubProfile?.award("gomoku", 2, "Board full — a draw", 0);
      GameHubJuice.levelUp();
    }
    persist();
    els.overlayTitle.textContent =
      winner === BLACK ? "Five in a row! ⚫" : winner === WHITE ? "The robot lines five ⚪" : "Board full — draw";
    els.overlaySub.textContent = winner === BLACK
      ? `+${game.difficulty === "sharp" ? 6 : 3} chips · ${game.gamesWon} wins`
      : winner === WHITE ? "It found its line first. Rematch?" : "Every stone placed, nobody connected five.";
    els.playButton.textContent = "Play again";
    els.overlay.hidden = false;
  }

  /* ------------------------------------------------------------------ *
   * Rendering                                                           *
   * ------------------------------------------------------------------ */

  function render() {
    els.board.innerHTML = "";
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const index = idx(x, y);
        const point = document.createElement("div");
        point.className = "point";
        if ((x === 3 || x === 7 || x === 11) && (y === 3 || y === 7 || y === 11)) {
          point.classList.add("star");
        }
        const value = game.board[index];
        if (value !== EMPTY) {
          const stone = document.createElement("div");
          stone.className = `stone ${value === BLACK ? "black" : "white"}`;
          if (index === game.lastMove) stone.classList.add("last");
          point.append(stone);
        }
        point.addEventListener("click", () => playerMove(index));
        els.board.append(point);
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Boot                                                                *
   * ------------------------------------------------------------------ */

  function newGame() {
    if (game.robotTimer) clearTimeout(game.robotTimer);
    game.board = new Int8Array(SIZE * SIZE);
    game.lastMove = -1;
    game.running = true;
    game.busy = false;
    game.difficulty = els.diffRow.querySelector("input[name=diff]:checked").value;
    els.overlay.hidden = true;
    els.statusLine.textContent = "Your move — black plays first";
    render();
  }

  els.playButton.addEventListener("click", newGame);
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
