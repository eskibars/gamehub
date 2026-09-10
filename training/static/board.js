// board.js — SVG renderer for the Training rail map. Fetches the map from
// /api/training/map (the server's data is the single source of truth) and
// draws cities, labeled routes as track sections, and claim states.
//
// window.TrainingBoard.render(svg, opts):
//   opts.claimed   {routeId: "red"|"blue"} player-owned routes
//   opts.onRouteClick(routeId) called for unclaimed routes when clickable
//   opts.clickable {routeId: true} which routes accept clicks

(function (global) {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const CITY_RADIUS = 12;
  const SECTION_HEIGHT = 12;
  const LINE_PAD = 22; // gap between city circle and first section

  const SUIT_FILL = {
    red: "#b8433a",
    orange: "#d98e32",
    yellow: "#e3bd45",
    green: "#5e8c4a",
    blue: "#3565b8",
    pink: "#b95faa",
    black: "#3a3532",
    white: "#efe9dc",
    gray: "#a49c90",
  };
  const SUIT_STROKE = {
    red: "#7e2b25",
    orange: "#9a6222",
    yellow: "#a8842c",
    green: "#3d5c31",
    blue: "#24457e",
    pink: "#7e3d72",
    black: "#141210",
    white: "#9a917f",
    gray: "#6d665c",
  };
  const PLAYER_FILL = { red: "#c9503f", blue: "#3f6fc1" };
  const PLAYER_STROKE = { red: "#7e2b25", blue: "#24457e" };

  let mapPromise = null;

  function fetchMap() {
    return fetch("/api/training/map").then((r) => {
      if (!r.ok) throw new Error("map fetch failed");
      return r.json();
    });
  }

  // Retry a few times so a server restart mid-load doesn't brick the board.
  function loadMap() {
    if (!mapPromise) {
      mapPromise = new Promise((resolve, reject) => {
        const attempt = (left) => {
          fetchMap().then(resolve).catch((error) => {
            if (left <= 0) reject(error);
            else setTimeout(() => attempt(left - 1), 600);
          });
        };
        attempt(10);
      });
    }
    return mapPromise;
  }

  function el(tag, attrs = {}) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      node.setAttribute(key, value);
    }
    return node;
  }

  function cityById(cities) {
    return Object.fromEntries(cities.map((c) => [c.id, c]));
  }

  function labelPosition(city) {
    switch (city.label) {
      case "n":
        return { x: city.x, y: city.y - CITY_RADIUS - 8, anchor: "middle" };
      case "s":
        return { x: city.x, y: city.y + CITY_RADIUS + 16, anchor: "middle" };
      case "e":
        return { x: city.x + CITY_RADIUS + 7, y: city.y + 4, anchor: "start" };
      case "sw":
        return { x: city.x - 2, y: city.y + CITY_RADIUS + 16, anchor: "middle" };
      case "w":
      default:
        return { x: city.x - CITY_RADIUS - 7, y: city.y + 4, anchor: "end" };
    }
  }

  function addLabel(svg, city) {
    const pos = labelPosition(city);
    const words = city.name.split(" ");
    const lines = [];
    if (words.length > 1 && words.join(" ").length > 10) {
      // Split long names into two balanced lines.
      let best = 0;
      for (let i = 1; i < words.length; i += 1) {
        if (words[i - 1].length <= words[best].length) best = i - 1;
      }
      lines.push(words.slice(0, best + 1).join(" "));
      lines.push(words.slice(best + 1).join(" "));
    } else {
      lines.push(city.name);
    }
    const text = el("text", {
      x: pos.x,
      y: pos.y,
      "text-anchor": pos.anchor,
      class: "city-label",
    });
    lines.forEach((line, i) => {
      const tspan = el("tspan", { x: pos.x, dy: i === 0 ? 0 : 12 });
      tspan.textContent = line;
      text.append(tspan);
    });
    svg.append(text);
  }

  function render(svg, map, opts = {}) {
    svg.innerHTML = "";
    svg.setAttribute("viewBox", "0 0 1000 640");
    const cities = cityById(map.cities);
    const claimed = opts.claimed || {};

    const defs = el("defs");
    const grad = el("linearGradient", { id: "trainingPaper", x1: "0", y1: "0", x2: "0.6", y2: "1" });
    grad.append(el("stop", { offset: "0", "stop-color": "#f7eeda" }));
    grad.append(el("stop", { offset: "0.55", "stop-color": "#f2e4c8" }));
    grad.append(el("stop", { offset: "1", "stop-color": "#ecd9b4" }));
    defs.append(grad);
    svg.append(defs);

    const bg = el("rect", { x: 0, y: 0, width: 1000, height: 640, fill: "url(#trainingPaper)" });
    svg.append(bg);

    // Routes first so cities sit on top.
    for (const route of map.routes) {
      const a = cities[route.a];
      const b = cities[route.b];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const ux = dx / dist;
      const uy = dy / dist;
      const group = el("g", {
        class: "route-group",
        "data-route-id": String(route.id),
      });
      const sectionLength = (dist - LINE_PAD * 2) / route.length;
      for (let i = 0; i < route.length; i += 1) {
        const cx = a.x + ux * (LINE_PAD + sectionLength * (i + 0.5));
        const cy = a.y + uy * (LINE_PAD + sectionLength * (i + 0.5));
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const w = sectionLength * 0.72;
        const owner = claimed[route.id];
        const fill = owner ? PLAYER_FILL[owner] : SUIT_FILL[route.color];
        const stroke = owner ? PLAYER_STROKE[owner] : SUIT_STROKE[route.color];
        const section = el("g", {
          transform: `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${angle.toFixed(1)})`,
        });
        section.append(
          el("rect", {
            x: (-w / 2).toFixed(1),
            y: (-SECTION_HEIGHT / 2).toFixed(1),
            width: w.toFixed(1),
            height: SECTION_HEIGHT,
            rx: 4,
            fill,
            stroke,
            "stroke-width": 1.5,
          })
        );
        if (owner) {
          // White twin rails so built track reads differently from suit color.
          const railY = SECTION_HEIGHT * 0.22;
          const railLen = w - 8;
          section.append(
            el("line", {
              x1: (-railLen / 2).toFixed(1),
              y1: (-railY).toFixed(1),
              x2: (railLen / 2).toFixed(1),
              y2: (-railY).toFixed(1),
              stroke: "rgba(255, 250, 240, 0.9)",
              "stroke-width": 1.4,
            }),
            el("line", {
              x1: (-railLen / 2).toFixed(1),
              y1: railY.toFixed(1),
              x2: (railLen / 2).toFixed(1),
              y2: railY.toFixed(1),
              stroke: "rgba(255, 250, 240, 0.9)",
              "stroke-width": 1.4,
            })
          );
        }
        group.append(section);
      }
      if (opts.onRouteClick) {
        const hit = el("line", {
          x1: a.x + ux * CITY_RADIUS,
          y1: a.y + uy * CITY_RADIUS,
          x2: b.x - ux * CITY_RADIUS,
          y2: b.y - uy * CITY_RADIUS,
          stroke: "rgba(0,0,0,0)",
          "stroke-width": 24,
          "stroke-linecap": "round",
        });
        const clickable = !opts.clickable || opts.clickable[route.id];
        if (clickable) {
          hit.style.cursor = "pointer";
          hit.addEventListener("click", () => opts.onRouteClick(route.id));
        }
        group.append(hit);
      }
      svg.append(group);
    }

    // Cities and labels on top.
    for (const city of map.cities) {
      svg.append(
        el("circle", {
          cx: city.x,
          cy: city.y,
          r: CITY_RADIUS,
          class: "city-dot",
        })
      );
      svg.append(
        el("circle", {
          cx: city.x,
          cy: city.y,
          r: CITY_RADIUS - 4,
          class: "city-inner",
        })
      );
      addLabel(svg, city);
    }

    // Decorative cartouche + compass.
    const title = el("text", { x: 26, y: 620, class: "map-title" });
    title.textContent = "TRAINING";
    svg.append(title);
    const compass = el("g", { class: "compass", transform: "translate(952 596)" });
    compass.append(el("circle", { cx: 0, cy: 0, r: 16, class: "compass-ring" }));
    compass.append(el("path", { d: "M0 -12 L4 2 L0 -2 L-4 2 Z", class: "compass-needle" }));
    const nLetter = el("text", { x: 0, y: -18, "text-anchor": "middle", class: "compass-n" });
    nLetter.textContent = "N";
    compass.append(nLetter);
    svg.append(compass);
  }

  global.TrainingBoard = { loadMap, render, SUIT_FILL, SUIT_STROKE };
})(window);
