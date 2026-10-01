/*
 * Set — the pattern-matching card game. Eighty-one cards vary across four
 * attributes (count, color, shape, shading); a set is three cards where
 * every attribute is all-same or all-different. The table refills when no
 * set remains, hints flash a real set, and your pace is timed.
 */
(() => {
  "use strict";

  const COLORS = [
    { id: "red", css: "#c0392b" },
    { id: "green", css: "#2f8c5a" },
    { id: "purple", css: "#7b4fa6" },
  ];
  const SHAPES = ["oval", "diamond", "squiggle"];
  const SHADINGS = ["solid", "striped", "open"];
  const NUMBERS = [1, 2, 3];

  const els = {
    board: document.querySelector("#board"),
    friendsButton: document.querySelector("#friendsButton"),
    remoteBackdrop: document.querySelector("#remoteBackdrop"),
    remoteName: document.querySelector("#remoteName"),
    remoteCode: document.querySelector("#remoteCode"),
    createTable: document.querySelector("#createTable"),
    joinTable: document.querySelector("#joinTable"),
    remoteCancel: document.querySelector("#remoteCancel"),
    remoteMessage: document.querySelector("#remoteMessage"),
    remoteLobby: document.querySelector("#remoteLobby"),
    lobbyHeading: document.querySelector("#lobbyHeading"),
    shareRow: document.querySelector("#shareRow"),
    shareCode: document.querySelector("#shareCode"),
    copyShare: document.querySelector("#copyShare"),
    remotePlayers: document.querySelector("#remotePlayers"),
    startTable: document.querySelector("#startTable"),
    leaveTable: document.querySelector("#leaveTable"),
    lobbyMessage: document.querySelector("#lobbyMessage"),
    tableActions: document.querySelector("#tableActions"),
    callButton: document.querySelector("#callButton"),
    remoteStrip: document.querySelector("#remoteStrip"),
    setsFound: document.querySelector("#setsFound"),
    deckLeft: document.querySelector("#deckLeft"),
    clock: document.querySelector("#clock"),
    overlay: document.querySelector("#overlay"),
    overlayTitle: document.querySelector("#overlayTitle"),
    overlaySub: document.querySelector("#overlaySub"),
    playButton: document.querySelector("#playButton"),
    hintButton: document.querySelector("#hintButton"),
    addThree: document.querySelector("#addThree"),
    newGame: document.querySelector("#newGame"),
    soundButton: document.querySelector("#soundButton"),
  };

  const STATE_KEY = "gamehub-set-v1";

  const game = {
    deck: [],
    table: [],      // card objects with an id
    selected: [],   // ids
    setsFound: 0,
    best: 0,
    running: false,
    startedAt: 0,
    timer: null,
    busy: false,
    remote: null,   // remote table state: { game, playerId, eventSource, claimEnd, countdown, subTimer }
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    game.best = saved.best || 0;
  } catch {
    // Fresh install.
  }

  function persist() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({ best: game.best }));
    } catch {
      // Storage unavailable.
    }
  }

  /* ------------------------------------------------------------------ *
   * Cards + set logic                                                   *
   * ------------------------------------------------------------------ */

  function cardFromIndex(idx) {
    return {
      id: idx,
      number: Math.floor(idx / 27) + 1,
      color: Math.floor(idx / 9) % 3,
      shape: SHAPES[Math.floor(idx / 3) % 3],
      shading: SHADINGS[idx % 3],
    };
  }

  function buildDeck() {
    const deck = [];
    let id = 0;
    for (const number of NUMBERS) {
      for (let ci = 0; ci < 3; ci += 1) {
        for (const shape of SHAPES) {
          for (const shading of SHADINGS) {
            deck.push({ id: id++, number, color: ci, shape, shading });
          }
        }
      }
    }
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  // A set: for each attribute, all three values are equal or all different.
  function isSet(a, b, c) {
    const attrs = ["number", "color", "shape", "shading"];
    return attrs.every((attr) => {
      const values = new Set([a[attr], b[attr], c[attr]]);
      return values.size === 1 || values.size === 3;
    });
  }

  function findSetOnTable() {
    for (let i = 0; i < game.table.length; i += 1) {
      for (let j = i + 1; j < game.table.length; j += 1) {
        for (let k = j + 1; k < game.table.length; k += 1) {
          if (isSet(game.table[i], game.table[j], game.table[k])) {
            return [game.table[i], game.table[j], game.table[k]];
          }
        }
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Rendering                                                           *
   * ------------------------------------------------------------------ */

  function cardSVG(card) {
    const color = COLORS[card.color].css;
    const fill = card.shading === "solid" ? color
      : card.shading === "striped" ? `url(#stripes-${card.id})`
      : "none";
    const shapes = [];
    for (let i = 0; i < card.number; i += 1) {
      const x = 50 - (card.number - 1) * 26 + i * 26;
      const d = shapePath(card.shape, x, 50);
      shapes.push(`<path d="${d}" fill="${fill}" stroke="${color}" stroke-width="3.2"/>`);
    }
    const defs = card.shading === "striped"
      ? `<defs><pattern id="stripes-${card.id}" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="3.2" height="7" fill="${color}"/></pattern></defs>`
      : "";
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${defs}${shapes.join("")}</svg>`;
  }

  function shapePath(shape, cx, cy) {
    if (shape === "oval") {
      return `M ${cx - 11} ${cy} a 11 17 0 1 0 22 0 a 11 17 0 1 0 -22 0`;
    }
    if (shape === "diamond") {
      return `M ${cx} ${cy - 21} L ${cx + 13} ${cy} L ${cx} ${cy + 21} L ${cx - 13} ${cy} Z`;
    }
    // Squiggle
    return `M ${cx - 14} ${cy + 6}
      C ${cx - 18} ${cy - 8}, ${cx - 6} ${cy - 8}, ${cx - 2} ${cy - 2}
      C ${cx + 2} ${cy + 4}, ${cx + 8} ${cy + 6}, ${cx + 12} ${cy}
      C ${cx + 16} ${cy - 6}, ${cx + 10} ${cy - 12}, ${cx + 14} ${cy - 16}
      M ${cx - 14} ${cy + 6}
      C ${cx - 10} ${cy + 12}, ${cx - 18} ${cy + 12}, ${cx - 14} ${cy + 6}`;
  }

  function render() {
    els.board.innerHTML = "";
    for (const card of game.table) {
      const el = document.createElement("div");
      el.className = "set-card";
      el.dataset.id = card.id;
      if (game.selected.includes(card.id)) el.classList.add("selected");
      el.innerHTML = cardSVG(card);
      el.addEventListener("click", () => onCardClick(card.id));
      els.board.append(el);
    }
    els.setsFound.textContent = game.setsFound;
    els.deckLeft.textContent = game.deck.length;
  }

  /* ------------------------------------------------------------------ *
   * Play                                                                *
   * ------------------------------------------------------------------ */

  function refill(checkSets = true) {
    // Keep the table at 12 (or larger while sets are missing).
    while (game.table.length < 12 && game.deck.length) {
      game.table.push(game.deck.pop());
    }
    if (checkSets && !findSetOnTable() && game.deck.length) {
      for (let i = 0; i < 3 && game.deck.length; i += 1) {
        game.table.push(game.deck.pop());
      }
    }
    render();
  }

  function onCardClick(id) {
    if (game.remote) {
      onRemoteCardClick(id);
      return;
    }
    if (!game.running || game.busy) return;
    if (game.selected.includes(id)) {
      game.selected = game.selected.filter((v) => v !== id);
      render();
      return;
    }
    game.selected.push(id);
    GameHubJuice.tick();
    if (game.selected.length < 3) {
      render();
      return;
    }
    const picked = game.selected
      .map((id) => game.table.find((card) => card.id === id))
      .filter(Boolean);
    if (picked.length === 3 && isSet(picked[0], picked[1], picked[2])) {
      game.busy = true;
      game.setsFound += 1;
      GameHubJuice.coin();
      const pickedIds = picked.map((c) => c.id);
      for (const el of els.board.children) {
        if (pickedIds.includes(Number(el.dataset.id))) el.classList.add("removing");
      }
      setTimeout(() => {
        game.table = game.table.filter((card) => !pickedIds.includes(card.id));
        game.selected = [];
        refill();
        game.busy = false;
        if (!findSetOnTable()) {
          finishGame();
        }
      }, 260);
    } else {
      GameHubJuice.lose();
      els.board.classList.add("shake");
      setTimeout(() => {
        els.board.classList.remove("shake");
        game.selected = [];
        render();
      }, 300);
    }
  }

  function finishGame() {
    game.running = false;
    clearInterval(game.timer);
    const seconds = Math.floor((Date.now() - game.startedAt) / 1000);
    const isRecord = game.setsFound > game.best;
    if (isRecord) {
      game.best = game.setsFound;
      persist();
    }
    const chips = Math.max(1, game.setsFound);
    GameHubProfile?.award("set", chips, `${game.setsFound} sets in ${Math.floor(seconds / 60)}m${seconds % 60}s`, game.setsFound);
    if (game.setsFound >= 10) GameHubProfile?.achieve("set-10");
    if (game.setsFound >= 27) GameHubProfile?.achieve("set-all");
    GameHubJuice.win();
    els.overlayTitle.textContent = "Deck cleared! 🧠";
    els.overlaySub.textContent =
      `${game.setsFound} sets in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} · +${chips} chips${isRecord ? " · new best!" : ""}`;
    els.playButton.textContent = "Play again";
    els.overlay.hidden = false;
  }

  function newGame() {
    els.overlay.hidden = true;
    game.deck = buildDeck();
    game.table = [];
    game.selected = [];
    game.setsFound = 0;
    game.running = true;
    game.busy = false;
    refill();
    game.startedAt = Date.now();
    clearInterval(game.timer);
    game.timer = setInterval(() => {
      if (!game.running) return;
      const seconds = Math.floor((Date.now() - game.startedAt) / 1000);
      els.clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }, 500);
  }

  els.playButton.addEventListener("click", newGame);
  els.newGame.addEventListener("click", newGame);
  els.addThree.addEventListener("click", () => {
    if (!game.running || game.busy) return;
    if (!game.deck.length) return;
    for (let i = 0; i < 3 && game.deck.length; i += 1) {
      game.table.push(game.deck.pop());
    }
    GameHubJuice.sweep();
    render();
  });
  els.hintButton.addEventListener("click", () => {
    if (!game.running || game.busy) return;
    const set = findSetOnTable();
    if (!set) return;
    GameHubJuice.coin();
    const ids = set.map((c) => c.id);
    for (const el of els.board.children) {
      if (ids.includes(Number(el.dataset.id))) el.classList.add("flash");
    }
    setTimeout(() => {
      for (const el of els.board.children) el.classList.remove("flash");
    }, 1900);
  });
  els.soundButton.addEventListener("click", () => {
    if (!window.GameHubJuice) return;
    GameHubJuice.muted = !GameHubJuice.muted;
    els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      game.selected = [];
      render();
    }
  });

  /* ------------------------------------------------------------------ *
   * Remote tables                                                       *
   * ------------------------------------------------------------------ */

  function remoteRequest(url, options = {}) {
    return fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Request failed");
      return data;
    });
  }

  function showRemoteMessage(text) {
    if (els.remoteMessage) els.remoteMessage.textContent = text;
  }

  function openRemoteModal() {
    els.remoteBackdrop.hidden = false;
    showRemoteMessage("");
    els.remoteName.focus();
  }

  function closeRemoteModal() {
    els.remoteBackdrop.hidden = true;
  }

  function savedRemoteName() {
    try {
      return localStorage.getItem("gamehub-set-name") || "";
    } catch {
      return "";
    }
  }

  function rememberRemoteName(name) {
    try {
      localStorage.setItem("gamehub-set-name", name);
    } catch {
      // Storage unavailable.
    }
  }

  async function createTable() {
    const name = els.remoteName.value.trim();
    if (!name) {
      showRemoteMessage("Add your name first.");
      return;
    }
    rememberRemoteName(name);
    try {
      const data = await remoteRequest("/api/set/games", { method: "POST", body: JSON.stringify({}) });
      const joined = await remoteRequest(`/api/set/games/${data.game.code}/players`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      adoptRemote(joined.game, joined.playerId);
      closeRemoteModal();
    } catch (error) {
      showRemoteMessage(error.message);
    }
  }

  async function joinTable() {
    const name = els.remoteName.value.trim();
    const code = els.remoteCode.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!name) {
      showRemoteMessage("Add your name first.");
      return;
    }
    if (!code) {
      showRemoteMessage("Enter a table code.");
      return;
    }
    rememberRemoteName(name);
    try {
      const joined = await remoteRequest(`/api/set/games/${code}/players`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      adoptRemote(joined.game, joined.playerId);
      closeRemoteModal();
    } catch (error) {
      showRemoteMessage(error.message);
    }
  }

  function adoptRemote(view, playerId) {
    if (!game.remote || game.remote.playerId !== playerId) {
      game.remote = { game: view, playerId, eventSource: null, claimEnd: 0, countdown: null };
    } else {
      game.remote.game = view;
    }
    const actionsRow = document.querySelector(".actions");
    if (actionsRow) actionsRow.hidden = view.status !== "lobby";
    els.remoteLobby.hidden = view.status !== "lobby";
    els.tableActions.hidden = view.status !== "active";
    els.overlay.hidden = view.status === "active" || view.status === "lobby" || view.status === "finished";
    if (view.status === "lobby") {
      renderRemoteLobby(view);
    } else if (view.status === "finished") {
      showRemoteFinished(view);
    } else {
      renderRemoteTable(view);
    }
    connectRemoteEvents(view.code);
  }

  function renderRemoteLobby(view) {
    els.lobbyHeading.textContent = `Round ${view.round} table`;
    els.shareRow.hidden = false;
    els.shareCode.textContent = view.code;
    els.remotePlayers.innerHTML = "";
    view.players.forEach((player) => {
      const chip = document.createElement("span");
      chip.className = "remote-chip";
      if (player.isHost) chip.classList.add("is-host");
      chip.textContent = player.name;
      els.remotePlayers.append(chip);
    });
    els.startTable.hidden = !view.youAreHost;
    els.startTable.disabled = !view.players.length;
    els.lobbyMessage.textContent = view.youAreHost
      ? "Share the code — deal when everyone is in."
      : "Waiting for the host to deal…";
  }

  function onRemoteCardClick(id) {
    const remote = game.remote;
    if (!remote) return;
    const view = remote.game;
    if (view.status !== "active") return;
    const myClaim = view.claim && view.claim.playerId === remote.playerId;
    if (!myClaim) {
      flashCall("Press SET! first");
      return;
    }
    if (game.selected.includes(id)) {
      game.selected = game.selected.filter((v) => v !== id);
      syncSelection(view);
      return;
    }
    if (game.selected.length >= 3) return;
    game.selected.push(id);
    GameHubJuice.tick();
    syncSelection(view);
    if (game.selected.length === 3) submitRemoteSet();
  }

  let flashTimer = null;
  function flashCall(text) {
    const previous = "SET!";
    if (flashTimer) clearTimeout(flashTimer);
    els.callButton.textContent = text;
    flashTimer = setTimeout(() => {
      els.callButton.textContent = previous;
      flashTimer = null;
    }, 1200);
  }

  function renderRemoteTable(view) {
    const mine = view.claim && view.claim.playerId === game.remote?.playerId;
    if (!mine) game.selected = [];
    // Rebuild the table only when the card multiset changes — selecting
    // cards re-renders classes in place to keep click handlers alive.
    const signature = view.table.join(",");
    if (signature !== game.tableSignature) {
      game.tableSignature = signature;
      game.table = view.table.map(cardFromIndex);
      game.selected = [];
      render();
    } else {
      syncSelection(view);
    }
    els.deckLeft.textContent = view.deckCount;
    els.setsFound.textContent = String(view.yourScore ?? 0);

    renderRemoteStrip(view);

    // Claim countdown + button state.
    const claim = view.claim;
    if (game.remote.countdown) clearInterval(game.remote.countdown);
    game.remote.countdown = null;
    if (!claim) {
      const lockedUntil = (view.lockedUntil || 0) * 1000;
      const locked = Date.now() < lockedUntil;
      els.callButton.disabled = locked;
      els.callButton.classList.remove("is-mine");
      els.callButton.textContent = locked
        ? `Sitting out ${Math.ceil((lockedUntil - Date.now()) / 1000)}s…`
        : "SET!";
      const tick = setInterval(() => {
        if (Date.now() >= lockedUntil || !game.remote) {
          clearInterval(tick);
          return;
        }
        if (!game.remote.game?.claim) {
          els.callButton.textContent = `Sitting out ${Math.ceil((lockedUntil - Date.now()) / 1000)}s…`;
        }
      }, 250);
    } else if (mine) {
      els.callButton.disabled = true;
      els.callButton.classList.add("is-mine");
      game.remote.claimEnd = Date.now() + claim.msLeft;
      els.callButton.textContent = `${(claim.msLeft / 1000).toFixed(1)}s — pick your set!`;
      game.remote.countdown = setInterval(() => {
        const left = game.remote.claimEnd - Date.now();
        if (left <= 0) {
          clearInterval(game.remote.countdown);
          game.remote.countdown = null;
          return;
        }
        els.callButton.textContent = `${(left / 1000).toFixed(1)}s — pick your set!`;
      }, 80);
    } else {
      els.callButton.disabled = true;
      els.callButton.classList.remove("is-mine");
      els.callButton.textContent = `🚨 ${claim.name} called SET!`;
    }
  }

  function renderRemoteStrip(view) {
    els.remoteStrip.innerHTML = "";
    view.players.forEach((player) => {
      const chip = document.createElement("span");
      chip.className = "remote-chip";
      if (view.claim && view.claim.playerId === player.id) chip.classList.add("is-claim");
      chip.textContent = `${player.name} · ${player.score}`;
      els.remoteStrip.append(chip);
    });
  }

  function syncSelection(view) {
    const claimMine = view.claim && view.claim.playerId === game.remote?.playerId;
    game.selected = game.selected.filter((id) => game.table.some((card) => card.id === id));
    for (const el of els.board.children) {
      el.classList.toggle("selected", claimMine && game.selected.includes(Number(el.dataset.id)));
    }
  }

  function connectRemoteEvents(code) {
    if (!game.remote) return;
    // adoptRemote runs on every SSE event — only (re)connect when the
    // stream target actually changes, or this would loop forever.
    if (game.remote.streamKey === code) return;
    game.remote.streamKey = code;
    if (game.remote.eventSource) game.remote.eventSource.close();
    const url = `/api/set/games/${code}/events?playerId=${encodeURIComponent(game.remote.playerId)}`;
    game.remote.eventSource = new EventSource(url);
    game.remote.eventSource.addEventListener("game", (event) => adoptRemote(JSON.parse(event.data), game.remote.playerId));
    ["joined", "started", "claim", "set"].forEach((name) => {
      game.remote.eventSource.addEventListener(name, (event) => adoptRemote(JSON.parse(event.data), game.remote.playerId));
    });
    game.remote.eventSource.addEventListener("finished", (event) => {
      adoptRemote(JSON.parse(event.data), game.remote.playerId);
      showRemoteFinished(game.remote.game);
    });
    game.remote.eventSource.addEventListener("closed", () => {
      exitRemote("The table was swept — everyone left or it timed out.");
    });
  }

  function showRemoteFinished(view) {
    if (!game.remote) return;
    const roundKey = `${view.code}:${view.round}`;
    if (game.remote.awardedRound === roundKey) return;
    game.remote.awardedRound = roundKey;
    const standings = [...view.players].sort((a, b) => b.score - a.score);
    const winner = standings[0];
    const myScore = view.players.find((p) => p.id === game.remote.playerId)?.score || 0;
    const iWon = winner && winner.id === game.remote.playerId;
    const chips = myScore + (iWon ? 3 : 0);
    GameHubProfile?.award("set", chips,
      iWon ? `Won the table with ${myScore} sets` : `${myScore} sets at the table`, myScore);
    if (myScore >= 10) GameHubProfile?.achieve("set-10");
    if (myScore >= 27) GameHubProfile?.achieve("set-all");
    GameHubJuice.win();
    els.overlayTitle.textContent = iWon ? "You won the table! 🧠" : `${winner?.name || "Nobody"} wins`;
    els.overlaySub.textContent = standings
      .map((player) => `${player.name}: ${player.score}`)
      .join(" · ") + (iWon ? ` · +${chips} chips` : ` · +${chips} chips`);
    els.playButton.textContent = "Play solo";
    els.overlay.hidden = false;
  }

  function exitRemote(reason) {
    if (game.remote?.eventSource) game.remote.eventSource.close();
    game.remote = null;
    game.tableSignature = null;
    const actionsRow = document.querySelector(".actions");
    if (actionsRow) actionsRow.hidden = false;
    els.remoteLobby.hidden = true;
    els.tableActions.hidden = true;
    els.overlay.hidden = false;
    els.overlayTitle.textContent = "Set";
    els.overlaySub.textContent = reason || "Back to the solo table.";
    els.playButton.textContent = "Play solo";
    game.deck = buildDeck();
    game.table = [];
    game.selected = [];
    game.running = false;
    refill(false);
  }

  async function callSet() {
    if (!game.remote) return;
    try {
      const data = await remoteRequest(`/api/set/games/${game.remote.game.code}/call`, {
        method: "POST",
        body: JSON.stringify({ playerId: game.remote.playerId }),
      });
      adoptRemote(data.game, game.remote.playerId);
    } catch (error) {
      els.playMessage || els.remoteMessage;
      // Surface call errors on the button label briefly.
      const previous = els.callButton.textContent;
      els.callButton.textContent = error.message;
      setTimeout(() => {
        if (els.callButton.textContent === error.message) els.callButton.textContent = previous;
      }, 1600);
    }
  }

  async function submitRemoteSet() {
    if (!game.remote) return;
    try {
      const data = await remoteRequest(`/api/set/games/${game.remote.game.code}/submit`, {
        method: "POST",
        body: JSON.stringify({ playerId: game.remote.playerId, cards: game.selected }),
      });
      adoptRemote(data.game, game.remote.playerId);
      if (data.game.claim && data.game.claim.playerId !== game.remote.playerId) {
        GameHubJuice.coin();
      }
    } catch (error) {
      game.selected = [];
      render();
      if (game.remote?.game) renderRemoteTable(game.remote.game);
    }
  }

  async function startTable() {
    if (!game.remote) return;
    try {
      const data = await remoteRequest(`/api/set/games/${game.remote.game.code}/start`, {
        method: "POST",
        body: JSON.stringify({ playerId: game.remote.playerId }),
      });
      adoptRemote(data.game, game.remote.playerId);
    } catch (error) {
      showRemoteMessage(error.message);
    }
  }

  async function leaveTable() {
    // No server-side leave endpoint: closing the stream is enough, the TTL
    // sweeper reclaims the table.
    exitRemote("Left the table.");
  }

  els.friendsButton?.addEventListener("click", () => {
    els.remoteName.value = savedRemoteName();
    openRemoteModal();
  });
  els.remoteCancel?.addEventListener("click", closeRemoteModal);
  els.createTable?.addEventListener("click", createTable);
  els.joinTable?.addEventListener("click", joinTable);
  els.remoteCode?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      joinTable();
    }
  });
  els.callButton?.addEventListener("click", callSet);
  els.startTable?.addEventListener("click", startTable);
  els.leaveTable?.addEventListener("click", leaveTable);
  els.copyShare?.addEventListener("click", async () => {
    if (!game.remote) return;
    const url = new URL(`/set/?table=${game.remote.game.code}`, window.location.origin).toString();
    await navigator.clipboard?.writeText(url).catch(() => {});
    els.shareCode.textContent = "Copied!";
    setTimeout(() => {
      els.shareCode.textContent = game.remote?.game?.code || "";
    }, 1200);
  });

  if (window.GameHubJuice) els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  // Idle preview table behind the start overlay.
  game.deck = buildDeck();
  refill(false);

  // Deep link: /set/?table=CODE joins straight away.
  const tableParams = new URLSearchParams(window.location.search);
  const tableCode = tableParams.get("table");
  if (tableCode) {
    els.remoteName.value = savedRemoteName();
    els.remoteCode.value = tableCode.toUpperCase();
    if (els.remoteName.value) joinTable();
    else openRemoteModal();
  }
})();
