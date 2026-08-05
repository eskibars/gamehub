// characters.js
// Deterministic character bank + SVG renderer for "Who Am I?".
// The same (seed, count) pair always produces the same pool of characters,
// so the server only needs to ship the seed and the secret index for each player.

(function (global) {
  "use strict";

  // ----- Seedable PRNG (Mulberry32) -----
  // Identical algorithm must run on the server in Python if we ever want the
  // server to do trait lookups. We keep the algorithm local-only for now and
  // the server only stores integer secret indices.
  function mulberry32(seed) {
    let state = (seed >>> 0) || 1;
    return function rand() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rng, options) {
    if (!options.length) return undefined;
    return options[Math.floor(rng() * options.length)];
  }

  function maybe(rng, probability) {
    return rng() < probability;
  }

  // ----- Trait banks -----
  const SKIN_COLORS = [
    "#fde2c4", "#f4cba0", "#e0a879", "#bf8157", "#8a5a3b", "#5d3b25"
  ];
  const EYE_COLORS = [
    "#3a6ea5", "#3b7a3b", "#7a5a35", "#3a3a3a", "#6e7a8a", "#4f6f4a", "#9b6f3a"
  ];
  const HAIR_COLORS = [
    "#1a1a1a", "#3a2820", "#5a3a1a", "#8a5a2a", "#b58a3a", "#d3b27a", "#cccccc", "#3a2a55"
  ];
  const FUR_COLORS = [
    "#1f1f1f", "#4a3a2a", "#6b4a2a", "#8a5a2a", "#b07a3a", "#d9b27a", "#e6e1d2", "#5a4a3a", "#a05a3a", "#7a4a30"
  ];
  const HAT_COLORS = [
    "#c84e4e", "#356eb8", "#2f6b4a", "#e2b34f", "#6e5cb8", "#1f1f1f", "#e2e2e2"
  ];
  const COLLAR_COLORS = [
    "#c84e4e", "#356eb8", "#2f6b4a", "#e2b34f", "#6e5cb8", "#1f1f1f", "#e2e2e2", "#a04a8a"
  ];

  const HAIR_STYLES = ["none", "short", "long", "ponytail", "bun", "curly", "buzz"];
  const HAT_STYLES = ["none", "beanie", "cap", "top"];
  const GLASSES_STYLES = ["none", "round", "square"];
  const EXPRESSIONS = ["smile", "neutral", "frown", "surprised"];
  const FACIAL_HAIR = ["none", "mustache", "beard"];
  const CAT_EAR_TILTS = ["up", "left", "right", "tilted"];
  const DOG_EARS = ["floppy", "pointed", "one-flop"];
  const DOG_NOSES = ["#1a1a1a", "#3a2a1a", "#a05a4a"];

  const KINDS = [
    { id: "human", weight: 5 },
    { id: "cat", weight: 3 },
    { id: "dog", weight: 3 },
  ];

  function pickKind(rng) {
    const total = KINDS.reduce((sum, k) => sum + k.weight, 0);
    let roll = rng() * total;
    for (const kind of KINDS) {
      roll -= kind.weight;
      if (roll <= 0) return kind.id;
    }
    return KINDS[0].id;
  }

  // ----- Character generation -----
  function generateHuman(rng) {
    const skin = pick(rng, SKIN_COLORS);
    const eye = pick(rng, EYE_COLORS);
    const hair = pick(rng, HAIR_COLORS);
    let hairStyle = pick(rng, HAIR_STYLES);
    if (hairStyle === "none") {
      // Force a tiny chance of truly bald so "hair: none" is meaningful.
      hairStyle = rng() < 0.4 ? "none" : pick(rng, HAIR_STYLES.filter((s) => s !== "none"));
    }
    const hat = pick(rng, HAT_STYLES);
    const hatColor = hat === "none" ? null : pick(rng, HAT_COLORS);
    const glasses = pick(rng, GLASSES_STYLES);
    const expression = pick(rng, EXPRESSIONS);
    const facialHair = pick(rng, FACIAL_HAIR);
    const lipstick = expression === "smile" || expression === "frown" ? maybe(rng, 0.55) : false;
    const earrings = hat === "none" ? maybe(rng, 0.35) : false;
    return {
      kind: "human",
      traits: {
        skin,
        eye,
        hair,
        hairStyle,
        hat,
        hatColor,
        glasses,
        expression,
        facialHair,
        lipstick,
        earrings,
      },
    };
  }

  function generateCat(rng) {
    const fur = pick(rng, FUR_COLORS);
    const pattern = pick(rng, ["solid", "solid", "solid", "stripes", "calico"]);
    const eye = pick(rng, EYE_COLORS);
    const collar = pick(rng, [null, null, ...COLLAR_COLORS]); // many cats have no collar
    const collarTag = collar ? maybe(rng, 0.6) : false;
    const expression = pick(rng, ["smile", "neutral", "sleepy"]);
    const earTilt = pick(rng, CAT_EAR_TILTS);
    return {
      kind: "cat",
      traits: {
        fur,
        pattern,
        eye,
        collar,
        collarTag,
        expression,
        earTilt,
      },
    };
  }

  function generateDog(rng) {
    const fur = pick(rng, FUR_COLORS);
    const earStyle = pick(rng, DOG_EARS);
    const earColor = pick(rng, FUR_COLORS);
    const nose = pick(rng, DOG_NOSES);
    const eye = pick(rng, EYE_COLORS);
    const collar = pick(rng, [...COLLAR_COLORS, null, null]);
    const expression = pick(rng, ["smile", "panting", "alert"]);
    return {
      kind: "dog",
      traits: {
        fur,
        earStyle,
        earColor,
        nose,
        eye,
        collar,
        expression,
      },
    };
  }

  function generateCharacter(rng) {
    const kind = pickKind(rng);
    if (kind === "human") return generateHuman(rng);
    if (kind === "cat") return generateCat(rng);
    return generateDog(rng);
  }

  function generatePool(seed, count) {
    const rng = mulberry32(seed);
    const pool = [];
    for (let i = 0; i < count; i += 1) {
      const character = generateCharacter(rng);
      character.id = `c${i}`;
      character.index = i;
      pool.push(character);
    }
    return pool;
  }

  // ----- SVG renderer -----
  // All SVGs share a 100x100 viewBox so the cards line up perfectly.
  const SVG_NS = "http://www.w3.org/2000/svg";

  function svg(tag, attrs = {}, children = []) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      el.setAttribute(key, value);
    }
    for (const child of children) {
      if (child == null) continue;
      el.append(child);
    }
    return el;
  }

  function circle(cx, cy, r, fill, stroke = null) {
    return svg("circle", { cx, cy, r, fill, stroke });
  }

  function ellipse(cx, cy, rx, ry, fill, stroke = null) {
    return svg("ellipse", { cx, cy, rx, ry, fill, stroke });
  }

  function rect(x, y, w, h, fill, rx = 0, stroke = null) {
    return svg("rect", { x, y, width: w, height: h, rx, ry: rx, fill, stroke });
  }

  function path(d, fill, stroke = "none", strokeWidth = 0) {
    return svg("path", { d, fill, stroke, "stroke-width": strokeWidth });
  }

  function group(children, transform = null) {
    const g = svg("g", transform ? { transform } : {});
    for (const child of children) g.append(child);
    return g;
  }

  // ---- Human face ----
  function renderHuman(character) {
    const t = character.traits;
    const out = [];
    // Shoulders / neck
    out.push(path("M10 100 C 25 78, 75 78, 90 100 Z", t.skin));
    // Neck shadow
    out.push(rect(42, 76, 16, 12, shade(t.skin, -10)));
    // Face oval
    out.push(ellipse(50, 52, 26, 32, t.skin, "#000"));
    // Ears
    out.push(ellipse(24, 50, 5, 8, t.skin, "#000"));
    out.push(ellipse(76, 50, 5, 8, t.skin, "#000"));
    // Earrings
    if (t.earrings) {
      out.push(circle(24, 58, 2.4, "#e2b34f"));
      out.push(circle(76, 58, 2.4, "#e2b34f"));
    }
    // Hair back layer
    out.push(...hairBack(t));
    // Hat sits on top of hair, behind front hair
    if (t.hat !== "none") out.push(...renderHat(t));
    // Front hair
    out.push(...hairFront(t));
    // Eyebrows
    out.push(rect(34, 46, 9, 2, darken(t.hair, -10), 1));
    out.push(rect(57, 46, 9, 2, darken(t.hair, -10), 1));
    // Glasses
    if (t.glasses !== "none") out.push(...renderGlasses(t));
    // Eyes
    out.push(ellipse(38, 54, 3, 3.2, "#fff"));
    out.push(ellipse(62, 54, 3, 3.2, "#fff"));
    out.push(circle(38, 54, 1.7, t.eye));
    out.push(circle(62, 54, 1.7, t.eye));
    out.push(circle(38, 53.2, 0.6, "#fff"));
    out.push(circle(62, 53.2, 0.6, "#fff"));
    // Nose
    out.push(path("M50 58 L46 66 L50 67 L54 66 Z", shade(t.skin, -8)));
    // Facial hair
    if (t.facialHair === "mustache") {
      out.push(path("M40 68 Q50 64 60 68 Q55 71 50 70 Q45 71 40 68 Z", darken(t.hair, 5)));
    } else if (t.facialHair === "beard") {
      out.push(path("M28 64 Q50 95 72 64 Q60 80 50 80 Q40 80 28 64 Z", darken(t.hair, 5)));
    }
    // Mouth + lipstick
    out.push(...renderMouth(t));
    return group(out, "translate(0,0)");
  }

  function hairBack(t) {
    if (t.hairStyle === "none" || t.hairStyle === "buzz") return [];
    const color = t.hair;
    if (t.hairStyle === "long") {
      return [path("M22 50 C 22 18, 78 18, 78 50 L 82 90 L 70 86 L 60 60 L 50 60 L 40 60 L 30 86 L 18 90 Z", color)];
    }
    if (t.hairStyle === "ponytail") {
      return [
        path("M22 50 C 22 18, 78 18, 78 50 L 80 70 L 78 92 L 72 92 L 70 64 L 30 64 L 28 92 L 22 92 L 20 70 Z", color),
        ellipse(86, 70, 5, 12, color),
      ];
    }
    if (t.hairStyle === "bun") {
      return [
        path("M22 50 C 22 18, 78 18, 78 50 L 80 60 L 20 60 Z", color),
        circle(80, 24, 8, color),
      ];
    }
    if (t.hairStyle === "curly") {
      return [
        circle(30, 32, 7, color),
        circle(40, 24, 8, color),
        circle(52, 22, 8, color),
        circle(64, 24, 8, color),
        circle(74, 32, 7, color),
        circle(26, 44, 6, color),
        circle(78, 44, 6, color),
      ];
    }
    // short
    return [path("M22 50 C 22 22, 78 22, 78 50 L 80 56 L 20 56 Z", color)];
  }

  function hairFront(t) {
    if (t.hat !== "none") return []; // hat covers the front
    if (t.hairStyle === "none" || t.hairStyle === "buzz") return [];
    const color = t.hair;
    if (t.hairStyle === "short" || t.hairStyle === "curly" || t.hairStyle === "long" || t.hairStyle === "ponytail" || t.hairStyle === "bun") {
      return [path("M22 48 C 28 32, 72 32, 78 48 L 74 46 Q 50 36 26 46 Z", color)];
    }
    return [];
  }

  function renderHat(t) {
    const color = t.hatColor || "#1a1a1a";
    if (t.hat === "beanie") {
      return [
        path("M20 38 C 22 18, 78 18, 80 38 L 78 44 L 22 44 Z", color),
        rect(20, 42, 60, 4, shade(color, -10), 1),
        circle(50, 18, 5, "#fffaf0"),
      ];
    }
    if (t.hat === "cap") {
      return [
        path("M20 36 C 22 22, 78 22, 80 36 L 82 44 L 18 44 Z", color),
        path("M18 40 C 50 50, 90 50, 90 50 L 90 56 L 18 56 Z", color),
      ];
    }
    if (t.hat === "top") {
      return [
        rect(28, 12, 44, 28, color, 2),
        rect(20, 38, 60, 6, color, 2),
      ];
    }
    return [];
  }

  function renderGlasses(t) {
    const stroke = "#1a1a1a";
    const sw = 1.5;
    if (t.glasses === "round") {
      return [
        circle(38, 54, 5.5, "none", stroke),
        circle(62, 54, 5.5, "none", stroke),
        path("M43 54 H 57", stroke, stroke, sw),
      ];
    }
    if (t.glasses === "square") {
      return [
        rect(31, 50, 14, 9, "none", 1, stroke),
        rect(55, 50, 14, 9, "none", 1, stroke),
        path("M45 54 H 55", stroke, stroke, sw),
      ];
    }
    return [];
  }

  function renderMouth(t) {
    const lip = t.lipstick ? "#c84e4e" : shade(t.skin, -25);
    if (t.expression === "smile") {
      return [
        path("M40 70 Q 50 76 60 70", "none", lip, 2),
        t.lipstick ? path("M40 70 Q 50 78 60 70 Q 50 72 40 70 Z", lip) : null,
      ];
    }
    if (t.expression === "frown") {
      return [
        path("M40 72 Q 50 66 60 72", "none", lip, 2),
        t.lipstick ? path("M40 72 Q 50 70 60 72 Q 50 76 40 72 Z", lip) : null,
      ];
    }
    if (t.expression === "surprised") {
      return [ellipse(50, 71, 3, 4, lip)];
    }
    // neutral
    return [path("M44 70 H 56", "none", lip, 2)];
  }

  // ---- Cat face ----
  function renderCat(character) {
    const t = character.traits;
    const out = [];
    // Shoulders
    out.push(path("M5 100 C 20 80, 80 80, 95 100 Z", t.fur));
    // Head
    out.push(ellipse(50, 56, 32, 30, t.fur, "#000"));
    // Ears
    const earTransform = t.earTilt === "left" ? "rotate(-6 26 32)" : t.earTilt === "right" ? "rotate(6 74 32)" : t.earTilt === "tilted" ? "skewX(-8)" : null;
    out.push(group([
      path("M22 30 L 32 12 L 40 30 Z", t.fur, "#000"),
      path("M26 26 L 32 18 L 36 26 Z", shade(t.fur, 25)),
    ], earTransform));
    out.push(group([
      path("M78 30 L 68 12 L 60 30 Z", t.fur, "#000"),
      path("M74 26 L 68 18 L 64 26 Z", shade(t.fur, 25)),
    ], earTransform));
    // Stripes or calico markings
    if (t.pattern === "stripes") {
      out.push(path("M30 44 L 50 40 L 70 44", shade(t.fur, -15), "none"));
      out.push(path("M34 52 L 50 48 L 66 52", shade(t.fur, -15), "none"));
      out.push(path("M30 62 L 50 58 L 70 62", shade(t.fur, -15), "none"));
    } else if (t.pattern === "calico") {
      out.push(path("M22 56 C 28 48, 40 60, 32 70 Z", "#d9b27a"));
      out.push(path("M70 60 C 76 50, 80 70, 64 72 Z", "#1f1f1f"));
    }
    // Eyes
    out.push(ellipse(38, 54, 5, 6, "#fffaf0"));
    out.push(ellipse(62, 54, 5, 6, "#fffaf0"));
    out.push(ellipse(38, 55, 1.6, 4, t.eye));
    out.push(ellipse(62, 55, 1.6, 4, t.eye));
    out.push(circle(38, 53, 0.7, "#fff"));
    out.push(circle(62, 53, 0.7, "#fff"));
    // Nose
    out.push(path("M48 62 L 50 60 L 52 62 L 50 66 Z", "#c84a6a"));
    // Mouth
    if (t.expression === "smile") {
      out.push(path("M44 70 Q 50 74 56 70", "none", "#1a1a1a", 1.5));
    } else if (t.expression === "sleepy") {
      out.push(path("M44 70 Q 50 71 56 70", "none", "#1a1a1a", 1.5));
    } else {
      out.push(path("M44 70 L 50 70 L 56 70", "none", "#1a1a1a", 1.5));
    }
    // Whiskers
    out.push(path("M22 64 H 38", "#1a1a1a"));
    out.push(path("M22 68 H 38", "#1a1a1a"));
    out.push(path("M62 64 H 78", "#1a1a1a"));
    out.push(path("M62 68 H 78", "#1a1a1a"));
    // Collar
    if (t.collar) {
      out.push(rect(18, 82, 64, 8, t.collar, 4));
      if (t.collarTag) {
        out.push(circle(50, 88, 4, "#e2b34f", "#1a1a1a"));
      }
    }
    return group(out);
  }

  // ---- Dog face ----
  function renderDog(character) {
    const t = character.traits;
    const out = [];
    // Shoulders
    out.push(path("M5 100 C 20 80, 80 80, 95 100 Z", t.fur));
    // Head
    out.push(ellipse(50, 52, 30, 28, t.fur, "#000"));
    // Snout
    out.push(ellipse(50, 64, 16, 14, shade(t.fur, 10), "#000"));
    // Ears
    if (t.earStyle === "floppy" || t.earStyle === "one-flop") {
      out.push(path("M16 40 C 8 48, 10 70, 24 70 C 28 60, 28 50, 24 38 Z", t.earColor, "#000"));
      if (t.earStyle === "floppy") {
        out.push(path("M84 40 C 92 48, 90 70, 76 70 C 72 60, 72 50, 76 38 Z", t.earColor, "#000"));
      } else {
        out.push(path("M68 28 L 78 18 L 82 36 Z", t.earColor, "#000"));
      }
    } else {
      out.push(path("M22 30 L 32 14 L 36 36 Z", t.earColor, "#000"));
      out.push(path("M78 30 L 68 14 L 64 36 Z", t.earColor, "#000"));
    }
    // Eyes
    out.push(circle(40, 50, 3, "#fffaf0"));
    out.push(circle(60, 50, 3, "#fffaf0"));
    out.push(circle(40, 50, 1.6, t.eye));
    out.push(circle(60, 50, 1.6, t.eye));
    // Nose
    out.push(ellipse(50, 60, 4, 3, t.nose, "#000"));
    // Mouth
    if (t.expression === "panting") {
      out.push(path("M44 68 Q 50 76 56 68", "none", "#1a1a1a", 1.5));
      out.push(path("M50 70 L 50 76", "#c84e6e"));
    } else if (t.expression === "alert") {
      out.push(path("M44 68 L 56 68", "#1a1a1a", "#1a1a1a", 1.5));
    } else {
      out.push(path("M44 68 Q 50 73 56 68", "none", "#1a1a1a", 1.5));
    }
    // Collar
    if (t.collar) {
      out.push(rect(20, 84, 60, 8, t.collar, 4));
    }
    return group(out);
  }

  // ----- Color helpers -----
  function shade(hex, percent) {
    const { r, g, b } = hexToRgb(hex);
    const f = percent / 100;
    const adjust = (c) => Math.max(0, Math.min(255, Math.round(c + 255 * f)));
    return rgbToHex(adjust(r), adjust(g), adjust(b));
  }

  function darken(hex, percent) {
    return shade(hex, -Math.abs(percent));
  }

  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    const num = parseInt(clean, 16);
    return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
  }

  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
  }

  // ----- Public render API -----
  function renderPortrait(character, options = {}) {
    const root = document.createElementNS(SVG_NS, "svg");
    root.setAttribute("viewBox", "0 0 100 100");
    root.setAttribute("preserveAspectRatio", "xMidYMid meet");
    root.setAttribute("aria-hidden", "true");
    if (options.className) root.classList.add(options.className);
    // Background card
    root.append(rect(0, 0, 100, 100, options.background || "#fffaf0", 6));
    if (character.kind === "cat") root.append(renderCat(character));
    else if (character.kind === "dog") root.append(renderDog(character));
    else root.append(renderHuman(character));
    return root;
  }

  // ----- Exports -----
  global.WhoAmI = {
    generatePool,
    renderPortrait,
  };
})(window);
