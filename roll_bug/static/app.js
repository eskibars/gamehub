/*
 * Roll-a-Bug — the school-classic roll-and-draw party game, pass-and-play.
 * Pick a creature, roll the die, and hand-draw the part you rolled onto your
 * own canvas with your own hand. First bug with all six parts wins, then the
 * gallery compares everyone's art.
 *
 * Six creatures ship, each owning its own six parts (so a snail rolls a shell,
 * and a bee rolls a stinger). House rules: "School classic" lets you draw
 * parts in any rolled order (spots before body is the joke); "Proper bug"
 * gates parts behind their prerequisites; the extra challenge makes you roll
 * each number N times before you may draw it.
 */
(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   * Creatures                                                           *
   * Every creature owns six parts in die order (index 0 = a roll of 1),  *
   * the prerequisites "proper bug" mode enforces by part name, and the   *
   * art used for the setup preview, draw thumbnail, and gallery target.  *
   * ------------------------------------------------------------------ */

  const CREATURES = [
    {
      id: "ladybug",
      name: "Ladybug",
      emoji: "🐞",
      parts: [
        { name: "body", glyph: "🍅" },
        { name: "head", glyph: "⚫" },
        { name: "spots", glyph: "🔴" },
        { name: "wings", glyph: "🪽" },
        { name: "antennae", glyph: "🥢" },
        { name: "feet", glyph: "🐾" },
      ],
      prereqs: {
        body: [],
        head: ["body"],
        spots: ["body"],
        wings: ["body"],
        feet: ["body"],
        antennae: ["head"],
      },
      art: ladybugSVG,
    },
    {
      id: "bee",
      name: "Bee",
      emoji: "🐝",
      parts: [
        { name: "body", glyph: "🍯" },
        { name: "head", glyph: "⚫" },
        { name: "stripes", glyph: "🦓" },
        { name: "wings", glyph: "🪽" },
        { name: "antennae", glyph: "🥢" },
        { name: "stinger", glyph: "📍" },
      ],
      prereqs: {
        body: [],
        head: ["body"],
        stripes: ["body"],
        wings: ["body"],
        antennae: ["head"],
        stinger: ["body"],
      },
      art: beeSVG,
    },
    {
      id: "butterfly",
      name: "Butterfly",
      emoji: "🦋",
      parts: [
        { name: "body", glyph: "🐛" },
        { name: "head", glyph: "⚫" },
        { name: "upper wings", glyph: "🔶" },
        { name: "lower wings", glyph: "🔻" },
        { name: "spots", glyph: "🔴" },
        { name: "antennae", glyph: "🥢" },
      ],
      prereqs: {
        body: [],
        head: ["body"],
        "upper wings": ["body"],
        "lower wings": ["body"],
        spots: ["upper wings"],
        antennae: ["head"],
      },
      art: butterflySVG,
    },
    {
      id: "snail",
      name: "Snail",
      emoji: "🐌",
      parts: [
        { name: "body", glyph: "🍞" },
        { name: "head", glyph: "⚫" },
        { name: "eye stalks", glyph: "👀" },
        { name: "shell", glyph: "🌀" },
        { name: "spiral", glyph: "💫" },
        { name: "slime trail", glyph: "💧" },
      ],
      prereqs: {
        body: [],
        head: ["body"],
        "eye stalks": ["head"],
        shell: ["body"],
        spiral: ["shell"],
        "slime trail": ["body"],
      },
      art: snailSVG,
    },
    {
      id: "caterpillar",
      name: "Caterpillar",
      emoji: "🐛",
      parts: [
        { name: "body", glyph: "🍈" },
        { name: "head", glyph: "⚫" },
        { name: "segments", glyph: "🧩" },
        { name: "feet", glyph: "🐾" },
        { name: "antennae", glyph: "🥢" },
        { name: "spots", glyph: "🔴" },
      ],
      prereqs: {
        body: [],
        head: ["body"],
        segments: ["body"],
        feet: ["body"],
        antennae: ["head"],
        spots: ["body"],
      },
      art: caterpillarSVG,
    },
    {
      id: "beetle",
      name: "Beetle",
      emoji: "🪲",
      parts: [
        { name: "body", glyph: "🥔" },
        { name: "head", glyph: "⚫" },
        { name: "wing case", glyph: "🛡️" },
        { name: "legs", glyph: "🦵" },
        { name: "horns", glyph: "🌙" },
        { name: "antennae", glyph: "🥢" },
      ],
      prereqs: {
        body: [],
        head: ["body"],
        "wing case": ["body"],
        legs: ["body"],
        horns: ["head"],
        antennae: ["head"],
      },
      art: beetleSVG,
    },
  ];

  function creatureById(id) {
    return CREATURES.find((creature) => creature.id === id) || CREATURES[0];
  }
  const AVATARS = ["🐞", "🦋", "🐝", "🐛", "🦗", "🕷️", "🐢", "🦔"];
  const BRUSH_COLORS = ["#20231f", "#d0342c", "#e8874e", "#2f8c5a", "#3565b8", "#8a4a8c"];
  const BRUSH_SIZES = [4, 10, 22];
  const CANVAS_SIZE = 512;
  const SAVE_KEY = "gamehub-rollbug-v1";

  const els = {};
  [
    "playerRows", "addPlayer", "modeRow", "streakRow", "startButton",
    "resumeRow", "resumeButton", "discardButton", "referenceBugSetup",
    "creaturePicker", "legendList", "legendCreature", "legendNote",
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
    creatureId: "ladybug",
    winner: null,
    wins: {}, // name -> win count (persisted meta)
  };

  // The creature everyone is building this game.
  function currentCreature() {
    return creatureById(game.creatureId);
  }

  function currentParts() {
    return currentCreature().parts;
  }

  function currentPrereqs() {
    return currentCreature().prereqs;
  }

  /* ------------------------------------------------------------------ *
   * Reference bug art                                                   *
   * ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ *
   * Reference art                                                       *
   * One function per creature returning an SVG string, so the same      *
   * drawing serves the setup preview, the draw-overlay thumbnail, and    *
   * the gallery's "target" card. Style follows the hub: flat fills, a    *
   * single ink outline, and one warm accent colour per creature.         *
   * ------------------------------------------------------------------ */

  const INK = "#20231f";
  let artUid = 0;

  // Both eyes at once, mirrored about cx so the face never sits askew.
  function eyes(cx, cy, dx, r) {
    return `<circle cx="${cx - dx}" cy="${cy}" r="${r}" fill="#fff"/>` +
      `<circle cx="${cx + dx}" cy="${cy}" r="${r}" fill="#fff"/>` +
      `<circle cx="${cx - dx + 1}" cy="${cy + 1}" r="${r * 0.46}" fill="${INK}"/>` +
      `<circle cx="${cx + dx - 1}" cy="${cy + 1}" r="${r * 0.46}" fill="${INK}"/>`;
  }

  function smile(cx, cy, w) {
    return `<path d="M${cx - w} ${cy} Q${cx} ${cy + w * 0.7} ${cx + w} ${cy}" ` +
      `stroke="#fff" stroke-width="3" fill="none"/>`;
  }

  // Archimedean spiral as a polyline — used for the snail's shell coil.
  function spiralPath(cx, cy, turns, r0, r1, steps) {
    let d = "";
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const angle = t * turns * Math.PI * 2;
      const r = r0 + (r1 - r0) * t;
      const x = (cx + Math.cos(angle) * r).toFixed(1);
      const y = (cy + Math.sin(angle) * r).toFixed(1);
      d += `${i ? "L" : "M"}${x} ${y} `;
    }
    return d.trim();
  }

  function ladybugSVG() {
    // Drawn back-to-front so the parts stack the way a real bug reads:
    // legs peeking out, then head + face, then the black body rind, then the
    // two red wing panels with a seam down the middle, then the spots.
    // Every coordinate is symmetric about x = 100 so nothing sits askew.
    return `<svg viewBox="0 0 200 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Reference ladybug: black head with two eyes, six legs, two antennae, and two red wings with black spots">
      <g transform="translate(0 4.5)" stroke-linecap="round" stroke-linejoin="round">
        <g stroke="#20231f" stroke-width="4" fill="none">
          <path d="M54 98 L18 92"/><path d="M44 122 L10 124"/><path d="M52 146 L22 168"/>
          <path d="M146 98 L182 92"/><path d="M156 122 L190 124"/><path d="M148 146 L178 168"/>
        </g>
        <circle cx="100" cy="54" r="26" fill="#20231f"/>
        <g stroke="#20231f" stroke-width="4" fill="none">
          <path d="M84 36 Q74 18 60 16"/><path d="M116 36 Q126 18 140 16"/>
        </g>
        <circle cx="58" cy="15" r="4.5" fill="#20231f"/><circle cx="142" cy="15" r="4.5" fill="#20231f"/>
        <circle cx="88" cy="47" r="6.5" fill="#fff"/><circle cx="112" cy="47" r="6.5" fill="#fff"/>
        <circle cx="89" cy="48" r="3" fill="#20231f"/><circle cx="111" cy="48" r="3" fill="#20231f"/>
        <path d="M91 58 Q100 65 109 58" stroke="#fff" stroke-width="3" fill="none"/>
        <ellipse cx="100" cy="115" rx="61" ry="51" fill="#20231f"/>
        <path d="M98 68 A55 47 0 0 0 98 162 Z" fill="#d0342c"/>
        <path d="M102 68 A55 47 0 0 1 102 162 Z" fill="#d0342c"/>
        <g fill="#20231f">
          <circle cx="68" cy="96" r="11"/><circle cx="62" cy="134" r="8.5"/><circle cx="86" cy="124" r="7"/>
          <circle cx="132" cy="96" r="11"/><circle cx="138" cy="134" r="8.5"/><circle cx="114" cy="124" r="7"/>
        </g>
      </g>
    </svg>`;
  }

  function beeSVG() {
    const uid = `bee-clip-${++artUid}`;
    return `<svg viewBox="0 0 200 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Reference bee: black head with two eyes and two antennae, gold body with black stripes, two wings, and a stinger">
      <defs><clipPath id="${uid}"><ellipse cx="100" cy="114" rx="51" ry="47"/></clipPath></defs>
      <g stroke-linecap="round" stroke-linejoin="round">
        <path d="M100 176 L93 160 L107 160 Z" fill="${INK}"/>
        <g fill="#eef4ff" stroke="${INK}" stroke-width="4">
          <ellipse cx="54" cy="80" rx="31" ry="16" transform="rotate(-22 54 80)"/>
          <ellipse cx="146" cy="80" rx="31" ry="16" transform="rotate(22 146 80)"/>
        </g>
        <g stroke="${INK}" stroke-width="4" fill="none">
          <path d="M86 42 Q76 22 62 20"/><path d="M114 42 Q124 22 138 20"/>
        </g>
        <circle cx="60" cy="19" r="4.5" fill="${INK}"/><circle cx="140" cy="19" r="4.5" fill="${INK}"/>
        <circle cx="100" cy="58" r="25" fill="${INK}"/>
        ${eyes(100, 54, 11, 6.5)}
        ${smile(100, 66, 8)}
        <ellipse cx="100" cy="114" rx="51" ry="47" fill="#dfb44e"/>
        <g clip-path="url(#${uid})">
          <rect x="45" y="96" width="110" height="15" fill="${INK}"/>
          <rect x="45" y="128" width="110" height="15" fill="${INK}"/>
        </g>
        <ellipse cx="100" cy="114" rx="51" ry="47" fill="none" stroke="${INK}" stroke-width="5"/>
      </g>
    </svg>`;
  }

  function butterflySVG() {
    return `<svg viewBox="0 0 200 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Reference butterfly: slim black body with a head, two antennae, two large orange upper wings, two gold lower wings, and pale spots">
      <g stroke-linecap="round" stroke-linejoin="round">
        <g fill="#e8874e" stroke="${INK}" stroke-width="5">
          <ellipse cx="58" cy="84" rx="42" ry="33" transform="rotate(-18 58 84)"/>
          <ellipse cx="142" cy="84" rx="42" ry="33" transform="rotate(18 142 84)"/>
        </g>
        <g fill="#dfb44e" stroke="${INK}" stroke-width="5">
          <ellipse cx="66" cy="138" rx="31" ry="25" transform="rotate(20 66 138)"/>
          <ellipse cx="134" cy="138" rx="31" ry="25" transform="rotate(-20 134 138)"/>
        </g>
        <g fill="#fffdf7">
          <circle cx="44" cy="76" r="8"/><circle cx="156" cy="76" r="8"/>
          <circle cx="60" cy="136" r="6"/><circle cx="140" cy="136" r="6"/>
        </g>
        <g stroke="${INK}" stroke-width="4" fill="none">
          <path d="M92 40 Q82 18 64 14"/><path d="M108 40 Q118 18 136 14"/>
        </g>
        <circle cx="62" cy="13" r="4.5" fill="${INK}"/><circle cx="138" cy="13" r="4.5" fill="${INK}"/>
        <ellipse cx="100" cy="106" rx="13" ry="56" fill="${INK}"/>
        <circle cx="100" cy="50" r="16" fill="${INK}"/>
        ${eyes(100, 46, 7, 4.5)}
        ${smile(100, 56, 5)}
      </g>
    </svg>`;
  }

  function snailSVG() {
    return `<svg viewBox="0 0 200 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Reference snail: pale body with a head, two eye stalks, a big gold shell with a spiral, and a slime trail">
      <g stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 168 Q100 182 188 168" stroke="#bcd7e4" stroke-width="10" fill="none"/>
        <rect x="24" y="122" width="128" height="40" rx="20" fill="#f0d9a8" stroke="${INK}" stroke-width="5"/>
        <circle cx="40" cy="116" r="22" fill="#f0d9a8" stroke="${INK}" stroke-width="5"/>
        <g stroke="${INK}" stroke-width="4" fill="none">
          <path d="M34 98 Q28 76 24 64"/><path d="M48 98 Q50 76 54 64"/>
        </g>
        <circle cx="23" cy="62" r="5" fill="${INK}"/><circle cx="55" cy="62" r="5" fill="${INK}"/>
        <circle cx="128" cy="100" r="52" fill="#dfb44e" stroke="${INK}" stroke-width="5"/>
        <path d="${spiralPath(128, 100, 2.6, 5, 40, 64)}" stroke="${INK}" stroke-width="4" fill="none"/>
      </g>
    </svg>`;
  }

  function caterpillarSVG() {
    return `<svg viewBox="0 0 200 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Reference caterpillar: green segmented body, a lighter head with two eyes and two antennae, small feet, and gold spots">
      <g stroke-linecap="round" stroke-linejoin="round">
        <g stroke="${INK}" stroke-width="6" fill="none">
          <path d="M78 146 L78 164"/><path d="M105 146 L105 164"/>
          <path d="M132 146 L132 164"/><path d="M155 146 L155 164"/>
        </g>
        <rect x="22" y="96" width="152" height="54" rx="27" fill="#2f8c5a" stroke="${INK}" stroke-width="5"/>
        <g stroke="${INK}" stroke-width="3.5" fill="none">
          <path d="M78 99 Q71 123 78 147"/><path d="M108 99 Q101 123 108 147"/>
          <path d="M138 99 Q131 123 138 147"/>
        </g>
        <g fill="#dfb44e">
          <circle cx="93" cy="110" r="6.5"/><circle cx="126" cy="110" r="6.5"/><circle cx="110" cy="136" r="6"/>
        </g>
        <circle cx="40" cy="123" r="27" fill="#46a878" stroke="${INK}" stroke-width="5"/>
        <g stroke="${INK}" stroke-width="4" fill="none">
          <path d="M32 99 Q26 79 20 69"/><path d="M48 99 Q52 79 58 69"/>
        </g>
        <circle cx="19" cy="67" r="4.5" fill="${INK}"/><circle cx="59" cy="67" r="4.5" fill="${INK}"/>
        ${eyes(40, 116, 9, 6)}
        ${smile(40, 127, 7)}
      </g>
    </svg>`;
  }

  function beetleSVG() {
    return `<svg viewBox="0 0 200 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Reference beetle: black head with two eyes, two horns and two antennae, six legs, and a brown body with two wing cases">
      <g stroke-linecap="round" stroke-linejoin="round">
        <g stroke="${INK}" stroke-width="4" fill="none">
          <path d="M52 104 L16 92"/><path d="M44 128 L8 128"/><path d="M52 152 L20 172"/>
          <path d="M148 104 L184 92"/><path d="M156 128 L192 128"/><path d="M148 152 L180 172"/>
        </g>
        <g stroke="#dfb44e" stroke-width="8" fill="none">
          <path d="M80 46 Q58 20 36 26"/><path d="M120 46 Q142 20 164 26"/>
        </g>
        <g stroke="${INK}" stroke-width="3.5" fill="none">
          <path d="M92 40 Q85 22 77 16"/><path d="M108 40 Q115 22 123 16"/>
        </g>
        <circle cx="76" cy="15" r="3.5" fill="${INK}"/><circle cx="124" cy="15" r="3.5" fill="${INK}"/>
        <circle cx="100" cy="58" r="24" fill="${INK}"/>
        ${eyes(100, 50, 10, 6.5)}
        ${smile(100, 60, 8)}
        <ellipse cx="100" cy="118" rx="57" ry="49" fill="#6f4a28"/>
        <path d="M97 74 A52 44 0 0 0 97 162 Z" fill="#96693a"/>
        <path d="M103 74 A52 44 0 0 1 103 162 Z" fill="#96693a"/>
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
      creatureId: game.creatureId,
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
    // Saves from before the creature chooser have no creatureId: ladybug.
    game.creatureId = creatureById(data.creatureId).id;
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

  function renderCreaturePicker() {
    els.creaturePicker.innerHTML = "";
    CREATURES.forEach((creature) => {
      const card = document.createElement("label");
      card.className = "creature-card" + (creature.id === game.creatureId ? " active" : "");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "creature";
      input.value = creature.id;
      input.checked = creature.id === game.creatureId;
      input.addEventListener("change", () => {
        game.creatureId = creature.id;
        renderCreaturePicker();
        renderReference();
        GameHubJuice.tick();
      });
      const preview = document.createElement("span");
      preview.className = "creature-preview";
      preview.innerHTML = creature.art();
      const label = document.createElement("span");
      label.className = "creature-name";
      label.textContent = `${creature.emoji} ${creature.name}`;
      card.append(input, preview, label);
      els.creaturePicker.append(card);
    });
  }

  // "a, b and c" — used to keep the proper-bug note readable.
  function listWords(words) {
    if (words.length <= 1) return words.join("");
    return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  }

  // Parts that name more than one thing take a plural verb ("the antennae
  // need"), so the proper-bug note doesn't read as broken English.
  const IRREGULAR_PLURALS = new Set(["antennae", "feet"]);

  function isPluralPart(name) {
    return IRREGULAR_PLURALS.has(name) || name.endsWith("s");
  }

  // Spell out this creature's real prerequisites, grouped by what they wait on,
  // so the note never claims a snail has antennae.
  function orderedNote(creature) {
    const groups = new Map();
    for (const part of creature.parts) {
      const pre = creature.prereqs[part.name] || [];
      if (!pre.length) continue;
      const key = pre.join("+");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(part.name);
    }
    const clauses = [];
    for (const [key, parts] of groups) {
      const pres = key.split("+");
      const subject = parts.length === 1 ? `the ${parts[0]}` : listWords(parts);
      const plural = parts.length > 1 || isPluralPart(parts[0]);
      const needed = listWords(pres.map((pre) => `the ${pre}`));
      clauses.push(`${subject} ${plural ? "need" : "needs"} ${needed}`);
    }
    return `Proper-bug order: the body comes first — ${clauses.join(", ")}.`;
  }

  // The "Every roll picks a part" list plus the "The target" drawing, both
  // rebuilt whenever the chosen creature changes.
  function renderReference() {
    const creature = currentCreature();
    els.legendCreature.textContent = creature.name.toLowerCase();
    els.legendList.innerHTML = "";
    creature.parts.forEach((part, index) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="mini-die" data-n="${index + 1}">${index + 1}</span> ${part.name}`;
      els.legendList.append(li);
    });
    els.legendNote.textContent =
      `First bug with all six parts wins, then everyone compares drawings — ` +
      `the weirder the better. ${orderedNote(creature)}`;
    els.referenceBugSetup.innerHTML = creature.art();
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
    game.creatureId = creatureById(game.creatureId).id;
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
    const prereqs = currentPrereqs();
    els.partsGrid.innerHTML = "";
    for (const part of currentParts()) {
      const chip = document.createElement("div");
      chip.className = "part-chip";
      const drawn = player.parts.has(part.name);
      const count = player.rollCounts[part.name] || 0;
      const locked = game.mode === "ordered" && !drawn &&
        (prereqs[part.name] || []).some((pre) => !player.parts.has(pre));
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
    const part = currentParts()[value - 1];
    player.rolls += 1;
    player.rollCounts[part.name] = (player.rollCounts[part.name] || 0) + 1;
    const count = player.rollCounts[part.name];
    let blocked = null;

    if (player.parts.has(part.name)) {
      blocked = `You already drew the ${part.name}! Roll again.`;
    } else if (game.mode === "ordered") {
      const missing = (currentPrereqs()[part.name] || []).find((pre) => !player.parts.has(pre));
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
    els.referenceThumb.innerHTML = currentCreature().art();
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

    if (player.parts.size === currentParts().length) {
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
    const creature = currentCreature();
    game.phase = "done";
    game.winner = winner.name;
    game.wins[winner.name] = (game.wins[winner.name] || 0) + 1;
    const isRecord = game.wins[winner.name] === 1;
    GameHubProfile?.achieve("rollbug-win");
    if (game.wins[winner.name] >= 3) GameHubProfile?.achieve("rollbug-3");
    if (game.mode === "ordered") GameHubProfile?.achieve("rollbug-master");
    GameHubProfile?.award(
      "roll-bug", 8,
      `First ${creature.name.toLowerCase()} finished! ${creature.emoji}`,
      game.wins[winner.name],
    );
    GameHubJuice.confetti(200);
    GameHubJuice.win();
    saveGame();
    showGallery(winner);
  }

  function showGallery(winner) {
    const creature = currentCreature();
    els.galleryTitle.textContent = `${creature.emoji} ${creature.name} gallery!`;
    els.gallerySub.textContent = winner
      ? `${winner.avatar} ${winner.name} finished first with ${winner.rolls} rolls — behold the fleet:`
      : "The fleet, in all its glory:";
    els.galleryGrid.innerHTML = "";
    const referenceCard = document.createElement("div");
    referenceCard.className = "gallery-card";
    referenceCard.innerHTML = `<div class="reference-bug">${creature.art()}</div><span class="gallery-name">The target 📋</span>`;
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
      const parts = `${player.parts.size}/${currentParts().length}`;
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

  // Leaving the table (either quitting or starting over) returns to setup with
  // the player list and the creature picker reflecting current game state.
  function backToSetup() {
    game.phase = "setup";
    saveGame();
    els.gameScreen.hidden = true;
    els.setupScreen.hidden = false;
    setupPlayers();
    renderCreaturePicker();
    renderReference();
  }

  els.quitButton.addEventListener("click", () => {
    if (!window.confirm("End this game and go back to setup?")) return;
    backToSetup();
  });

  els.againButton.addEventListener("click", () => {
    els.galleryOverlay.hidden = true;
    els.peekButton.hidden = true;
    backToSetup();
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

  renderCreaturePicker();
  renderReference();
  if (window.GameHubJuice) els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  setupPlayers();
  const saved = loadSavedGame();
  if (saved) {
    els.resumeRow.hidden = false;
    const savedCreature = creatureById(saved.creatureId);
    els.resumeButton.textContent =
      `Resume game (${saved.players.map((p) => p.name).join(", ")} · ${savedCreature.name})`;
  }
})();
