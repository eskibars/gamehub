/*
 * Hearts — the classic evasion trick-taker against three robots. Follow
 * suit, dodge the hearts and the queen of spades, and race to the lowest
 * score when someone crosses 100. Shoot the moon by taking all 26 points.
 * Robots duck under winners, dump the queen when void, and smoke out
 * spades while the queen is still loose.
 */
(() => {
  "use strict";

  const SUITS = ["♣", "♦", "♠", "♥"]; // display order
  const SUIT_NAME = { "♣": "clubs", "♦": "diamonds", "♠": "spades", "♥": "hearts" };
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2])); // 2..14

  const els = {
    seatWest: document.querySelector("#seatWest"),
    seatNorth: document.querySelector("#seatNorth"),
    seatEast: document.querySelector("#seatEast"),
    trickWest: document.querySelector("#trickWest"),
    trickNorth: document.querySelector("#trickNorth"),
    trickEast: document.querySelector("#trickEast"),
    trickSouth: document.querySelector("#trickSouth"),
    scoreStrip: document.querySelector("#scoreStrip"),
    statusLine: document.querySelector("#statusLine"),
    hand: document.querySelector("#hand"),
    overlay: document.querySelector("#overlay"),
    overlayTitle: document.querySelector("#overlayTitle"),
    overlaySub: document.querySelector("#overlaySub"),
    playButton: document.querySelector("#playButton"),
    roundOverlay: document.querySelector("#roundOverlay"),
    roundTitle: document.querySelector("#roundTitle"),
    scoreTable: document.querySelector("#scoreTable"),
    nextRoundButton: document.querySelector("#nextRoundButton"),
    gamesWon: document.querySelector("#gamesWon"),
    soundButton: document.querySelector("#soundButton"),
  };

  const STATE_KEY = "gamehub-hearts-v1";
  const seats = ["south", "west", "north", "east"];
  const SEAT_NAMES = { south: "You", west: "Robot West", north: "Robot North", east: "Robot East" };

  const game = {
    scores: [0, 0, 0, 0],      // by seat index
    handPoints: [0, 0, 0, 0],
    hands: [[], [], [], []],
    trick: [],                 // [{ seat, card }]
    leader: 0,
    turn: 0,
    heartsBroken: false,
    trickNo: 0,
    roundNo: 0,
    running: false,
    busy: false,
    gamesWon: 0,
    gamesPlayed: 0,
    robotTimer: null,
    settleTimer: null,
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    game.gamesWon = saved.gamesWon || 0;
    game.gamesPlayed = saved.gamesPlayed || 0;
  } catch {
    // Fresh install.
  }
  els.gamesWon.textContent = game.gamesWon;

  function persist() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({ gamesWon: game.gamesWon, gamesPlayed: game.gamesPlayed }));
    } catch {
      // Storage unavailable.
    }
  }

  /* ------------------------------------------------------------------ *
   * Cards + rules                                                       *
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

  const isHeart = (card) => card.suit === "♥";
  const isQS = (card) => card.suit === "♠" && card.rank === "Q";
  const isPoint = (card) => isHeart(card) || isQS(card);
  const rankValue = (card) => RANK_VALUE[card.rank];

  function sortHand(hand) {
    hand.sort((a, b) =>
      SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || rankValue(a) - rankValue(b));
  }

  function cardLabel(card) {
    return card.rank + card.suit;
  }

  function legalCards(seat) {
    const hand = game.hands[seat];
    if (game.trick.length === 0) {
      // Leading.
      if (game.trickNo === 0) {
        return hand.filter((c) => c.suit === "♣" && c.rank === "2");
      }
      if (!game.heartsBroken) {
        const nonHearts = hand.filter((c) => !isHeart(c));
        if (nonHearts.length) return nonHearts;
      }
      return hand.slice();
    }
    const led = game.trick[0].card.suit;
    const follow = hand.filter((c) => c.suit === led);
    if (follow.length) return follow;
    if (game.trickNo === 0) {
      // No points on the first trick unless the hand is all points.
      const safe = hand.filter((c) => !isPoint(c));
      if (safe.length) return safe;
    }
    return hand.slice();
  }

  function trickWinner(trick) {
    const led = trick[0].card.suit;
    let best = trick[0];
    for (const entry of trick.slice(1)) {
      if (entry.card.suit === led && rankValue(entry.card) > rankValue(best.card)) {
        best = entry;
      }
    }
    return best.seat;
  }

  function trickPoints(trick) {
    return trick.reduce((sum, entry) =>
      sum + (isHeart(entry.card) ? 1 : isQS(entry.card) ? 13 : 0), 0);
  }

  /* ------------------------------------------------------------------ *
   * Round flow                                                          *
   * ------------------------------------------------------------------ */

  function dealRound() {
    const deck = buildDeck();
    game.hands = [[], [], [], []];
    for (let i = 0; i < 52; i += 1) game.hands[i % 4].push(deck[i]);
    game.hands.forEach(sortHand);
    game.handPoints = [0, 0, 0, 0];
    game.trick = [];
    game.heartsBroken = false;
    game.trickNo = 0;
    game.roundNo += 1;
    game.running = true;
    // 2♣ opens.
    game.leader = game.hands.findIndex((hand) =>
      hand.some((c) => c.suit === "♣" && c.rank === "2"));
    game.turn = game.leader;
    hideRoundOverlay();
    render();
    status();
    scheduleRobot();
  }

  function status() {
    if (!game.running) return;
    const turnName = game.turn === 0 ? "Your turn" : `${SEAT_NAMES[seats[game.turn]]} is thinking…`;
    const bits = [];
    if (game.trick.length) bits.push(`${SUIT_NAME[game.trick[0].card.suit]} led`);
    if (game.heartsBroken) bits.push("hearts broken");
    els.statusLine.textContent = game.trick.length === 4
      ? "Trick complete"
      : [turnName, ...bits].join(" · ");
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function playCard(seat, card) {
    const hand = game.hands[seat];
    const index = hand.indexOf(card);
    if (index === -1) return;
    hand.splice(index, 1);
    game.trick.push({ seat, card });
    if (isHeart(card)) game.heartsBroken = true;
    seat === 0 ? GameHubJuice.pop(520) : GameHubJuice.pop(330);
    render();

    if (game.trick.length === 4) {
      game.busy = true;
      const winner = trickWinner(game.trick);
      const points = trickPoints(game.trick);
      game.handPoints[winner] += points;
      await sleep(850);
      // Flash the winning card before sweeping.
      const winnerEl = { 0: els.trickSouth, 1: els.trickWest, 2: els.trickNorth, 3: els.trickEast }[winner];
      winnerEl.classList.add("winner-flash");
      if (points > 0 && winner === 0) GameHubJuice.lose();
      else if (points > 0) GameHubJuice.tick();
      else GameHubJuice.tick();
      await sleep(700);
      winnerEl.classList.remove("winner-flash");
      game.trick = [];
      game.trickNo += 1;
      game.leader = winner;
      game.turn = winner;
      game.busy = false;
      render();
      if (game.hands[0].length === 0) {
        settleRound();
        return;
      }
      status();
      scheduleRobot();
      return;
    }

    game.turn = (seat + 1) % 4;
    render();
    status();
    scheduleRobot();
  }

  function scheduleRobot() {
    if (game.robotTimer) clearTimeout(game.robotTimer);
    if (!game.running || game.turn === 0) return;
    game.robotTimer = setTimeout(() => {
      if (!game.running) return;
      const seat = game.turn;
      const choices = legalCards(seat);
      if (!choices.length) return;
      playCard(seat, chooseRobotCard(seat, choices));
    }, 750 + Math.random() * 450);
  }

  function settleRound() {
    game.running = false;
    // Shoot the moon check.
    let moon = -1;
    game.handPoints.forEach((points, seat) => {
      if (points === 26) moon = seat;
    });
    if (moon >= 0) {
      for (let seat = 0; seat < 4; seat += 1) {
        game.scores[seat] += seat === moon ? 0 : 26;
      }
    } else {
      for (let seat = 0; seat < 4; seat += 1) game.scores[seat] += game.handPoints[seat];
    }

    if (moon === 0) {
      GameHubProfile?.achieve("hearts-moon");
      GameHubJuice.confetti(200);
    }

    const gameOver = game.scores.some((score) => score >= 100);
    if (gameOver) {
      const minScore = Math.min(...game.scores);
      const winners = [];
      game.scores.forEach((score, seat) => { if (score === minScore) winners.push(seat); });
      const iWon = winners.includes(0);
      game.gamesPlayed += 1;
      const chips = iWon ? 8 + Math.min(4, winners.length === 1 ? 4 : 1) : 1;
      if (iWon) {
        game.gamesWon += 1;
        els.gamesWon.textContent = game.gamesWon;
        GameHubProfile?.achieve("hearts-win");
        if (game.gamesWon >= 3) GameHubProfile?.achieve("hearts-3");
        GameHubProfile?.award("hearts", chips, `Won the game at ${minScore} points`, game.gamesWon);
        GameHubJuice.win();
      } else {
        GameHubProfile?.award("hearts", 1, "Finished a game of Hearts", game.gamesWon);
        GameHubJuice.lose();
      }
      persist();
      els.overlayTitle.textContent = iWon
        ? (winners.length > 1 ? "Shared victory! 🏆" : "You win the game! 🏆")
        : `${SEAT_NAMES[seats[winners[0]]]} wins the game`;
      els.overlaySub.textContent = `Final scores — ${game.scores.map((s, i) => `${SEAT_NAMES[seats[i]]}: ${s}`).join(" · ")} · +${chips} chips`;
      els.playButton.textContent = "New game";
      els.overlay.hidden = false;
      showRoundTable(moon, true);
      return;
    }
    showRoundTable(moon, false);
  }

  function showRoundTable(moon, gameDone) {
    const rowNames = seats.map((s) => SEAT_NAME_SHORT[s]);
    els.roundTitle.textContent = moon >= 0
      ? `${moon === 0 ? "You" : SEAT_NAME_SHORT[moon]} shot the moon! 🌕`
      : `Round ${game.roundNo} over`;
    els.scoreTable.innerHTML = "<tr><th>Player</th><th>Round</th><th>Total</th></tr>" +
      seats.map((seat) => {
        const roundPts = moon >= 0 ? (seat === moon ? 0 : 26) : game.handPoints[seat];
        const me = seat === 0 ? " (you)" : "";
        return `<tr><td>${rowNames[seat]}${me}</td><td>+${roundPts}</td><td class="total">${game.scores[seat]}</td></tr>`;
      }).join("");
    els.nextRoundButton.textContent = gameDone ? "See results" : "Next round";
    els.roundOverlay.hidden = false;
    if (!gameDone) GameHubJuice.coin();
  }

  const SEAT_NAME_SHORT = { south: "You", west: "West", north: "North", east: "East" };

  function hideRoundOverlay() {
    els.roundOverlay.hidden = true;
  }

  /* ------------------------------------------------------------------ *
   * Robot brain                                                         *
   * ------------------------------------------------------------------ */

  function chooseRobotCard(seat, choices) {
    const hand = game.hands[seat];
    const qsOut = cardLoose("♠", "Q");
    const firstTrick = game.trickNo === 0;

    if (game.trick.length === 0) {
      // Leading.
      const nonHearts = choices.filter((c) => !isHeart(c));
      const pool = nonHearts.length ? nonHearts : choices;
      // Smoke out the queen: low spades while QS is loose.
      if (qsOut) {
        const lowSpades = pool.filter((c) => c.suit === "♠" && rankValue(c) < 12);
        if (lowSpades.length && Math.random() < 0.6) {
          return lowSpades.reduce((lo, c) => (rankValue(c) < rankValue(lo) ? c : lo));
        }
      }
      // Lead the lowest card, avoiding winning high cards while QS is out.
      const safe = pool.filter((c) => !(qsOut && c.suit === "♠" && rankValue(c) > 12));
      const leadPool = safe.length ? safe : pool;
      return leadPool.reduce((lo, c) => (rankValue(c) < rankValue(lo) ? c : lo));
    }

    const led = game.trick[0].card.suit;
    const following = choices[0].suit === led && hand.some((c) => c.suit === led);
    const pointsInTrick = trickPoints(game.trick);
    const isLast = game.trick.length === 3;
    const currentWinner = trickWinner(game.trick);
    const winningCard = game.trick.find((e) => e.seat === currentWinner).card;

    if (following) {
      const under = choices.filter((c) => rankValue(c) < rankValue(winningCard));
      const winners = choices.filter((c) => rankValue(c) > rankValue(winningCard));

      // Safe queen dump: someone else already overtook the queen's suit.
      const qs = choices.find(isQS);
      if (qs && winningCard.suit === "♠" && rankValue(winningCard) > 12) return qs;

      if (isLast) {
        if (pointsInTrick === 0) {
          // Free win: dump the highest, including a bare queen if safe-ish.
          if (qs && !qsOut) return qs;
          const nonQS = winners.filter((c) => !isQS(c));
          const dump = nonQS.length ? nonQS : winners;
          return dump.reduce((hi, c) => (rankValue(c) > rankValue(hi) ? c : hi));
        }
        // Points on the table: duck if possible, else win as cheap as we must.
        if (under.length) {
          return under.reduce((hi, c) => (rankValue(c) > rankValue(hi) ? c : hi));
        }
        if (winners.length) {
          const nonQS = winners.filter((c) => !isQS(c));
          const pool = nonQS.length ? nonQS : winners;
          return pool.reduce((lo, c) => (rankValue(c) < rankValue(lo) ? c : lo));
        }
        return choices[0];
      }
      // Not last: duck under the winner with the highest under card.
      if (under.length) {
        return under.reduce((hi, c) => (rankValue(c) > rankValue(hi) ? c : hi));
      }
      // Forced to beat it — play the lowest winner unless it's the queen.
      if (winners.length) {
        const nonQS = winners.filter((c) => !isQS(c));
        const pool = nonQS.length ? nonQS : winners;
        return pool.reduce((lo, c) => (rankValue(c) < rankValue(lo) ? c : lo));
      }
      return choices[0];
    }

    // Void in the led suit: dump danger, best target first.
    const dumpOrder = [];
    if (qsOut) {
      const qs = choices.find(isQS);
      if (qs) dumpOrder.push(qs);
      const bigSpades = choices.filter((c) => c.suit === "♠" && (c.rank === "A" || c.rank === "K"));
      dumpOrder.push(...bigSpades);
    }
    const hearts = choices.filter(isHeart);
    dumpOrder.push(...hearts.sort((a, b) => rankValue(b) - rankValue(a)));
    if (dumpOrder.length) return dumpOrder[0];
    // Nothing dangerous: shed the highest card.
    return choices.reduce((hi, c) => (rankValue(c) > rankValue(hi) ? c : hi));
  }

  function cardLoose(suit, rank) {
    return game.hands.some((hand) => hand.some((c) => c.suit === suit && c.rank === rank)) ||
      game.trick.some((e) => e.card.suit === suit && e.card.rank === rank);
  }

  /* ------------------------------------------------------------------ *
   * Rendering                                                           *
   * ------------------------------------------------------------------ */

  const seatEls = () => ({ 0: els.trickSouth, 1: els.trickWest, 2: els.trickNorth, 3: els.trickEast });

  function seatInfo(seat) {
    const el = { 1: els.seatWest, 2: els.seatNorth, 3: els.seatEast }[seat];
    if (!el) return;
    el.className = "seat";
    el.classList.toggle("active", game.running && game.turn === seat);
    el.innerHTML = `<span>${SEAT_NAME_SHORT[seat]}</span>
      <span class="cards-left">${game.hands[seat]?.length ?? 0} cards · ${game.scores[seat]} pts</span>`;
  }

  function render() {
    seatInfo(1);
    seatInfo(2);
    seatInfo(3);

    // Score strip
    els.scoreStrip.innerHTML = seats.map((seat) => {
      const roundPts = game.handPoints[seat];
      return `<span class="score-pill">${SEAT_NAME_SHORT[seat]} ${game.scores[seat]}${roundPts ? ` (+${roundPts} this round)` : ""}</span>`;
    }).join("");

    // Trick
    const played = Object.fromEntries(game.trick.map((e) => [e.seat, e.card]));
    for (let seat = 0; seat < 4; seat += 1) {
      const slot = seatEls()[seat];
      slot.innerHTML = "";
      const card = played[seat];
      if (card) {
        const el = document.createElement("div");
        el.className = `played-card ${card.suit === "♥" || card.suit === "♦" ? "red" : "black"}`;
        el.style.color = card.suit === "♥" || card.suit === "♦" ? "var(--red)" : "#22252a";
        el.textContent = cardLabel(card);
        slot.append(el);
      }
    }

    // Hand
    els.hand.innerHTML = "";
    const legal = game.running && game.turn === 0 && !game.busy ? new Set(legalCards(0)) : null;
    for (const card of game.hands[0]) {
      const el = document.createElement("div");
      el.className = `hcard ${card.suit === "♥" || card.suit === "♦" ? "" : ""}`;
      el.style.color = card.suit === "♥" || card.suit === "♦" ? "var(--red)" : "#22252a";
      el.textContent = cardLabel(card);
      if (legal) {
        if (legal.has(card)) {
          el.classList.add("playable");
          el.addEventListener("click", () => {
            if (!game.running || game.turn !== 0 || game.busy) return;
            playCard(0, card);
          });
        } else {
          el.classList.add("dead");
        }
      }
      els.hand.append(el);
    }
  }

  /* ------------------------------------------------------------------ *
   * Boot                                                                *
   * ------------------------------------------------------------------ */

  function newGame() {
    game.scores = [0, 0, 0, 0];
    game.roundNo = 0;
    els.overlay.hidden = true;
    dealRound();
  }

  els.playButton.addEventListener("click", newGame);
  els.nextRoundButton.addEventListener("click", () => {
    hideRoundOverlay();
    dealRound();
  });
  els.soundButton.addEventListener("click", () => {
    if (!window.GameHubJuice) return;
    GameHubJuice.muted = !GameHubJuice.muted;
    els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  });

  if (window.GameHubJuice) els.soundButton.textContent = GameHubJuice.muted ? "🔇" : "🔊";
  render();
  els.statusLine.textContent = "";
})();
