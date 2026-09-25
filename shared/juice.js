/*
 * GameHub shared juice — tiny WebAudio sound effects and canvas confetti that
 * any game can borrow in one line. Synthesized on the fly (no audio files, so
 * everything still works offline and costs zero bytes of assets).
 *
 *   GameHubJuice.pop();               // match / pickup blip
 *   GameHubJuice.pop(660);            // higher pitch
 *   GameHubJuice.sweep();             // whoosh / clear
 *   GameHubJuice.coin();              // chip awarded
 *   GameHubJuice.win();               // victory fanfare + confetti
 *   GameHubJuice.lose();              // gentle sad tone
 *   GameHubJuice.tick();              // UI click
 *   GameHubJuice.boom();              // explosion
 *   GameHubJuice.confetti();          // just the confetti
 *   GameHubJuice.muted                // read/flip the mute flag (persisted)
 *
 * Browsers block audio until the first user gesture; the first call after a
 * click/keypress just works because the context is created lazily.
 */
(function initGameHubJuice() {
  const MUTE_KEY = "gamehub-juice-muted";
  let ctx = null;
  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    // Private mode: keep sound on for the session.
  }

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  // One enveloped oscillator blip. type: sine/square/triangle/sawtooth.
  function blip(freq, duration, type, gainValue, delay, slideTo) {
    const audio = ensureCtx();
    if (!audio || muted) return;
    const t0 = audio.currentTime + (delay || 0);
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(gainValue || 0.12, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  // Short filtered noise burst for impacts and explosions.
  function noise(duration, gainValue, delay, filterHz) {
    const audio = ensureCtx();
    if (!audio || muted) return;
    const t0 = audio.currentTime + (delay || 0);
    const frames = Math.floor(audio.sampleRate * duration);
    const buffer = audio.createBuffer(1, frames, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const src = audio.createBufferSource();
    src.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterHz || 900;
    const gain = audio.createGain();
    gain.gain.value = gainValue || 0.2;
    src.connect(filter).connect(gain).connect(audio.destination);
    src.start(t0);
  }

  const juice = {
    get muted() {
      return muted;
    },
    set muted(value) {
      muted = Boolean(value);
      try {
        localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
      } catch {
        // Ignore; the flag still applies for this session.
      }
      try {
        window.dispatchEvent(new CustomEvent("gamehub-juice", { detail: { muted } }));
      } catch {
        // Older browsers still mute fine.
      }
    },
    pop(freq) {
      blip(freq || 520, 0.12, "triangle", 0.14);
      blip((freq || 520) * 1.5, 0.09, "sine", 0.08, 0.03);
    },
    swap() {
      blip(320, 0.08, "sine", 0.1, 0, 420);
    },
    drop() {
      blip(180, 0.1, "sine", 0.16, 0, 80);
      noise(0.08, 0.1, 0, 500);
    },
    tick() {
      blip(700, 0.05, "square", 0.05);
    },
    sweep() {
      blip(440, 0.22, "sawtooth", 0.07, 0, 880);
      noise(0.25, 0.12, 0.02, 1400);
    },
    coin() {
      blip(880, 0.09, "square", 0.09);
      blip(1320, 0.18, "square", 0.09, 0.07);
    },
    boom() {
      noise(0.4, 0.3, 0, 400);
      blip(90, 0.35, "sine", 0.2, 0, 40);
    },
    win() {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
        blip(freq, 0.22, "triangle", 0.14, index * 0.11);
      });
      this.confetti();
    },
    lose() {
      blip(330, 0.25, "triangle", 0.12, 0, 220);
      blip(220, 0.4, "triangle", 0.1, 0.18, 140);
    },
    levelUp() {
      [392, 523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
        blip(freq, 0.16, "square", 0.08, index * 0.08);
      });
    },
    confetti(count) {
      const pieces = count || 120;
      const canvas = document.createElement("canvas");
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.cssText =
        "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9998";
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      document.body.append(canvas);
      const ctx2d = canvas.getContext("2d");
      ctx2d.scale(dpr, dpr);
      const colors = ["#e5484d", "#dfb44e", "#2f8c5a", "#3565b8", "#8a4a8c", "#df7e4e"];
      const bits = Array.from({ length: pieces }, () => ({
        x: Math.random() * window.innerWidth,
        y: -20 - Math.random() * window.innerHeight * 0.4,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        vx: (Math.random() - 0.5) * 2.4,
        vy: 2 + Math.random() * 3.2,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.25,
        color: colors[Math.floor(Math.random() * colors.length)],
      }));
      const started = performance.now();
      (function frame(now) {
        const elapsed = now - started;
        ctx2d.clearRect(0, 0, canvas.width, canvas.height);
        ctx2d.save();
        ctx2d.scale(dpr, dpr);
        bits.forEach((bit) => {
          bit.x += bit.vx;
          bit.y += bit.vy;
          bit.vy += 0.05;
          bit.rot += bit.vr;
          ctx2d.save();
          ctx2d.translate(bit.x, bit.y);
          ctx2d.rotate(bit.rot);
          ctx2d.fillStyle = bit.color;
          ctx2d.globalAlpha = Math.max(0, 1 - elapsed / 3400);
          ctx2d.fillRect(-bit.w / 2, -bit.h / 2, bit.w, bit.h);
          ctx2d.restore();
        });
        ctx2d.restore();
        if (elapsed < 3500) requestAnimationFrame(frame);
        else canvas.remove();
      })(started);
    },
  };

  window.GameHubJuice = juice;
})();
