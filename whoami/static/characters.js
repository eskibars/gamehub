// characters.js
// Deterministic character bank + SVG renderer for "Who Am I?".
// The same (seed, count) pair always produces the same pool of characters,
// so the server only needs to ship the seed and the secret index for each player.

(function (global) {
  "use strict";

  // ----- Seedable PRNG (Mulberry32) -----
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
  // Skin tones for humans — wide range so a Guess Who board shows variety.
  const SKIN_COLORS = [
    "#fde2c4", "#f4cba0", "#e0a879", "#bf8157", "#8a5a3b", "#5d3b25"
  ];
  const EYE_COLORS = [
    "#3a6ea5", "#3b7a3b", "#7a5a35", "#3a3a3a", "#6e7a8a", "#4f6f4a", "#9b6f3a"
  ];
  // Hair colors including "unusual" tones for variety.
  const HAIR_COLORS = [
    "#1a1a1a", "#2a1f1a", "#3a2820", "#5a3a1a", "#8a5a2a", "#b58a3a", "#d3b27a",
    "#cccccc", "#5a4a3a", "#3a2a55", "#7a3a2a"
  ];
  // Cat/dog fur colors — distinct from skin tones to read as "furry".
  const FUR_COLORS = [
    "#1f1f1f", "#3a2a1a", "#4a3a2a", "#6b4a2a", "#8a5a2a", "#a05a3a", "#b07a3a",
    "#d9b27a", "#e6e1d2", "#5a4a3a", "#2a2a55", "#7a3a2a"
  ];
  const NOSE_COLORS = ["#1a1a1a", "#3a2a1a", "#5a3a2a", "#a05a4a"];
  const HAT_COLORS = [
    "#c84e4e", "#356eb8", "#2f6b4a", "#e2b34f", "#6e5cb8", "#1f1f1f", "#e2e2e2",
    "#a04a8a", "#8a5a2a"
  ];
  const COLLAR_COLORS = [
    "#c84e4e", "#356eb8", "#2f6b4a", "#e2b34f", "#6e5cb8", "#1f1f1f", "#e2e2e2",
    "#a04a8a", "#b07a3a"
  ];
  const EAR_INNER = "#f1a8a0";
  const EAR_INNER_DARK = "#a86060";

  const HAIR_STYLES = ["short", "long", "ponytail", "bun", "curly", "buzz", "bald", "afro"];
  const HAT_STYLES = ["none", "beanie", "cap", "tophat", "cowboy", "bandana"];
  const GLASSES_STYLES = ["none", "round", "square", "sunglasses", "monocle"];
  const HUMAN_EXPRESSIONS = ["smile", "grin", "neutral", "frown", "surprised", "smirk", "skeptical", "sleepy"];
  const CAT_EXPRESSIONS = ["smile", "neutral", "sleepy", "smug", "alert"];
  const DOG_EXPRESSIONS = ["smile", "panting", "alert", "sleepy", "happy"];
  const FACIAL_HAIR = ["none", "mustache", "beard", "goatee"];

  // Predefined breeds with distinct head shapes — the user wanted "general
  // head shapes for each" so the player can tell at a glance "that's a
  // spaniel, not a bulldog".
  const HUMAN_BREEDS = [
    { id: "man", weight: 5 },
    { id: "woman", weight: 5 },
    { id: "kid", weight: 2 },
  ];
  const CAT_BREEDS = [
    { id: "tabby", weight: 4 },
    { id: "kitten", weight: 3 },
    { id: "siamese", weight: 2 },
  ];
  const DOG_BREEDS = [
    { id: "spaniel", weight: 3 },
    { id: "puppy", weight: 3 },
    { id: "bulldog", weight: 2 },
  ];

  function pickBreed(rng, breeds) {
    const total = breeds.reduce((sum, b) => sum + b.weight, 0);
    let roll = rng() * total;
    for (const b of breeds) {
      roll -= b.weight;
      if (roll <= 0) return b.id;
    }
    return breeds[0].id;
  }

  // ----- Character generation -----
  function generateHuman(rng) {
    const breed = pickBreed(rng, HUMAN_BREEDS);
    const skin = pick(rng, SKIN_COLORS);
    const eye = pick(rng, EYE_COLORS);
    const hair = pick(rng, HAIR_COLORS);
    const hairStyle = pick(rng, HAIR_STYLES);
    const hat = pick(rng, HAT_STYLES);
    const hatColor = hat === "none" ? null : pick(rng, HAT_COLORS);
    const glasses = pick(rng, GLASSES_STYLES);
    const expression = pick(rng, HUMAN_EXPRESSIONS);
    const facialHair = breed === "man" && maybe(rng, 0.45) ? pick(rng, FACIAL_HAIR) : "none";
    const lipstick = breed !== "man" && (expression === "grin" || expression === "smile" || expression === "smirk") ? maybe(rng, 0.55) : false;
    const earrings = hat === "none" && breed !== "man" ? maybe(rng, 0.35) : false;
    const eyebrows = pick(rng, ["normal", "normal", "raised", "angry", "sad", "bushy"]);
    return {
      kind: "human",
      breed,
      traits: {
        skin, eye, hair, hairStyle, hat, hatColor, glasses, expression, facialHair,
        lipstick, earrings, eyebrows, freckles: maybe(rng, 0.2),
      },
    };
  }

  function generateCat(rng) {
    const breed = pickBreed(rng, CAT_BREEDS);
    const fur = pick(rng, FUR_COLORS);
    // Tabby gets stripes; kitten is solid; siamese gets colorpoint.
    let pattern = "solid";
    if (breed === "tabby") pattern = pick(rng, ["stripes", "stripes", "mackerel", "solid"]);
    if (breed === "kitten") pattern = pick(rng, ["solid", "calico", "solid"]);
    if (breed === "siamese") pattern = "colorpoint";
    const eye = breed === "siamese" ? "#3a6ea5" : pick(rng, EYE_COLORS);
    const collar = pick(rng, [null, null, null, ...COLLAR_COLORS]);
    const collarTag = collar ? maybe(rng, 0.55) : false;
    const expression = pick(rng, CAT_EXPRESSIONS);
    return {
      kind: "cat",
      breed,
      traits: { fur, pattern, eye, collar, collarTag, expression },
    };
  }

  function generateDog(rng) {
    const breed = pickBreed(rng, DOG_BREEDS);
    const fur = pick(rng, FUR_COLORS);
    // Most dogs share ear color with the fur; spaniels can have a contrasting
    // patch to add breed personality without being garish.
    const earColor = breed === "spaniel" && maybe(rng, 0.4) ? shade(fur, 30) : shade(fur, -15);
    const nose = pick(rng, NOSE_COLORS);
    const eye = pick(rng, EYE_COLORS);
    const collar = pick(rng, [...COLLAR_COLORS, null, null]);
    const expression = pick(rng, DOG_EXPRESSIONS);
    return {
      kind: "dog",
      breed,
      traits: { fur, earColor, nose, eye, collar, expression },
    };
  }

  function generateCharacter(rng) {
    const kinds = [
      { id: "human", weight: 5 },
      { id: "cat", weight: 3 },
      { id: "dog", weight: 3 },
    ];
    const total = kinds.reduce((sum, k) => sum + k.weight, 0);
    let roll = rng() * total;
    let kind = kinds[0].id;
    for (const k of kinds) {
      roll -= k.weight;
      if (roll <= 0) { kind = k.id; break; }
    }
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

  // ----- SVG helpers -----
  const SVG_NS = "http://www.w3.org/2000/svg";

  function svgEl(tag, attrs = {}, children = []) {
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

  const circle = (cx, cy, r, fill, stroke = null) => svgEl("circle", { cx, cy, r, fill, stroke });
  const ellipse = (cx, cy, rx, ry, fill, stroke = null) => svgEl("ellipse", { cx, cy, rx, ry, fill, stroke });
  const rect = (x, y, w, h, fill, rx = 0, stroke = null) => svgEl("rect", { x, y, width: w, height: h, rx, ry: rx, fill, stroke });
  const path = (d, fill, stroke = "none", strokeWidth = 0) => svgEl("path", { d, fill, stroke, "stroke-width": strokeWidth });
  const line = (x1, y1, x2, y2, stroke, sw = 1) => svgEl("line", { x1, y1, x2, y2, stroke, "stroke-width": sw, "stroke-linecap": "round" });

  function group(children, transform = null) {
    const g = svgEl("g", transform ? { transform } : {});
    for (const child of children) g.append(child);
    return g;
  }

  // ----- Color helpers -----
  function shade(hex, percent) {
    const { r, g, b } = hexToRgb(hex);
    const f = percent / 100;
    const adjust = (c) => Math.max(0, Math.min(255, Math.round(c + 255 * f)));
    return rgbToHex(adjust(r), adjust(g), adjust(b));
  }
  const darken = (hex, percent) => shade(hex, -Math.abs(percent));

  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    const num = parseInt(clean, 16);
    return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
  }

  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
  }

  // ============================================================
  // CAT RENDERERS — three breeds, each with a distinct head shape
  // ============================================================

  // Cat ear: pointed triangle rising from the top of the head.
  // Takes explicit base-left, base-right, and apex coordinates so the
  // ears always look like they belong to the head.
  function catEar(baseLeft, baseRight, apex, fill, innerFill) {
    const [blx, bly] = baseLeft;
    const [brx, bry] = baseRight;
    const [ax, ay] = apex;
    const d = `M ${blx} ${bly} L ${ax} ${ay} L ${brx} ${bry} Z`;
    const out = [path(d, fill, "#000", 0.6)];
    if (innerFill) {
      // Inner ear — smaller triangle inset toward the apex
      const inset = 0.35;
      const iblx = blx + (ax - blx) * inset;
      const ibly = bly + (ay - bly) * inset;
      const ibrx = brx + (ax - brx) * inset;
      const ibry = bry + (ay - bry) * inset;
      const iax = blx + (brx - blx) / 2 + (ax - (blx + brx) / 2) * (1 - inset);
      const iay = bly + (bry - bly) / 2 + (ay - (bly + bry) / 2) * (1 - inset);
      const id = `M ${iblx.toFixed(1)} ${ibly.toFixed(1)} L ${iax.toFixed(1)} ${iay.toFixed(1)} L ${ibrx.toFixed(1)} ${ibry.toFixed(1)} Z`;
      out.push(path(id, innerFill));
    }
    return group(out);
  }

  // Tabby: heart-shaped face, classic triangular ears rising from the top.
  function catTabbyHead(c) {
    const t = c.traits;
    const out = [];
    // Shoulders
    out.push(path("M 4 100 C 18 82, 82 82, 96 100 Z", shade(t.fur, -10)));
    // Neck fluff
    out.push(ellipse(50, 80, 18, 12, t.fur));
    // Ears — drawn first so the head overlaps the base of each ear.
    // Left ear: base sits on top of the head, apex points up and slightly out.
    out.push(catEar([22, 32], [38, 28], [26, 6], t.fur, EAR_INNER));
    out.push(catEar([62, 28], [78, 32], [74, 6], t.fur, EAR_INNER));
    // Head: heart-shape, wider at temples, pointed chin
    out.push(path(
      "M 50 30 " +
      "C 32 30 20 42 20 56 " +
      "C 20 70 32 80 50 90 " +
      "C 68 80 80 70 80 56 " +
      "C 80 42 68 30 50 30 Z",
      t.fur, "#000", 0.6
    ));
    // M-shaped tabby forehead stripes
    if (t.pattern === "stripes" || t.pattern === "mackerel") {
      out.push(path("M 32 38 Q 38 32 42 38", "none", darken(t.fur, 25), 1.5));
      out.push(path("M 58 38 Q 62 32 68 38", "none", darken(t.fur, 25), 1.5));
      out.push(path("M 50 34 L 50 42", "none", darken(t.fur, 25), 1.5));
    }
    // Calico patches
    if (t.pattern === "calico") {
      out.push(path("M 22 52 C 26 42 38 58 32 72 C 26 66 18 62 22 52 Z", "#d9b27a"));
      out.push(path("M 70 57 C 76 47 84 72 64 74 C 68 67 64 60 70 57 Z", "#1f1f1f"));
    }
    return group(out);
  }

  // Kitten: rounder, fluffier face, bigger eyes, smaller ears.
  function catKittenHead(c) {
    const t = c.traits;
    const out = [];
    out.push(path("M 4 100 C 18 82, 82 82, 96 100 Z", shade(t.fur, -10)));
    out.push(ellipse(50, 82, 22, 14, t.fur));
    // Smaller triangular ears (kitten-sized)
    out.push(catEar([26, 36], [40, 32], [30, 14], t.fur, EAR_INNER));
    out.push(catEar([60, 32], [74, 36], [70, 14], t.fur, EAR_INNER));
    // Rounder, fluffier head
    out.push(ellipse(50, 58, 30, 28, t.fur, "#000"));
    // Fluffy cheeks
    out.push(ellipse(32, 64, 10, 8, shade(t.fur, 5)));
    out.push(ellipse(68, 64, 10, 8, shade(t.fur, 5)));
    return group(out);
  }

  // Siamese: classic colorpoint with darker face mask and ears, blue eyes.
  function catSiameseHead(c) {
    const t = c.traits;
    const out = [];
    out.push(path("M 4 100 C 18 82, 82 82, 96 100 Z", shade(t.fur, -10)));
    out.push(ellipse(50, 80, 18, 12, t.fur));
    // Ears — colorpoint: dark ear fronts
    out.push(catEar([22, 32], [38, 28], [26, 6], darken(t.fur, 35), EAR_INNER_DARK));
    out.push(catEar([62, 28], [78, 32], [74, 6], darken(t.fur, 35), EAR_INNER_DARK));
    // Face — same heart-shape as tabby
    out.push(path(
      "M 50 30 " +
      "C 32 30 20 42 20 56 " +
      "C 20 70 32 80 50 90 " +
      "C 68 80 80 70 80 56 " +
      "C 80 42 68 30 50 30 Z",
      t.fur, "#000", 0.6
    ));
    // Colorpoint mask around the muzzle (darker on the points)
    out.push(path(
      "M 50 44 " +
      "C 36 44 28 54 28 64 " +
      "C 28 74 36 80 50 80 " +
      "C 64 80 72 74 72 64 " +
      "C 72 54 64 44 50 44 Z",
      darken(t.fur, 35), null, 0
    ));
    return group(out);
  }

  // Cat eyes — two almond/circle eyes + nose + mouth + whiskers.
  // `eyeShape` adjusts for breed ("kitten" → bigger).
  function catFace(c, eyeScale = 1) {
    const t = c.traits;
    const out = [];
    const eyeY = 60;
    const eyeRx = 4 * eyeScale;
    const eyeRy = 5 * eyeScale;
    // Eye whites
    out.push(ellipse(38, eyeY, eyeRx, eyeRy, "#fffaf0"));
    out.push(ellipse(62, eyeY, eyeRx, eyeRy, "#fffaf0"));
    // Pupils — vertical slits for cat
    out.push(ellipse(38, eyeY, eyeRx * 0.4, eyeRy * 0.85, t.eye));
    out.push(ellipse(62, eyeY, eyeRx * 0.4, eyeRy * 0.85, t.eye));
    // Catchlight
    out.push(circle(38, eyeY - eyeRy * 0.5, 0.6, "#fff"));
    out.push(circle(62, eyeY - eyeRy * 0.5, 0.6, "#fff"));
    // Nose
    out.push(path("M 47 68 L 50 66 L 53 68 L 50 72 Z", "#d36b7a", "#000", 0.4));
    // Mouth
    if (t.expression === "smile" || t.expression === "happy") {
      out.push(path("M 44 76 Q 50 80 56 76", "none", "#1a1a1a", 1.4));
    } else if (t.expression === "smug") {
      out.push(path("M 44 75 Q 50 77 56 75", "none", "#1a1a1a", 1.4));
    } else if (t.expression === "sleepy") {
      out.push(path("M 45 76 Q 50 77 55 76", "none", "#1a1a1a", 1.2));
    } else if (t.expression === "alert") {
      out.push(path("M 44 76 L 50 76 L 56 76", "none", "#1a1a1a", 1.4));
    } else {
      out.push(path("M 44 76 Q 50 78 56 76", "none", "#1a1a1a", 1.2));
    }
    // Whiskers — 3 per side
    out.push(line(22, 70, 40, 71, "#1a1a1a", 0.7));
    out.push(line(22, 74, 40, 74, "#1a1a1a", 0.7));
    out.push(line(22, 78, 40, 77, "#1a1a1a", 0.7));
    out.push(line(60, 71, 78, 70, "#1a1a1a", 0.7));
    out.push(line(60, 74, 78, 74, "#1a1a1a", 0.7));
    out.push(line(60, 77, 78, 78, "#1a1a1a", 0.7));
    return group(out);
  }

  function catCollar(c) {
    const t = c.traits;
    if (!t.collar) return null;
    const out = [
      path("M 18 88 Q 50 96 82 88 L 80 96 Q 50 102 20 96 Z", t.collar, darken(t.collar, 20), 0.6),
    ];
    if (t.collarTag) {
      out.push(ellipse(50, 95, 4, 5, "#e2b34f", "#1a1a1a"));
    }
    return group(out);
  }

  // ============================================================
  // DOG RENDERERS — three breeds, distinct silhouettes
  // ============================================================

  // Spaniel: long face, long droopy ears that hang down the sides.
  function dogSpanielHead(c) {
    const t = c.traits;
    const out = [];
    out.push(path("M 4 100 C 18 82, 82 82, 96 100 Z", shade(t.fur, -10)));
    // Long droopy ears BEHIND the head
    out.push(path("M 22 42 C 6 50, 8 88, 26 86 C 32 80, 32 60, 28 42 Z", t.earColor, "#000", 0.6));
    out.push(path("M 78 42 C 94 50, 92 88, 74 86 C 68 80, 68 60, 72 42 Z", t.earColor, "#000", 0.6));
    // Top of head (rounded but elongated)
    out.push(ellipse(50, 48, 24, 22, t.fur, "#000"));
    // Snout — long, hangs down
    out.push(ellipse(50, 68, 13, 14, shade(t.fur, 8), "#000"));
    return group(out);
  }

  // Puppy: round face, big eyes, small floppy ears.
  function dogPuppyHead(c) {
    const t = c.traits;
    const out = [];
    out.push(path("M 4 100 C 18 82, 82 82, 96 100 Z", shade(t.fur, -10)));
    // Small floppy ears on the sides
    out.push(path("M 24 38 C 16 44, 18 60, 28 60 C 30 52, 30 44, 28 38 Z", t.earColor, "#000", 0.6));
    out.push(path("M 76 38 C 84 44, 82 60, 72 60 C 70 52, 70 44, 72 38 Z", t.earColor, "#000", 0.6));
    // Round head
    out.push(ellipse(50, 50, 28, 26, t.fur, "#000"));
    // Small snout
    out.push(ellipse(50, 66, 11, 9, shade(t.fur, 10), "#000"));
    return group(out);
  }

  // Bulldog: square, wide head, short pushed-in snout, small rose ears.
  function dogBulldogHead(c) {
    const t = c.traits;
    const out = [];
    out.push(path("M 4 100 C 18 82, 82 82, 96 100 Z", shade(t.fur, -10)));
    // Tiny rose ears
    out.push(path("M 22 30 C 16 28, 14 36, 22 40 C 26 36, 26 32, 22 30 Z", t.earColor, "#000", 0.5));
    out.push(path("M 78 30 C 84 28, 86 36, 78 40 C 74 36, 74 32, 78 30 Z", t.earColor, "#000", 0.5));
    // Square head
    out.push(rect(20, 30, 60, 50, t.fur, 12, "#000"));
    // Wrinkle lines on the forehead
    out.push(path("M 30 42 Q 50 38 70 42", "none", darken(t.fur, 18), 1));
    out.push(path("M 32 48 Q 50 46 68 48", "none", darken(t.fur, 18), 1));
    // Short pushed-in snout
    out.push(ellipse(50, 66, 18, 10, shade(t.fur, 10), "#000"));
    return group(out);
  }

  function dogFace(c, opts = {}) {
    const t = c.traits;
    const out = [];
    // Eye position depends on breed — spaniel eyes are higher and a bit sad,
    // puppy eyes are big and round, bulldog eyes are wide set.
    let eyeY, eyeRX, eyeRY, eyeDX;
    if (c.breed === "puppy") {
      eyeY = 48; eyeRX = 4.5; eyeRY = 5; eyeDX = 12;
    } else if (c.breed === "bulldog") {
      eyeY = 46; eyeRX = 3.2; eyeRY = 3.2; eyeDX = 14;
    } else {
      eyeY = 46; eyeRX = 3.2; eyeRY = 3.2; eyeDX = 12;
    }
    const exL = 50 - eyeDX;
    const exR = 50 + eyeDX;
    // Eye whites
    out.push(ellipse(exL, eyeY, eyeRX, eyeRY, "#fffaf0"));
    out.push(ellipse(exR, eyeY, eyeRX, eyeRY, "#fffaf0"));
    out.push(circle(exL, eyeY, eyeRX * 0.55, t.eye));
    out.push(circle(exR, eyeY, eyeRX * 0.55, t.eye));
    out.push(circle(exL, eyeY - 1, 0.7, "#fff"));
    out.push(circle(exR, eyeY - 1, 0.7, "#fff"));
    // Nose — large for spaniel/puppy, small for bulldog
    let noseW, noseH, noseY;
    if (c.breed === "bulldog") { noseW = 5; noseH = 3; noseY = 64; }
    else if (c.breed === "puppy") { noseW = 5; noseH = 4; noseY = 64; }
    else { noseW = 6; noseH = 5; noseY = 64; }
    out.push(ellipse(50, noseY, noseW, noseH, t.nose, "#000"));
    // Mouth
    if (t.expression === "panting") {
      out.push(path("M 42 70 Q 50 78 58 70", "none", "#1a1a1a", 1.5));
      out.push(path("M 47 73 L 47 78 Q 50 80 53 78 L 53 73 Z", "#c84e6e"));
    } else if (t.expression === "happy") {
      out.push(path("M 40 70 Q 50 80 60 70", "none", "#1a1a1a", 1.5));
    } else if (t.expression === "sleepy") {
      out.push(path("M 44 71 Q 50 72 56 71", "none", "#1a1a1a", 1.2));
    } else if (t.expression === "alert") {
      out.push(path("M 44 70 L 56 70", "none", "#1a1a1a", 1.5));
    } else {
      out.push(path("M 44 70 Q 50 74 56 70", "none", "#1a1a1a", 1.4));
    }
    return group(out);
  }

  function dogCollar(c) {
    const t = c.traits;
    if (!t.collar) return null;
    const out = [
      path("M 18 88 Q 50 96 82 88 L 80 96 Q 50 102 20 96 Z", t.collar, darken(t.collar, 20), 0.6),
    ];
    if (t.collarTag) {
      out.push(ellipse(50, 95, 4, 5, "#e2b34f", "#1a1a1a"));
    }
    return group(out);
  }

  // ============================================================
  // HUMAN RENDERERS — man, woman, kid
  // ============================================================

  function humanBase(c) {
    const t = c.traits;
    const out = [];
    // Shoulders / neck
    out.push(path("M 8 100 C 22 78, 78 78, 92 100 Z", shade(t.skin, -15)));
    out.push(rect(42, 76, 16, 12, shade(t.skin, -8)));
    // Ears (drawn before the head so the head overlaps them slightly)
    out.push(ellipse(24, 50, 5, 8, t.skin, "#000"));
    out.push(ellipse(76, 50, 5, 8, t.skin, "#000"));
    if (t.earrings) {
      out.push(circle(24, 58, 2.2, "#e2b34f"));
      out.push(circle(76, 58, 2.2, "#e2b34f"));
    }
    return out;
  }

  // Face shape: round/oval, slightly angular for "man", softer for "woman",
  // even rounder for "kid".
  function humanFace(c) {
    const t = c.traits;
    let rx, ry, cy, jawDrop = 0;
    if (c.breed === "man") { rx = 22; ry = 26; cy = 50; jawDrop = 2; }
    else if (c.breed === "woman") { rx = 21; ry = 25; cy = 50; jawDrop = -2; }
    else { rx = 21; ry = 23; cy = 48; jawDrop = 0; } // kid
    // Use a path for the face so we can shape the jaw.
    // Top half: half-ellipse. Bottom: come down to a slightly tapered chin.
    const top = `M ${50 - rx} ${cy} A ${rx} ${ry} 0 0 1 ${50 + rx} ${cy}`;
    const leftJaw = `Q ${50 - rx} ${cy + ry} ${50} ${cy + ry + jawDrop}`;
    const rightJaw = `Q ${50 + rx} ${cy + ry} ${50} ${cy + ry + jawDrop}`;
    return path(`${top} ${rightJaw} ${leftJaw} Z`, t.skin, "#000", 0.6);
  }

  // Hair — drawn first, then the face overlaps the front (for short styles),
  // and bangs sit on top of the face.
  function humanHairBack(c) {
    const t = c.traits;
    if (t.hairStyle === "bald") return null;
    const color = t.hair;
    if (t.hairStyle === "long") {
      return path(
        "M 20 50 C 20 16, 80 16, 80 50 L 86 92 L 70 88 L 60 60 L 50 58 L 40 60 L 30 88 L 14 92 Z",
        color
      );
    }
    if (t.hairStyle === "ponytail") {
      return group([
        path("M 22 50 C 22 20, 78 20, 78 50 L 80 64 L 20 64 Z", color),
        ellipse(84, 70, 6, 14, color),
        path("M 78 78 L 80 92 L 88 92 L 86 76 Z", color),
      ]);
    }
    if (t.hairStyle === "bun") {
      return group([
        path("M 22 50 C 22 18, 78 18, 78 50 L 78 58 L 22 58 Z", color),
        circle(78, 22, 9, color),
        circle(22, 22, 9, color),
      ]);
    }
    if (t.hairStyle === "afro") {
      return group([
        circle(28, 32, 11, color),
        circle(40, 22, 12, color),
        circle(50, 20, 13, color),
        circle(60, 22, 12, color),
        circle(72, 32, 11, color),
        circle(20, 44, 9, color),
        circle(80, 44, 9, color),
      ]);
    }
    if (t.hairStyle === "curly") {
      return group([
        circle(30, 32, 8, color),
        circle(40, 24, 9, color),
        circle(50, 22, 9, color),
        circle(60, 24, 9, color),
        circle(70, 32, 8, color),
        circle(24, 42, 7, color),
        circle(76, 42, 7, color),
      ]);
    }
    if (t.hairStyle === "buzz") {
      return path("M 24 46 C 24 28, 76 28, 76 46 L 78 50 L 22 50 Z", color);
    }
    // short
    return path("M 22 50 C 22 22, 78 22, 78 50 L 80 56 L 20 56 Z", color);
  }

  // Bangs — drawn AFTER the face so they sit on the forehead.
  function humanHairFront(c) {
    const t = c.traits;
    if (t.hat !== "none" || t.hairStyle === "bald" || t.hairStyle === "buzz") return null;
    const color = t.hair;
    if (t.hairStyle === "afro" || t.hairStyle === "curly") return null;
    if (t.hairStyle === "long" || t.hairStyle === "ponytail") {
      return path("M 22 48 C 30 34, 70 34, 78 48 Q 70 42 60 46 Q 50 50 40 46 Q 30 42 22 48 Z", color);
    }
    if (t.hairStyle === "bun") return null;
    // short
    return path("M 24 48 C 30 36, 70 36, 76 48 Q 70 44 60 46 Q 50 50 40 46 Q 30 44 24 48 Z", color);
  }

  // Hats — drawn AFTER the back hair but BEFORE the front hair.
  // Each hat is shaped to follow the curve of the head so it doesn't look
  // like a rectangle stuck on the forehead.
  function humanHat(c) {
    const t = c.traits;
    if (t.hat === "none") return null;
    const color = t.hatColor;
    if (t.hat === "beanie") {
      return group([
        // The dome of the beanie follows the head's curve.
        path("M 20 44 C 22 22, 78 22, 80 44 L 78 50 L 22 50 Z", color, darken(color, 15), 0.6),
        // Folded cuff at the bottom
        rect(20, 46, 60, 6, shade(color, -12), 1, darken(color, 20)),
        // Pom on top
        circle(50, 18, 5, "#fffaf0", darken(color, 25)),
      ]);
    }
    if (t.hat === "cap") {
      return group([
        // Crown of the cap follows the head curve.
        path("M 18 42 C 22 26, 78 26, 82 42 L 80 46 L 20 46 Z", color, darken(color, 15), 0.6),
        // Brim — a thin horizontal strip across the forehead, above the eyes
        rect(18, 46, 64, 4, color, 1, darken(color, 15)),
        // Button on top
        circle(50, 26, 2, shade(color, 15)),
      ]);
    }
    if (t.hat === "tophat") {
      return group([
        // Tall cylinder
        rect(36, 8, 28, 32, color, 2, darken(color, 20)),
        // Brim
        rect(26, 38, 48, 5, color, 2, darken(color, 20)),
        // Band
        rect(36, 34, 28, 5, darken(color, 25)),
      ]);
    }
    if (t.hat === "cowboy") {
      return group([
        // Brim — wide oval
        ellipse(50, 42, 36, 7, color, darken(color, 20)),
        // Crown — pinched in the middle (classic cowboy shape)
        path("M 32 42 C 32 18, 68 18, 68 42 Z", color, darken(color, 20), 0.6),
        // Hatband
        path("M 32 36 Q 50 32 68 36 L 68 40 Q 50 36 32 40 Z", darken(color, 20)),
      ]);
    }
    if (t.hat === "bandana") {
      // Bandana — a wide strip across the forehead with a knot on top.
      return group([
        // Front strip — covers the forehead, just above the eyes
        path("M 18 44 L 82 44 L 80 50 L 20 50 Z", color, darken(color, 20), 0.6),
        // Knot on top
        path("M 44 38 L 50 28 L 56 38 L 52 44 L 48 44 Z", color, darken(color, 20), 0.6),
        // Small polka dots for character
        circle(30, 47, 1, "rgba(255,250,240,0.5)"),
        circle(50, 47, 1, "rgba(255,250,240,0.5)"),
        circle(70, 47, 1, "rgba(255,250,240,0.5)"),
      ]);
    }
    return null;
  }

  function humanEyes(c) {
    const t = c.traits;
    const out = [];
    out.push(ellipse(38, 54, 3, 3.2, "#fff"));
    out.push(ellipse(62, 54, 3, 3.2, "#fff"));
    out.push(circle(38, 54, 1.7, t.eye));
    out.push(circle(62, 54, 1.7, t.eye));
    out.push(circle(38, 53.2, 0.6, "#fff"));
    out.push(circle(62, 53.2, 0.6, "#fff"));
    return group(out);
  }

  function humanEyebrows(c) {
    const t = c.traits;
    const color = darken(t.hair, -5);
    if (t.eyebrows === "raised") {
      return group([
        path("M 33 44 Q 38 41 43 44", "none", color, 2),
        path("M 57 44 Q 62 41 67 44", "none", color, 2),
      ]);
    }
    if (t.eyebrows === "angry") {
      return group([
        path("M 33 46 L 43 43", "none", color, 2),
        path("M 57 43 L 67 46", "none", color, 2),
      ]);
    }
    if (t.eyebrows === "sad") {
      return group([
        path("M 33 44 L 43 47", "none", color, 2),
        path("M 57 47 L 67 44", "none", color, 2),
      ]);
    }
    if (t.eyebrows === "bushy") {
      return group([
        path("M 32 45 Q 38 42 44 45 L 44 47 L 32 47 Z", color),
        path("M 56 45 Q 62 42 68 45 L 68 47 L 56 47 Z", color),
      ]);
    }
    return group([
      path("M 33 46 L 43 46", "none", color, 2),
      path("M 57 46 L 67 46", "none", color, 2),
    ]);
  }

  function humanGlasses(c) {
    const t = c.traits;
    if (t.glasses === "none") return null;
    const stroke = "#1a1a1a";
    const sw = 1.5;
    if (t.glasses === "round") {
      return group([
        circle(38, 54, 5.5, "none", stroke),
        circle(62, 54, 5.5, "none", stroke),
        path("M 43 54 H 57", stroke, stroke, sw),
      ]);
    }
    if (t.glasses === "square") {
      return group([
        rect(31, 50, 14, 9, "none", 1, stroke),
        rect(55, 50, 14, 9, "none", 1, stroke),
        path("M 45 54 H 55", stroke, stroke, sw),
      ]);
    }
    if (t.glasses === "sunglasses") {
      return group([
        rect(31, 50, 14, 8, "#1a1a1a", 2),
        rect(55, 50, 14, 8, "#1a1a1a", 2),
        path("M 45 54 H 55", stroke, "#1a1a1a", sw),
        // Reflection shine
        path("M 34 52 L 38 55", "none", "rgba(255,255,255,0.4)", 1),
        path("M 58 52 L 62 55", "none", "rgba(255,255,255,0.4)", 1),
      ]);
    }
    if (t.glasses === "monocle") {
      return group([
        circle(62, 54, 6, "none", stroke, sw),
        line(62, 60, 64, 70, stroke, 0.8),
      ]);
    }
    return null;
  }

  function humanNose(c) {
    const t = c.traits;
    return path("M 50 58 L 46 66 L 50 67 L 54 66 Z", shade(t.skin, -8));
  }

  function humanFacialHair(c) {
    const t = c.traits;
    if (t.facialHair === "none") return null;
    const color = darken(t.hair, 5);
    if (t.facialHair === "mustache") {
      return path("M 40 68 Q 50 64 60 68 Q 55 71 50 70 Q 45 71 40 68 Z", color);
    }
    if (t.facialHair === "beard") {
      return path("M 28 64 Q 50 95 72 64 Q 60 80 50 80 Q 40 80 28 64 Z", color);
    }
    if (t.facialHair === "goatee") {
      return group([
        path("M 44 70 Q 50 68 56 70 Q 53 73 50 73 Q 47 73 44 70 Z", color),
        path("M 46 73 L 50 80 L 54 73 Z", color),
      ]);
    }
    return null;
  }

  function humanMouth(c) {
    const t = c.traits;
    const lip = t.lipstick ? "#c84e4e" : shade(t.skin, -25);
    if (t.expression === "grin" || t.expression === "smile") {
      return group([
        path("M 40 70 Q 50 78 60 70", "none", lip, 2),
        t.lipstick ? path("M 40 70 Q 50 80 60 70 Q 50 72 40 70 Z", lip) : null,
        // Teeth hint for big grin
        t.expression === "grin" ? path("M 42 72 Q 50 76 58 72 L 58 73 Q 50 75 42 73 Z", "#fffaf0") : null,
      ]);
    }
    if (t.expression === "smirk") {
      return group([
        path("M 40 71 Q 50 74 60 70", "none", lip, 2),
        t.lipstick ? path("M 40 71 Q 50 75 60 70 Q 50 71 40 71 Z", lip) : null,
      ]);
    }
    if (t.expression === "frown") {
      return group([
        path("M 40 72 Q 50 66 60 72", "none", lip, 2),
        t.lipstick ? path("M 40 72 Q 50 70 60 72 Q 50 76 40 72 Z", lip) : null,
      ]);
    }
    if (t.expression === "surprised") {
      return ellipse(50, 71, 3, 4, lip, "#1a1a1a");
    }
    if (t.expression === "skeptical") {
      return path("M 42 71 Q 50 70 58 71", "none", lip, 2);
    }
    if (t.expression === "sleepy") {
      return path("M 44 71 Q 50 72 56 71", "none", lip, 1.5);
    }
    return path("M 44 70 H 56", "none", lip, 2);
  }

  function humanFreckles(c) {
    if (!c.traits.freckles) return null;
    const freckleColor = "#a05a3a";
    return group([
      circle(40, 64, 0.7, freckleColor),
      circle(44, 66, 0.6, freckleColor),
      circle(48, 65, 0.6, freckleColor),
      circle(52, 65, 0.7, freckleColor),
      circle(56, 66, 0.6, freckleColor),
      circle(60, 64, 0.7, freckleColor),
    ]);
  }

  // ============================================================
  // Top-level renderer — picks the right head + accessories
  // ============================================================
  function renderPortrait(character, options = {}) {
    const root = svgEl("svg", {
      viewBox: "0 0 100 100",
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true",
    });
    if (options.className) root.classList.add(options.className);
    root.append(rect(0, 0, 100, 100, options.background || "#fffaf0", 6));
    if (character.kind === "cat") {
      if (character.breed === "kitten") {
        root.append(catKittenHead(character));
        root.append(catFace(character, 1.3));
      } else if (character.breed === "siamese") {
        root.append(catSiameseHead(character));
        root.append(catFace(character, 1));
      } else {
        root.append(catTabbyHead(character));
        root.append(catFace(character, 1));
      }
      const collar = catCollar(character);
      if (collar) root.append(collar);
    } else if (character.kind === "dog") {
      if (character.breed === "puppy") root.append(dogPuppyHead(character));
      else if (character.breed === "bulldog") root.append(dogBulldogHead(character));
      else root.append(dogSpanielHead(character));
      root.append(dogFace(character));
      const collar = dogCollar(character);
      if (collar) root.append(collar);
    } else {
      // Human
      for (const el of humanBase(character)) root.append(el);
      const hairBack = humanHairBack(character);
      if (hairBack) root.append(hairBack);
      root.append(humanFace(character));
      const hairFront = humanHairFront(character);
      if (hairFront) root.append(hairFront);
      const eyebrows = humanEyebrows(character);
      if (eyebrows) root.append(eyebrows);
      const freckles = humanFreckles(character);
      if (freckles) root.append(freckles);
      const facialHair = humanFacialHair(character);
      if (facialHair) root.append(facialHair);
      const mouth = humanMouth(character);
      if (mouth) root.append(mouth);
      root.append(humanNose(character));
      root.append(humanEyes(character));
      const glasses = humanGlasses(character);
      if (glasses) root.append(glasses);
      // Hat is drawn last so the band/rim sits on the forehead, not behind it.
      const hat = humanHat(character);
      if (hat) root.append(hat);
    }
    return root;
  }

  // ----- Exports -----
  global.WhoAmI = {
    generatePool,
    renderPortrait,
  };
})(window);
