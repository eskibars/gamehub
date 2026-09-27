/*
 * Roll-a-Bug — the school-classic roll-and-draw party game, pass-and-play.
 * Roll the die: 1 body, 2 head, 3 spots, 4 wings, 5 antennae, 6 feet. Draw
 * the part you rolled onto your own canvas with your own hand. First bug
 * with all six parts wins, then the gallery compares everyone's art.
 *
 * House rules: "School classic" lets you draw parts in any rolled order
 * (spots before body is the joke); "Proper bug" gates parts behind their
 * prerequisites; the extra challenge makes you roll each number N times
 * before you may draw it.
 */
(() => {
  "use strict";

  const PARTS = [
    { name: "body", glyph: "🍅" },
    { name: "head", glyph: "⚫" },
    { name: "spots", glyph: "🔴" },
    { name: "wings", glyph: "🪽" },
    { name: "antennae", glyph: "🥢" },
    { name: "feet", glyph: "🐾" },
  ];
  const PREREQS = {
    body: [],
    head: ["body"],
    spots: ["body"],
    wings: ["body"],
    feet: ["body"],
    antennae: ["head"],
  };
  const AVATARS = ["🐞", "🦋", "🐝", "🐛", "🦗", "🕷️", "🐢", "🦔"];
  const BRUSH_COLORS = ["#20231f", "#d0342c", "#e8874e", "#2f8c5a", "#3565b8", "#8a4a8c"];
  const BRUSH_SIZES = [4, 10, 22];
  const CANVAS_SIZE = 512;
  const SAVE_KEY = "gamehub-rollbug-v1";

  const els = {};
  [
    "playerRows", "addPlayer", "modeRow", "streakRow", "startButton",
    "resumeRow", "resumeButton", "discardButton", "referenceBugSetup",
    "setupScreen", "gameScreen", "turnAvatar", "turnName", "turnSub",
    "die", "dieFace", "rollButton", "statusLine", "partsGrid", "rollLog",
    "quitButton", "passOverlay", "passName", "imReady", "drawOverlay",
    "drawPart", "referenceThumb", "drawCanvas", "swatches", "sizes",
    "undoButton", "clearButton", "doneButton", "galleryOverlay",
    "galleryTitle", "gallerySub", "galleryGrid", "againButton",
    "galleryClose", "peekButton", "soundButton",
  ].forEach((id) => { els[id] = document.getElementById(id); });

  const game = {
    phase: "setup", // setup | passing | rolling | drawing | done
    players: [],
    current: 0,
    mode: "jumble",
    streak: 1,
    winner: null,
    wins: {}, // name -> win count (persisted meta)
  };

  /* ------------------------------------------------------------------ *
   * Reference bug art                                                   *
   * ------------------------------------------------------------------ */

  function referenceBugSVG() {
    return `<svg viewBox="0 0 200 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Reference ladybug">
      <g stroke="#20231f" stroke-width="5" stroke-linecap="round" fill="none">
        <path d="M55 148 L38 170"/><path d="M45 138 L24 156"/>
        <path d="M145 148 L162 170"/><path d="M155 138 L176 156"/>
        <path d="M100 162 L100 184"/>
      </g>
      <ellipse cx="100" cy="105" rx="62" ry="56" fill="#d0342c" stroke="#20231f" stroke-width="5"/>
      <line x1="100" y1="50" x2="100" y2="160" stroke="#20231f" stroke-width="4"/>
      <path d="M42 78 A62 56 0 0 1 158 78 Q100 52 42 78 Z" fill="#20231f"/>
      <g fill="none" stroke="#20231f" stroke-width="4" stroke-linecap="round">
        <path d="M82 32 Q72 14 58 10"/><path d="M118 32 Q128 14 142 10"/>
      </g>
      <circle cx="57" cy="10" r="5" fill="#20231f"/><circle cx="143" cy="10" r="5" fill="#20231f"/>
      <circle cx="76" cy="52" r="4.5" fill="#fff"/><circle cx="124" cy="52" r="4.5" fill="#fff"/>
      <circle cx="76" cy="52" r="2" fill="#20231f"/><circle cx="124" cy="52" r="2" fill="#20231f"/>
      <g fill="#20231f">
        <circle cx="74" cy="102" r="12"/><circle cx="128" cy="94" r="10"/>
        <circle cx="92" cy="140" r="9"/><circle cx="135" cy="128" r="8"/>
        <circle cx="64" cy="132" r="6"/>
      </g>
    </svg>`;
  }

  /* ------------------------------------------------------------------ *
   * Persistence                                                         *
   * ------------------------------------------------------------------ */

  function saveGame() {
    if (game.phase === "setup" || game.phase === "done") {
      localStorage.removeItem(SAVE_KEY);
      return;
    }
    const payload = {
      phase: game.phase,
      current: game.current,
      mode: game.mode,
      streak: game.streak,
      players: game.players.map((p) => ({
        name: p.name,
        avatar: p.avatar,
        strokes: p.strokes,
        parts: [...p.parts],
        rolls: p.rolls,
        rollCounts: p.rollCounts,
      })),
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch {
      // Storage unavailable; the session lives in memory.
    }
  }

  function loadSavedGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.players) || !data.players.length) return null;
      return data;
    } catch {
      return null;
    }
  }

  function resumeSavedGame(data) {
    game.players = data.players.map((p) => ({
      name: p.name,
      avatar: p.avatar || "🐞",
      strokes: Array.isArray(p.strokes) ? p.strokes : [],
      parts: new Set(p.parts || []),
      rolls: p.rolls || 0,
      rollCounts: p.rollCounts || {},
    }));
    game.current = data.current || 0;
    game.mode = data.mode || "jumble";
    game.streak = data.streak || 1;
    game.phase = "passing";
    els.setupScreen.hidden = true;
    els.gameScreen.hidden = false;
    beginTurn(true);
  }

  /* ------------------------------------------------------------------ *
   * Setup screen                                                        *
   * ------------------------------------------------------------------ */

  function setupPlayers() {
    if (!game.players.length) {
      game.players = [
        { name: "Player 1", avatar: AVATARS[0], strokes: [], parts: new Set(), rolls: 0, rollCounts: {} },
        { name: "Player 2", avatar: AVATARS[1], strokes: [], parts: new Set(), rolls: 0, rollCounts: {} },
      ];
    }
    renderPlayerRows();
  }

  function renderPlayerRows() {
    els.playerRows.innerHTML = "";
    game.players.forEach((player, index) => {
      const row = document.createElement("div");
      row.className = "player-row";
      const avatarBtn = document.createElement("button");
      avatarBtn.type = "button";
      avatarBtn.className = "avatar-button";
      avatarBtn.textContent = player.avatar;
      avatarBtn.title = "Change bug buddy";
      avatarBtn.addEventListener("click", () => {
        const at = AVATARS.indexOf(player.avatar);
        player.avatar = AVATARS[(at + 1) % AVATARS.length];
        avatarBtn.textContent = player.avatar;
        GameHubJuice.tick();
      });
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 14;
      input.placeholder = `Player ${index + 1}`;
      input.value = player.name;
      input.addEventListener("input", () => {
        player.name = input.value;
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-player";
      remove.textContent = "✕";
      remove.title = "Remove player";
      remove.addEventListener("click", () => {
        if (game.players.length <= 1) return;
        game.players.splice(index, 1);
        renderPlayerRows();
        GameHubJuice.tick();
      });
      row.append(avatarBtn, input, remove);
      els.playerRows.append(row);
    });
  }

  function startGame() {
    game.players = game.players.map((player, index) => ({
      name: player.name.trim() || `Player ${index + 1}`,
      avatar: player.avatar,
      strokes: [],
      parts: new Set(),
      rolls: 0,
      rollCounts: {},
    }));
    if (game.players.length < 2) game.players = game.players.slice(0, 1);
    game.mode = els.modeRow.querySelector("input[name=mode]:checked").value;
    game.streak = Number(els.streakRow.querySelector("input[name=streak]:checked").value);
    game.current = 0;
    game.winner = null;
    game.phase = "passing";
    els.setupScreen.hidden = true;
    els.gameScreen.hidden = false;
    els.peekButton.hidden = true;
    saveGame();
    beginTurn(true);
  }

  /* ------------------------------------------------------------------ *
   * Turn flow                                                           *
   * ------------------------------------------------------------------ */

  function beginTurn(showPass) {
    const player = game.players[game.current];
    els.turnAvatar.textContent = player.avatar;
    els.turnName.textContent = `${player.name}'s turn`;
    els.turnSub.textContent = game.streak > 1
      ? `Roll — each part needs ${game.streak} hits`
      : "Roll for a part";
    els.statusLine.textContent = "";
    els.dieFace.textContent = "?";
    els.rollLog.innerHTML = "";
    els.rollButton.disabled = false;
    els.die.classList.remove("rolling");
    renderParts();
    if (game.players.length > 1 && showPass) {
      els.passName.textContent = player.name;
      els.passOverlay.hidden = false;
      game.phase = "passing";
    } else {
      game.phase = "rolling";
    }
    saveGame();
  }

  els.imReady.addEventListener("click", () => {
    els.passOverlay.hidden = true;
    game.phase = "rolling";
    GameHubJuice.tick();
  });

  function renderParts() {
    const player = game.players[game.current];
    els.partsGrid.innerHTML = "";
    for (const part of PARTS) {
      const chip = document.createElement("div");
      chip.className = "part-chip";
      const drawn = player.parts.has(part.name);
      const count = player.rollCounts[part.name] || 0;
      const locked = game.mode === "ordered" && !drawn &&
        PREREQS[part.name].some((pre) => !player.parts.has(pre));
      let status = "";
      if (drawn) {
        chip.classList.add("drawn");
        status = "done ✔";
      } else if (locked) {
        chip.classList.add("locked");
        status = "locked 🔒";
      } else if (game.streak > 1 && count > 0) {
        status = "●".repeat(Math.min(count, game.streak)) +
          "○".repeat(Math.max(0, game.streak - count));
      }
      chip.innerHTML = `<span class="glyph">${part.glyph}</span><span>${part.name}</span><span class="pips">${status}</span>`;
      els.partsGrid.append(chip);
    }
  }

  function logChip(text, hit) {
    const chip = document.createElement("span");
    chip.className = "log-chip" + (hit ? " hit" : "");
    chip.textContent = text;
    els.rollLog.prepend(chip);
    while (els.rollLog.children.length > 10) els.rollLog.lastChild.remove();
  }

  els.rollButton.addEventListener("click", () => {
    if (game.phase !== "rolling") return;
    game.phase = "rolling-animation";
    els.rollButton.disabled = true;
    els.die.classList.add("rolling");
    const ticks = setInterval(() => {
      els.dieFace.textContent = String(1 + Math.floor(Math.random() * 6));
      GameHubJuice.tick();
    }, 75);
    setTimeout(() => {
      clearInterval(ticks);
      els.die.classList.remove("rolling");
      const value = 1 + Math.floor(Math.random() * 6);
      els.dieFace.textContent = String(value);
      GameHubJuice.pop(480);
      resolveRoll(value);
    }, 900);
  });

  function resolveRoll(value) {
    const player = game.players[game.current];
    const part = PARTS[value - 1];
    player.rolls += 1;
    player.rollCounts[part.name] = (player.rollCounts[part.name] || 0) + 1;
    const count = player.rollCounts[part.name];
    let blocked = null;

    if (player.parts.has(part.name)) {
      blocked = `You already drew the ${part.name}! Roll again.`;
    } else if (game.mode === "ordered") {
      const missing = PREREQS[part.name].find((pre) => !player.parts.has(pre));
      if (missing) blocked = `No ${missing} yet — the ${part.name} has nowhere to go!`;
    }
    if (!blocked && game.streak > 1 && count < game.streak) {
      blocked = `${count}/${game.streak} rolls toward the ${part.name}… keep rolling!`;
    }

    if (blocked) {
      els.statusLine.textContent = blocked;
      logChip(`${value}·${part.name} — not yet`, false);
      GameHubJuice.drop();
      renderParts();
      game.phase = "rolling";
      els.rollButton.disabled = false;
      saveGame();
      return;
    }

    els.statusLine.textContent = "";
    logChip(`${value}·${part.name} — draw it!`, true);
    openDrawOverlay(part);
  }

  /* ------------------------------------------------------------------ *
   * Drawing                                                             *
   * ------------------------------------------------------------------ */

  const ctx = els.drawCanvas.getContext("2d");
  let brush = { color: BRUSH_COLORS[0], size: BRUSH_SIZES[1] };
  let activeStroke = null;

  function openDrawOverlay(part) {
    game.phase = "drawing";
    game.drawingPart = part.name;
    els.drawPart.textContent = `Draw the ${part.name}!`;
    els.referenceThumb.innerHTML = referenceBugSVG();
    els.drawOverlay.hidden = false;
    replayCanvas(game.players[game.current].strokes);
    renderBrushes();
    saveGame();
  }

  function replayCanvas(strokes) {
    ctx.fillStyle = "#fffdf7";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokes) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.beginPath();
      const pts = stroke.pts;
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      if (pts.length === 2) ctx.lineTo(pts[0] + 0.5, pts[1] + 0.5);
      ctx.stroke();
    }
  }

  function renderBrushes() {
    els.swatches.innerHTML = "";
    BRUSH_COLORS.forEach((color) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "swatch" + (brush.color === color ? " active" : "");
      swatch.style.background = color;
      swatch.addEventListener("click", () => {
        brush.color = color;
        GameHubJuice.tick();
        renderBrushes();
      });
      els.swatches.append(swatch);
    });
    els.sizes.innerHTML = "";
    BRUSH_SIZES.forEach((size) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "size-dot" + (brush.size === size ? " active" : "");
      dot.innerHTML = `<i style="width:${Math.min(22, size * 1.2)}px;height:${Math.min(22, size * 1.2)}px"></i>`;
      dot.addEventListener("click", () => {
        brush.size = size;
        GameHubJuice.tick();
        renderBrushes();
      });
      els.sizes.append(dot);
    });
  }

  function canvasPoint(event) {
    const rect = els.drawCanvas.getBoundingClientRect();
    return [
      Math.round(((event.clientX - rect.left) / rect.width) * CANVAS_SIZE),
      Math.round(((event.clientY - rect.top) / rect.height) * CANVAS_SIZE),
    ];
  }

  els.drawCanvas.addEventListener("pointerdown", (event) => {
    if (game.phase !== "drawing") return;
    event.preventDefault();
    els.drawCanvas.setPointerCapture(event.pointerId);
    const pt = canvasPoint(event);
    activeStroke = { color: brush.color, size: brush.size, pts: [pt[0], pt[1]] };
    ctx.strokeStyle = activeStroke.color;
    ctx.lineWidth = activeStroke.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pt[0], pt[1]);
  });

  els.drawCanvas.addEventListener("pointermove", (event) => {
    if (!activeStroke) return;
    const pt = canvasPoint(event);
    activeStroke.pts.push(pt[0], pt[1]);
    ctx.lineTo(pt[0], pt[1]);
    ctx.stroke();
  });

  function endStroke() {
    if (!activeStroke) return;
    game.players[game.current].strokes.push(activeStroke);
    activeStroke = null;
  }

  els.drawCanvas.addEventListener("pointerup", endStroke);
  els.drawCanvas.addEventListener("pointercancel", endStroke);

  els.undoButton.addEventListener("click", () => {
    const player = game.players[game.current];
    if (player.strokes.length) {
      player.strokes.pop();
      replayCanvas(player.strokes);
      GameHubJuice.tick();
    }
  });

  els.clearButton.addEventListener("click", () => {
    const player = game.players[game.current];
    player.strokes = [];
    replayCanvas(player.strokes);
    GameHubJuice.sweep();
  });

  els.doneButton.addEventListener("click", () => {
    if (activeStroke) endStroke();
    const player = game.players[game.current];
    if (!player.strokes.length) {
      els.drawPart.textContent = "Draw something first! ✏️";
      GameHubJuice.tick();
      return;
    }
    const partName = game.drawingPart || "body";
    player.parts.add(partName);
    els.drawOverlay.hidden = true;
    GameHubJuice.pop(700);
    saveGame();

    if (player.parts.size === PARTS.length) {
      declareWinner(player);
      return;
    }
    game.current = (game.current + 1) % game.players.length;
    game.phase = "passing";
    renderParts();
    beginTurn(true);
  });

  /* ------------------------------------------------------------------ *
   * Win + gallery                                                       *
   * ------------------------------------------------------------------ */

  function declareWinner(winner) {
    game.phase = "done";
    game.winner = winner.name;
    game.wins[winner.name] = (game.wins[winner.name] || 0) + 1;
    const isRecord = game.wins[winner.name] === 1;
    GameHubProfile?.achieve("rollbug-win");
    if (game.wins[winner.name] >= 3) GameHubProfile?.achieve("rollbug-3");
    if (game.mode === "ordered") GameHubProfile?.achieve("rollbug-master");
    GameHubProfile?.award("roll-bug", 8, "First ladybug finished! 🐞", game.wins[winner.name]);
    GameHubJuice.confetti(200);
    GameHubJuice.win();
    saveGame();
    showGallery(winner);
  }

  function showGallery(winner) {
    els.galleryTitle.textContent = "🐞 Ladybug gallery!";
    els.gallerySub.textContent = winner
      ? `${winner.avatar} ${winner.name} finished first with ${winner.rolls} rolls — behold the fleet:`
      : "The fleet, in all its glory:";
    els.galleryGrid.innerHTML = "";
    const referenceCard = document.createElement("div");
    referenceCard.className = "gallery-card";
    referenceCard.innerHTML = `<div class="reference-bug">${referenceBugSVG()}</div><span class="gallery-name">The target 📋</span>`;
    els.galleryGrid.append(referenceCard);
    for (const player of game.players) {
      const card = document.createElement("div");
      card.className = "gallery-card" + (winner && player === winner ? " winner" : "");
      const canvas = document.createElement("canvas");
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      const c2 = canvas.getContext("2d");
      c2.fillStyle = "#fffdf7";
      c2.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      c2.lineCap = "round";
      c2.lineJoin = "round";
      for (const stroke of player.strokes) {
        c2.strokeStyle = stroke.color;
        c2.lineWidth = stroke.size;
        c2.beginPath();
        c2.moveTo(stroke.pts[0], stroke.pts[1]);
        for (let i = 2; i < stroke.pts.length; i += 2) c2.lineTo(stroke.pts[i], stroke.pts[i + 1]);
        if (stroke.pts.length === 2) c2.lineTo(stroke.pts[0] + 0.5, stroke.pts[1] + 0.5);
        c2.stroke();
      }
      const name = document.createElement("span");
      name.className = "gallery-name";
      const parts = `${player.parts.size}/6`;
      name.textContent = `${player.avatar} ${player.name} · ${parts}${winner && player === winner ? " 🏆" : ""}`;
      card.append(canvas, name);
      els.galleryGrid.append(card);
    }
    els.galleryOverlay.hidden = false;
    els.peekButton.hidden = false;
  }

  /* ------------------------------------------------------------------ *
   * Wiring                                                              *
   * ------------------------------------------------------------------ */

  els.addPlayer.addEventListener("click", () => {
    if (game.players.length >= AVATARS.length) return;
    const used = game.players.map((p) => p.avatar);
    const avatar = AVATARS.find((a) => !used.includes(a)) || AVATARS[0];
    game.players.push({
      name: `Player ${game.players.length + 1}`,
      avatar,
      strokes: [],
      parts: new Set(),
      rolls: 0,
      rollCounts: {},
    });
    renderPlayerRows();
    GameHubJuice.tick();
  });

  els.startButton.addEventListener("click", startGame);

  els.resumeButton.addEventListener("click", () => {
    const data = loadSavedGame();
    if (data) resumeSavedGame(data);
  });
  els.discardButton.addEventListener("click", () => {
    localStorage.removeItem(SAVE_KEY);
    els.resumeRow.hidden = true;
    GameHubJuice.tick();
  });

  els.quitButton.addEventListener("click", () => {
    if (!window.confirm("End this game and go back to setup?")) return;
    game.phase = "setup";
    saveGame();
    els.gameScreen.hidden = true;
    els.setupScreen.hidden = false;
    setupPlayers();
  });

  els.againButton.addEventListener("click", () => {
    els.galleryOverlay.hidden = true;
    els.peekButton.hidden = true;
    game.phase = "setup";
    saveGame();
    els.gameScreen.hidden = true;
    els.setupScreen.hidden = false;
    setupPlayers();
  });
  els.galleryClose.addEventListener("click", () => {
    els.galleryOverlay.hidden = true;
  });
  els.peekButton.addEventListener("click", () => {
    const winner = game.players.find((p) => p.name === game.winner) || null;
    showGallery(winner);
  });
  els.soundButton.addEventListener("click", () => {
    if (!window.GameHubJuice) return;
    GameHubJuice.muted = !GameHubJuice.muted;
    els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  });

  /* ------------------------------------------------------------------ *
   * Boot                                                                *
   * ------------------------------------------------------------------ */

  els.referenceBugSetup.innerHTML = referenceBugSVG();
  if (window.GameHubJuice) els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  setupPlayers();
  const saved = loadSavedGame();
  if (saved) {
    els.resumeRow.hidden = false;
    els.resumeButton.textContent =
      `Resume game (${saved.players.map((p) => p.name).join(", ")})`;
  }
})();
