const BEST_KEY = "gamehub-simon-best";
const PADS = [...document.querySelectorAll(".pad")];
const els = {
  level: document.querySelector("#level"),
  best: document.querySelector("#best"),
  centerLabel: document.querySelector("#centerLabel"),
  startButton: document.querySelector("#startButton"),
  hintLine: document.querySelector("#hintLine"),
  overlay: document.querySelector("#overlay"),
  overlaySub: document.querySelector("#overlaySub"),
  againButton: document.querySelector("#againButton"),
};

const TONES = [261.63, 329.63, 392.0, 523.25];

const state = {
  sequence: [],
  position: 0,
  accepting: false,
  playing: false,
  best: Number(localStorage.getItem(BEST_KEY) || 0),
  timeouts: [],
};

els.best.textContent = state.best;

let audioCtx = null;

function tone(index, duration) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = TONES[index];
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.28, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration / 1000);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration / 1000);
  } catch {
    // Audio is a garnish; the game plays fine silent.
  }
}

function buzz() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 110;
    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.6);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.65);
  } catch {
    // Silent fallback.
  }
}

function later(fn, ms) {
  state.timeouts.push(setTimeout(fn, ms));
}

function clearPending() {
  state.timeouts.forEach(clearTimeout);
  state.timeouts = [];
}

function light(index, duration) {
  const pad = PADS[index];
  pad.classList.add("lit");
  tone(index, duration);
  setTimeout(() => pad.classList.remove("lit"), duration * 0.8);
}

function playbackSpeed() {
  return Math.max(280, 640 - state.sequence.length * 28);
}

function playSequence() {
  state.playing = true;
  state.accepting = false;
  els.centerLabel.textContent = "Watch…";
  const speed = playbackSpeed();
  state.sequence.forEach((pad, i) => {
    later(() => light(pad, speed * 0.62), 400 + i * speed);
  });
  later(() => {
    state.playing = false;
    state.accepting = true;
    state.position = 0;
    els.centerLabel.textContent = "Your turn";
  }, 400 + state.sequence.length * speed);
}

function startGame() {
  clearPending();
  state.sequence = [];
  els.level.textContent = "0";
  els.overlay.hidden = true;
  els.startButton.disabled = true;
  nextLevel();
}

function nextLevel() {
  state.sequence.push(Math.floor(Math.random() * 4));
  els.level.textContent = state.sequence.length;
  els.hintLine.textContent = `Level ${state.sequence.length} — the pattern grows by one.`;
  playSequence();
}

function onPad(event) {
  if (!state.accepting) return;
  const index = Number(event.currentTarget.dataset.pad);
  light(index, 300);
  if (state.sequence[state.position] === index) {
    state.position += 1;
    if (state.position === state.sequence.length) {
      state.accepting = false;
      els.centerLabel.textContent = "Nice!";
      if (state.sequence.length > state.best) {
        state.best = state.sequence.length;
        localStorage.setItem(BEST_KEY, String(state.best));
        els.best.textContent = state.best;
      }
      later(nextLevel, 800);
    }
  } else {
    state.accepting = false;
    buzz();
    gameOver();
  }
}

function gameOver() {
  window.GameHubProfile?.award("simon", state.sequence.length - 1, `Reached level ${state.sequence.length}`, state.sequence.length - 1);
  els.centerLabel.textContent = "Press Start";
  els.startButton.disabled = false;
  els.overlaySub.textContent = `You made it to level ${state.sequence.length}. Best: ${state.best}.`;
  els.overlay.hidden = false;
}

PADS.forEach((pad) => pad.addEventListener("click", onPad));
els.startButton.addEventListener("click", startGame);
els.againButton.addEventListener("click", startGame);
