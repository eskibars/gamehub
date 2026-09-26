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
  const DAILY_BONUS = 50;
  const DAILY_LOG_DAYS = 40;

  function defaults() {
    return {
      name: "",
      avatar: AVATARS[Math.floor(Math.random() * (AVATARS.length - 1))],
      xp: 0,
      plays: 0,
      bests: {},
      // Lifetime per-game play counts (gamesPlayed.gameId = rounds played).
      gamesPlayed: {},
      // Unlocked achievements: achievements[id] = ISO timestamp.
      achievements: {},
      // Rolling per-day activity log that powers the Daily Challenge:
      // { "2026-09-25": { games: { snake: { chips, plays } }, newBest: bool } }
      dailyLog: {},
      // Completed daily challenges: { "2026-09-25": { id: "featured", at: iso } }
      dailyDone: {},
      streakBest: 0,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults();
      const saved = JSON.parse(raw);
      return {
        ...defaults(),
        ...saved,
        bests: saved.bests || {},
        gamesPlayed: saved.gamesPlayed || {},
        achievements: saved.achievements || {},
        dailyLog: saved.dailyLog || {},
        dailyDone: saved.dailyDone || {},
      };
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

  function dateKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function shiftDateKey(key, days) {
    const [y, m, d] = key.split("-").map(Number);
    const shifted = new Date(y, m - 1, d + days);
    return dateKey(shifted);
  }

  function trimDailyLog() {
    const keys = Object.keys(profile.dailyLog).sort();
    while (keys.length > DAILY_LOG_DAYS) {
      delete profile.dailyLog[keys.shift()];
    }
    const doneKeys = Object.keys(profile.dailyDone).sort();
    while (doneKeys.length > DAILY_LOG_DAYS) {
      delete profile.dailyDone[doneKeys.shift()];
    }
  }

  /*
   * Daily Challenge — one deterministic challenge per calendar day for every
   * game on the hub. Progress is read from the dailyLog that award() keeps,
   * so every game that grants chips automatically supports the daily with no
   * per-game code. Completing it pays a +50 chip bonus and keeps a streak.
   */
  const DAILY_GAMES = [
    { id: "g2048", title: "2048", href: "/2048/" },
    { id: "snake", title: "Snake", href: "/snake/" },
    { id: "word-guess", title: "Word Guess", href: "/word-guess/" },
    { id: "minesweeper", title: "Minesweeper", href: "/minesweeper/" },
    { id: "simon", title: "Simon Says", href: "/simon/" },
    { id: "sliding-puzzle", title: "Sliding Puzzle", href: "/sliding-puzzle/" },
    { id: "lights-out", title: "Lights Out", href: "/lights-out/" },
    { id: "memory", title: "Memory Match", href: "/memory/" },
    { id: "connect-four", title: "Connect Four", href: "/connect-four/" },
    { id: "sudoku", title: "Sudoku", href: "/sudoku/" },
    { id: "block-drop", title: "Block Drop", href: "/block-drop/" },
    { id: "solitaire", title: "Solitaire", href: "/solitaire/" },
    { id: "reversi", title: "Reversi", href: "/reversi/" },
    { id: "blackjack", title: "Blackjack", href: "/blackjack/" },
    { id: "chess", title: "Chess", href: "/chess/" },
    { id: "gem-crush", title: "Gem Crush", href: "/gem-crush/" },
    { id: "melon-drop", title: "Melon Drop", href: "/melon-drop/" },
    { id: "breakout", title: "Breakout", href: "/breakout/" },
    { id: "mahjong", title: "Mahjong", href: "/mahjong/" },
    { id: "nonogram", title: "Nonogram", href: "/nonogram/" },
    { id: "sokoban", title: "Sokoban", href: "/sokoban/" },
    { id: "crazy-eights", title: "Eights", href: "/crazy-eights/" },
    { id: "dominoes", title: "Dominoes", href: "/dominoes/" },
    { id: "mancala", title: "Mancala", href: "/mancala/" },
  ];
  const DAILY_TYPES = ["featured", "explorer", "earner", "record"];

  function hashKey(key) {
    let h = 2166136261;
    for (let i = 0; i < key.length; i += 1) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function dayChallenge(key = dateKey()) {
    const h = hashKey(`gamehub-daily-${key}`);
    const type = DAILY_TYPES[h % DAILY_TYPES.length];
    const game = DAILY_GAMES[(h >>> 4) % DAILY_GAMES.length];
    if (type === "featured") {
      return {
        id: `featured-${game.id}`,
        type,
        gameId: game.id,
        title: `${game.title} day`,
        description: `Finish a round of ${game.title} today to bank the bonus.`,
        target: 1,
      };
    }
    if (type === "explorer") {
      return {
        id: "explorer",
        type,
        title: "Table hop",
        description: "Play 3 different games today.",
        target: 3,
      };
    }
    if (type === "earner") {
      return {
        id: "earner",
        type,
        title: "Chip harvest",
        description: "Earn 25 chips today, any way you like.",
        target: 25,
      };
    }
    return {
      id: "record",
      type: "record",
      title: "Record run",
      description: "Beat one of your personal bests today.",
      target: 1,
    };
  }

  function dayProgress(challenge, key = dateKey()) {
    const day = profile.dailyLog[key];
    if (!day) return 0;
    if (challenge.type === "featured") {
      return day.games[challenge.gameId]?.plays > 0 ? 1 : 0;
    }
    if (challenge.type === "explorer") {
      return Math.min(challenge.target, Object.keys(day.games).length);
    }
    if (challenge.type === "earner") {
      const chips = Object.values(day.games).reduce((sum, g) => sum + g.chips, 0);
      return Math.min(challenge.target, chips);
    }
    return day.newBest ? 1 : 0;
  }

  function dailyStreak() {
    let current = 0;
    let cursor = dateKey();
    if (!profile.dailyDone[cursor]) cursor = shiftDateKey(cursor, -1);
    while (profile.dailyDone[cursor]) {
      current += 1;
      cursor = shiftDateKey(cursor, -1);
    }
    const best = Math.max(profile.streakBest || 0, current);
    return { current, best };
  }

  function dailyHistory(n = 7) {
    const days = [];
    for (let i = n - 1; i >= 0; i -= 1) {
      const key = shiftDateKey(dateKey(), -i);
      days.push({ dateKey: key, done: Boolean(profile.dailyDone[key]) });
    }
    return days;
  }

  function checkDaily() {
    const key = dateKey();
    const challenge = dayChallenge(key);
    if (profile.dailyDone[key]) return null;
    if (dayProgress(challenge, key) < challenge.target) return null;
    profile.dailyDone[key] = { id: challenge.id, at: new Date().toISOString() };
    const { current } = dailyStreak();
    profile.streakBest = Math.max(profile.streakBest || 0, current);
    trimDailyLog();
    save();
    notify();
    if (document.body) dailyToast(DAILY_BONUS, current);
    setTimeout(checkAchievements, 1000);
    return { bonus: DAILY_BONUS, streak: current };
  }

  function dailyToast(bonus, streakCount) {
    ensureStyles();
    const el = document.createElement("div");
    el.className = "ghp-toast ghp-daily-toast";
    const strong = document.createElement("b");
    strong.textContent = `Daily complete! +${bonus} chips`;
    const span = document.createElement("span");
    span.textContent = streakCount > 1 ? `🔥 ${streakCount}-day streak` : "🔥 Streak started";
    el.append(strong, span);
    document.body.append(el);
    setTimeout(() => el.remove(), 3200);
  }

  /*
   * Achievements — a trophy shelf that spans every game. Stat-based ones
   * (chips earned, rounds played, games tried, streaks) unlock automatically
   * whenever award() or the daily challenge runs; feat-based ones unlock
   * when a game calls GameHubProfile.achieve(id) at the moment of glory.
   */
  const ACHIEVEMENTS = [
    { id: "first-round", icon: "🎲", title: "Table Seated", description: "Finish your first round.", test: (p) => p.plays >= 1 },
    { id: "rounds-25", icon: "🔄", title: "Regular", description: "Play 25 rounds.", test: (p) => p.plays >= 25 },
    { id: "rounds-100", icon: "🏅", title: "Fixture", description: "Play 100 rounds.", test: (p) => p.plays >= 100 },
    { id: "chips-100", icon: "🪙", title: "Pocket Change", description: "Bank 100 chips.", test: (p) => p.xp >= 100 },
    { id: "chips-500", icon: "💰", title: "Chip Stack", description: "Bank 500 chips.", test: (p) => p.xp >= 500 },
    { id: "chips-2000", icon: "👑", title: "High Roller", description: "Bank 2,000 chips.", test: (p) => p.xp >= 2000 },
    { id: "tried-5", icon: "🧭", title: "Explorer", description: "Try 5 different games.", test: (p) => Object.keys(p.gamesPlayed).length >= 5 },
    { id: "tried-10", icon: "🗺️", title: "Tourist", description: "Try 10 different games.", test: (p) => Object.keys(p.gamesPlayed).length >= 10 },
    { id: "tried-all", icon: "🌍", title: "Full Circuit", description: `Try ${DAILY_GAMES.length} different games.`, test: (p) => Object.keys(p.gamesPlayed).length >= DAILY_GAMES.length },
    { id: "daily-first", icon: "📅", title: "On the Books", description: "Complete your first daily challenge.", test: (p) => Object.keys(p.dailyDone).length >= 1 },
    { id: "daily-10", icon: "🗓️", title: "Habit Forming", description: "Complete 10 daily challenges.", test: (p) => Object.keys(p.dailyDone).length >= 10 },
    { id: "streak-3", icon: "🔥", title: "Heating Up", description: "Hold a 3-day daily streak.", test: (p) => (p.streakBest || 0) >= 3 },
    { id: "streak-7", icon: "🌋", title: "Week of Fire", description: "Hold a 7-day daily streak.", test: (p) => (p.streakBest || 0) >= 7 },
    { id: "big-win", icon: "🎉", title: "Jackpot Feel", description: "Earn 30+ chips from a single round.", test: (p) => p.biggestAward >= 30 },
    { id: "g2048-1000", icon: "🔢", title: "Tile Whisperer", description: "Score 1,000 in 2048.", game: "g2048", test: (p) => (p.bests.g2048?.value || 0) >= 1000 },
    { id: "snake-15", icon: "🐍", title: "Apple Fest", description: "Eat 15 apples in one Snake run.", game: "snake", test: (p) => (p.bests.snake?.value || 0) >= 15 },
    { id: "simon-10", icon: "🎵", title: "Perfect Pitch", description: "Reach level 10 in Simon Says.", game: "simon", test: (p) => (p.bests.simon?.value || 0) >= 10 },
    { id: "blockdrop-2000", icon: "🧱", title: "Well Packer", description: "Score 2,000 in Block Drop.", game: "block-drop", test: (p) => (p.bests["block-drop"]?.value || 0) >= 2000 },
    // Feat-based — unlocked by games via achieve().
    { id: "chess-robot", icon: "♟️", title: "Robot Slayer", description: "Beat any chess robot.", game: "chess", test: null },
    { id: "chess-master", icon: "🏰", title: "Grandmaster", description: "Beat the Master chess robot.", game: "chess", test: null },
    { id: "gem-5", icon: "💎", title: "Gem Cutter", description: "Reach level 5 in Gem Crush.", game: "gem-crush", test: null },
    { id: "gem-10", icon: "💍", title: "Jeweler", description: "Reach level 10 in Gem Crush.", game: "gem-crush", test: null },
    { id: "watermelon", icon: "🍉", title: "Almighty Melon", description: "Create the watermelon in Melon Drop.", game: "melon-drop", test: null },
    { id: "breakout-5", icon: "🕹️", title: "Wall Wrecker", description: "Clear 5 Breakout walls in a row.", game: "breakout", test: null },
    { id: "mahjong-clear", icon: "🀄", title: "Bone Sweeper", description: "Clear a full Mahjong board.", game: "mahjong", test: null },
    { id: "nonogram-10", icon: "🖼️", title: "Pixel Painter", description: "Solve 10 Nonogram pictures.", game: "nonogram", test: null },
    { id: "nonogram-50", icon: "🎨", title: "Gallery Owner", description: "Solve 50 Nonogram pictures.", game: "nonogram", test: null },
    { id: "sokoban-5", icon: "📦", title: "Forklift Certified", description: "Clear 5 Sokoban levels.", game: "sokoban", test: null },
    { id: "sokoban-all", icon: "🏭", title: "Warehouse Master", description: "Clear every Sokoban level.", game: "sokoban", test: null },
    { id: "eights-win", icon: "🃏", title: "Eight Escape", description: "Win a hand of Eights.", game: "crazy-eights", test: null },
    { id: "eights-5", icon: "🂡", title: "Card Shark", description: "Win 5 hands of Eights.", game: "crazy-eights", test: null },
    { id: "dominoes-win", icon: "🁣", title: "Domino Effect", description: "Win a round of Dominoes.", game: "dominoes", test: null },
    { id: "dominoes-5", icon: "🁤", title: "Bone Roller", description: "Win 5 rounds of Dominoes.", game: "dominoes", test: null },
    { id: "mancala-win", icon: "🌾", title: "Seed Sower", description: "Win a game of Mancala.", game: "mancala", test: null },
    { id: "mancala-5", icon: "🌍", title: "Grand Harvest", description: "Win 5 games of Mancala.", game: "mancala", test: null },
  ];

  function achievementToast(achievement) {
    ensureStyles();
    const el = document.createElement("div");
    el.className = "ghp-toast ghp-achievement-toast";
    const strong = document.createElement("b");
    strong.textContent = `${achievement.icon} ${achievement.title}`;
    const span = document.createElement("span");
    span.textContent = `Achievement unlocked · ${Object.keys(profile.achievements).length}/${ACHIEVEMENTS.length}`;
    el.append(strong, span);
    document.body.append(el);
    setTimeout(() => el.remove(), 3600);
  }

  function unlockAchievement(id) {
    const achievement = ACHIEVEMENTS.find((a) => a.id === id);
    if (!achievement || profile.achievements[id]) return false;
    profile.achievements[id] = new Date().toISOString();
    save();
    notify();
    if (document.body) achievementToast(achievement);
    return true;
  }

  function checkAchievements() {
    for (const achievement of ACHIEVEMENTS) {
      if (achievement.test && !profile.achievements[achievement.id] && achievement.test(profile)) {
        unlockAchievement(achievement.id);
      }
    }
  }

  function achievementsView() {
    return ACHIEVEMENTS.map((achievement) => ({
      ...achievement,
      unlockedAt: profile.achievements[achievement.id] || null,
    }));
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
      .ghp-toast.ghp-daily-toast {
        bottom: 74px;
        border-color: rgba(223, 180, 78, 0.65);
        animation-duration: 3.2s;
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
      if (amount > (profile.biggestAward || 0)) profile.biggestAward = amount;
      let beatBest = false;
      if (gameId) {
        profile.gamesPlayed[gameId] = (profile.gamesPlayed[gameId] || 0) + 1;
        const bestValue = score === undefined ? amount : Math.round(Number(score) || 0);
        const previous = profile.bests[gameId];
        if (previous === undefined || bestValue > previous.value) {
          profile.bests[gameId] = { value: bestValue, at: new Date().toISOString() };
          beatBest = previous !== undefined;
        }
        // Feed the daily challenge log for today's date.
        const key = dateKey();
        const day = profile.dailyLog[key] || { games: {}, newBest: false };
        const entry = day.games[gameId] || { chips: 0, plays: 0 };
        entry.chips += amount;
        entry.plays += 1;
        day.games[gameId] = entry;
        if (beatBest) day.newBest = true;
        profile.dailyLog[key] = day;
        trimDailyLog();
      }
      save();
      notify();
      if (amount > 0 && document.body) toast(amount, note, level() > beforeLevel);
      if (window.GameHubDaily) window.GameHubDaily.checkNow();
      setTimeout(checkAchievements, amount > 0 ? 900 : 0);
      return this.get();
    },
    grantBonus(points, note) {
      const amount = Math.max(0, Math.round(Number(points) || 0));
      const beforeLevel = level();
      profile.xp += amount;
      save();
      notify();
      if (amount > 0 && document.body) toast(amount, note, level() > beforeLevel);
      return this.get();
    },
    best(gameId) {
      return profile.bests[gameId]?.value;
    },
    achieve(gameId) {
      return unlockAchievement(gameId);
    },
    achievements: achievementsView,
    achievementCount() {
      return {
        unlocked: Object.keys(profile.achievements).length,
        total: ACHIEVEMENTS.length,
      };
    },
    level,
    rank,
    levelProgress,
  };

  // Daily Challenge API for the hub and any game that wants to surface it.
  window.GameHubDaily = {
    today() {
      const challenge = dayChallenge();
      return {
        ...challenge,
        dateKey: dateKey(),
        progress: dayProgress(challenge),
        completed: Boolean(profile.dailyDone[dateKey()]),
        bonus: DAILY_BONUS,
      };
    },
    streak: dailyStreak,
    history: dailyHistory,
    checkNow: checkDaily,
  };

  // Register the root service worker so deep links into this game also get
  // offline coverage. Idempotent: browsers dedupe by URL + scope.
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  // Retroactive unlocks for long-time players the first time the new
  // achievement system sees their profile.
  if (document.body) setTimeout(checkAchievements, 1500);
})();
