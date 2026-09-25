/*
 * Breakout — canvas brick smasher with power-ups (wide paddle, multiball,
 * slow-mo, extra life), multi-hit bricks, and endless levels that thicken
 * the wall as you climb.
 */
(() => {
  "use strict";

  const W = 420;
  const H = 560;
  const BRICK_ROWS = 10;
  const BRICK_COLS = 10;
  const BRICK_TOP = 56;
  const BRICK_H = 20;
  const BRICK_GAP = 4;
  const SIDE = 8;
  const PADDLE_Y = H - 36;
  const POWER_KINDS = ["wide", "multi", "slow", "life"];

  const ROW_COLORS = ["#e5484d", "#e8874e", "#dfb44e", "#8bc34a", "#4caf7d", "#3565b8", "#7b61c9", "#c05fbf"];

  const els = {
    canvas: document.querySelector("#board"),
    score: document.querySelector("#score"),
    best: document.querySelector("#best"),
    level: document.querySelector("#level"),
    lives: document.querySelector("#lives"),
    overlay: document.querySelector("#overlay"),
    overlayTitle: document.querySelector("#overlayTitle"),
    overlaySub: document.querySelector("#overlaySub"),
    playButton: document.querySelector("#playButton"),
    soundButton: document.querySelector("#soundButton"),
  };
  const ctx = els.canvas.getContext("2d");
  const BEST_KEY = "gamehub-breakout-best";

  const game = {
    state: "menu", // menu | ready | playing | paused | levelClear | over
    score: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0),
    level: 1,
    lives: 3,
    bricks: [],
    balls: [],
    drops: [],
    effects: { wideUntil: 0, slowUntil: 0 },
    paddleX: W / 2,
    paddleW: 76,
    keys: { left: false, right: false },
    lastTs: 0,
    combo: 0,
  };
  els.best.textContent = game.best;

  function brickW() {
    return (W - SIDE * 2 - BRICK_GAP * (BRICK_COLS - 1)) / BRICK_COLS;
  }

  /* ------------------------------------------------------------------ *
   * Level building                                                      *
   * ------------------------------------------------------------------ */

  function buildLevel(level) {
    game.bricks = [];
    const rows = Math.min(4 + Math.ceil(level / 2), 8);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < BRICK_COLS; c += 1) {
        // Sparse lower levels get denser; higher levels add tougher bricks.
        if (level < 3 && (r + c) % 7 === 0) continue;
        let hp = 1;
        if (level >= 2 && r === 0) hp = 2;
        if (level >= 4 && r <= 1) hp = 2;
        if (level >= 6 && r === 0) hp = 3;
        if (level >= 8 && r <= 2 && (r + c) % 3 === 0) hp = 3;
        game.bricks.push({
          x: SIDE + c * (brickW() + BRICK_GAP),
          y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
          w: brickW(),
          h: BRICK_H,
          hp,
          maxHp: hp,
          color: ROW_COLORS[(r + level) % ROW_COLORS.length],
        });
      }
    }
  }

  function spawnBall(stuck = true) {
    game.balls.push({
      x: game.paddleX,
      y: PADDLE_Y - 12,
      vx: 0,
      vy: 0,
      r: 6,
      stuck,
      speed: 240 + game.level * 12,
    });
  }

  function launchBalls() {
    let launched = false;
    for (const ball of game.balls) {
      if (!ball.stuck) continue;
      ball.stuck = false;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
      ball.vx = Math.cos(angle) * ball.speed;
      ball.vy = Math.sin(angle) * ball.speed;
      launched = true;
    }
    if (launched) GameHubJuice.tick();
  }

  /* ------------------------------------------------------------------ *
   * Physics                                                             *
   * ------------------------------------------------------------------ */

  function speedMultiplier() {
    return performance.now() < game.effects.slowUntil ? 0.65 : 1;
  }

  function stepBall(ball, dt) {
    if (ball.stuck) {
      ball.x = game.paddleX;
      ball.y = PADDLE_Y - ball.r - 6;
      return;
    }
    const scale = speedMultiplier();
    const steps = 3;
    for (let i = 0; i < steps; i += 1) {
      ball.x += (ball.vx * dt * scale) / steps;
      ball.y += (ball.vy * dt * scale) / steps;

      if (ball.x - ball.r < SIDE) { ball.x = SIDE + ball.r; ball.vx = Math.abs(ball.vx); GameHubJuice.tick(); }
      if (ball.x + ball.r > W - SIDE) { ball.x = W - SIDE - ball.r; ball.vx = -Math.abs(ball.vx); GameHubJuice.tick(); }
      if (ball.y - ball.r < 8) { ball.y = 8 + ball.r; ball.vy = Math.abs(ball.vy); GameHubJuice.tick(); }

      // Paddle
      if (ball.vy > 0 &&
          ball.y + ball.r >= PADDLE_Y && ball.y - ball.r <= PADDLE_Y + 14 &&
          ball.x >= game.paddleX - game.paddleW / 2 - ball.r &&
          ball.x <= game.paddleX + game.paddleW / 2 + ball.r) {
        ball.y = PADDLE_Y - ball.r;
        const hit = (ball.x - game.paddleX) / (game.paddleW / 2); // -1..1
        const angle = -Math.PI / 2 + hit * 1.05;
        ball.vx = Math.cos(angle) * ball.speed;
        ball.vy = Math.sin(angle) * ball.speed;
        game.combo = 0;
        GameHubJuice.pop(240);
      }

      // Bricks
      for (const brick of game.bricks) {
        if (brick.hp <= 0) continue;
        const nearestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.w));
        const nearestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.h));
        const dx = ball.x - nearestX, dy = ball.y - nearestY;
        if (dx * dx + dy * dy > ball.r * ball.r) continue;

        // Reflect on the axis of least penetration.
        const overlapX = ball.r - Math.abs(dx);
        const overlapY = ball.r - Math.abs(dy);
        if (dx === 0 && dy === 0) {
          ball.vy = -ball.vy;
        } else if (overlapX < overlapY) {
          ball.vx = dx > 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
        } else {
          ball.vy = dy > 0 ? Math.abs(ball.vy) : -Math.abs(ball.vy);
        }
        hitBrick(brick);
        break;
      }
    }
  }

  function hitBrick(brick) {
    brick.hp -= 1;
    game.combo += 1;
    game.score += 10 * brick.maxHp + Math.min(game.combo, 10) * 2;
    els.score.textContent = game.score;
    if (game.score > game.best) {
      game.best = game.score;
      els.best.textContent = game.best;
      localStorage.setItem(BEST_KEY, String(game.best));
    }
    if (brick.hp <= 0) {
      GameHubJuice.pop(420 + Math.min(game.combo, 8) * 40);
      if (Math.random() < 0.13) dropPower(brick.x + brick.w / 2, brick.y + brick.h / 2);
    } else {
      GameHubJuice.tick();
    }
  }

  function dropPower(x, y) {
    const roll = Math.random();
    const kind = roll < 0.34 ? "wide" : roll < 0.68 ? "multi" : roll < 0.9 ? "slow" : "life";
    game.drops.push({ x, y, kind, vy: 110 });
  }

  const POWER_META = {
    wide: { glyph: "W", color: "#3565b8" },
    multi: { glyph: "M", color: "#e5484d" },
    slow: { glyph: "S", color: "#4caf7d" },
    life: { glyph: "♥", color: "#e8874e" },
  };

  function applyPower(kind) {
    if (kind === "wide") game.effects.wideUntil = performance.now() + 12000;
    if (kind === "slow") game.effects.slowUntil = performance.now() + 9000;
    if (kind === "life") game.lives = Math.min(5, game.lives + 1);
    if (kind === "multi") {
      const existing = game.balls.filter((b) => !b.stuck);
      const base = existing[0] || game.balls[0];
      if (base) {
        for (const angle of [-0.5, 0.5]) {
          const speed = Math.hypot(base.vx, base.vy) || base.speed;
          const current = Math.atan2(base.vy, base.vx) + angle;
          game.balls.push({
            x: base.x, y: base.y,
            vx: Math.cos(current) * speed,
            vy: Math.sin(current) * speed,
            r: base.r,
            stuck: false,
            speed: base.speed,
          });
        }
      }
    }
    GameHubJuice.coin();
  }

  function stepDrops(dt) {
    const scale = speedMultiplier();
    const now = performance.now();
    const halfW = now < game.effects.wideUntil ? game.paddleW * 1.5 / 2 : game.paddleW / 2;
    for (const drop of game.drops) {
      drop.y += drop.vy * dt * scale;
      if (drop.y >= PADDLE_Y - 8 && drop.y <= PADDLE_Y + 16 &&
          Math.abs(drop.x - game.paddleX) <= halfW + 10) {
        drop.caught = true;
        applyPower(drop.kind);
      }
    }
    game.drops = game.drops.filter((d) => !d.caught && d.y < H + 20);
  }

  /* ------------------------------------------------------------------ *
   * Flow                                                                *
   * ------------------------------------------------------------------ */

  function loseBallCheck() {
    game.balls = game.balls.filter((ball) => ball.y - ball.r < H + 10);
    if (game.balls.length === 0 && game.state === "playing") {
      game.lives -= 1;
      updateHud();
      GameHubJuice.boom();
      if (game.lives <= 0) endGame();
      else {
        game.state = "ready";
        spawnBall(true);
      }
    }
  }

  function checkLevelClear() {
    if (game.state !== "playing") return;
    if (game.bricks.some((b) => b.hp > 0)) return;
    game.state = "levelClear";
    if (game.level >= 5) GameHubProfile?.achieve("breakout-5");
    const bonus = 100 * game.level + game.lives * 50;
    game.score += bonus;
    els.score.textContent = game.score;
    GameHubJuice.win();
    game.level += 1;
    els.level.textContent = game.level;
    game.drops = [];
    els.overlayTitle.textContent = `Wall cleared! +${bonus}`;
    els.overlaySub.textContent = `Level ${game.level} is thicker. Ready?`;
    els.playButton.textContent = "Next level →";
    els.overlay.hidden = false;
  }

  function endGame() {
    game.state = "over";
    const chips = Math.max(1, Math.floor(game.score / 100));
    const isRecord = game.score >= game.best && game.score > 0;
    GameHubProfile?.award("breakout", chips, `Smashed ${game.score} points`, game.best);
    if (isRecord) GameHubJuice.win();
    else GameHubJuice.lose();
    els.overlayTitle.textContent = isRecord ? "New best! 🧱" : "Game over";
    els.overlaySub.textContent = `Level ${game.level} · ${game.score} points · +${chips} chips`;
    els.playButton.textContent = "Play again";
    els.overlay.hidden = false;
  }

  function startGame(fresh = true) {
    els.overlay.hidden = true;
    if (fresh) {
      game.score = 0;
      game.level = 1;
      game.lives = 3;
      els.score.textContent = "0";
      els.level.textContent = "1";
    }
    game.drops = [];
    game.effects = { wideUntil: 0, slowUntil: 0 };
    game.combo = 0;
    buildLevel(game.level);
    game.balls = [];
    spawnBall(true);
    game.state = "ready";
    updateHud();
  }

  function updateHud() {
    els.lives.textContent = "❤️".repeat(Math.max(0, game.lives)) || "💥";
  }

  /* ------------------------------------------------------------------ *
   * Rendering                                                           *
   * ------------------------------------------------------------------ */

  function draw() {
    const now = performance.now();
    ctx.fillStyle = "#101426";
    ctx.fillRect(0, 0, W, H);

    // Wall backdrop dots
    ctx.fillStyle = "rgba(253, 246, 227, 0.04)";
    for (let y = 8; y < H; y += 26) {
      for (let x = 8; x < W; x += 26) ctx.fillRect(x, y, 2, 2);
    }

    // Bricks
    for (const brick of game.bricks) {
      if (brick.hp <= 0) continue;
      ctx.fillStyle = brick.color;
      if (brick.hp < brick.maxHp) ctx.globalAlpha = 0.55 + 0.45 * (brick.hp / brick.maxHp);
      ctx.beginPath();
      ctx.roundRect(brick.x, brick.y, brick.w, brick.h, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (brick.maxHp > 1) {
        ctx.fillStyle = "rgba(16, 20, 38, 0.5)";
        ctx.font = "bold 11px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(brick.hp), brick.x + brick.w / 2, brick.y + brick.h / 2 + 1);
      }
    }

    // Power-up drops
    for (const drop of game.drops) {
      const meta = POWER_META[drop.kind];
      ctx.fillStyle = meta.color;
      ctx.beginPath();
      ctx.roundRect(drop.x - 12, drop.y - 9, 24, 18, 6);
      ctx.fill();
      ctx.fillStyle = "#fdf6e3";
      ctx.font = "bold 12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(meta.glyph, drop.x, drop.y + 1);
    }

    // Paddle
    const halfW = now < game.effects.wideUntil ? game.paddleW * 1.5 / 2 : game.paddleW / 2;
    const grad = ctx.createLinearGradient(game.paddleX - halfW, 0, game.paddleX + halfW, 0);
    grad.addColorStop(0, "#dfb44e");
    grad.addColorStop(0.5, "#fdf6e3");
    grad.addColorStop(1, "#dfb44e");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(game.paddleX - halfW, PADDLE_Y, halfW * 2, 12, 6);
    ctx.fill();

    // Balls
    for (const ball of game.balls) {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fillStyle = now < game.effects.slowUntil ? "#4caf7d" : "#fdf6e3";
      ctx.fill();
      if (ball.stuck) {
        ctx.strokeStyle = "rgba(253, 246, 227, 0.5)";
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(ball.x, ball.y - ball.r);
        ctx.lineTo(ball.x, ball.y - 40);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    if (game.state === "ready") {
      ctx.fillStyle = "rgba(253, 246, 227, 0.75)";
      ctx.font = "700 14px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Click, tap, or press space to launch", W / 2, PADDLE_Y - 48);
    }
  }

  function tick(ts) {
    const dt = Math.min(0.033, (ts - game.lastTs) / 1000 || 0);
    game.lastTs = ts;

    if (game.state === "playing" || game.state === "ready") {
      const speed = 460 * dt;
      if (game.keys.left) game.paddleX -= speed;
      if (game.keys.right) game.paddleX += speed;
      const halfW = performance.now() < game.effects.wideUntil ? game.paddleW * 1.5 / 2 : game.paddleW / 2;
      game.paddleX = Math.min(Math.max(game.paddleX, SIDE + halfW), W - SIDE - halfW);
      for (const ball of game.balls) stepBall(ball, dt);
      stepDrops(dt);
      loseBallCheck();
      checkLevelClear();
    }
    draw();
    requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------------ *
   * Input                                                               *
   * ------------------------------------------------------------------ */

  function steerFromEvent(event) {
    const rect = els.canvas.getBoundingClientRect();
    game.paddleX = ((event.clientX - rect.left) / rect.width) * W;
    const halfW = performance.now() < game.effects.wideUntil ? game.paddleW * 1.5 / 2 : game.paddleW / 2;
    game.paddleX = Math.min(Math.max(game.paddleX, SIDE + halfW), W - SIDE - halfW);
  }

  els.canvas.addEventListener("pointermove", steerFromEvent);
  els.canvas.addEventListener("pointerdown", (event) => {
    steerFromEvent(event);
    if (game.state === "ready") launchBalls();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "a") game.keys.left = true;
    if (event.key === "ArrowRight" || event.key === "d") game.keys.right = true;
    if (event.key === " ") {
      event.preventDefault();
      if (game.state === "ready") launchBalls();
      else if (game.state === "playing") game.state = "paused";
      else if (game.state === "paused") game.state = "playing";
    }
  });
  document.addEventListener("keyup", (event) => {
    if (event.key === "ArrowLeft" || event.key === "a") game.keys.left = false;
    if (event.key === "ArrowRight" || event.key === "d") game.keys.right = false;
  });

  els.playButton.addEventListener("click", () => {
    if (game.state === "levelClear") startGame(false);
    else startGame(true);
  });
  els.soundButton.addEventListener("click", () => {
    if (!window.GameHubJuice) return;
    GameHubJuice.muted = !GameHubJuice.muted;
    els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  });

  updateHud();
  buildLevel(1);
  spawnBall(true);
  requestAnimationFrame((ts) => {
    game.lastTs = ts;
    tick(ts);
  });
})();
