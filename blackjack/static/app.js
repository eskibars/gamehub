"use strict";

/*
 * Blackjack — casino rules on a paper-and-felt table.
 *
 * Six-deck shoe with a cut card (~75% penetration), dealer stands on all
 * 17s (soft included), blackjack pays 3:2, dealer peeks on ace or ten,
 * insurance on an ace (half bet, pays 2:1), double on any first two cards,
 * and one split of a matching pair (split aces take one card and stand).
 *
 * The rules engine at the top is pure and DOM-free so it can be exercised
 * headlessly; the browser UI lives in the guarded block below.
 */

/* ------------------------------------------------------------------ */
/* Rules engine (pure functions, no DOM)                               */
/* ------------------------------------------------------------------ */

const DECKS = 6;
const MIN_BET = 5;
const SUITS = ["♠", "♥", "♦", "♣"];
const RED_SUITS = new Set(["♥", "♦"]);
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function rankValue(rank) {
  if (rank === "A") return 1;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return Number(rank);
}

// Best total ≤ 21, with `soft` set when an ace still counts as 11.
function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += rankValue(card.rank);
    if (card.rank === "A") aces += 1;
  }
  if (aces > 0 && total + 10 <= 21) return { total: total + 10, soft: true };
  return { total, soft: false };
}

// Soft hands read like "7 / 17"; everything else is a plain number.
function formatHandValue(value) {
  if (value.soft && value.total < 21) return `${value.total - 10} / ${value.total}`;
  return String(value.total);
}

function isNatural(cards) {
  return cards.length === 2 && handValue(cards).total === 21;
}

// Dealer stands on every 17, soft included.
function dealerShouldHit(cards) {
  return handValue(cards).total < 17;
}

function buildShoe(rng = Math.random) {
  const cards = [];
  for (let deck = 0; deck < DECKS; deck += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push({ rank, suit });
    }
  }
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// Cut card sits at ~75% penetration (72–78% for variety).
function cutIndex(length, rng = Math.random) {
  return Math.floor(length * (0.72 + rng() * 0.06));
}

// Half the bet, rounded down to whole chips.
function insuranceCost(bet) {
  return Math.floor(bet / 2);
}

// 3:2, floored to whole chips.
function blackjackPayout(bet) {
  return bet + Math.floor(bet * 1.5);
}

/*
 * Settles one player hand against the dealer's final hand.
 * `payout` is the total chips returned to the bank for this hand,
 * including the stake (0 = lost stake and all).
 */
function settleHand(playerCards, dealerCards, wager, fromSplit) {
  const player = handValue(playerCards).total;
  const dealer = handValue(dealerCards).total;
  if (player > 21) return { outcome: "bust", payout: 0 };
  const playerNatural = !fromSplit && isNatural(playerCards);
  const dealerNatural = isNatural(dealerCards);
  if (playerNatural && dealerNatural) return { outcome: "push", payout: wager };
  if (playerNatural) return { outcome: "blackjack", payout: blackjackPayout(wager) };
  if (dealerNatural) return { outcome: "lose", payout: 0 };
  if (dealer > 21) return { outcome: "win", payout: wager * 2 };
  if (player > dealer) return { outcome: "win", payout: wager * 2 };
  if (player === dealer) return { outcome: "push", payout: wager };
  return { outcome: "lose", payout: 0 };
}

function dealerPlay(cards, drawCard) {
  const hand = cards.slice();
  while (dealerShouldHit(hand)) hand.push(drawCard());
  return hand;
}

/* ------------------------------------------------------------------ */
/* Browser UI                                                          */
/* ------------------------------------------------------------------ */

if (typeof document !== "undefined") {
  const BANK_KEY = "blackjack-bank";
  const STATS_KEY = "blackjack-stats";
  const REFILLS_KEY = "blackjack-refills";
  const LASTBET_KEY = "blackjack-lastbet";
  const PENDING_KEY = "blackjack-pending";
  const STARTING_BANK = 200;
  const REFILL_CHIPS = 200;

  const els = {
    bank: document.querySelector("#bank"),
    bet: document.querySelector("#bet"),
    betBox: document.querySelector("#betBox"),
    net: document.querySelector("#net"),
    cashOut: document.querySelector("#cashOut"),
    statsButton: document.querySelector("#statsButton"),
    table: document.querySelector("#table"),
    dealerSeat: document.querySelector("#dealerSeat"),
    dealerValue: document.querySelector("#dealerValue"),
    dealerCards: document.querySelector("#dealerCards"),
    banner: document.querySelector("#banner"),
    hands: document.querySelector("#hands"),
    playerSpot: document.querySelector("#playerSpot"),
    overlay: document.querySelector("#overlay"),
    overlayTitle: document.querySelector("#overlayTitle"),
    overlaySub: document.querySelector("#overlaySub"),
    overlayActions: document.querySelector("#overlayActions"),
    betControls: document.querySelector("#betControls"),
    clearBet: document.querySelector("#clearBet"),
    rebet: document.querySelector("#rebet"),
    deal: document.querySelector("#deal"),
    actionControls: document.querySelector("#actionControls"),
    hit: document.querySelector("#hit"),
    stand: document.querySelector("#stand"),
    double: document.querySelector("#double"),
    split: document.querySelector("#split"),
    insuranceControls: document.querySelector("#insuranceControls"),
    insuranceCostLabel: document.querySelector("#insuranceCostLabel"),
    takeInsurance: document.querySelector("#takeInsurance"),
    declineInsurance: document.querySelector("#declineInsurance"),
    nextControls: document.querySelector("#nextControls"),
    nextHand: document.querySelector("#nextHand"),
    statsDialog: document.querySelector("#statsDialog"),
    statsClose: document.querySelector("#statsClose"),
    statHands: document.querySelector("#statHands"),
    statWins: document.querySelector("#statWins"),
    statBlackjacks: document.querySelector("#statBlackjacks"),
    statBigBank: document.querySelector("#statBigBank"),
    statNet: document.querySelector("#statNet"),
    statRefills: document.querySelector("#statRefills"),
  };
  const chipButtons = Array.from(document.querySelectorAll(".chip[data-chip]"));

  /* ---------------- persistent state ---------------- */

  let bank = loadNumber(BANK_KEY, STARTING_BANK);
  let stats = loadStats();
  let refills = loadNumber(REFILLS_KEY, 0);
  let lastBet = loadNumber(LASTBET_KEY, 0);

  /* ---------------- round state ---------------- */

  let bet = 0; // chips staked on the felt before dealing
  let hands = [];
  let dealerCards = [];
  let activeHand = 0;
  let insuranceStake = 0;
  let pending = 0; // chips committed to the current round (for reload refunds)
  let state = "betting"; // betting | dealing | insurance | player | dealer | settle
  let round = 0;
  let busy = false;
  let shoe = null;
  let shoePos = 0;
  let cutAt = 0;
  let sessionStart = bank;
  let sessionBlackjacks = 0;
  let insuranceResolver = null;

  /* ---------------- storage helpers ---------------- */

  function loadNumber(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === "") return fallback;
      const value = Number(raw);
      return Number.isFinite(value) && value >= 0 ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function loadStats() {
    const fallback = { hands: 0, wins: 0, blackjacks: 0, biggestBank: STARTING_BANK, net: 0 };
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (!raw) return fallback;
      const saved = JSON.parse(raw);
      return typeof saved === "object" && saved ? { ...fallback, ...saved } : fallback;
    } catch {
      return fallback;
    }
  }

  function saveNumber(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // Storage unavailable; play continues in memory.
    }
  }

  function saveAll() {
    saveNumber(BANK_KEY, bank);
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch {
      // Ignore.
    }
    saveNumber(REFILLS_KEY, refills);
    saveNumber(LASTBET_KEY, lastBet);
    saveNumber(PENDING_KEY, pending);
  }

  /* ---------------- small utilities ---------------- */

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setText(el, text) {
    if (el.textContent === text) return;
    el.textContent = text;
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }

  function formatSigned(value) {
    if (value > 0) return `+${value}`;
    if (value < 0) return `−${-value}`;
    return "±0";
  }

  function setBanner(text, tone) {
    els.banner.textContent = text;
    els.banner.className = tone ? `banner ${tone}` : "banner";
  }

  function roundStakes() {
    return hands.reduce((sum, hand) => sum + hand.wager, 0) + insuranceStake;
  }

  /* ---------------- shoe ---------------- */

  function ensureShoe() {
    if (!shoe || shoePos >= cutAt) {
      shoe = buildShoe();
      shoePos = 0;
      cutAt = cutIndex(shoe.length);
      return true; // fresh shuffle needed
    }
    return false;
  }

  function drawCard() {
    if (!shoe || shoePos >= shoe.length) {
      // Practically unreachable with six decks, but never draw from nothing.
      shoe = buildShoe();
      shoePos = 0;
      cutAt = cutIndex(shoe.length);
    }
    const source = shoe[shoePos];
    shoePos += 1;
    return { rank: source.rank, suit: source.suit };
  }

  async function reshuffle(roundId) {
    setBanner("Shuffling the shoe…", "");
    const fx = document.createElement("div");
    fx.className = "shuffle-fx";
    for (let i = 0; i < 4; i += 1) fx.append(document.createElement("i"));
    els.table.append(fx);
    await sleep(1100);
    fx.remove();
    if (roundId !== round) return;
    ensureShoe();
  }

  /* ---------------- rendering ---------------- */

  function createCardEl(card, faceDown) {
    const el = document.createElement("div");
    el.className = "card deal-in";
    if (RED_SUITS.has(card.suit)) el.classList.add("red");
    const inner = document.createElement("div");
    inner.className = "card-inner";
    const face = document.createElement("div");
    face.className = "card-face";
    face.append(buildCorner(card, "corner-tl"), buildPip(card), buildCorner(card, "corner-br"));
    const back = document.createElement("div");
    back.className = "card-back";
    inner.append(face, back);
    el.append(inner);
    if (faceDown) el.classList.add("face-down");
    el.addEventListener("animationend", () => el.classList.remove("deal-in"), { once: true });
    card.el = el;
    return el;
  }

  function buildCorner(card, position) {
    const corner = document.createElement("span");
    corner.className = `corner ${position}`;
    const rankEl = document.createElement("b");
    rankEl.textContent = card.rank;
    const suitEl = document.createElement("i");
    suitEl.textContent = card.suit;
    corner.append(rankEl, suitEl);
    return corner;
  }

  function buildPip(card) {
    const pip = document.createElement("span");
    pip.className = "pip";
    pip.textContent = card.suit;
    return pip;
  }

  function crowd(container) {
    container.classList.toggle("crowded", container.children.length >= 4);
  }

  function newHandObject(wager, fromSplit) {
    return {
      cards: [],
      wager,
      fromSplit: Boolean(fromSplit),
      doubled: false,
      done: false,
      result: null,
      el: null,
    };
  }

  function renderHandGroups() {
    els.hands.innerHTML = "";
    for (const hand of hands) {
      const group = document.createElement("div");
      group.className = "hand";
      const cardsEl = document.createElement("div");
      cardsEl.className = "cards";
      const meta = document.createElement("div");
      meta.className = "hand-meta";
      const value = document.createElement("span");
      value.className = "hand-value";
      value.hidden = true;
      const tag = document.createElement("span");
      tag.className = "hand-tag";
      tag.hidden = true;
      meta.append(value, tag);
      group.append(cardsEl, meta);
      els.hands.append(group);
      hand.el = { group, cardsEl, value, tag };
    }
    els.playerSpot.hidden = hands.length > 0;
    markActiveHand();
  }

  function markActiveHand() {
    hands.forEach((hand, index) => {
      if (hand.el) hand.el.group.classList.toggle("active", state === "player" && index === activeHand);
    });
  }

  function appendCardToHand(hand, card) {
    const el = createCardEl(card, false);
    hand.el.cardsEl.append(el);
    crowd(hand.el.cardsEl);
    updateHandValue(hand);
  }

  function updateHandValue(hand) {
    if (!hand.el) return;
    if (!hand.cards.length) {
      hand.el.value.hidden = true;
      return;
    }
    hand.el.value.textContent = formatHandValue(handValue(hand.cards));
    hand.el.value.hidden = false;
  }

  function appendDealerCard(card, faceDown) {
    const el = createCardEl(card, Boolean(faceDown));
    els.dealerCards.append(el);
    crowd(els.dealerCards);
    updateDealerValue();
  }

  function updateDealerValue() {
    if (!dealerCards.length) {
      els.dealerValue.hidden = true;
      return;
    }
    const holeHidden = Boolean(els.dealerCards.querySelector(".card.face-down"));
    const shown = holeHidden ? [dealerCards[0]] : dealerCards;
    const value = handValue(shown);
    els.dealerValue.textContent = holeHidden ? `${value.total} + ?` : formatHandValue(value);
    els.dealerValue.hidden = false;
  }

  function revealHole() {
    const hole = els.dealerCards.querySelector(".card.face-down");
    if (hole) hole.classList.remove("face-down");
    updateDealerValue();
  }

  function shakeDealer() {
    els.dealerSeat.classList.remove("shake");
    void els.dealerSeat.offsetWidth;
    els.dealerSeat.classList.add("shake");
  }

  function flyChip(fromEl, toEl, denom) {
    if (!fromEl || !toEl || !fromEl.getBoundingClientRect) return;
    const from = fromEl.getBoundingClientRect();
    const to = toEl.getBoundingClientRect();
    const chip = document.createElement("div");
    chip.className = `fly-chip chip-${denom}`;
    const size = 34;
    chip.style.width = `${size}px`;
    chip.style.height = `${size}px`;
    chip.style.left = `${from.left + from.width / 2 - size / 2}px`;
    chip.style.top = `${from.top + from.height / 2 - size / 2}px`;
    document.body.append(chip);
    requestAnimationFrame(() => {
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      chip.style.transform = `translate(${dx}px, ${dy}px) scale(0.55)`;
      chip.style.opacity = "0.25";
    });
    setTimeout(() => chip.remove(), 520);
  }

  /* ---------------- HUD ---------------- */

  function updateHud() {
    setText(els.bank, String(bank));
    setText(els.bet, String(bet));
    // Chips actually at risk: staged bet while betting, live wagers mid-round,
    // and nothing once the settle payout has been folded back into the bank.
    const onTable = state === "settle" ? 0 : bet + hands.reduce((sum, hand) => sum + hand.wager, 0);
    setText(els.net, formatSigned(bank + onTable - sessionStart));
    refreshControls();
  }

  function refreshControls() {
    const betting = state === "betting";
    els.betControls.hidden = !betting;
    els.actionControls.hidden = state !== "player";
    els.insuranceControls.hidden = state !== "insurance";
    els.nextControls.hidden = state !== "settle";
    els.cashOut.disabled = !(betting || state === "settle");

    if (betting) {
      for (const chip of chipButtons) chip.disabled = bank < Number(chip.dataset.chip);
      els.clearBet.disabled = bet === 0;
      els.rebet.disabled = lastBet === 0 || bank === 0 || bet >= lastBet;
      els.deal.disabled = bet < MIN_BET;
    }

    if (state === "player") {
      const hand = hands[activeHand];
      const playable = Boolean(hand) && !hand.done && hand.cards.length >= 2;
      els.hit.disabled = !playable;
      els.stand.disabled = !playable;
      els.double.disabled = !playable || hand.cards.length !== 2 || bank < hand.wager;
      els.split.hidden = !(
        hands.length === 1 &&
        playable &&
        hand.cards.length === 2 &&
        hand.cards[0].rank === hand.cards[1].rank &&
        bank >= hand.wager
      );
    }

    markActiveHand();
  }

  /* ---------------- overlays ---------------- */

  function overlayOpen() {
    return !els.overlay.hidden;
  }

  function showOverlay(title, sub, actions) {
    els.overlayTitle.textContent = title;
    els.overlaySub.textContent = sub;
    els.overlayActions.innerHTML = "";
    for (const action of actions) {
      let el;
      if (action.href) {
        el = document.createElement("a");
        el.className = "small-button";
        el.href = action.href;
        el.textContent = action.label;
      } else {
        el = document.createElement("button");
        el.type = "button";
        el.className = action.primary ? "primary-button" : "small-button";
        el.textContent = action.label;
        el.addEventListener("click", action.onClick);
      }
      els.overlayActions.append(el);
    }
    els.overlay.hidden = false;
  }

  function hideOverlay() {
    els.overlay.hidden = true;
  }

  function checkStake() {
    if (bank >= MIN_BET || overlayOpen()) return;
    showOverlay(
      "Staked!",
      "You're out of chips. The house fronts you 200 more — good luck at the table.",
      [{ label: "Take the Stake", primary: true, onClick: takeStake }]
    );
  }

  function takeStake() {
    bank += REFILL_CHIPS;
    refills += 1;
    if (bank > stats.biggestBank) stats.biggestBank = bank;
    sessionStart = bank;
    sessionBlackjacks = 0;
    saveAll();
    hideOverlay();
    toBetting();
  }

  /* ---------------- betting ---------------- */

  function addChip(denom, sourceEl) {
    if (state !== "betting" || bank < denom) return;
    bank -= denom;
    bet += denom;
    saveNumber(BANK_KEY, bank);
    flyChip(sourceEl, els.betBox, denom);
    updateHud();
  }

  function clearBet() {
    if (state !== "betting" || bet === 0) return;
    bank += bet;
    bet = 0;
    saveNumber(BANK_KEY, bank);
    updateHud();
  }

  function rebet() {
    if (state !== "betting" || lastBet === 0) return;
    const target = Math.min(lastBet, bet + bank);
    const delta = target - bet;
    if (delta <= 0) return;
    bank -= delta;
    bet += delta;
    saveNumber(BANK_KEY, bank);
    flyChip(els.rebet, els.betBox, 25);
    updateHud();
  }

  /* ---------------- round flow ---------------- */

  async function startRound() {
    if (state !== "betting" || bet < MIN_BET || busy) return;
    busy = true;
    try {
      const roundId = (round += 1);
      state = "dealing";
      lastBet = bet;
      hands = [newHandObject(bet)];
      bet = 0; // the staked chips are now the hand's wager
      activeHand = 0;
      dealerCards = [];
      insuranceStake = 0;
      els.dealerCards.innerHTML = "";
      renderHandGroups();
      setBanner("Dealing…", "");
      updateHud();

      if (ensureShoe()) await reshuffle(roundId);
      if (roundId !== round) return;

      const pause = async (ms) => {
        await sleep(ms);
        if (roundId !== round) throw new RoundAborted();
      };

      try {
        hands[0].cards.push(drawCard());
        appendCardToHand(hands[0], hands[0].cards[0]);
        await pause(240);
        dealerCards.push(drawCard());
        appendDealerCard(dealerCards[0], false);
        await pause(240);
        hands[0].cards.push(drawCard());
        appendCardToHand(hands[0], hands[0].cards[1]);
        await pause(240);
        dealerCards.push(drawCard());
        appendDealerCard(dealerCards[1], true);
        await pause(240);

        pending = roundStakes();
        saveNumber(BANK_KEY, bank);
        saveNumber(PENDING_KEY, pending);

        const upCard = dealerCards[0];
        const cost = insuranceCost(hands[0].wager);
        if (upCard.rank === "A" && bank >= cost) {
          state = "insurance";
          els.insuranceCostLabel.textContent = String(cost);
          refreshControls();
          setBanner("Dealer shows an ace", "");
          const taken = await askInsurance();
          if (taken) {
            insuranceStake = cost;
            bank -= cost;
            pending = roundStakes();
            saveNumber(BANK_KEY, bank);
            saveNumber(PENDING_KEY, pending);
            setBanner(`Insurance taken (−${cost})`, "");
            updateHud();
            await pause(520);
          }
          await dealerPeek(roundId, pause);
        } else if (upCard.rank === "A" || rankValue(upCard.rank) === 10) {
          // Ace with no bank for insurance, or a ten up: peek without offering.
          setBanner("Dealer peeks…", "");
          await pause(650);
          await dealerPeek(roundId, pause);
        } else {
          await afterPeek(roundId, pause);
        }
      } catch (error) {
        if (!(error instanceof RoundAborted)) throw error;
      }
    } finally {
      busy = false;
    }
  }

  class RoundAborted extends Error {}

  function askInsurance() {
    return new Promise((resolve) => {
      insuranceResolver = resolve;
    });
  }

  function resolveInsurance(taken) {
    if (!insuranceResolver) return;
    const resolve = insuranceResolver;
    insuranceResolver = null;
    resolve(taken);
  }

  async function dealerPeek(roundId, pause) {
    if (roundId !== round) return;
    if (isNatural(dealerCards)) {
      setBanner("Dealer has blackjack", "lose");
      await pause(450);
      revealHole();
      await pause(650);
      settleRound();
      return;
    }
    setBanner("No blackjack — play on", "");
    await pause(620);
    await afterPeek(roundId, pause);
  }

  async function afterPeek(roundId, pause) {
    if (roundId !== round) return;
    if (isNatural(hands[0].cards)) {
      setBanner("Blackjack!", "win");
      revealHole();
      await pause(750);
      settleRound();
      return;
    }
    state = "player";
    activeHand = 0;
    setBanner("Your move", "");
    refreshControls();
  }

  /* ---------------- player actions ---------------- */

  async function playerHit() {
    if (state !== "player" || busy) return;
    const hand = hands[activeHand];
    if (!hand || hand.done) return;
    busy = true;
    try {
      const roundId = round;
      const card = drawCard();
      hand.cards.push(card);
      appendCardToHand(hand, card);
      const total = handValue(hand.cards).total;
      if (total > 21) {
        hand.done = true;
        setBanner("Bust!", "lose");
        refreshControls();
        await sleep(650);
        if (roundId !== round) return;
        await advanceRound(roundId);
      } else if (total === 21) {
        hand.done = true;
        refreshControls();
        await sleep(380);
        if (roundId !== round) return;
        await advanceRound(roundId);
      } else {
        refreshControls();
      }
    } finally {
      busy = false;
    }
  }

  async function playerStand() {
    if (state !== "player" || busy) return;
    const hand = hands[activeHand];
    if (!hand || hand.done) return;
    busy = true;
    try {
      hand.done = true;
      refreshControls();
      await advanceRound(round);
    } finally {
      busy = false;
    }
  }

  async function playerDouble() {
    if (state !== "player" || busy) return;
    const hand = hands[activeHand];
    if (!hand || hand.done || hand.cards.length !== 2 || bank < hand.wager) return;
    busy = true;
    try {
      const roundId = round;
      bank -= hand.wager;
      hand.wager *= 2;
      hand.doubled = true;
      pending = roundStakes();
      saveNumber(BANK_KEY, bank);
      saveNumber(PENDING_KEY, pending);
      updateHud();
      const card = drawCard();
      hand.cards.push(card);
      appendCardToHand(hand, card);
      hand.done = true;
      const busted = handValue(hand.cards).total > 21;
      setBanner(busted ? "Doubled — bust!" : "Doubled down", busted ? "lose" : "");
      refreshControls();
      await sleep(700);
      if (roundId !== round) return;
      await advanceRound(roundId);
    } finally {
      busy = false;
    }
  }

  async function playerSplit() {
    if (state !== "player" || busy || hands.length !== 1) return;
    const hand = hands[0];
    if (
      hand.done ||
      hand.cards.length !== 2 ||
      hand.cards[0].rank !== hand.cards[1].rank ||
      bank < hand.wager
    ) {
      return;
    }
    busy = true;
    try {
      const roundId = round;
      bank -= hand.wager;
      saveNumber(BANK_KEY, bank);

      const movedCard = hand.cards.pop();
      const movedEl = movedCard.el;
      hand.fromSplit = true;
      const second = newHandObject(hand.wager, true);
      second.cards.push(movedCard);
      hands.push(second);
      pending = roundStakes();
      saveNumber(PENDING_KEY, pending);
      updateHud();

      renderHandGroups();
      movedEl.classList.remove("deal-in");
      hand.cards[0].el.classList.remove("deal-in");
      hand.el.cardsEl.append(hand.cards[0].el);
      second.el.cardsEl.append(movedEl);
      updateHandValue(hand);
      updateHandValue(second);
      await sleep(340);
      if (roundId !== round) return;

      const aces = movedCard.rank === "A";
      const first = drawCard();
      hand.cards.push(first);
      appendCardToHand(hand, first);
      await sleep(260);
      if (roundId !== round) return;
      const secondCard = drawCard();
      second.cards.push(secondCard);
      appendCardToHand(second, secondCard);
      await sleep(260);
      if (roundId !== round) return;

      // Split aces get exactly one card each and stand; a 21 after a split
      // is just 21, never blackjack.
      for (const split of hands) {
        if (aces || handValue(split.cards).total === 21) split.done = true;
      }

      state = "player";
      activeHand = hands.findIndex((entry) => !entry.done);
      if (aces) setBanner("Split aces — one card each", "");
      await advanceRound(roundId);
    } finally {
      busy = false;
    }
  }

  async function advanceRound(roundId) {
    const next = hands.findIndex((hand) => !hand.done);
    if (next === -1) {
      await dealerTurn(roundId);
      return;
    }
    activeHand = next;
    state = "player";
    setBanner(hands.length > 1 ? `Hand ${next + 1}: your move` : "Your move", "");
    refreshControls();
  }

  async function dealerTurn(roundId) {
    state = "dealer";
    refreshControls();
    setBanner("Dealer plays…", "");
    await sleep(320);
    if (roundId !== round) return;
    revealHole();
    await sleep(650);
    if (roundId !== round) return;

    const anyLive = hands.some((hand) => handValue(hand.cards).total <= 21);
    if (anyLive) {
      while (dealerShouldHit(dealerCards)) {
        const card = drawCard();
        dealerCards.push(card);
        appendDealerCard(card, false);
        await sleep(430);
        if (roundId !== round) return;
      }
    }
    await sleep(420);
    if (roundId !== round) return;
    settleRound();
  }

  /* ---------------- settlement ---------------- */

  function tagText(result, wager) {
    if (result.outcome === "blackjack") return `Blackjack +${result.payout - wager}`;
    if (result.outcome === "win") return `Win +${result.payout - wager}`;
    if (result.outcome === "push") return "Push";
    return `−${wager}`;
  }

  function settleRound() {
    const dealerTotal = handValue(dealerCards).total;
    const dealerBust = dealerTotal > 21;
    const dealerNatural = isNatural(dealerCards);
    let returned = 0;

    for (const hand of hands) {
      const result = settleHand(hand.cards, dealerCards, hand.wager, hand.fromSplit);
      hand.result = result;
      returned += result.payout;
      bank += result.payout;
      stats.hands += 1;
      stats.net += result.payout - hand.wager;
      if (result.outcome === "win" || result.outcome === "blackjack") stats.wins += 1;
      if (result.outcome === "blackjack") {
        stats.blackjacks += 1;
        sessionBlackjacks += 1;
      }
      hand.el.tag.className = `hand-tag ${result.outcome}`;
      hand.el.tag.textContent = tagText(result, hand.wager);
      hand.el.tag.hidden = false;
    }

    const insuranceReturn = insuranceStake > 0 && dealerNatural ? insuranceStake * 3 : 0;
    if (insuranceReturn > 0) {
      bank += insuranceReturn;
      stats.net += insuranceReturn - insuranceStake;
    }

    const stakeTotal = roundStakes();
    const net = returned + insuranceReturn - stakeTotal;
    if (bank > stats.biggestBank) stats.biggestBank = bank;
    pending = 0;
    saveAll();

    if (dealerBust) shakeDealer();

    const singleNatural = hands.length === 1 && hands[0].result.outcome === "blackjack";
    const allBust = hands.every((hand) => hand.result.outcome === "bust");
    let text;
    let tone;
    if (singleNatural) {
      text = "Blackjack! Pays 3:2";
      tone = "win";
    } else if (allBust) {
      tone = net < 0 ? "lose" : "push";
      text = net < 0 ? `Bust — dealer takes ${-net}` : "Bust";
    } else if (dealerBust) {
      text = `Dealer busts — you win +${net}`;
      tone = "win";
    } else if (net > 0) {
      text = `You win +${net}`;
      tone = "win";
    } else if (net < 0) {
      text = `Dealer takes ${-net}`;
      tone = "lose";
    } else {
      text = "Push — bet returned";
      tone = "push";
    }
    if (insuranceReturn > 0) text += " · insurance pays 2:1";
    setBanner(text, tone);

    state = "settle";
    updateHud();

    if (bank < MIN_BET) {
      setTimeout(() => {
        if (state === "settle") checkStake();
      }, 1200);
    }
  }

  function toBetting() {
    hands = [];
    dealerCards = [];
    insuranceStake = 0;
    els.dealerCards.innerHTML = "";
    els.dealerCards.classList.remove("crowded");
    renderHandGroups();
    updateDealerValue();
    bet = 0;
    state = "betting";
    setBanner("Place your bet", "");
    updateHud();
    checkStake();
  }

  /* ---------------- session end: cash out ---------------- */

  function cashOut() {
    if (state !== "betting" && state !== "settle") return;
    if (overlayOpen() || busy) return;

    if (state === "betting" && bet > 0) {
      bank += bet; // take the chips back off the felt before settling up
      bet = 0;
    }

    const profit = bank - sessionStart;
    const hadBlackjack = sessionBlackjacks > 0;
    const chips = Math.max(0, Math.floor(profit / 5)) + (hadBlackjack ? 5 : 0);
    if (window.GameHubProfile) {
      window.GameHubProfile.award("blackjack", chips, `Cashed out with ${bank} chips`, chips);
    }
    sessionStart = bank;
    sessionBlackjacks = 0;
    saveAll();

    toBetting();

    const finishLine =
      profit === 0
        ? "You walked away even."
        : profit > 0
          ? `You finished +${profit}.`
          : `You finished −${-profit}.`;
    const awardLine =
      chips > 0
        ? `+${chips} profile chips earned${hadBlackjack ? " (includes the blackjack bonus)" : ""}.`
        : "No profile chips this time.";
    showOverlay("Cashed Out", `${finishLine} ${awardLine}`, [
      { label: "Keep Playing", primary: true, onClick: resumeAfterCashOut },
      { label: "Back to Game Hub", href: "/" },
    ]);
  }

  function resumeAfterCashOut() {
    hideOverlay();
    refreshControls();
    checkStake();
  }

  /* ---------------- stats dialog ---------------- */

  function openStats() {
    els.statHands.textContent = String(stats.hands);
    els.statWins.textContent = String(stats.wins);
    els.statBlackjacks.textContent = String(stats.blackjacks);
    els.statBigBank.textContent = String(stats.biggestBank);
    els.statNet.textContent = formatSigned(stats.net);
    els.statRefills.textContent = String(refills);
    els.statsDialog.hidden = false;
  }

  function closeStats() {
    els.statsDialog.hidden = true;
  }

  /* ---------------- input ---------------- */

  function bindInput() {
    for (const chip of chipButtons) {
      chip.addEventListener("click", () => addChip(Number(chip.dataset.chip), chip));
    }
    els.clearBet.addEventListener("click", clearBet);
    els.rebet.addEventListener("click", rebet);
    els.deal.addEventListener("click", startRound);
    els.hit.addEventListener("click", playerHit);
    els.stand.addEventListener("click", playerStand);
    els.double.addEventListener("click", playerDouble);
    els.split.addEventListener("click", playerSplit);
    els.takeInsurance.addEventListener("click", () => resolveInsurance(true));
    els.declineInsurance.addEventListener("click", () => resolveInsurance(false));
    els.nextHand.addEventListener("click", () => {
      if (state === "settle" && !busy) toBetting();
    });
    els.cashOut.addEventListener("click", cashOut);
    els.statsButton.addEventListener("click", openStats);
    els.statsClose.addEventListener("click", closeStats);
    els.statsDialog.addEventListener("click", (event) => {
      if (event.target === els.statsDialog) closeStats();
    });

    document.addEventListener("keydown", (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "h") playerHit();
      else if (key === "s") playerStand();
      else if (key === "d") playerDouble();
      else if (key === "p") playerSplit();
      else if (key === "enter") {
        if (state === "betting") startRound();
        else if (state === "settle" && !busy) toBetting();
      }
    });
  }

  /* ---------------- boot ---------------- */

  const interruptedStake = loadNumber(PENDING_KEY, 0);
  if (interruptedStake > 0) {
    // A round was cut off by a reload; hand its stake back.
    bank += interruptedStake;
  }
  pending = 0;
  if (bank > stats.biggestBank) stats.biggestBank = bank;
  sessionStart = bank;
  saveAll();
  bindInput();
  toBetting();
}

/* Node test-rig hook — ignored in the browser. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DECKS,
    MIN_BET,
    SUITS,
    RANKS,
    rankValue,
    handValue,
    formatHandValue,
    isNatural,
    dealerShouldHit,
    buildShoe,
    cutIndex,
    insuranceCost,
    blackjackPayout,
    settleHand,
    dealerPlay,
  };
}
