// characters.js — procedural portrait generator for "Who Am I?".
//
// The same (seed, count) pair always produces the same pool of characters,
// so the server only ships the seed and each player's secret index.
//
// Illustration system: every portrait is a flat two-tone cartoon drawn on a
// 100x100 SVG with warm brown line work, a soft pastel background, and a
// single "emotion" token per character that drives brows, eyelids, pupils,
// and mouth together so faces read as coherent expressions at card size.
//
// Board planning: instead of rolling every trait independently, the pool is
// dealt from shuffled quota lists (species split, near-distinct hair/fur
// colors, spread of glasses, hats, and expressions) so a 24-card board plays
// like a real Guess Who box — lots of visible, askable differences.

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
    return options[Math.floor(rng() * options.length)];
  }

  function maybe(rng, probability) {
    return rng() < probability;
  }

  function shuffle(rng, list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // Deal `n` values from a shuffled cycle of `list`, so every value appears
  // before any repeats and large groups stay visually distinct.
  function deal(rng, list, n) {
    const out = [];
    while (out.length < n) out.push(...shuffle(rng, list));
    return out.slice(0, n);
  }

  // ----- Color helpers -----
  function hexToRgb(hex) {
    const num = parseInt(hex.replace("#", ""), 16);
    return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
  }

  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
  }

  function shade(hex, percent) {
    const { r, g, b } = hexToRgb(hex);
    const f = percent / 100;
    const adjust = (c) => Math.max(0, Math.min(255, c + 255 * f));
    return rgbToHex(adjust(r), adjust(g), adjust(b));
  }

  const darken = (hex, percent) => shade(hex, -Math.abs(percent));
  const lighten = (hex, percent) => shade(hex, Math.abs(percent));

  function isLightColor(hex) {
    const { r, g, b } = hexToRgb(hex);
    return 0.299 * r + 0.587 * g + 0.114 * b > 150;
  }

  // ----- Palettes -----
  const LINE = "#463428"; // warm near-black for all line work
  const SKIN_COLORS = [
    "#ffe0c4", "#f6c99f", "#e2a878", "#bf8157", "#8d5a3b", "#5f3d28",
  ];
  const HAIR_COLORS = [
    "#1f1a17", "#33251c", "#4a3222", "#5f4025", "#7a5230", "#96683a",
    "#b8894e", "#d3ac69", "#c96f3b", "#a34f2a", "#8a8d93", "#d9d5cf",
  ];
  const EYE_COLORS = ["#4a6f8a", "#4f7a4f", "#7a5a35", "#3d3a37", "#6e7a8a"];
  const CLOTHES_COLORS = [
    "#c96f4a", "#4a7d8c", "#d9a441", "#7d9c6a", "#5b6b9e", "#a86a8e", "#96604a",
  ];
  const FUR_COLORS = [
    "#8a6a48", "#a8845e", "#6b5138", "#4c3a28", "#2f2620", "#c7a37c",
    "#d9c8ae", "#b5b0a8", "#8c8578",
  ];
  const COLORPOINT_FURS = ["#e8dcc6", "#dcc9a8", "#e5d9c4"];
  // Soft card backgrounds, rotated per character for a varied board.
  const BG_PASTELS = ["#f3e4d3", "#e4edf2", "#f0e6ee", "#e7efe2", "#f6ecd9", "#f0e0da"];
  const EAR_INNER = "#e8a4a0";
  const BLUSH = "rgba(217, 108, 108, 0.30)";
  const MOUTH_DARK = "#5c3a34";
  const TONGUE = "#e88a9a";

  // ----- Pool planning -----
  const HUMAN_HAIRSTYLES = ["short", "long", "curly", "ponytail", "bun", "afro", "buzz", "bald"];
  const HUMAN_EXPRESSIONS = ["happy", "grin", "calm", "smirk", "surprised", "sad", "grumpy", "sleepy"];
  const CAT_EXPRESSIONS = ["content", "playful", "smug", "sleepy", "alert", "grumpy"];
  const DOG_EXPRESSIONS = ["happy", "panting", "alert", "sleepy", "sad"];
  const CAT_PATTERNS = ["stripes", "solid", "calico", "colorpoint", "stripes", "solid"];
  const DOG_BREEDS = ["shepherd", "spaniel", "puppy", "bulldog"];

  function planSpecies(rng, count) {
    const humans = Math.round(count * 0.5);
    const cats = Math.round(count * 0.25);
    const dogs = count - humans - cats;
    const kinds = [
      ...Array.from({ length: humans }, () => "human"),
      ...Array.from({ length: cats }, () => "cat"),
      ...Array.from({ length: dogs }, () => "dog"),
    ];
    return shuffle(rng, kinds);
  }

  function planHuman(rng, i, n) {
    const breed = ["man", "woman", "kid"][i % 3];
    const hat = deal(rng, ["none", "none", "none", "none", "none", "none", "beanie", "cap", "cowboy", "bandana", "tophat"], n)[i];
    return {
      kind: "human",
      breed,
      traits: {
        skin: deal(rng, SKIN_COLORS, n)[i],
        hair: deal(rng, HAIR_COLORS, n)[i],
        hairStyle: deal(rng, HUMAN_HAIRSTYLES, n)[i],
        expression: deal(rng, HUMAN_EXPRESSIONS, n)[i],
        glasses: deal(
          rng,
          ["none", "none", "none", "none", "none", "round", "round", "square", "sunglasses", "monocle"],
          n
        )[i],
        hat,
        hatColor: hat === "none" ? null : pick(rng, CLOTHES_COLORS.concat(["#6b5138", "#3d3a37"])),
        shirt: deal(rng, CLOTHES_COLORS, n)[i],
        eye: pick(rng, EYE_COLORS),
        facialHair:
          breed === "man" && maybe(rng, 0.5)
            ? pick(rng, ["mustache", "beard", "goatee"])
            : "none",
        earrings: breed !== "man" && hat === "none" && maybe(rng, 0.4),
        lipstick: breed === "woman" && maybe(rng, 0.45),
        freckles: maybe(rng, 0.22),
        tilt: (rng() - 0.5) * 3.4,
      },
    };
  }

  function planCat(rng, i, n) {
    const pattern = CAT_PATTERNS[i % CAT_PATTERNS.length];
    const furPool = pattern === "colorpoint" ? COLORPOINT_FURS : FUR_COLORS;
    return {
      kind: "cat",
      breed: "cat",
      traits: {
        fur: deal(rng, furPool, n)[i],
        pattern,
        expression: deal(rng, CAT_EXPRESSIONS, n)[i],
        collar: maybe(rng, 0.5) ? pick(rng, CLOTHES_COLORS) : null,
        tag: maybe(rng, 0.6),
        tilt: (rng() - 0.5) * 3,
      },
    };
  }

  function planDog(rng, i, n) {
    const fur = deal(rng, FUR_COLORS, n)[i];
    return {
      kind: "dog",
      breed: deal(rng, DOG_BREEDS, n)[i],
      traits: {
        fur,
        // Most dogs share their ear color with a darker shade of the coat;
        // some get a contrasting patch for extra breed personality.
        earColor: maybe(rng, 0.35) ? pick(rng, ["#4c3a28", "#2f2620", "#8a5a3a", "#6b5138"]) : darken(fur, 18),
        expression: deal(rng, DOG_EXPRESSIONS, n)[i],
        collar: maybe(rng, 0.55) ? pick(rng, CLOTHES_COLORS) : null,
        tag: maybe(rng, 0.6),
        tilt: (rng() - 0.5) * 3,
      },
    };
  }

  function generatePool(seed, count) {
    const rng = mulberry32(seed);
    const kinds = planSpecies(rng, count);
    const humans = kinds.filter((kind) => kind === "human").length;
    const cats = kinds.filter((kind) => kind === "cat").length;
    const dogs = kinds.filter((kind) => kind === "dog").length;
    const humanPlans = Array.from({ length: humans }, (_, i) => planHuman(rng, i, humans));
    const catPlans = Array.from({ length: cats }, (_, i) => planCat(rng, i, cats));
    const dogPlans = Array.from({ length: dogs }, (_, i) => planDog(rng, i, dogs));

    const plans = [];
    let hi = 0;
    let ci = 0;
    let di = 0;
    for (const kind of kinds) {
      if (kind === "human") plans.push(humanPlans[hi++]);
      else if (kind === "cat") plans.push(catPlans[ci++]);
      else plans.push(dogPlans[di++]);
    }

    return plans.map((plan, index) => {
      // Breed lives on the character for the app's labels, and inside traits
      // so the renderers' per-breed branches can read it in one place.
      const character = {
        kind: plan.kind,
        breed: plan.breed,
        traits: { ...plan.traits, breed: plan.breed },
      };
      character.id = `c${index}`;
      character.index = index;
      return character;
    });
  }

  // ----- SVG primitives -----
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

  const circle = (cx, cy, r, fill, stroke = "none", sw = 0) =>
    svgEl("circle", { cx, cy, r, fill, stroke, "stroke-width": sw });
  const ellipse = (cx, cy, rx, ry, fill, stroke = "none", sw = 0, transform = null) =>
    svgEl("ellipse", { cx, cy, rx, ry, fill, stroke, "stroke-width": sw, transform });
  const path = (d, fill, stroke = "none", sw = 0, extra = {}) =>
    svgEl("path", { d, fill, stroke, "stroke-width": sw, "stroke-linecap": "round", "stroke-linejoin": "round", ...extra });
  const line = (x1, y1, x2, y2, stroke, sw = 1.4) =>
    svgEl("line", { x1, y1, x2, y2, stroke, "stroke-width": sw, "stroke-linecap": "round" });

  function group(children, transform = null) {
    const g = svgEl("g", transform ? { transform } : {});
    for (const child of children) if (child != null) g.append(child);
    return g;
  }

  function zzz(x, y, size, opacity) {
    const text = svgEl("text", {
      x, y,
      "font-size": size,
      "font-family": "ui-monospace, monospace",
      "font-weight": "700",
      fill: `rgba(70, 52, 40, ${opacity})`,
    });
    text.textContent = "z";
    return text;
  }

  // ----- Shared pieces -----
  function backdrop(character, options = {}) {
    const bg = options.background || BG_PASTELS[character.index % BG_PASTELS.length];
    return [
      svgEl("rect", { x: 0, y: 0, width: 100, height: 100, fill: bg }),
      circle(50, 52, 41, lighten(bg, 7)),
    ];
  }

  function tagCircle(cx, cy) {
    return group([
      circle(cx, cy, 3.4, "#e2b34f", darken("#e2b34f", 25), 1),
      circle(cx - 0.8, cy - 0.9, 0.9, "rgba(255,255,255,0.85)"),
    ]);
  }

  function animalCollar(t, y) {
    if (!t.collar) return null;
    const parts = [
      path(`M 26 ${y} Q 50 ${y + 8} 74 ${y} L 72.5 ${y + 6} Q 50 ${y + 13.5} 27.5 ${y + 6} Z`, t.collar, darken(t.collar, 22), 1.4),
    ];
    if (t.tag) parts.push(tagCircle(50, y + 10));
    return group(parts);
  }

  // ============================================================
  // HUMAN RENDERER
  // ============================================================

  function humanHeadPath(breed) {
    if (breed === "man") {
      return "M 50 21 C 34 21 24 31 24 46 C 24 59 30 70 38 74.5 C 43 77 57 77 62 74.5 C 70 70 76 59 76 46 C 76 31 66 21 50 21 Z";
    }
    if (breed === "woman") {
      return "M 50 21 C 35 21 25 31 25 46 C 25 60 33 72 43 75.5 C 47 77 53 77 57 75.5 C 67 72 75 60 75 46 C 75 31 65 21 50 21 Z";
    }
    return "M 50 23 C 36 23 26 33 26 47 C 26 61 36 75 50 75 C 64 75 74 61 74 47 C 74 33 64 23 50 23 Z";
  }

  function humanBody(t, breed) {
    const inset = breed === "kid" ? 20 : 12;
    return [
      // Neck first so the shirt covers its base.
      path("M 43 64 L 43 82 L 57 82 L 57 64 Z", t.skin),
      path("M 43 68 Q 50 74 57 68 L 57 64 L 43 64 Z", darken(t.skin, 12)),
      path(
        `M ${inset} 102 C ${inset + 4} 86 34 79 50 79 C 66 79 ${100 - inset - 4} 86 ${100 - inset} 102 Z`,
        t.shirt, darken(t.shirt, 25), 2
      ),
      path("M 42 79 Q 50 85 58 79", "none", darken(t.shirt, 32), 1.6),
    ];
  }

  function humanEars(t) {
    const parts = [
      ellipse(24, 52, 4.2, 6, t.skin, LINE, 1.6),
      ellipse(76, 52, 4.2, 6, t.skin, LINE, 1.6),
      path("M 24.5 50.5 Q 22.6 52 24.3 54", "none", darken(t.skin, 22), 1.1),
      path("M 75.5 50.5 Q 77.4 52 75.7 54", "none", darken(t.skin, 22), 1.1),
    ];
    if (t.earrings) {
      parts.push(circle(24, 58.5, 1.7, "#e2b34f", darken("#e2b34f", 25), 0.8));
      parts.push(circle(76, 58.5, 1.7, "#e2b34f", darken("#e2b34f", 25), 0.8));
    }
    return group(parts);
  }

  // Hair drawn behind the head: long panels, ponytail tail, buns, afro mass.
  function humanHairBack(t) {
    const color = t.hair;
    const edge = darken(color, 22);
    switch (t.hairStyle) {
      case "long":
        return path(
          "M 22 44 C 22 18 36 10 50 10 C 64 10 78 18 78 44 L 81 88 Q 75 92 71 88 L 67 62 L 33 62 L 29 88 Q 25 92 19 88 Z",
          color, edge, 1.6
        );
      case "ponytail":
        return path(
          "M 62 28 C 80 30 88 48 84 66 C 82 76 75 82 70 77 C 77 64 77 46 60 37 Z",
          color, edge, 1.4
        );
      case "bun":
        return group([
          path("M 24 44 C 24 20 36 12 50 12 C 64 12 76 20 76 44 Z", color, edge, 1.4),
          circle(50, 10, 8.5, color, edge, 1.6),
        ]);
      case "curly":
        return group([
          circle(24, 44, 7.5, color, edge, 1.2),
          circle(21, 54, 6.5, color, edge, 1.2),
          circle(76, 44, 7.5, color, edge, 1.2),
          circle(79, 54, 6.5, color, edge, 1.2),
        ]);
      case "afro":
        return group([
          ellipse(50, 36, 33, 29, color, edge, 1.8),
          circle(20, 44, 8, color, edge, 1.2),
          circle(80, 44, 8, color, edge, 1.2),
        ]);
      default:
        return null;
    }
  }

  // Hair drawn after the head: caps, bangs, fringes.
  function humanHairFront(t) {
    const color = t.hair;
    const edge = darken(color, 20);
    switch (t.hairStyle) {
      case "buzz":
        return path(
          "M 26 45 C 26 28 37 19 50 19 C 63 19 74 28 74 45 C 70 33 61 29 50 29 C 39 29 30 33 26 45 Z",
          color, edge, 1.2
        );
      case "short":
        return group([
          path(
            "M 25 47 C 24 28 36 17 50 17 C 64 17 76 28 75 47 C 72 38 67 33.5 61 32.5 C 55 31.5 52 28 48 28 C 44 28 40 32.5 35 33.5 C 30 34.5 27 40 25 47 Z",
            color, edge, 1.6
          ),
          // Sideburns keep the cap from reading as a helmet.
          path("M 25 44 L 29.5 43.5 L 29 52.5 Q 25.8 51 25 44 Z", color),
          path("M 75 44 L 70.5 43.5 L 71 52.5 Q 74.2 51 75 44 Z", color),
        ]);
      case "long":
        return group([
          path(
            "M 25 48 C 24 24 36 15 50 15 C 64 15 76 24 75 48 C 71 36 66 31 50 30 C 40 30 30 36 25 48 Z",
            color, edge, 1.6
          ),
          path("M 25 44 C 23.5 56 23.5 66 26 76 L 32.5 73.5 C 30.5 65 30.5 54 31.5 45 Z", color, edge, 1.2),
          path("M 75 44 C 76.5 56 76.5 66 74 76 L 67.5 73.5 C 69.5 65 69.5 54 68.5 45 Z", color, edge, 1.2),
        ]);
      case "ponytail":
        return path(
          "M 25 48 C 24 26 36 16 50 16 C 64 16 76 26 75 48 C 71 37 65 32 50 31 C 38 31 29 37 25 48 Z",
          color, edge, 1.6
        );
      case "bun":
        return path(
          "M 25 47 C 24 27 36 16 50 16 C 64 16 76 27 75 47 C 70 36 62 31 50 31 C 38 31 30 36 25 47 Z",
          color, edge, 1.6
        );
      case "curly":
        return group([
          circle(32, 28, 8, color, edge, 1.2),
          circle(43, 21.5, 8.5, color, edge, 1.2),
          circle(57, 21.5, 8.5, color, edge, 1.2),
          circle(68, 28, 8, color, edge, 1.2),
          circle(27.5, 39, 7, color, edge, 1.2),
          circle(72.5, 39, 7, color, edge, 1.2),
        ]);
      case "afro":
        return group([
          circle(36, 27, 6, color, edge, 1),
          circle(50, 24.5, 6.5, color, edge, 1),
          circle(64, 27, 6, color, edge, 1),
        ]);
      default:
        return null;
    }
  }

  // One emotion drives brows, lids, and mouth so the face stays coherent.
  const HUMAN_EMOTION_PRESETS = {
    happy:     { brow: "arch",     lid: 0,    pupil: 1,    mouth: "smileOpen" },
    grin:      { brow: "archHigh", lid: 0.32, pupil: 0.95, mouth: "grin" },
    calm:      { brow: "flat",     lid: 0.12, pupil: 1,    mouth: "calm" },
    smirk:     { brow: "asym",     lid: 0.15, pupil: 1,    mouth: "smirk" },
    surprised: { brow: "high",     lid: 0,    pupil: 1.15, mouth: "o", wide: true },
    sad:       { brow: "sad",      lid: 0.3,  pupil: 1,    mouth: "frown" },
    grumpy:    { brow: "angry",    lid: 0.42, pupil: 1,    mouth: "flat" },
    sleepy:    { brow: "low",      lid: 0.72, pupil: 0.9,  mouth: "sleepy" },
  };

  const BROW_PATHS = {
    arch:     { l: "M 33 46.6 Q 38.5 43.8 44 46.2", r: "M 67 46.6 Q 61.5 43.8 56 46.2" },
    archHigh: { l: "M 33 45 Q 38.5 42.4 44 44.8",   r: "M 67 45 Q 61.5 42.4 56 44.8" },
    flat:     { l: "M 33 46.5 L 44 46.2",           r: "M 67 46.5 L 56 46.2" },
    high:     { l: "M 33 43.8 Q 38.5 41.4 44 43.6", r: "M 67 43.8 Q 61.5 41.4 56 43.6" },
    low:      { l: "M 33 48 L 44 47.6",             r: "M 67 48 L 56 47.6" },
    asym:     { l: "M 33 43.8 Q 38.5 41.4 44 44.2", r: "M 67 47.2 Q 61.5 45.4 56 46.4" },
    sad:      { l: "M 33 47.8 L 44 44.8",           r: "M 67 47.8 L 56 44.8" },
    angry:    { l: "M 33 44.2 L 44 47.4",           r: "M 67 44.2 L 56 47.4" },
  };

  function humanBrows(preset, hairColor) {
    const paths = BROW_PATHS[preset.brow] || BROW_PATHS.flat;
    const color = darken(hairColor, 12);
    return group([
      path(paths.l, "none", color, 2.1),
      path(paths.r, "none", color, 2.1),
    ]);
  }

  function humanEyes(t, preset) {
    const exL = 39, exR = 61, ey = 55, rx = 4.1;
    const ry = preset.wide ? 5.1 : 4.6;
    const skinLid = darken(t.skin, 8);
    const parts = [];
    for (const ex of [exL, exR]) {
      parts.push(ellipse(ex, ey, rx, ry, "#fffdf8", LINE, 1.3));
      const irisR = 2.75 * preset.pupil;
      parts.push(circle(ex, ey + 0.2, irisR, t.eye));
      parts.push(circle(ex, ey + 0.2, irisR * 0.48, "#241d18"));
      parts.push(circle(ex - 0.9, ey - 1.1, 0.75, "rgba(255,255,255,0.95)"));
      if (preset.lid > 0.02) {
        const lidH = ry * 2 * preset.lid;
        parts.push(ellipse(ex, ey - ry + lidH / 2, rx * 0.92, lidH / 2 + 0.4, skinLid));
        parts.push(path(
          `M ${ex - rx + 0.3} ${ey - ry + lidH} Q ${ex} ${ey - ry + lidH + 1.7} ${ex + rx - 0.3} ${ey - ry + lidH}`,
          "none", LINE, 1.2
        ));
      }
    }
    if (t.breed !== "man") {
      parts.push(path("M 34.8 53.4 L 32.8 52.2", "none", LINE, 1.1));
      parts.push(path("M 65.2 53.4 L 67.2 52.2", "none", LINE, 1.1));
    }
    return group(parts);
  }

  function humanNose(t) {
    return path(
      "M 50 56.5 C 49.2 59.5 48.2 61.8 47.4 63.2 Q 50 64.8 52.6 63.2",
      "none", darken(t.skin, 26), 1.5
    );
  }

  function humanMouth(t, preset) {
    const lip = t.lipstick ? "#c4526a" : darken(t.skin, 28);
    switch (preset.mouth) {
      case "smileOpen":
        return group([
          path("M 42.5 68.5 Q 50 74.8 57.5 68.5", "none", lip, 2),
          path("M 45 71.6 Q 50 73.3 55 71.6", "none", lip, 1),
        ]);
      case "grin":
        return group([
          path("M 41.5 67.5 Q 50 79 58.5 67.5 Q 50 70 41.5 67.5 Z", MOUTH_DARK, LINE, 1.4),
          path("M 43.5 68.7 Q 50 70.4 56.5 68.7 L 56.2 70.8 Q 50 72.6 43.8 70.8 Z", "#fffdf8"),
          path("M 45.5 75.6 Q 50 77.4 54.5 75.6", "none", TONGUE, 1.6),
        ]);
      case "calm":
        return path("M 44.5 69.5 Q 50 72.2 55.5 69.5", "none", lip, 2);
      case "smirk":
        return path("M 43.5 70.5 Q 50 73.8 57.5 68.2", "none", lip, 2);
      case "o":
        return group([
          ellipse(50, 70.5, 3.1, 4, MOUTH_DARK, LINE, 1.2),
          ellipse(50, 72.4, 1.6, 1.5, TONGUE),
        ]);
      case "frown":
        return path("M 44.5 71.8 Q 50 68.8 55.5 71.8", "none", lip, 2);
      case "flat":
        return path("M 44.5 70.4 L 55.5 70.4", "none", lip, 2);
      case "sleepy":
        return ellipse(50.5, 70.5, 2.1, 2.6, MOUTH_DARK, LINE, 1);
      default:
        return path("M 44.5 70 L 55.5 70", "none", lip, 2);
    }
  }

  function humanExtras(t) {
    const parts = [];
    if (["happy", "grin", "surprised"].includes(t.expression)) {
      parts.push(ellipse(31.5, 63.5, 3.4, 2.1, BLUSH));
      parts.push(ellipse(68.5, 63.5, 3.4, 2.1, BLUSH));
    }
    if (t.freckles) {
      const c = "rgba(122, 68, 38, 0.75)";
      parts.push(
        circle(36, 60.5, 0.75, c), circle(39.5, 62, 0.7, c), circle(42, 60, 0.6, c),
        circle(58, 60, 0.6, c), circle(60.5, 62, 0.7, c), circle(64, 60.5, 0.75, c)
      );
    }
    if (t.expression === "sleepy") {
      parts.push(zzz(78, 32, 7, 0.7), zzz(85, 24, 5.5, 0.55));
    }
    return parts.length ? group(parts) : null;
  }

  function humanFacialHair(t) {
    const color = darken(t.hair, 6);
    switch (t.facialHair) {
      case "mustache":
        return path(
          "M 41.5 66.5 Q 46 63.8 50 66 Q 54 63.8 58.5 66.5 Q 54 68.8 50 67.2 Q 46 68.8 41.5 66.5 Z",
          color
        );
      case "beard":
        return path(
          "M 30 56 C 30 74 38 83 50 83 C 62 83 70 74 70 56 C 66 72 60 74.5 50 74.5 C 40 74.5 34 72 30 56 Z",
          color, darken(color, 20), 1
        );
      case "goatee":
        return path(
          "M 44.5 71 C 45.5 77.5 48 79.5 50 79.5 C 52 79.5 54.5 77.5 55.5 71 C 53.5 73.2 46.5 73.2 44.5 71 Z",
          color
        );
      default:
        return null;
    }
  }

  function humanGlasses(t) {
    switch (t.glasses) {
      case "round":
        return group([
          circle(39, 55, 6.4, "rgba(255,255,255,0.25)", LINE, 1.7),
          circle(61, 55, 6.4, "rgba(255,255,255,0.25)", LINE, 1.7),
          path("M 45.4 54.4 Q 50 52.8 54.6 54.4", "none", LINE, 1.7),
          line(32.6, 54, 26, 51.5, LINE, 1.5),
          line(67.4, 54, 74, 51.5, LINE, 1.5),
        ]);
      case "square":
        return group([
          svgEl("rect", { x: 31.5, y: 49.5, width: 15, height: 11.5, rx: 3, fill: "rgba(255,255,255,0.25)", stroke: LINE, "stroke-width": 1.7 }),
          svgEl("rect", { x: 53.5, y: 49.5, width: 15, height: 11.5, rx: 3, fill: "rgba(255,255,255,0.25)", stroke: LINE, "stroke-width": 1.7 }),
          path("M 46.5 54.4 Q 50 53 53.5 54.4", "none", LINE, 1.7),
          line(31.5, 53.5, 26, 51.5, LINE, 1.5),
          line(68.5, 53.5, 74, 51.5, LINE, 1.5),
        ]);
      case "sunglasses":
        return group([
          path("M 30.5 49 L 47.5 49 Q 48 56.5 43 58 Q 35 59.5 31.5 55.5 Q 30.2 52.5 30.5 49 Z", "#33291f", LINE, 1.5),
          path("M 69.5 49 L 52.5 49 Q 52 56.5 57 58 Q 65 59.5 68.5 55.5 Q 69.8 52.5 69.5 49 Z", "#33291f", LINE, 1.5),
          path("M 47.5 51.5 Q 50 50.4 52.5 51.5", "none", LINE, 1.7),
          line(30.5, 51, 26, 51.5, LINE, 1.5),
          line(69.5, 51, 74, 51.5, LINE, 1.5),
          path("M 34 52 L 37.5 55.5", "none", "rgba(255,255,255,0.5)", 1.3),
          path("M 56 52 L 59.5 55.5", "none", "rgba(255,255,255,0.5)", 1.3),
        ]);
      case "monocle":
        return group([
          circle(61, 55, 6.8, "rgba(255,255,255,0.25)", LINE, 1.7),
          path("M 61 61.8 Q 63.5 68 66.5 72", "none", LINE, 1.1),
        ]);
      default:
        return null;
    }
  }

  function humanHat(t) {
    const c = t.hatColor || "#6b5138";
    const edge = darken(c, 26);
    switch (t.hat) {
      case "beanie":
        return group([
          path("M 22.5 39 C 21 21 34 10 50 10 C 66 10 79 21 77.5 39 Z", c, edge, 1.8),
          svgEl("rect", { x: 21, y: 34.5, width: 58, height: 8.5, rx: 4.2, fill: darken(c, 12), stroke: edge, "stroke-width": 1.4 }),
          circle(50, 7.5, 5.2, "#f6efe2", darken("#f6efe2", 14), 1.2),
        ]);
      case "cap":
        return group([
          path("M 22.5 43 C 22.5 25 34.5 14 50 14 C 65.5 14 77.5 25 77.5 43 L 77.5 44.5 L 22.5 44.5 Z", c, edge, 1.8),
          path("M 20 43 Q 50 49.5 80 43 Q 50 46 20 43 Z", darken(c, 12), edge, 1.4),
          circle(50, 12.5, 2.2, lighten(c, 14)),
        ]);
      case "tophat":
        return group([
          svgEl("rect", { x: 34, y: 2, width: 32, height: 33, rx: 2.5, fill: c, stroke: edge, "stroke-width": 1.8 }),
          svgEl("rect", { x: 34, y: 25, width: 32, height: 6.5, fill: darken(c, 22) }),
          ellipse(50, 35.5, 27, 5.2, c, edge, 1.8),
        ]);
      case "cowboy":
        return group([
          path("M 31.5 35 C 31.5 17 42 11 50 11 C 58 11 68.5 17 68.5 35 Z", c, edge, 1.8),
          path("M 31.5 30 Q 50 26 68.5 30 L 68.5 35 Q 50 31.5 31.5 35 Z", darken(c, 18)),
          path(
            "M 12 36.5 C 16 30.5 26 32.5 32 35.5 C 40 39.5 60 39.5 68 35.5 C 74 32.5 84 30.5 88 36.5 C 90 42.5 76 46.5 50 46.5 C 24 46.5 10 42.5 12 36.5 Z",
            c, edge, 1.8
          ),
        ]);
      case "bandana":
        return group([
          path("M 24 42 C 24 26 35 16 50 16 C 65 16 76 26 76 42 L 69 44.5 Q 50 38.5 31 44.5 Z", c, edge, 1.6),
          path("M 69.5 43.5 L 79 39.5 L 76 48.5 Z", c, edge, 1.4),
          circle(38, 31, 1.4, "rgba(255,250,240,0.55)"),
          circle(50, 25.5, 1.4, "rgba(255,250,240,0.55)"),
          circle(60, 32, 1.4, "rgba(255,250,240,0.55)"),
        ]);
      default:
        return null;
    }
  }

  function renderHuman(character) {
    const t = character.traits;
    const preset = HUMAN_EMOTION_PRESETS[t.expression] || HUMAN_EMOTION_PRESETS.calm;
    const layers = [
      ...humanBody(t, character.breed),
      humanHairBack(t),
      humanEars(t),
      path(humanHeadPath(character.breed), t.skin, LINE, 2),
      humanHairFront(t),
      humanBrows(preset, t.hair),
      humanEyes(t, preset),
      humanNose(t),
      humanFacialHair(t),
      humanMouth(t, preset),
      humanExtras(t),
      humanGlasses(t),
      humanHat(t),
    ];
    return group(layers.filter(Boolean), `rotate(${(t.tilt || 0).toFixed(2)} 50 62)`);
  }

  // ============================================================
  // CAT RENDERER
  // ============================================================

  const CAT_EMOTION_PRESETS = {
    content: { eyes: "happyArcs", mouth: "omega", blush: true },
    playful: { eyes: "roundBig",  mouth: "openTongue", blush: true },
    smug:    { eyes: "halfLid",   mouth: "omegaSmirk" },
    sleepy:  { eyes: "closed",    mouth: "tiny", zzz: true },
    alert:   { eyes: "roundWide", mouth: "tiny" },
    grumpy:  { eyes: "grumpyLid", mouth: "flatOmega" },
  };

  function catEars(t, fur) {
    const edge = darken(fur, 24);
    const dark = t.pattern === "colorpoint" ? darken(fur, 38) : fur;
    return group([
      path("M 26 40 Q 22.5 22 30 12 Q 41 18 43.5 33 Z", dark, edge, 1.8),
      path("M 74 40 Q 77.5 22 70 12 Q 59 18 56.5 33 Z", dark, edge, 1.8),
      path("M 30.5 33 Q 29 23 32.5 17.5 Q 38 21.5 39.5 30 Z", EAR_INNER),
      path("M 69.5 33 Q 71 23 67.5 17.5 Q 62 21.5 60.5 30 Z", EAR_INNER),
    ]);
  }

  function catHead(t, fur) {
    const edge = darken(fur, 24);
    const parts = [
      path("M 50 24 C 34 24 23 34 23 50 C 23 67 35 79 50 79 C 65 79 77 67 77 50 C 77 34 66 24 50 24 Z", fur, edge, 2),
      // Cheek tufts — little fur spikes on each side.
      path("M 23.5 54 L 18 56 L 23.5 58.5 L 19.5 62 L 25 63.5", "none", edge, 1.2),
      path("M 76.5 54 L 82 56 L 76.5 58.5 L 80.5 62 L 75 63.5", "none", edge, 1.2),
    ];
    if (t.pattern === "stripes") {
      const stripe = darken(fur, 20);
      parts.push(
        path("M 42 27 L 40.5 34", "none", stripe, 2),
        path("M 50 25.5 L 50 33", "none", stripe, 2),
        path("M 58 27 L 59.5 34", "none", stripe, 2),
        path("M 27.5 42 L 34 44.5", "none", stripe, 2),
        path("M 72.5 42 L 66 44.5", "none", stripe, 2)
      );
    }
    if (t.pattern === "calico") {
      parts.push(
        path("M 28 38 C 33 30 44 32 42 42 C 38 48 30 46 28 38 Z", "#d9a35c"),
        path("M 67 59 C 73 55 78 62 74 68 C 68 71 64 65 67 59 Z", "#3a3028")
      );
    }
    if (t.pattern === "colorpoint") {
      parts.push(ellipse(50, 63, 15.5, 11.5, darken(fur, 34)));
    }
    return group(parts);
  }

  function catEyes(t, preset) {
    const ey = 49, exL = 39, exR = 61;
    // Deterministic iris color derived from the fur color string.
    const hash = (t.fur || "").split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const iris = t.pattern === "colorpoint" ? "#5b8ac2" : ["#7a9a4f", "#c9a441", "#5b8ac2"][hash % 3];
    const parts = [];
    const drawOpen = (ex, wide) => {
      const rx = wide ? 5.4 : 4.9;
      const ry = wide ? 6 : 5.4;
      parts.push(ellipse(ex, ey, rx, ry, "#fdf8ee", darken(t.fur, 30), 1.2));
      parts.push(ellipse(ex, ey, rx * 0.72, ry * 0.78, iris));
      parts.push(ellipse(ex, ey, rx * 0.2, ry * 0.6, "#241d18"));
      parts.push(circle(ex - 1.1, ey - 1.6, 0.85, "rgba(255,255,255,0.95)"));
    };
    switch (preset.eyes) {
      case "happyArcs":
        parts.push(
          path("M 34.5 50 Q 39 44.5 43.5 50", "none", LINE, 2),
          path("M 56.5 50 Q 61 44.5 65.5 50", "none", LINE, 2)
        );
        break;
      case "closed":
        parts.push(
          path("M 34.5 48 Q 39 52.5 43.5 48", "none", LINE, 2),
          path("M 56.5 48 Q 61 52.5 65.5 48", "none", LINE, 2)
        );
        break;
      case "halfLid":
        drawOpen(exL, false); drawOpen(exR, false);
        parts.push(
          ellipse(exL, ey - 3.4, 4.6, 2.2, darken(t.fur, 10)),
          ellipse(exR, ey - 3.4, 4.6, 2.2, darken(t.fur, 10)),
          path("M 34.5 47.5 Q 39 49 43.5 47.5", "none", LINE, 1.6),
          path("M 56.5 47.5 Q 61 49 65.5 47.5", "none", LINE, 1.6)
        );
        break;
      case "grumpyLid":
        drawOpen(exL, false); drawOpen(exR, false);
        parts.push(
          ellipse(exL, ey - 2.6, 4.6, 2.4, darken(t.fur, 10), "none", 0, `rotate(-10 ${exL} ${ey - 2.6})`),
          ellipse(exR, ey - 2.6, 4.6, 2.4, darken(t.fur, 10), "none", 0, `rotate(10 ${exR} ${ey - 2.6})`),
          path("M 34.5 48.6 Q 39 50.2 43.5 49", "none", LINE, 1.6),
          path("M 65.5 48.6 Q 61 50.2 56.5 49", "none", LINE, 1.6)
        );
        break;
      case "roundWide":
        drawOpen(exL, true); drawOpen(exR, true);
        break;
      default:
        drawOpen(exL, false); drawOpen(exR, false);
    }
    return group(parts);
  }

  function catMuzzle(t, preset) {
    const parts = [
      ellipse(50, 63.5, 12.5, 9, lighten(t.fur, 14)),
      path("M 46.6 58.4 Q 50 56.6 53.4 58.4 Q 52 62.2 50 62.8 Q 48 62.2 46.6 58.4 Z", "#d3737f", darken("#d3737f", 25), 0.9),
    ];
    const mouthLine = darken(t.fur, 40);
    switch (preset.mouth) {
      case "omega":
        parts.push(path("M 43.5 65.5 Q 46.5 69 50 66.2 Q 53.5 69 56.5 65.5", "none", mouthLine, 1.8));
        break;
      case "omegaSmirk":
        parts.push(path("M 44.5 66 Q 47.5 69.5 50.5 66.4 Q 54 68.4 57 64.6", "none", mouthLine, 1.8));
        break;
      case "flatOmega":
        parts.push(path("M 44.5 66.5 Q 47.5 68.6 50 66.8 Q 52.5 68.6 55.5 66.5", "none", mouthLine, 1.7));
        break;
      case "openTongue":
        parts.push(
          path("M 44 64.5 Q 50 72 56 64.5 Q 50 66.5 44 64.5 Z", MOUTH_DARK, LINE, 1.2),
          ellipse(50, 68.6, 2.6, 2.4, TONGUE)
        );
        break;
      default:
        parts.push(path("M 45.5 65.8 Q 50 67.8 54.5 65.8", "none", mouthLine, 1.7));
    }
    const whisker = "rgba(70, 52, 40, 0.6)";
    parts.push(
      path("M 36.5 61 Q 28 59.5 21.5 56.5", "none", whisker, 1),
      path("M 36.5 64 Q 28 64.5 21.5 64.5", "none", whisker, 1),
      path("M 63.5 61 Q 72 59.5 78.5 56.5", "none", whisker, 1),
      path("M 63.5 64 Q 72 64.5 78.5 64.5", "none", whisker, 1)
    );
    return group(parts);
  }

  function renderCat(character) {
    const t = character.traits;
    const preset = CAT_EMOTION_PRESETS[t.expression] || CAT_EMOTION_PRESETS.content;
    const point = t.pattern === "colorpoint";
    // Colorpoint cats have cream bodies with dark ears, mask, and tail.
    const bodyFur = point ? t.fur : t.fur;
    const tailFur = point ? darken(t.fur, 30) : t.fur;
    const edge = darken(bodyFur, 24);
    const layers = [
      path("M 72 100 C 86 97 93 85 84 77 C 80 74 76 76 77 80", "none", tailFur, 7),
      circle(77, 80, 3.6, darken(tailFur, 18)),
      path("M 17 102 C 22 85 37 78 50 78 C 63 78 78 85 83 102 Z", bodyFur, edge, 2),
      ellipse(50, 95, 12, 9, lighten(bodyFur, 12)),
      animalCollar(t, 85),
      catEars(t, bodyFur),
      catHead(t, bodyFur),
      catEyes(t, preset),
      catMuzzle(t, preset),
    ];
    if (preset.blush) {
      layers.push(ellipse(31, 58.5, 3.4, 2, BLUSH), ellipse(69, 58.5, 3.4, 2, BLUSH));
    }
    if (preset.zzz) {
      layers.push(zzz(76, 32, 8, 0.7), zzz(84, 23, 6, 0.55));
    }
    return group(layers.filter(Boolean), `rotate(${(t.tilt || 0).toFixed(2)} 50 62)`);
  }

  // ============================================================
  // DOG RENDERER
  // ============================================================

  const DOG_EMOTION_PRESETS = {
    happy:   { eyes: "round",  brows: "relaxed", mouth: "smileTongue", ears: "normal" },
    panting: { eyes: "round",  brows: "relaxed", mouth: "pant",        ears: "droop" },
    alert:   { eyes: "wide",   brows: "up",      mouth: "small",       ears: "up" },
    sleepy:  { eyes: "closed", brows: "flat",    mouth: "tiny",        ears: "droop", zzz: true },
    sad:     { eyes: "sadLid", brows: "sad",     mouth: "frown",       ears: "droop" },
  };

  function dogEars(t, pose) {
    const edge = darken(t.earColor, 22);
    switch (t.breed) {
      case "shepherd": {
        if (pose === "droop") {
          return group([
            path("M 28 32 Q 21 44 28 56 Q 34.5 53 35 40 Z", t.earColor, edge, 1.8),
            path("M 72 32 Q 79 44 72 56 Q 65.5 53 65 40 Z", t.earColor, edge, 1.8),
          ]);
        }
        return group([
          path("M 27 38 Q 23 18 33 10 Q 44 16 45.5 32 Z", t.earColor, edge, 1.8),
          path("M 73 38 Q 77 18 67 10 Q 56 16 54.5 32 Z", t.earColor, edge, 1.8),
          path("M 31.5 30 Q 30 19 34.5 14.5 Q 40 18.5 41.5 28 Z", darken(t.earColor, 28)),
          path("M 68.5 30 Q 70 19 65.5 14.5 Q 60 18.5 58.5 28 Z", darken(t.earColor, 28)),
        ]);
      }
      case "spaniel":
        return group([
          path("M 27 34 C 14 38 12 62 18 78 C 21 86 30 86 31 78 C 33 64 33 46 31 36 Z", t.earColor, edge, 1.8),
          path("M 73 34 C 86 38 88 62 82 78 C 79 86 70 86 69 78 C 67 64 67 46 69 36 Z", t.earColor, edge, 1.8),
        ]);
      case "bulldog":
        return group([
          path("M 25 36 Q 18.5 30 21 42 Q 23 50 30 47.5 Z", t.earColor, edge, 1.6),
          path("M 75 36 Q 81.5 30 79 42 Q 77 50 70 47.5 Z", t.earColor, edge, 1.6),
        ]);
      default: // puppy
        return group([
          path("M 27 34 C 19 38 18 52 24 58 C 29 56 31 44 30 35 Z", t.earColor, edge, 1.8),
          path("M 73 34 C 81 38 82 52 76 58 C 71 56 69 44 70 35 Z", t.earColor, edge, 1.8),
        ]);
    }
  }

  function dogHead(t) {
    const edge = darken(t.fur, 24);
    if (t.breed === "bulldog") {
      return group([
        path("M 50 26 C 32 26 21 35 21 50 C 21 66 33 78 50 78 C 67 78 79 66 79 50 C 79 35 68 26 50 26 Z", t.fur, edge, 2),
        path("M 33 41.5 Q 39 39 44 41.5", "none", darken(t.fur, 20), 1.3),
        path("M 56 41.5 Q 61 39 67 41.5", "none", darken(t.fur, 20), 1.3),
        path("M 42 33.5 Q 50 31.5 58 33.5", "none", darken(t.fur, 20), 1.3),
      ]);
    }
    if (t.breed === "puppy") {
      return group([
        path("M 50 26 C 35 26 25 36 25 50 C 25 65 36 78 50 78 C 64 78 75 65 75 50 C 75 36 65 26 50 26 Z", t.fur, edge, 2),
        ellipse(50, 19, 3.6, 2.8, lighten(t.fur, 12)),
      ]);
    }
    if (t.breed === "spaniel") {
      return group([
        path("M 50 25 C 35 25 25 35 25 49 C 25 65 36 79 50 79 C 64 79 75 65 75 49 C 75 35 65 25 50 25 Z", t.fur, edge, 2),
        path("M 33 29 Q 50 21 67 29 Q 58 24.5 50 24.5 Q 42 24.5 33 29 Z", darken(t.fur, 10)),
      ]);
    }
    // shepherd
    return group([
      path("M 50 24 C 35 24 24 33 24 48 C 24 64 35 79 50 79 C 65 79 76 64 76 48 C 76 33 65 24 50 24 Z", t.fur, edge, 2),
    ]);
  }

  function dogEyes(t, preset) {
    const exL = t.breed === "bulldog" ? 38.5 : 39;
    const exR = t.breed === "bulldog" ? 61.5 : 61;
    const ey = 50;
    const rx = t.breed === "puppy" ? 4.9 : 4.3;
    const ryBase = t.breed === "puppy" ? 5.3 : 4.7;
    const parts = [];
    const drawOpen = (ex, ryScale = 1, lidFrac = 0) => {
      const ry = ryBase * ryScale;
      parts.push(ellipse(ex, ey, rx, ry, "#fdf8ee", darken(t.fur, 30), 1.2));
      parts.push(circle(ex, ey + 0.2, rx * 0.62, "#4a3a24"));
      parts.push(circle(ex, ey + 0.2, rx * 0.3, "#1d1613"));
      parts.push(circle(ex - 0.95, ey - 1.2, 0.8, "rgba(255,255,255,0.95)"));
      if (lidFrac > 0.02) {
        const lidH = ry * 2 * lidFrac;
        parts.push(ellipse(ex, ey - ry + lidH / 2, rx * 0.92, lidH / 2 + 0.4, darken(t.fur, 6)));
        parts.push(path(
          `M ${ex - rx + 0.3} ${ey - ry + lidH} Q ${ex} ${ey - ry + lidH + 1.6} ${ex + rx - 0.3} ${ey - ry + lidH}`,
          "none", LINE, 1.2
        ));
      }
    };
    switch (preset.eyes) {
      case "closed":
        parts.push(
          path(`M ${exL - 4.4} 50 Q ${exL} 54.5 ${exL + 4.4} 50`, "none", LINE, 2),
          path(`M ${exR - 4.4} 50 Q ${exR} 54.5 ${exR + 4.4} 50`, "none", LINE, 2)
        );
        break;
      case "sadLid":
        drawOpen(exL, 0.95, 0.32); drawOpen(exR, 0.95, 0.32);
        break;
      case "wide":
        drawOpen(exL, 1.12); drawOpen(exR, 1.12);
        break;
      default:
        drawOpen(exL); drawOpen(exR);
    }
    // Classic eyebrow dots — they tilt with the emotion. On light coats the
    // dots must darken to stay visible; on dark coats they lighten.
    const browColor = t.breed === "bulldog"
      ? "#3a2d22"
      : isLightColor(t.fur) ? darken(t.fur, 32) : lighten(t.fur, 34);
    const browY = preset.brows === "up" ? 42 : 43.6;
    const leftTilt = preset.brows === "sad" ? -14 : preset.brows === "up" ? 0 : 5;
    const rightTilt = preset.brows === "sad" ? 14 : preset.brows === "up" ? 0 : -5;
    parts.push(ellipse(exL, browY, 3, 1.4, browColor, "none", 0, `rotate(${leftTilt} ${exL} ${browY})`));
    parts.push(ellipse(exR, browY, 3, 1.4, browColor, "none", 0, `rotate(${rightTilt} ${exR} ${browY})`));
    return group(parts);
  }

  function dogMuzzle(t, preset) {
    const edge = darken(t.fur, 24);
    const muzzleFill = t.breed === "bulldog" ? lighten(t.fur, 16) : lighten(t.fur, 22);
    const parts = [];
    if (t.breed === "bulldog") {
      parts.push(ellipse(50, 65, 16, 10.5, muzzleFill, edge, 1.4));
      parts.push(path("M 40 66.5 Q 44.5 71.5 50 70 Q 55.5 71.5 60 66.5", "none", darken(t.fur, 30), 1.4));
    } else if (t.breed === "puppy") {
      parts.push(ellipse(50, 64, 11, 8.5, muzzleFill, edge, 1.4));
    } else {
      parts.push(ellipse(50, 65, 13.5, 10, muzzleFill, edge, 1.4));
    }
    parts.push(
      path("M 45.8 57.8 Q 50 55.4 54.2 57.8 Q 52.8 62.4 50 63 Q 47.2 62.4 45.8 57.8 Z", "#33261f", LINE, 1),
      path("M 48.4 58.2 Q 47.4 59.4 47.8 60.6", "none", "rgba(255,255,255,0.35)", 1),
      path("M 50 63 L 50 66", "none", LINE, 1.4)
    );
    switch (preset.mouth) {
      case "smileTongue":
        parts.push(
          path("M 42.5 66 Q 46.5 71.5 50 67.5 Q 53.5 71.5 57.5 66", "none", LINE, 1.8),
          path("M 47 69.5 Q 50 73.5 53 69.5 Q 53 75.5 50 76 Q 47 75.5 47 69.5 Z", TONGUE, darken(TONGUE, 22), 1)
        );
        break;
      case "pant":
        parts.push(
          path("M 43 65.5 Q 50 72.5 57 65.5", "none", LINE, 1.8),
          path("M 46.6 68 Q 50 71 53.4 68 L 53.4 77 Q 50 80 46.6 77 Z", TONGUE, darken(TONGUE, 22), 1),
          path("M 50 70.5 L 50 76", "none", darken(TONGUE, 26), 0.9)
        );
        break;
      case "small":
        parts.push(path("M 46 66.5 Q 50 68 54 66.5", "none", LINE, 1.6));
        break;
      case "frown":
        parts.push(path("M 45 68 Q 50 65.5 55 68", "none", LINE, 1.7));
        break;
      default:
        parts.push(path("M 46.5 66.8 Q 50 68.4 53.5 66.8", "none", LINE, 1.5));
    }
    return group(parts);
  }

  function renderDog(character) {
    const t = character.traits;
    const preset = DOG_EMOTION_PRESETS[t.expression] || DOG_EMOTION_PRESETS.happy;
    const edge = darken(t.fur, 24);
    const wagging = t.expression === "happy";
    const layers = [
      wagging ? path("M 74 100 C 88 96 94 84 85 76", "none", t.fur, 7) : null,
      wagging ? circle(85, 76, 3.4, lighten(t.fur, 10)) : null,
      path("M 18 102 C 23 86 38 79 50 79 C 62 79 77 86 82 102 Z", t.fur, edge, 2),
      ellipse(50, 96, 12.5, 9, lighten(t.fur, 14)),
      animalCollar(t, 86),
      dogEars(t, preset.ears || "normal"),
      dogHead(t),
      dogEyes(t, preset),
      dogMuzzle(t, preset),
    ];
    if (t.expression === "happy" || t.expression === "panting") {
      layers.push(ellipse(30.5, 57.5, 3.2, 2, BLUSH), ellipse(69.5, 57.5, 3.2, 2, BLUSH));
    }
    if (preset.zzz) {
      layers.push(zzz(76, 32, 8, 0.7), zzz(84, 23, 6, 0.55));
    }
    return group(layers.filter(Boolean), `rotate(${(t.tilt || 0).toFixed(2)} 50 62)`);
  }

  // ----- Top-level renderer -----
  function renderPortrait(character, options = {}) {
    const root = svgEl("svg", {
      viewBox: "0 0 100 100",
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true",
    });
    if (options.className) root.classList.add(options.className);
    for (const layer of backdrop(character, options)) root.append(layer);
    let portrait;
    if (character.kind === "cat") portrait = renderCat(character);
    else if (character.kind === "dog") portrait = renderDog(character);
    else portrait = renderHuman(character);
    root.append(portrait);
    return root;
  }

  // ----- Exports -----
  global.WhoAmI = {
    generatePool,
    renderPortrait,
  };
})(window);
