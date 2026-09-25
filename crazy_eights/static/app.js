/*
 * Eights — Crazy Eights against one to three robots. Match the suit or rank
 * of the top discard; eights are wild and name the next suit. Empty your
 * hand first to win the hand. Robots weigh rank priority, suit counts, and
 * hold their eights for a rainy day.
 */
(() => {
  "use strict";

  const SUITS = [
    { id: "♠", color: "black", name: "Spades" },
    { id: "♥", color: "red", name: "Hearts" },
    { id: "♦", color: "red", name: "Diamonds" },
    { id: "♣", color: "black", name: "Clubs" },
  ];
  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const CARD_VALUES = { "8": 50, J: 11, Q: 12, K: 13, A: 1 };

  const els = {
    opponents: document.querySelector("#opponents"),
    drawPile: document.querySelector("#drawPile"),
    pileCount: document.querySelector("#pileCount"),
    discard: document.querySelector("#discard"),
    suitCall: document.querySelector("#suitCall"),
    statusLine: document.querySelector("#statusLine"),
    hand: document.querySelector("#hand"),
    overlay: document.querySelector("#overlay"),
    overlayTitle: document.querySelector("#overlayTitle"),
    overlaySub: document.querySelector("#overlaySub"),
    playButton: document.querySelector("#playButton"),
    suitOverlay: document.querySelector("#suitOverlay"),
    suitRow: document.querySelector("#suitRow"),
    handsWon: document.querySelector("#handsWon"),
    soundButton: document.querySelector("#soundButton"),
    oppRow: document.querySelector("#oppRow"),
  };

  const STATE_KEY = "gamehub-eights-v1";

  const game = {
    deck: [],
    discardPile: [],
    players: [], // { id, name, robot, hand: [], activeSuit (only after an 8) }
    turn: 0,
    calledSuit: null, // suit id in play after an eight
    handsWon: 0,
    handsPlayed: 0,
    running: false,
    busy: false,
    robotTimer: null,
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    game.handsWon = saved.handsWon || 0;
    game.handsPlayed = saved.handsPlayed || 0;
  } catch {
    // Fresh install.
  }
  els.handsWon.textContent = game.handsWon;

  function persist() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        handsWon: game.handsWon,
        handsPlayed: game.handsPlayed,
      }));
    } catch {
      // Storage unavailable.
    }
  }

  /* ------------------------------------------------------------------ *
   * Deck + rules                                                        *
   * ------------------------------------------------------------------ */

  function buildDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit: suit.id, color: suit.color, rank });
      }
    }
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function topCard() {
    return game.discardPile[game.discardPile.length - 1];
  }

  function activeSuit() {
    return game.calledSuit || topCard().suit;
  }

  function canPlay(card) {
    return card.rank === "8" || card.suit === activeSuit() || card.rank === topCard().rank;
  }

  function cardLabel(card) {
    return `${card.rank}${card.suit}`;
  }

  function cardPoints(card) {
    if (CARD_VALUES[card.rank] !== undefined) return CARD_VALUES[card.rank];
    const numeric = Number(card.rank);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function playableCards(player) {
    return player.hand.filter(canPlay);
  }

  /* ------------------------------------------------------------------ *
   * Flow                                                                *
   * ------------------------------------------------------------------ */

  function deal() {
    const oppCount = Number(els.oppRow.querySelector('input[name=opps]:checked').value);
    game.deck = buildDeck();
    game.discardPile = [];
    game.calledSuit = null;
    game.players = [{ id: 0, name: "You", robot: false, hand: [] }];
    for (let i = 0; i < oppCount; i += 1) {
      game.players.push({ id: i + 1, name: `Robot ${i + 1}`, robot: true, hand: [] });
    }
    for (let round = 0; round < 7; round += 1) {
      for (const player of game.players) player.hand.push(game.deck.pop());
    }
    // First discard must not be an eight (classic nuisance-avoidance rule).
    let first = game.deck.pop();
    while (first.rank === "8") {
      game.deck.unshift(first);
      first = game.deck.pop();
    }
    game.discardPile.push(first);
    game.turn = 0;
    game.running = true;
    game.busy = false;
    els.overlay.hidden = true;
    render();
    scheduleRobot();
  }

  function drawCards(player, count) {
    for (let i = 0; i < count; i += 1) {
      if (!game.deck.length) {
        // Reshuffle the discard except the top card.
        if (game.discardPile.length <= 1) return;
        const top = game.discardPile.pop();
        game.deck = game.discardPile;
        game.discardPile = [top];
        game.calledSuit = null;
        for (let k = game.deck.length - 1; k > 0; k -= 1) {
          const j = Math.floor(Math.random() * (k + 1));
          [game.deck[k], game.deck[j]] = [game.deck[j], game.deck[k]];
        }
      }
      player.hand.push(game.deck.pop());
    }
  }

  function playCard(playerIndex, card, calledSuit) {
    const player = game.players[playerIndex];
    const index = player.hand.indexOf(card);
    if (index === -1) return;
    player.hand.splice(index, 1);
    game.discardPile.push(card);
    game.calledSuit = card.rank === "8" ? calledSuit : null;
    if (playerIndex === 0) GameHubJuice.pop(520);
    else GameHubJuice.pop(300);
    render();

    if (!player.hand.length) {
      endHand(playerIndex);
      return;
    }
    nextTurn();
  }

  function nextTurn() {
    game.turn = (game.turn + 1) % game.players.length;
    render();
    scheduleRobot();
  }

  function scheduleRobot() {
    if (game.robotTimer) clearTimeout(game.robotTimer);
    if (!game.running) return;
    const player = game.players[game.turn];
    if (!player.robot) return;
    game.busy = true;
    game.robotTimer = setTimeout(() => {
      game.busy = false;
      if (!game.running) return;
      robotMove(player);
    }, 750 + Math.random() * 500);
  }

  function robotMove(player) {
    const playable = playableCards(player);
    if (playable.length) {
      // Keep eights for flexibility; otherwise dump the highest-value match.
      const nonEights = playable.filter((c) => c.rank !== "8");
      const choice = nonEights.length
        ? nonEights.reduce((best, card) => (cardPoints(card) > cardPoints(best) ? card : best))
        : playable[0];
      const calledSuit = choice.rank === "8" ? bestSuit(player) : null;
      playCard(player.id, choice, calledSuit);
      return;
    }
    drawCards(player, 1);
    GameHubJuice.tick();
    render();
    const fresh = player.hand[player.hand.length - 1];
    if (fresh && canPlay(fresh)) {
      const calledSuit = fresh.rank === "8" ? bestSuit(player) : null;
      setTimeout(() => {
        if (game.running) playCard(player.id, fresh, calledSuit);
      }, 450);
    } else {
      els.statusLine.textContent = `${player.name} draws and passes`;
      setTimeout(nextTurn, 500);
    }
  }

  function bestSuit(player) {
    const counts = { "♠": 0, "♥": 0, "♦": 0, "♣": 0 };
    for (const card of player.hand) {
      if (card.rank !== "8") counts[card.suit] += 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  function endHand(winnerIndex) {
    game.running = false;
    game.handsPlayed += 1;
    const humanWon = winnerIndex === 0;
    if (humanWon) {
      game.handsWon += 1;
      els.handsWon.textContent = game.handsWon;
    }
    persist();

    const loser = game.players[(winnerIndex + 1) % game.players.length] || game.players[1];
    let penalty = 0;
    for (const player of game.players) {
      if (player.id === winnerIndex) continue;
      penalty += player.hand.reduce((sum, card) => sum + cardPoints(card), 0);
    }
    const chips = humanWon ? 3 + Math.min(4, game.players.length - 1) : 1;
    if (humanWon) {
      GameHubProfile?.achieve("eights-win");
      if (game.handsWon >= 5) GameHubProfile?.achieve("eights-5");
      GameHubProfile?.award("crazy-eights", chips, `Won a hand vs ${game.players.length - 1} robot${game.players.length > 2 ? "s" : ""}`, game.handsWon);
      GameHubJuice.win();
    } else {
      GameHubProfile?.award("crazy-eights", 1, "Played a hand of Eights", game.handsWon);
      GameHubJuice.lose();
    }

    const winner = game.players[winnerIndex];
    els.overlayTitle.textContent = humanWon ? "You win the hand! 🃏" : `${winner.name} wins`;
    els.overlaySub.textContent = humanWon
      ? `Robots were holding ${penalty} points. +${chips} chips · ${game.handsWon} hands won.`
      : `${winner.name} ran out first. You held ${cardPointsTotal(game.players[0])} points. +1 chip.`;
    els.playButton.textContent = "Deal again";
    els.overlay.hidden = false;
  }

  function cardPointsTotal(player) {
    return player.hand.reduce((sum, card) => sum + cardPoints(card), 0);
  }

  /* ------------------------------------------------------------------ *
   * Rendering                                                           *
   * ------------------------------------------------------------------ */

  function render() {
    // Opponents
    els.opponents.innerHTML = "";
    for (const player of game.players) {
      if (!player.robot) continue;
      const div = document.createElement("div");
      div.className = player.id === game.turn && game.running ? "opp active" : "opp";
      const name = document.createElement("span");
      name.textContent = player.name;
      const fan = document.createElement("span");
      fan.className = "fan";
      const shown = Math.min(player.hand.length, 7);
      for (let i = 0; i < shown; i += 1) fan.append(document.createElement("span"));
      const count = document.createElement("span");
      count.textContent = `${player.hand.length} card${player.hand.length === 1 ? "" : "s"}`;
      div.append(name, fan, count);
      els.opponents.append(div);
    }

    // Draw pile
    els.pileCount.textContent = `${game.deck.length} left`;

    // Discard
    els.discard.innerHTML = "";
    const top = topCard();
    if (top) {
      const cardEl = cardElement(top);
      cardEl.classList.add("pop");
      els.discard.append(cardEl);
    }
    if (game.calledSuit) {
      els.suitCall.hidden = false;
      els.suitCall.textContent = `called: ${game.calledSuit}`;
      els.discard.append(els.suitCall);
    }

    // Status + turn glow
    if (game.running) {
      const player = game.players[game.turn];
      els.statusLine.textContent = player.robot
        ? `${player.name} is thinking…`
        : playableCards(player).length
          ? "Your move — tap a glowing card"
          : "No plays — tap the draw pile";
    }

    // Hand
    els.hand.innerHTML = "";
    const human = game.players[0];
    if (!human) return;
    if (!human.hand.length && game.running === false && game.handsPlayed) {
      const note = document.createElement("div");
      note.className = "card empty-note";
      note.textContent = "Hand finished.";
      els.hand.append(note);
      return;
    }
    for (const card of human.hand) {
      const cardEl = cardElement(card);
      const playable = game.running && game.turn === 0 && !game.busy && canPlay(card);
      cardEl.classList.add(playable ? "playable" : "dead");
      if (playable) {
        cardEl.addEventListener("click", () => onHumanPlay(card));
      }
      els.hand.append(cardEl);
    }
    if (!human.hand.length) {
      const note = document.createElement("div");
      note.className = "card empty-note";
      note.textContent = "Your hand is empty 🎉";
      els.hand.append(note);
    }
  }

  function cardElement(card) {
    const el = document.createElement("div");
    el.className = `card ${card.color}`;
    el.innerHTML = `<span class="corner">${card.rank}${card.suit}</span><span class="suit-big">${card.suit}</span>`;
    return el;
  }

  function onHumanPlay(card) {
    if (!game.running || game.turn !== 0 || game.busy) return;
    if (!canPlay(card)) return;
    if (card.rank === "8") {
      askSuit((suit) => playCard(0, card, suit));
    } else {
      playCard(0, card, null);
    }
  }

  function askSuit(callback) {
    els.suitRow.innerHTML = "";
    for (const suit of SUITS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = suit.color;
      button.textContent = suit.id;
      button.title = suit.name;
      button.addEventListener("click", () => {
        els.suitOverlay.hidden = true;
        GameHubJuice.tick();
        callback(suit.id);
      });
      els.suitRow.append(button);
    }
    els.suitOverlay.hidden = false;
  }

  /* ------------------------------------------------------------------ *
   * Input                                                               *
   * ------------------------------------------------------------------ */

  els.drawPile.addEventListener("click", () => {
    if (!game.running || game.turn !== 0 || game.busy) return;
    const human = game.players[0];
    drawCards(human, 1);
    GameHubJuice.drop();
    render();
    const fresh = human.hand[human.hand.length - 1];
    if (fresh && canPlay(fresh)) {
      els.statusLine.textContent = fresh.rank === "8"
        ? "Eight drawn — play it and name a suit"
        : "Lucky draw — it plays!";
    } else {
      els.statusLine.textContent = "Still nothing — turn passes";
      game.busy = true;
      setTimeout(() => {
        game.busy = false;
        if (game.running) nextTurn();
      }, 700);
    }
  });

  els.playButton.addEventListener("click", deal);
  els.oppRow.addEventListener("change", () => {
    GameHubJuice.tick();
    showMenu();
  });
  els.soundButton.addEventListener("click", () => {
    if (!window.GameHubJuice) return;
    GameHubJuice.muted = !GameHubJuice.muted;
    els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  });

  function showMenu() {
    game.running = false;
    if (game.robotTimer) clearTimeout(game.robotTimer);
    els.overlayTitle.textContent = "Eights";
    els.overlaySub.textContent = "Match suit or rank, eights are wild, empty your hand first. Robots hold a grudge and their eights.";
    els.playButton.textContent = game.handsPlayed ? "Deal again" : "Deal me in";
    els.overlay.hidden = false;
    // A face-down table behind the menu.
    game.players = [];
    game.deck = buildDeck();
    game.discardPile = [{ suit: "♥", color: "red", rank: "5" }];
    render();
  }

  if (window.GameHubJuice) els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  showMenu();
})();
