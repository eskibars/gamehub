/*
 * Melon Drop — a Suika-style physics merger. Drop fruit into the jar; two of
 * a kind merge into the next size up. The physics is a small impulse solver:
 * gravity, circle-circle separation with restitution, wall/floor clamps, and
 * a merge on same-tier contact. Overflow above the danger line ends the run.
 */
(() => {
  "use strict";

  const W = 420;
  const H = 600;
  const WALL = 10;          // playable inset
  const DANGER_Y = 110;
  const DROP_COOLDOWN = 420;
  const OVERFLOW_GRACE = 1600;

  const TIERS = [
    { emoji: "🍒", r: 17,  color: "#f7c8cf" },
    { emoji: "🍓", r: 23,  color: "#f6b3b8" },
    { emoji: "🍇", r: 30,  color: "#d9c2ec" },
    { emoji: "🍊", r: 38,  color: "#fbd9a4" },
    { emoji: "🍎", r: 47,  color: "#f6b09a" },
    { emoji: "🍐", r: 57,  color: "#d6e6ae" },
    { emoji: "🍍", r: 68,  color: "#f7e3a2" },
    { emoji: "🥝", r: 80,  color: "#cfe0a0" },
    { emoji: "🍑", r: 93,  color: "#f9c9ae" },
    { emoji: "🍈", r: 107, color: "#dcedc1" },
    { emoji: "🍉", r: 124, color: "#f9b9c4" },
  ];
  const POINTS = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66];
  const DROPABLE = 5; // fruit the player can be dealt

  const els = {
    canvas: document.querySelector("#board"),
    score: document.querySelector("#score"),
    best: document.querySelector("#best"),
    next: document.querySelector("#next"),
    overlay: document.querySelector("#overlay"),
    overlayTitle: document.querySelector("#overlayTitle"),
    overlaySub: document.querySelector("#overlaySub"),
    playButton: document.querySelector("#playButton"),
    soundButton: document.querySelector("#soundButton"),
    evolution: document.querySelector("#evolution"),
  };
  const ctx = els.canvas.getContext("2d");

  const BEST_KEY = "gamehub-melon-drop-best";
  const DISCOVER_KEY = "gamehub-melon-drop-discovered";

  const game = {
    melons: [],
    score: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0),
    discovered: new Set(JSON.parse(localStorage.getItem(DISCOVER_KEY) || "[0]")),
    current: 0,
    next: 0,
    aimX: W / 2,
    canDropAt: 0,
    pending: null, // {tier} falling from the spout
    overflowMs: 0,
    playing: false,
    over: false,
    lastTs: 0,
    shakeUntil: 0,
  };

  els.best.textContent = game.best;

  /* ------------------------------------------------------------------ *
   * Physics                                                             *
   * ------------------------------------------------------------------ */

  function spawnMelon(tier, x, y, vx = 0, vy = 0) {
    game.melons.push({
      tier,
      x, y, vx, vy,
      r: TIERS[tier].r,
      angle: Math.random() * Math.PI * 2,
      born: performance.now(),
    });
  }

  function physicsStep(dt) {
    const now = performance.now();
    const g = 1500;

    for (const m of game.melons) {
      m.vy += g * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.angle += (m.vx / m.r) * dt * 0.8;
    }

    // Pair collisions: positional separation + impulse.
    const list = game.melons;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.r + b.r;
        const dist2 = dx * dx + dy * dy;
        if (dist2 >= min * min || dist2 === 0) continue;
        const dist = Math.sqrt(dist2);
        const nx = dx / dist, ny = dy / dist;
        const overlap = min - dist;

        // Same tier + both settled enough → merge.
        if (a.tier === b.tier && a.tier < TIERS.length - 1 &&
            now - a.born > 90 && now - b.born > 90) {
          mergeMelons(a, b);
          return; // list mutated; resume next substep
        }

        const aInv = a.r * a.r, bInv = b.r * b.r;
        const totalInv = aInv + bInv;
        a.x -= nx * overlap * (aInv / totalInv);
        a.y -= ny * overlap * (aInv / totalInv);
        b.x += nx * overlap * (bInv / totalInv);
        b.y += ny * overlap * (bInv / totalInv);

        const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        const velNormal = rvx * nx + rvy * ny;
        if (velNormal > 0) continue;
        const restitution = 0.12;
        const impulse = -(1 + restitution) * velNormal / totalInv;
        a.vx -= impulse * nx * aInv;
        a.vy -= impulse * ny * aInv;
        b.vx += impulse * nx * bInv;
        b.vy += impulse * ny * bInv;
        // Tangential damping so stacks settle instead of jiggling.
        const tx = -ny, ty = nx;
        const velTangent = rvx * tx + rvy * ty;
        const friction = 0.06;
        a.vx += velTangent * tx * friction;
        a.vy += velTangent * ty * friction;
        b.vx -= velTangent * tx * friction;
        b.vy -= velTangent * ty * friction;
      }
    }

    for (const m of game.melons) {
      if (m.x - m.r < WALL) { m.x = WALL + m.r; m.vx = Math.abs(m.vx) * 0.3; }
      if (m.x + m.r > W - WALL) { m.x = W - WALL - m.r; m.vx = -Math.abs(m.vx) * 0.3; }
      const floor = H - 14;
      if (m.y + m.r > floor) {
        m.y = floor - m.r;
        if (m.vy > 0) m.vy = -m.vy * 0.16;
        m.vx *= 0.985;
      }
    }
    game.melons = game.melons.filter((m) => !m.dead);
  }

  function mergeMelons(a, b) {
    a.dead = true;
    b.dead = true;
    const tier = a.tier + 1;
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    game.score += POINTS[tier];
    els.score.textContent = game.score;
    discover(tier);
    GameHubJuice.pop(300 + tier * 55);
    if (tier === TIERS.length - 1) {
      GameHubProfile?.achieve("watermelon");
      GameHubJuice.confetti(160);
      GameHubJuice.win();
    }
    game.shakeUntil = performance.now() + 120;
    spawnMelon(tier, x, y, (Math.random() - 0.5) * 40, -60);
    if (game.score > game.best) {
      game.best = game.score;
      els.best.textContent = game.best;
      localStorage.setItem(BEST_KEY, String(game.best));
    }
  }

  /* ------------------------------------------------------------------ *
   * Rendering                                                           *
   * ------------------------------------------------------------------ */

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Jar interior
    ctx.fillStyle = "#fff4dd";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(122, 92, 58, 0.08)";
    for (let y = 0; y < H; y += 36) {
      for (let x = 0; x < W; x += 36) {
        if (((x + y) / 36) % 2 === 0) ctx.fillRect(x, y, 36, 36);
      }
    }

    // Danger line
    const overDanger = game.overflowMs > 0;
    ctx.strokeStyle = overDanger ? "#c84e4e" : "rgba(200, 78, 78, 0.35)";
    ctx.lineWidth = overDanger ? 3 : 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(WALL, DANGER_Y);
    ctx.lineTo(W - WALL, DANGER_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    const now = performance.now();
    const shake = now < game.shakeUntil ? (Math.random() - 0.5) * 3 : 0;
    ctx.save();
    ctx.translate(shake, 0);

    for (const m of game.melons) {
      const info = TIERS[m.tier];
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);
      ctx.beginPath();
      ctx.arc(0, 0, m.r, 0, Math.PI * 2);
      ctx.fillStyle = info.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(32, 35, 31, 0.18)";
      ctx.stroke();
      ctx.font = `${Math.round(m.r * 1.15)}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(info.emoji, 0, m.r * 0.06);
      ctx.restore();
    }

    // Aim guide + pending fruit
    if (game.playing && !game.over && game.pending) {
      const info = TIERS[game.pending.tier];
      ctx.strokeStyle = "rgba(32, 35, 31, 0.22)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(game.aimX, DANGER_Y);
      ctx.lineTo(game.aimX, H - 20);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(game.aimX, 62, info.r, 0, Math.PI * 2);
      ctx.fillStyle = info.color;
      ctx.fill();
      ctx.strokeStyle = "rgba(32, 35, 31, 0.25)";
      ctx.stroke();
      ctx.font = `${Math.round(info.r * 1.15)}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(info.emoji, game.aimX, 63);
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   * Loop                                                                *
   * ------------------------------------------------------------------ */

  function tick(ts) {
    const rawDt = Math.min(0.05, (ts - game.lastTs) / 1000 || 0);
    game.lastTs = ts;
    if (game.playing) {
      const substeps = 4;
      for (let i = 0; i < substeps; i += 1) physicsStep(rawDt / substeps);
      checkOverflow(rawDt);
    }
    draw();
    requestAnimationFrame(tick);
  }

  function checkOverflow(dt) {
    const now = performance.now();
    let overflowing = false;
    for (const m of game.melons) {
      if (now - m.born < 500) continue;
      if (m.y - m.r < DANGER_Y) { overflowing = true; break; }
    }
    if (overflowing) {
      game.overflowMs += dt * 1000;
      if (game.overflowMs > OVERFLOW_GRACE) endGame();
    } else {
      game.overflowMs = 0;
    }
  }

  /* ------------------------------------------------------------------ *
   * Flow                                                                *
   * ------------------------------------------------------------------ */

  function dealNext() {
    game.current = game.next;
    game.next = Math.floor(Math.random() * DROPABLE);
    els.next.textContent = TIERS[game.next].emoji;
  }

  function drop() {
    if (!game.playing || game.over || game.pending === null) return;
    if (performance.now() < game.canDropAt) return;
    game.canDropAt = performance.now() + DROP_COOLDOWN;
    const x = Math.min(Math.max(game.aimX, WALL + TIERS[game.current].r + 2), W - WALL - TIERS[game.current].r - 2);
    spawnMelon(game.current, x, 62);
    GameHubJuice.drop();
    dealNext();
  }

  function endGame() {
    game.over = true;
    game.playing = false;
    GameHubJuice.lose();
    const chips = Math.max(1, Math.floor(game.score / 20));
    const isRecord = game.score >= game.best && game.score > 0;
    GameHubProfile?.award("melon-drop", chips, `Mashed ${game.score} points`, game.best);
    if (isRecord) GameHubJuice.win();
    els.overlayTitle.textContent = isRecord ? "New best! 🍉" : "Jar overflowed!";
    els.overlaySub.textContent = `${game.score} points · best ${game.best} · +${chips} chips`;
    els.playButton.textContent = "Play again";
    els.overlay.hidden = false;
  }

  function startGame() {
    els.overlay.hidden = true;
    game.melons = [];
    game.score = 0;
    game.overflowMs = 0;
    game.over = false;
    game.playing = true;
    game.pending = { tier: 0 };
    game.next = Math.floor(Math.random() * DROPABLE);
    dealNext();
    els.score.textContent = "0";
    renderEvolution();
  }

  function discover(tier) {
    if (game.discovered.has(tier)) return;
    game.discovered.add(tier);
    localStorage.setItem(DISCOVER_KEY, JSON.stringify([...game.discovered].sort((a, b) => a - b)));
    renderEvolution();
  }

  function renderEvolution() {
    els.evolution.innerHTML = "";
    TIERS.forEach((tier, index) => {
      if (index) {
        const arrow = document.createElement("span");
        arrow.className = "arrow";
        arrow.textContent = "▸";
        els.evolution.append(arrow);
      }
      const span = document.createElement("span");
      span.textContent = tier.emoji;
      if (game.discovered.has(index)) span.classList.add("discovered");
      span.title = `${POINTS[index]} pts`;
      els.evolution.append(span);
    });
  }

  /* ------------------------------------------------------------------ *
   * Input                                                               *
   * ------------------------------------------------------------------ */

  function aimFromEvent(event) {
    const rect = els.canvas.getBoundingClientRect();
    game.aimX = ((event.clientX - rect.left) / rect.width) * W;
    game.aimX = Math.min(Math.max(game.aimX, WALL + 20), W - WALL - 20);
  }

  els.canvas.addEventListener("pointermove", aimFromEvent);
  els.canvas.addEventListener("pointerdown", (event) => {
    aimFromEvent(event);
    if (event.pointerType === "touch") drop();
  });
  els.canvas.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch") drop();
  });

  els.playButton.addEventListener("click", startGame);
  els.soundButton.addEventListener("click", () => {
    if (!window.GameHubJuice) return;
    GameHubJuice.muted = !GameHubJuice.muted;
    els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  });

  renderEvolution();
  requestAnimationFrame((ts) => {
    game.lastTs = ts;
    tick(ts);
  });
})();
