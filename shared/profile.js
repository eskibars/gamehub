/*
 * GameHub shared player profile — one identity, XP balance, and per-game
 * bests across every game on the hub. Stored in localStorage so it works
 * fully offline.
 *
 * Games integrate with one line (usually where a round ends):
 *   GameHubProfile.award("snake", 4, "apples eaten");
 * Points are added to the balance, a floating "+N" toast confirms it, and
 * the best score for the game is kept if it beats the previous one.
 */
(function initGameHubProfile() {
  const STORAGE_KEY = "gamehub-profile-v1";
  const LEVEL_STEP = 100;
  const RANKS = [
    "Newcomer", "Regular", "Contender", "Sharp", "Shark",
    "High Roller", "Legend", "Grandmaster", "Hall of Famer",
  ];
  const AVATARS = ["🎲", "🃏", "♟️", "🎯", "🧩", "🚂", "🐋", "🦊", "👾", "👑"];

  function defaults() {
    return {
      name: "",
      avatar: AVATARS[Math.floor(Math.random() * (AVATARS.length - 1))],
      xp: 0,
      plays: 0,
      bests: {},
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults();
      const saved = JSON.parse(raw);
      return { ...defaults(), ...saved, bests: saved.bests || {} };
    } catch {
      return defaults();
    }
  }

  let profile = load();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // Storage unavailable; profile lives for this session only.
    }
  }

  function level(xp = profile.xp) {
    return Math.floor(xp / LEVEL_STEP) + 1;
  }

  function rank(levelValue = level()) {
    return RANKS[Math.min(levelValue - 1, RANKS.length - 1)];
  }

  function levelProgress(xp = profile.xp) {
    return {
      into: xp % LEVEL_STEP,
      step: LEVEL_STEP,
      next: LEVEL_STEP - (xp % LEVEL_STEP),
    };
  }

  function ensureStyles() {
    if (document.getElementById("gamehub-profile-styles")) return;
    const style = document.createElement("style");
    style.id = "gamehub-profile-styles";
    style.textContent = `
      .ghp-toast {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 9999;
        display: grid;
        gap: 2px;
        border: 1px solid rgba(35, 108, 90, 0.4);
        border-radius: 12px;
        background: rgba(255, 250, 240, 0.97);
        box-shadow: 0 12px 34px rgba(32, 35, 31, 0.22);
        padding: 10px 16px;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        animation: ghp-float 2.8s ease forwards;
        pointer-events: none;
      }
      .ghp-toast b {
        color: #236c5a;
        font-size: 1.05rem;
      }
      .ghp-toast span {
        color: #647069;
        font-size: 0.78rem;
        font-weight: 700;
      }
      @keyframes ghp-float {
        0% { opacity: 0; transform: translateY(14px); }
        12% { opacity: 1; transform: translateY(0); }
        80% { opacity: 1; }
        100% { opacity: 0; transform: translateY(-10px); }
      }
    `;
    document.head.append(style);
  }

  function toast(points, note, leveledUp) {
    ensureStyles();
    const el = document.createElement("div");
    el.className = "ghp-toast";
    const strong = document.createElement("b");
    strong.textContent = `+${points} chip${points === 1 ? "" : "s"}`;
    const span = document.createElement("span");
    span.textContent = note
      ? `${note} · ${leveledUp ? `Level up! ${rank()}` : `Level ${level()} · ${rank()}`}`
      : leveledUp ? `Level up! ${rank()}` : `Level ${level()} · ${rank()}`;
    el.append(strong, span);
    document.body.append(el);
    setTimeout(() => el.remove(), 2800);
  }

  function notify() {
    try {
      window.dispatchEvent(new CustomEvent("gamehub-profile"));
    } catch {
      // Environments without CustomEvent still get correct storage.
    }
  }

  window.GameHubProfile = {
    AVATARS,
    LEVEL_STEP,
    get() {
      return { ...profile, bests: { ...profile.bests } };
    },
    setIdentity({ name, avatar } = {}) {
      if (typeof name === "string") profile.name = name.slice(0, 24);
      if (typeof avatar === "string") profile.avatar = avatar.slice(0, 4);
      save();
      notify();
      return this.get();
    },
    award(gameId, points, note, score) {
      const amount = Math.max(0, Math.round(Number(points) || 0));
      const beforeLevel = level();
      profile.xp += amount;
      profile.plays += 1;
      if (gameId) {
        const bestValue = score === undefined ? amount : Math.round(Number(score) || 0);
        const previous = profile.bests[gameId];
        if (previous === undefined || bestValue > previous.value) {
          profile.bests[gameId] = { value: bestValue, at: new Date().toISOString() };
        }
      }
      save();
      notify();
      if (amount > 0 && document.body) toast(amount, note, level() > beforeLevel);
      return this.get();
    },
    best(gameId) {
      return profile.bests[gameId]?.value;
    },
    level,
    rank,
    levelProgress,
  };
})();
