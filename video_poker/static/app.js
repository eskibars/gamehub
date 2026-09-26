/*
 * Video Poker — Jacks or Better five-card draw. Bet from a persistent bank,
 * hold cards, draw replacements, and get paid on the paytable (royal 250×).
 * Cashing out converts bank profit into hub chips.
 */
(() => {
  "use strict";

  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

  const PAYTABLE = [
    { name: "Royal flush", mult: 250 },
    { name: "Straight flush", mult: 50 },
    { name: "Four of a kind", mult: 25 },
    { name: "Full house", mult: 9 },
    { name: "Flush", mult: 6 },
    { name: "Straight", mult: 4 },
    { name: "Three of a kind", mult: 3 },
    { name: "Two pair", mult: 2 },
    { name: "Jacks or better", mult: 1 },
  ];
  const BASE_BANK = 200;

  const els = {
    hand: document.querySelector("#hand"),
    bank: document.querySelector("#bank"),
    bet: document.querySelector("#bet"),
    handsWon: document.querySelector("#handsWon"),
    betRow: document.querySelector("#betRow"),
    resultLine: document.querySelector("#resultLine"),
    overlay: document.querySelector("#overlay"),
    overlayTitle: document.querySelector("#overlayTitle"),
    overlaySub: document.querySelector("#overlaySub"),
    playButton: document.querySelector("#playButton"),
    dealButton: document.querySelector("#dealButton"),
    cashOut: document.querySelector("#cashOut"),
    paytable: document.querySelector("#paytable"),
    soundButton: document.querySelector("#soundButton"),
  };

  const STATE_KEY = "gamehub-video-poker-v1";

  const game = {
    bank: BASE_BANK,
    bet: 5,
    handsWon: 0,
    hand: [],        // { suit, rank } x5 while in play
    held: [false, false, false, false, false],
    phase: "menu",   // menu | dealt | drawn
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    game.bank = Number.isFinite(saved.bank) ? saved.bank : BASE_BANK;
    game.handsWon = saved.handsWon || 0;
    game.bet = saved.bet || 5;
  } catch {
    // Fresh install.
  }
  renderHud();

  function persist() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        bank: game.bank,
        handsWon: game.handsWon,
        bet: game.bet,
      }));
    } catch {
      // Storage unavailable.
    }
  }

  /* ------------------------------------------------------------------ *
   * Cards + hand evaluation                                             *
   * ------------------------------------------------------------------ */

  function buildDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) deck.push({ suit, rank });
    }
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function evaluateHand(cards) {
    const values = cards.map((c) => RANK_VALUE[c.rank]).sort((a, b) => a - b);
    const suits = new Set(cards.map((c) => c.suit));
    const counts = new Map();
    for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
    const groups = [...counts.values()].sort((a, b) => b - a);

    const flush = suits.size === 1;
    const unique = [...counts.keys()];
    let straight = false;
    let royal = false;
    if (unique.length === 5) {
      straight = values[4] - values[0] === 4;
      // Ace-low straight A-2-3-4-5 → values 14,2,3,4,5
      if (!straight && values[0] === 2 && values[1] === 3 && values[2] === 4 &&
          values[3] === 5 && values[4] === 14) {
        straight = true;
      }
      royal = straight && values[0] === 10;
    }

    if (royal && flush) return "Royal flush";
    if (straight && flush) return "Straight flush";
    if (groups[0] === 4) return "Four of a kind";
    if (groups[0] === 3 && groups[1] === 2) return "Full house";
    if (flush) return "Flush";
    if (straight) return "Straight";
    if (groups[0] === 3) return "Three of a kind";
    if (groups[0] === 2 && groups[1] === 2) return "Two pair";
    if (groups[0] === 2) {
      const pairValue = [...counts.entries()].find(([, n]) => n === 2)[0];
      if (pairValue >= 11) return "Jacks or better";
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Flow                                                                *
   * ------------------------------------------------------------------ */

  function deal() {
    if (game.phase === "dealt") {
      // This press means DRAW.
      draw();
      return;
    }
    if (game.bank < game.bet) {
      if (game.bank < 5) {
        game.bank = BASE_BANK;
        persist();
        renderHud();
        els.resultLine.textContent = "Bankrupt! The house staked you a fresh 200.";
        GameHubJuice.sweep();
        return;
      }
      els.resultLine.textContent = "Bank too low — lower the bet or cash out what's left.";
      GameHubJuice.lose();
      return;
    }
    game.bank -= game.bet;
    const deck = buildDeck();
    game.hand = [];
    for (let i = 0; i < 5; i += 1) game.hand.push(deck.pop());
    game.held = [false, false, false, false, false];
    game.phase = "dealt";
    els.dealButton.textContent = "Draw";
    els.resultLine.textContent = "Tap cards to hold, then draw.";
    GameHubJuice.tick();
    persist();
    render();
  }

  function draw() {
    if (game.phase !== "dealt") return;
    const deck = buildDeck();
    for (let i = 0; i < 5; i += 1) {
      if (!game.held[i]) game.hand[i] = deck.pop();
    }
    game.phase = "drawn";
    const result = evaluateHand(game.hand);
    let payout = 0;
    if (result) {
      const mult = PAYTABLE.find((row) => row.name === result)?.mult || 1;
      payout = mult * game.bet;
      game.bank += payout;
      game.handsWon += 1;
      GameHubJuice.coin();
      if (result === "Royal flush") {
        GameHubProfile?.achieve("poker-royal");
        GameHubJuice.confetti(220);
        GameHubJuice.win();
      } else if (mult >= 9) {
        GameHubJuice.win();
      } else {
        GameHubJuice.coin();
      }
      GameHubProfile?.award("video-poker", Math.max(1, Math.round(payout / 10)), `${result} pays ${payout}`, payout);
    } else {
      GameHubJuice.lose();
    }
    els.dealButton.textContent = "Deal";
    els.resultLine.textContent = result
      ? `${result} — pays ${payout}!`
      : "No paying hand. Better luck on the next deal.";
    persist();
    render();
  }

  /* ------------------------------------------------------------------ *
   * Rendering                                                           *
   * ------------------------------------------------------------------ */

  function renderHud() {
    els.bank.textContent = game.bank;
    els.bet.textContent = game.bet;
    els.handsWon.textContent = game.handsWon;
    els.betRow.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.bet) === game.bet);
    });
  }

  function cardLabel(card) {
    return card.rank + card.suit;
  }

  function render() {
    els.hand.innerHTML = "";
    for (let i = 0; i < 5; i += 1) {
      const card = game.hand[i];
      const el = document.createElement("div");
      if (!card) {
        el.className = "pcard back";
        els.hand.append(el);
        continue;
      }
      el.className = "pcard" + (game.held[i] ? " held" : "");
      el.style.color = card.suit === "♥" || card.suit === "♦" ? "var(--red)" : "#22252a";
      if (game.phase === "dealt") {
        const tag = document.createElement("span");
        tag.className = "hold-tag";
        tag.textContent = "HOLD";
        tag.style.visibility = game.held[i] ? "visible" : "hidden";
        el.append(tag);
        el.addEventListener("click", () => {
          game.held[i] = !game.held[i];
          GameHubJuice.tick();
          render();
        });
      }
      el.append(document.createTextNode(cardLabel(card)));
      els.hand.append(el);
    }
    renderHud();
  }

  function renderPaytable() {
    els.paytable.innerHTML = PAYTABLE.map((row) =>
      `<div class="pay-row"><span>${row.name}</span><b>×${row.mult}</b></div>`).join("");
  }

  /* ------------------------------------------------------------------ *
   * Boot                                                                *
   * ------------------------------------------------------------------ */

  els.betRow.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-bet]");
    if (!button || game.phase === "dealt") return;
    game.bet = Number(button.dataset.bet);
    GameHubJuice.tick();
    persist();
    renderHud();
  });

  els.cashOut.addEventListener("click", () => {
    const profit = game.bank - BASE_BANK;
    if (profit <= 0) {
      els.resultLine.textContent = profit === 0
        ? "Bank is at the baseline — play a few hands first."
        : "Down on your luck — rebuild the bank before cashing out.";
      GameHubJuice.tick();
      return;
    }
    GameHubProfile?.achieve("poker-cashout");
    if (profit >= 200) GameHubProfile?.achieve("poker-high");
    GameHubProfile?.award("video-poker", profit, `Cashed out ${profit} chips of profit`, profit);
    game.bank = BASE_BANK;
    persist();
    renderHud();
    els.resultLine.textContent = `Cashed out +${profit} chips to your profile!`;
    GameHubJuice.win();
  });

  els.dealButton.addEventListener("click", deal);
  els.playButton.addEventListener("click", () => {
    els.overlay.hidden = true;
  });
  els.soundButton.addEventListener("click", () => {
    if (!window.GameHubJuice) return;
    GameHubJuice.muted = !GameHubJuice.muted;
    els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  });

  renderPaytable();
  render();
})();
