const STORAGE_KEY = "local-first-game-hub-v1";

const icons = {
  bingo: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="8" width="44" height="48" rx="4"></rect>
      <path d="M18 18h28M18 28h28M18 38h28M27 18v28M37 18v28"></path>
      <circle cx="27" cy="28" r="4"></circle>
      <circle cx="37" cy="38" r="4"></circle>
    </svg>`,
  dice: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="9" y="12" width="34" height="34" rx="7"></rect>
      <rect x="25" y="22" width="30" height="30" rx="7"></rect>
      <circle cx="20" cy="23" r="2.5"></circle>
      <circle cx="32" cy="35" r="2.5"></circle>
      <circle cx="36" cy="31" r="2.5"></circle>
      <circle cx="46" cy="43" r="2.5"></circle>
    </svg>`,
  bullsandcows: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="14" y="7" width="36" height="50" rx="5"></rect>
      <path d="M24 17h16M24 28h16M24 39h16"></path>
      <circle cx="21" cy="17" r="3"></circle>
      <circle cx="43" cy="28" r="3"></circle>
      <circle cx="32" cy="39" r="3"></circle>
      <path d="M22 49h20"></path>
    </svg>`,
  cards: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="14" y="10" width="28" height="40" rx="4"></rect>
      <rect x="23" y="15" width="28" height="40" rx="4"></rect>
      <path d="M37 27l6 8-6 8-6-8z"></path>
    </svg>`,
  tools: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="22" cy="22" r="12"></circle>
      <path d="M22 14v8l5 4"></path>
      <rect x="34" y="31" width="19" height="19" rx="4"></rect>
      <circle cx="40" cy="37" r="1.6"></circle>
      <circle cx="47" cy="44" r="1.6"></circle>
      <path d="M16 42h12M19 35h6M19 49h6"></path>
    </svg>`,
  letters: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="10" width="18" height="18" rx="3"></rect>
      <rect x="36" y="10" width="18" height="18" rx="3"></rect>
      <rect x="10" y="36" width="18" height="18" rx="3"></rect>
      <rect x="36" y="36" width="18" height="18" rx="3"></rect>
      <text x="19" y="19" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-weight="900" font-size="12" style="fill:currentColor;stroke:none">A</text>
      <text x="45" y="19" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-weight="900" font-size="12" style="fill:currentColor;stroke:none">B</text>
      <text x="19" y="45" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-weight="900" font-size="12" style="fill:currentColor;stroke:none">C</text>
      <text x="45" y="45" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-weight="900" font-size="12" style="fill:currentColor;stroke:none">D</text>
    </svg>`,
  wordfind: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="9" y="9" width="46" height="46" rx="5"></rect>
      <path d="M20 9v46M32 9v46M44 9v46M9 20h46M9 32h46M9 44h46"></path>
      <path d="M18 18l28 28"></path>
      <circle cx="18" cy="18" r="4"></circle>
      <circle cx="46" cy="46" r="4"></circle>
      <path d="M18 18h28"></path>
    </svg>`,
  backgammon: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="9" width="48" height="46" rx="4"></rect>
      <path d="M32 9v46"></path>
      <path d="M14 10l4 18 4-18M24 10l4 18 4-18M42 10l4 18 4-18"></path>
      <path d="M14 54l4-18 4 18M34 54l4-18 4 18M44 54l4-18 4 18"></path>
      <circle cx="22" cy="39" r="4"></circle>
      <circle cx="22" cy="47" r="4"></circle>
      <circle cx="42" cy="17" r="4"></circle>
      <circle cx="42" cy="25" r="4"></circle>
    </svg>`,
  findem: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="13" y="8" width="38" height="50" rx="5"></rect>
      <path d="M21 18h22M21 27h14"></path>
      <circle cx="37" cy="38" r="8"></circle>
      <path d="m43 44 6 6"></path>
      <path d="M23 42h6"></path>
    </svg>`,
  whoami: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="28" r="14"></circle>
      <circle cx="26" cy="28" r="2"></circle>
      <circle cx="38" cy="28" r="2"></circle>
      <path d="M26 35q6 4 12 0"></path>
      <path d="M14 50c4-6 12-8 18-8s14 2 18 8"></path>
    </svg>`,
  hangman: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <line x1="6" y1="56" x2="44" y2="56"></line>
      <line x1="14" y1="56" x2="14" y2="8"></line>
      <line x1="14" y1="8" x2="38" y2="8"></line>
      <line x1="38" y1="8" x2="38" y2="18"></line>
      <circle cx="38" cy="24" r="5"></circle>
      <line x1="38" y1="29" x2="38" y2="42"></line>
      <line x1="38" y1="34" x2="30" y2="40"></line>
      <line x1="38" y1="34" x2="46" y2="40"></line>
      <line x1="38" y1="42" x2="32" y2="52"></line>
      <line x1="38" y1="42" x2="44" y2="52"></line>
      <path d="M47 51h6M56 51h6"></path>
    </svg>`,
  battleship: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M8 40h48l-6 10H16z"></path>
      <path d="M20 40v-8h20l6 8"></path>
      <path d="M28 32v-8h8v8"></path>
      <path d="M32 24v-6"></path>
      <circle cx="16" cy="46" r="1.6"></circle>
      <circle cx="24" cy="46" r="1.6"></circle>
      <circle cx="32" cy="46" r="1.6"></circle>
      <circle cx="40" cy="46" r="1.6"></circle>
      <path d="M6 56c3-2.5 6-2.5 9 0s6 2.5 9 0 6-2.5 9 0 6 2.5 9 0 6-2.5 9 0"></path>
    </svg>`,
  checkers: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="8" width="48" height="48" rx="4"></rect>
      <path d="M8 24h48M8 40h48M24 8v48M40 8v48"></path>
      <circle cx="16" cy="16" r="5"></circle>
      <circle cx="48" cy="16" r="5"></circle>
      <circle cx="32" cy="32" r="5"></circle>
      <circle cx="16" cy="48" r="5"></circle>
      <circle cx="48" cy="48" r="5"></circle>
    </svg>`,
  oracle: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M6 32C13 20 23 14 32 14s19 6 26 18c-7 12-17 18-26 18S13 44 6 32z"></path>
      <circle cx="32" cy="32" r="8"></circle>
      <circle cx="32" cy="32" r="2.5"></circle>
    </svg>`,
  training: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="16" y="8" width="32" height="38" rx="6"></rect>
      <path d="M16 30h32"></path>
      <circle cx="25" cy="38" r="3"></circle>
      <circle cx="39" cy="38" r="3"></circle>
      <path d="M20 46l-6 10M44 46l6 10M14 56h36"></path>
      <path d="M24 8V4h16v4"></path>
    </svg>`,
  g2048: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="8" width="48" height="48" rx="6"></rect>
      <path d="M8 24h48M8 40h48M24 8v48M40 8v48"></path>
      <text x="16" y="16" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-weight="900" font-size="10" style="fill:currentColor;stroke:none">2</text>
      <text x="48" y="32" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-weight="900" font-size="10" style="fill:currentColor;stroke:none">4</text>
      <text x="48" y="48" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-weight="900" font-size="10" style="fill:currentColor;stroke:none">8</text>
    </svg>`,
  wordguess: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="14" width="20" height="20" rx="4"></rect>
      <rect x="36" y="14" width="20" height="20" rx="4"></rect>
      <rect x="8" y="36" width="20" height="20" rx="4"></rect>
      <rect x="36" y="36" width="20" height="20" rx="4"></rect>
      <text x="18" y="24" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-weight="900" font-size="13" style="fill:currentColor;stroke:none">W</text>
      <text x="46" y="24" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-weight="900" font-size="13" style="fill:currentColor;stroke:none">O</text>
      <text x="18" y="46" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-weight="900" font-size="13" style="fill:currentColor;stroke:none">R</text>
      <text x="46" y="46" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-weight="900" font-size="13" style="fill:currentColor;stroke:none">D</text>
    </svg>`,
  mine: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="36" r="14"></circle>
      <path d="M32 16v6M32 50v6M12 36h6M46 36h6M18 22l4.5 4.5M46 22l-4.5 4.5"></path>
      <circle cx="27" cy="31" r="3"></circle>
    </svg>`,
  connect4: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="10" width="48" height="46" rx="6"></rect>
      <circle cx="20" cy="22" r="6"></circle>
      <circle cx="44" cy="22" r="6"></circle>
      <circle cx="32" cy="36" r="6"></circle>
      <circle cx="20" cy="50" r="6"></circle>
      <circle cx="44" cy="50" r="6"></circle>
    </svg>`,
  memory: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="12" width="24" height="34" rx="4" transform="rotate(-8 22 29)"></rect>
      <rect x="28" y="16" width="24" height="34" rx="4" transform="rotate(7 40 33)"></rect>
      <circle cx="40" cy="33" r="6.5"></circle>
      <path d="M40 29.5l3.5 3.5-3.5 3.5-3.5-3.5z"></path>
    </svg>`,
  snake: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M12 16h28a8 8 0 0 1 0 16H22a8 8 0 0 0 0 16h28"></path>
      <circle cx="52" cy="48" r="5"></circle>
      <circle cx="46" cy="16" r="2.5"></circle>
    </svg>`,
  simon: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M30 6a24 24 0 0 0-24 24h24V6z"></path>
      <path d="M34 6a24 24 0 0 1 24 24H34V6z"></path>
      <path d="M6 34a24 24 0 0 0 24 24V34H6z"></path>
      <path d="M34 34v24a24 24 0 0 0 24-24H34z"></path>
      <circle cx="32" cy="32" r="7" class="simon-core"></circle>
    </svg>`,
  sliding: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="8" width="48" height="48" rx="6"></rect>
      <rect x="14" y="14" width="15" height="15" rx="3"></rect>
      <rect x="35" y="14" width="15" height="15" rx="3"></rect>
      <rect x="14" y="35" width="15" height="15" rx="3"></rect>
      <path d="M40 42h8M44 38l4 4-4 4"></path>
    </svg>`,
  dots: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="12" cy="12" r="3"></circle>
      <circle cx="32" cy="12" r="3"></circle>
      <circle cx="52" cy="12" r="3"></circle>
      <circle cx="12" cy="32" r="3"></circle>
      <circle cx="32" cy="32" r="3"></circle>
      <circle cx="52" cy="32" r="3"></circle>
      <circle cx="12" cy="52" r="3"></circle>
      <circle cx="32" cy="52" r="3"></circle>
      <circle cx="52" cy="52" r="3"></circle>
      <path d="M12 12h20M12 12v20M32 12v20M12 32h20"></path>
      <rect x="17" y="17" width="10" height="10" rx="2" class="dots-fill"></rect>
    </svg>`,
  lights: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="8" width="48" height="48" rx="6"></rect>
      <circle cx="22" cy="22" r="7" style="fill:currentColor;stroke:none"></circle>
      <circle cx="42" cy="22" r="7"></circle>
      <circle cx="22" cy="42" r="7"></circle>
      <circle cx="42" cy="42" r="7" style="fill:currentColor;stroke:none"></circle>
    </svg>`,
  sudoku: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="8" width="48" height="48" rx="6"></rect>
      <path d="M8 24h48M8 40h48M24 8v48M40 8v48"></path>
      <text x="16" y="16" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-weight="900" font-size="10" style="fill:currentColor;stroke:none">5</text>
      <text x="48" y="32" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-weight="900" font-size="10" style="fill:currentColor;stroke:none">3</text>
      <text x="32" y="48" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-weight="900" font-size="10" style="fill:currentColor;stroke:none">7</text>
    </svg>`,
  blockdrop: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="16" y="8" width="32" height="48" rx="5"></rect>
      <rect x="20" y="12" width="11" height="11" rx="2" style="fill:currentColor;stroke:none"></rect>
      <rect x="33" y="12" width="11" height="11" rx="2"></rect>
      <rect x="20" y="25" width="11" height="11" rx="2"></rect>
      <rect x="33" y="25" width="11" height="11" rx="2" style="fill:currentColor;stroke:none"></rect>
      <path d="M20 44h24M20 50h24"></path>
    </svg>`,
  solitaire: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="12" y="12" width="24" height="34" rx="4" transform="rotate(-10 24 29)"></rect>
      <rect x="26" y="12" width="24" height="34" rx="4" transform="rotate(8 38 29)"></rect>
      <path d="M38 21l5 8-5 8-5-8z" transform="rotate(8 38 29)"></path>
    </svg>`,
  reversi: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="8" width="48" height="48" rx="5"></rect>
      <circle cx="24" cy="24" r="8" style="fill:currentColor;stroke:none"></circle>
      <circle cx="40" cy="40" r="8" style="fill:currentColor;stroke:none"></circle>
      <circle cx="40" cy="24" r="8"></circle>
      <circle cx="24" cy="40" r="8"></circle>
    </svg>`,
  blackjack: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="14" width="26" height="38" rx="4" transform="rotate(-8 23 33)"></rect>
      <rect x="28" y="12" width="26" height="38" rx="4" transform="rotate(9 41 31)"></rect>
      <text x="20" y="33" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-weight="900" font-size="14" transform="rotate(-8 23 33)" style="fill:currentColor;stroke:none">A</text>
      <path d="M41 24l5.5 7-5.5 7-5.5-7z" transform="rotate(9 41 31)"></path>
    </svg>`,
  chess: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="8" width="48" height="48" rx="5"></rect>
      <path d="M8 24h48M8 40h48M24 8v48M40 8v48"></path>
      <path d="M17 47v-4l3-3v-7l-3-2v-5h4v3h3v-3h4v5l-3 2v7l3 3v4z"></path>
      <circle cx="41" cy="18.5" r="4"></circle>
      <path d="M38 44c0-9 1.2-16.5 3-21.5 1.8 4.5 3 12 3 21.5z"></path>
      <path d="M35 47h12"></path>
    </svg>`,
  gemcrush: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="8" width="48" height="48" rx="6"></rect>
      <path d="M20 16l6 6-6 6-6-6z"></path>
      <circle cx="42" cy="22" r="6"></circle>
      <rect x="14" y="38" width="12" height="12" rx="2"></rect>
      <path d="M38 44l5-8 5 8z"></path>
    </svg>`,
  melon: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M10 30a22 22 0 0 0 44 0z"></path>
      <path d="M14 30a18 18 0 0 0 36 0" stroke-dasharray="3 4"></path>
      <path d="M32 30V16"></path>
      <path d="M32 16c4-4 9-4 12-2-3 4-8 5-12 2z"></path>
      <circle cx="24" cy="40" r="1.8" style="fill:currentColor;stroke:none"></circle>
      <circle cx="33" cy="44" r="1.8" style="fill:currentColor;stroke:none"></circle>
      <circle cx="41" cy="39" r="1.8" style="fill:currentColor;stroke:none"></circle>
    </svg>`,
  breakout: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="10" width="12" height="7" rx="2"></rect>
      <rect x="26" y="10" width="12" height="7" rx="2"></rect>
      <rect x="44" y="10" width="12" height="7" rx="2"></rect>
      <rect x="17" y="23" width="12" height="7" rx="2"></rect>
      <rect x="35" y="23" width="12" height="7" rx="2"></rect>
      <circle cx="36" cy="42" r="4"></circle>
      <rect x="24" y="52" width="18" height="5" rx="2.5"></rect>
    </svg>`,
  mahjong: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="16" width="20" height="28" rx="3"></rect>
      <rect x="34" y="12" width="20" height="28" rx="3" transform="rotate(6 44 26)"></rect>
      <circle cx="20" cy="26" r="4"></circle>
      <circle cx="20" cy="35" r="4"></circle>
      <path d="M44 20l4.5 6-4.5 6-4.5-6z" transform="rotate(6 44 26)"></path>
      <path d="M34 46h20M36 52h16"></path>
    </svg>`,
  nonogram: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="8" width="48" height="48" rx="5"></rect>
      <path d="M8 20h48M8 32h48M8 44h48M20 8v48M32 8v48M44 8v48"></path>
      <rect x="21" y="21" width="10" height="10" style="fill:currentColor;stroke:none"></rect>
      <rect x="45" y="9" width="10" height="10" style="fill:currentColor;stroke:none"></rect>
      <rect x="9" y="45" width="10" height="10" style="fill:currentColor;stroke:none"></rect>
      <rect x="33" y="33" width="10" height="10" style="fill:currentColor;stroke:none"></rect>
    </svg>`,
  sokoban: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="8" width="48" height="48" rx="5"></rect>
      <rect x="14" y="26" width="16" height="16" rx="2"></rect>
      <rect x="34" y="14" width="16" height="16" rx="2"></rect>
      <circle cx="24" cy="22" r="5" style="fill:currentColor;stroke:none"></circle>
      <circle cx="42" cy="42" r="3.5"></circle>
      <circle cx="50" cy="50" r="3.5"></circle>
    </svg>`,
  dominoes: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="14" y="10" width="20" height="38" rx="4" transform="rotate(-12 24 29)"></rect>
      <rect x="30" y="14" width="20" height="38" rx="4" transform="rotate(9 40 33)"></rect>
      <circle cx="24" cy="22" r="2.4" style="fill:currentColor;stroke:none"></circle>
      <circle cx="24" cy="34" r="2.4" style="fill:currentColor;stroke:none"></circle>
      <circle cx="40" cy="26" r="2.4" style="fill:currentColor;stroke:none"></circle>
      <circle cx="40" cy="38" r="2.4" style="fill:currentColor;stroke:none"></circle>
      <circle cx="46" cy="44" r="2.4" style="fill:currentColor;stroke:none"></circle>
    </svg>`,
  videopoker: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="12" width="26" height="36" rx="4" transform="rotate(-9 23 30)"></rect>
      <rect x="29" y="14" width="26" height="36" rx="4" transform="rotate(8 42 32)"></rect>
      <text x="19" y="30" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-weight="900" font-size="13" transform="rotate(-9 23 30)" style="fill:currentColor;stroke:none">K</text>
      <text x="42" y="32" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-weight="900" font-size="14" transform="rotate(8 42 32)" style="fill:currentColor;stroke:none">A</text>
    </svg>`,
  rollbug: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="10" width="24" height="24" rx="6"></rect>
      <circle cx="18" cy="18" r="2.4" style="fill:currentColor;stroke:none"></circle>
      <circle cx="26" cy="26" r="2.4" style="fill:currentColor;stroke:none"></circle>
      <ellipse cx="42" cy="40" rx="14" ry="12"></ellipse>
      <path d="M42 28v24"></path>
      <circle cx="37" cy="38" r="2.2" style="fill:currentColor;stroke:none"></circle>
      <circle cx="48" cy="44" r="2.2" style="fill:currentColor;stroke:none"></circle>
      <path d="M36 30q-3-6-8-8M48 30q3-6 8-8"></path>
    </svg>`,
  gomoku: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="8" width="48" height="48" rx="5"></rect>
      <path d="M8 32h48M32 8v48M18 18l28 28M46 18L18 46" style="opacity:0.4"></path>
      <circle cx="24" cy="24" r="6" style="fill:currentColor;stroke:none"></circle>
      <circle cx="40" cy="40" r="6"></circle>
      <circle cx="40" cy="24" r="6"></circle>
    </svg>`,
  setgame: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="14" width="22" height="14" rx="4"></rect>
      <rect x="34" y="14" width="22" height="14" rx="4"></rect>
      <rect x="21" y="34" width="22" height="14" rx="4"></rect>
      <circle cx="19" cy="21" r="3" style="fill:currentColor;stroke:none"></circle>
      <circle cx="45" cy="21" r="3"></circle>
      <circle cx="32" cy="41" r="3" style="fill:currentColor;stroke:none"></circle>
    </svg>`,
  hearts: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="12" y="12" width="26" height="36" rx="4" transform="rotate(-10 25 30)"></rect>
      <rect x="27" y="16" width="26" height="36" rx="4" transform="rotate(9 40 34)"></rect>
      <path d="M40 44c-7-5-10-9-10-13a5 5 0 0 1 10-1.5A5 5 0 0 1 50 31c0 4-3 8-10 13z" transform="rotate(9 40 34)" style="fill:currentColor;stroke:none"></path>
    </svg>`,
  mancala: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="16" width="48" height="32" rx="14"></rect>
      <ellipse cx="20" cy="32" rx="5.5" ry="8"></ellipse>
      <ellipse cx="44" cy="32" rx="5.5" ry="8"></ellipse>
      <circle cx="32" cy="24" r="4.5"></circle>
      <circle cx="32" cy="40" r="4.5"></circle>
      <circle cx="23" cy="24" r="3" style="fill:currentColor;stroke:none"></circle>
      <circle cx="41" cy="40" r="3" style="fill:currentColor;stroke:none"></circle>
    </svg>`,
  eights: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="12" y="10" width="26" height="38" rx="4" transform="rotate(-9 25 29)"></rect>
      <rect x="27" y="14" width="26" height="38" rx="4" transform="rotate(8 40 33)"></rect>
      <text x="40" y="25" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, monospace" font-weight="900" font-size="15" transform="rotate(8 40 33)" style="fill:currentColor;stroke:none">8</text>
      <path d="M40 47.5c-4.2-3-6-5.4-6-7.8a3 3 0 0 1 6-.9 3 3 0 0 1 6 .9c0 2.4-1.8 4.8-6 7.8z" transform="rotate(8 40 33)" style="fill:currentColor;stroke:none"></path>
    </svg>`,
};

const games = [
  {
    id: "bingo",
    title: "Bingo Card Builder",
    type: "Card maker",
    status: "ready",
    category: "cards",
    href: "/bingo/",
    accent: "#356eb8",
    tilt: "-1.6deg",
    description: "Create printable bingo cards with text or image tiles. Build locally first; sign in only to create share links.",
    features: {
      Mode: "Builder",
      Storage: "Local first, share optional",
      Players: "Any group",
    },
    icon: "bingo",
  },
  {
    id: "yacht",
    title: "Yacht Scorepad",
    type: "Score tracker",
    status: "ready",
    category: "score",
    href: "/yacht/",
    accent: "#c84e4e",
    tilt: "1.4deg",
    description: "Roll five lockable dice against up to three robots at three skill levels, or keep a paper-style scorepad for the table.",
    features: {
      Mode: "Solo vs robots or scorepad",
      Storage: "Local browser",
      Players: "1-8",
    },
    icon: "dice",
  },
  {
    id: "bullsandcows",
    title: "Bulls and Cows",
    type: "Board game",
    status: "ready",
    category: "board",
    href: "/bulls-and-cows/",
    accent: "#6e5cb8",
    tilt: "-0.7deg",
    description: "A Mastermind-style code breaker: duel a robot cracker offline at three strengths, or share a code and race a friend live.",
    features: {
      Mode: "Solo vs robot or live",
      Storage: "Local, or in-memory share code",
      Players: "1-2",
    },
    icon: "bullsandcows",
  },
  {
    id: "boggle",
    title: "Boggle Table",
    type: "Word board",
    status: "ready",
    category: "board",
    href: "/boggle/",
    accent: "#236c5a",
    tilt: "0.8deg",
    description: "Race the clock and a dictionary-solving robot offline, or share a table link and compare lists together at the end.",
    features: {
      Mode: "Solo vs robot or live table",
      Storage: "Local, or in-memory share code",
      Players: "1 or group",
    },
    icon: "letters",
  },
  {
    id: "word-find",
    title: "Word Find",
    type: "Puzzle maker + player",
    status: "ready",
    category: "board",
    href: "/word-find/",
    accent: "#a15a2f",
    tilt: "-1.1deg",
    description: "Build printable word-find puzzles from 14 built-in themes or your own words — then play them on screen, fully offline.",
    features: {
      Mode: "Builder or on-screen play",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "wordfind",
  },
  {
    id: "backgammon",
    title: "Backgammon",
    type: "Board game",
    status: "ready",
    category: "board",
    href: "/backgammon/",
    accent: "#8d5735",
    tilt: "1.2deg",
    description: "The classic race with enforced moves — duel a robot at three strengths offline, share one device locally, or stream a live game over a share code.",
    features: {
      Mode: "Solo vs robot, local, or remote",
      Storage: "Local, or in-memory share code",
      Players: "1-2",
    },
    icon: "backgammon",
  },
  {
    id: "find-em",
    title: "Find 'em",
    type: "Question cards",
    status: "ready",
    category: "cards",
    href: "/find-em/",
    accent: "#c19638",
    tilt: "-0.4deg",
    description: "Draw randomized prompt cards from editable JSON decks for kid-friendly finding and follow-up questions.",
    features: {
      Mode: "Prompt deck",
      Storage: "Static JSON and local browser",
      Players: "Family group",
    },
    icon: "findem",
  },
  {
    id: "whoami",
    title: "Who Am I?",
    type: "Two-player board",
    status: "ready",
    category: "board",
    href: "/whoami/",
    accent: "#c84e3a",
    tilt: "1.6deg",
    description: "Guess the secret character — against a detective robot offline or a friend over a share code. Ask yes/no questions about the procedurally-generated people, cats, and dogs.",
    features: {
      Mode: "Solo vs robot or live",
      Storage: "Local, or in-memory share code",
      Players: "1-2",
    },
    icon: "whoami",
  },
  {
    id: "hangman",
    title: "Hangman",
    type: "Word duel",
    status: "ready",
    category: "board",
    href: "/hangman/",
    accent: "#a82a2a",
    tilt: "-1.3deg",
    description: "Letter-guessing duels against a word-minded robot offline, pass-and-play on one device, or remotely with a share code and an optional table-wide category.",
    features: {
      Mode: "Robot, local, or remote",
      Storage: "Local browser or in-memory share code",
      Players: "1-2",
    },
    icon: "hangman",
  },
  {
    id: "battleship",
    title: "Battleship",
    type: "Fleet duel",
    status: "ready",
    category: "board",
    href: "/battleship/",
    accent: "#173042",
    tilt: "1.1deg",
    description: "Hide a five-ship fleet, then trade salvos — against a robot admiral offline or a friend over a share code. Hits ping on a live radar board and the captain's log calls every shot.",
    features: {
      Mode: "Solo vs robot or remote",
      Storage: "Local, or in-memory share code",
      Players: "1-2",
    },
    icon: "battleship",
  },
  {
    id: "checkers",
    title: "Checkers",
    type: "Draughts board",
    status: "ready",
    category: "board",
    href: "/checkers/",
    accent: "#8a5a34",
    tilt: "-1.2deg",
    description: "Draughts against a searching robot at three strengths, or over a share code — 8×8 classic up to a huge 12×12. Forced captures, chained jumps, crowning.",
    features: {
      Mode: "Solo vs robot or remote",
      Storage: "Local, or in-memory share code",
      Players: "1-2",
    },
    icon: "checkers",
  },
  {
    id: "oracle",
    title: "The Oracle",
    type: "Word visions",
    status: "ready",
    category: "board",
    href: "/oracle/",
    accent: "#3565b8",
    tilt: "0.9deg",
    description: "Codenames-style team play for four: spymasters see the secret key and give one-word clues while operatives guess the visions — and one card hides the assassin.",
    features: {
      Mode: "Two teams of two",
      Storage: "In-memory share code",
      Players: "4",
    },
    icon: "oracle",
  },
  {
    id: "training",
    title: "Training",
    type: "Rail empire",
    status: "ready",
    category: "board",
    href: "/training/",
    accent: "#8a5a34",
    tilt: "-1deg",
    description: "Claim railway lines across a 20-city map with matching train cards, and complete destination tickets before your engines run out. Hand-built map, live board.",
    features: {
      Mode: "Remote duel",
      Storage: "In-memory share code",
      Players: "2",
    },
    icon: "training",
  },
  {
    id: "tools",
    title: "Table Tools",
    type: "Support tools",
    status: "ready",
    category: "tools",
    href: "/tools/",
    accent: "#7b6333",
    tilt: "1deg",
    description: "Run a digital or sand-style timer, roll any mix of dice, draw from a shuffled deck with optional jokers, and settle ties with a coin flip.",
    features: {
      Mode: "Timer, dice, cards, coin",
      Storage: "Local preferences",
      Players: "Flexible",
    },
    icon: "tools",
  },
  {
    id: "g2048",
    title: "2048",
    type: "Tile merge",
    status: "ready",
    category: "solo",
    href: "/2048/",
    accent: "#dfb44e",
    tilt: "-1.4deg",
    description: "Slide tiles, merge matching numbers, and chase the elusive 2048 tile. Swipe or arrow keys, undo, and your best score sticks around.",
    features: {
      Mode: "Solo puzzle",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "g2048",
  },
  {
    id: "word-guess",
    title: "Word Guess",
    type: "Word duel",
    status: "ready",
    category: "solo",
    href: "/word-guess/",
    accent: "#236c5a",
    tilt: "1.2deg",
    description: "Crack the hidden five-letter word in six tries. A fresh daily word, endless practice rounds, hard mode, streak stats, and emoji share grids.",
    features: {
      Mode: "Solo word puzzle",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "wordguess",
  },
  {
    id: "minesweeper",
    title: "Minesweeper",
    type: "Logic classic",
    status: "ready",
    category: "solo",
    href: "/minesweeper/",
    accent: "#6e5cb8",
    tilt: "-0.9deg",
    description: "Read the numbers, flag the bombs, clear the field. Three board sizes, guaranteed-safe first click, chording, and best times to beat.",
    features: {
      Mode: "Solo logic",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "mine",
  },
  {
    id: "sudoku",
    title: "Sudoku",
    type: "Number logic",
    status: "ready",
    category: "solo",
    href: "/sudoku/",
    accent: "#3565b8",
    tilt: "1deg",
    description: "Fill the grid so every row, column, and box holds 1–9. Four difficulties with exactly-one-solution deals, pencil notes, hints, and best times.",
    features: {
      Mode: "Solo puzzle",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "sudoku",
    badge: "New",
  },
  {
    id: "block-drop",
    title: "Block Drop",
    type: "Arcade stacker",
    status: "ready",
    category: "solo",
    href: "/block-drop/",
    accent: "#6e5cb8",
    tilt: "-1.1deg",
    description: "Rotate falling blocks, pack the well, and clear lines before it overflows. Hold pieces, ghost previews, and speeds that climb every ten lines.",
    features: {
      Mode: "Solo arcade",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "blockdrop",
    badge: "New",
  },
  {
    id: "connect-four",
    title: "Connect Four",
    type: "Gravity duel",
    status: "ready",
    category: "board",
    href: "/connect-four/",
    accent: "#3565b8",
    tilt: "0.8deg",
    description: "Drop discs and line up four. Pass-and-play at the table, or take on the robot at three strengths — Hard plays a real minimax search.",
    features: {
      Mode: "Pass-and-play or vs robot",
      Storage: "Local browser",
      Players: "1-2",
    },
    icon: "connect4",
  },
  {
    id: "reversi",
    title: "Reversi",
    type: "Flip duel",
    status: "ready",
    category: "board",
    href: "/reversi/",
    accent: "#1f5c46",
    tilt: "0.9deg",
    description: "Outflank your way to a disc majority on the classic 8×8 board. Pass-and-play, or take on three robot strengths — the hard one searches real move trees.",
    features: {
      Mode: "Pass-and-play or vs robot",
      Storage: "Local browser",
      Players: "1-2",
    },
    icon: "reversi",
    badge: "New",
  },
  {
    id: "memory",
    title: "Memory Match",
    type: "Pair hunt",
    status: "ready",
    category: "cards",
    href: "/memory/",
    accent: "#c8792f",
    tilt: "-1.1deg",
    description: "Flip cards two at a time and collect pairs — animals, food, or space themes, three board sizes, and up to four players around one device.",
    features: {
      Mode: "Pass-and-play or solo",
      Storage: "Local browser",
      Players: "1-4",
    },
    icon: "memory",
  },
  {
    id: "solitaire",
    title: "Solitaire",
    type: "Card classic",
    status: "ready",
    category: "cards",
    href: "/solitaire/",
    accent: "#2f8c5a",
    tilt: "-0.9deg",
    description: "Klondike with drag-and-drop or tap-to-move, draw-1 or draw-3, unlimited undo, auto-finish, and a winning cascade. Best times get remembered.",
    features: {
      Mode: "Solo cards",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "solitaire",
    badge: "New",
  },
  {
    id: "blackjack",
    title: "Blackjack",
    type: "Card duel",
    status: "ready",
    category: "cards",
    href: "/blackjack/",
    accent: "#8a2f2f",
    tilt: "1.2deg",
    description: "Bet chips, hit, stand, double, and split pairs against the dealer on a six-deck shoe. Blackjack pays 3:2 and your bank survives between visits.",
    features: {
      Mode: "Solo vs dealer",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "blackjack",
    badge: "New",
  },
  {
    id: "chess",
    title: "Chess",
    type: "The classic duel",
    status: "ready",
    category: "board",
    href: "/chess/",
    accent: "#5d4632",
    tilt: "-1.1deg",
    description: "Full-rules chess with castling, en passant, and promotion. Pass-and-play on one device or take on three robots — Master searches real move trees. SAN move list, undo, captured trays.",
    features: {
      Mode: "Pass-and-play or vs robot",
      Storage: "Local browser",
      Players: "1-2",
    },
    icon: "chess",
    badge: "New",
  },
  {
    id: "gem-crush",
    title: "Gem Crush",
    type: "Match-3",
    status: "ready",
    category: "solo",
    href: "/gem-crush/",
    accent: "#8a4a8c",
    tilt: "1deg",
    description: "Swap gems, trigger cascades, and crush level goals. Match four for striped blasts, L-shapes for bombs, fives for rainbows — chains multiply your score.",
    features: {
      Mode: "Solo puzzle",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "gemcrush",
    badge: "New",
  },
  {
    id: "melon-drop",
    title: "Melon Drop",
    type: "Physics merger",
    status: "ready",
    category: "solo",
    href: "/melon-drop/",
    accent: "#df7e4e",
    tilt: "-0.9deg",
    description: "Drop fruit into the jar — two alike merge into the next size up. Build the mighty watermelon without overflowing the jar. Suika-style physics, real rolling.",
    features: {
      Mode: "Solo arcade",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "melon",
    badge: "New",
  },
  {
    id: "breakout",
    title: "Breakout",
    type: "Brick smasher",
    status: "ready",
    category: "solo",
    href: "/breakout/",
    accent: "#354065",
    tilt: "1.1deg",
    description: "Bounce the ball, demolish the wall, and catch falling power-ups — wide paddle, multiball, slow-mo, extra lives. Walls get tougher every level.",
    features: {
      Mode: "Solo arcade",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "breakout",
    badge: "New",
  },
  {
    id: "mahjong",
    title: "Mahjong",
    type: "Tile matching",
    status: "ready",
    category: "solo",
    href: "/mahjong/",
    accent: "#2f5c47",
    tilt: "-1deg",
    description: "Dismantle a three-layer tower of 144 tiles by matching free pairs. Flowers match any flower, seasons any season. Hints, undo, and reshuffles keep every deal winnable.",
    features: {
      Mode: "Solo puzzle",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "mahjong",
    badge: "New",
  },
  {
    id: "nonogram",
    title: "Nonogram",
    type: "Picture logic",
    status: "ready",
    category: "solo",
    href: "/nonogram/",
    accent: "#3565b8",
    tilt: "0.9deg",
    description: "Paint cells using the row and column number clues to reveal a hidden picture. Every deal is machine-verified to have exactly one logical solution, from 5×5 up to 15×15.",
    features: {
      Mode: "Solo puzzle",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "nonogram",
    badge: "New",
  },
  {
    id: "sokoban",
    title: "Sokoban",
    type: "Warehouse keeper",
    status: "ready",
    category: "solo",
    href: "/sokoban/",
    accent: "#8a5735",
    tilt: "-1.2deg",
    description: "Push every crate onto a target — crates never pull, so corners are forever. Ten handcrafted levels (all machine-verified solvable), full undo, and best-push records.",
    features: {
      Mode: "Solo puzzle",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "sokoban",
    badge: "New",
  },
  {
    id: "dominoes",
    title: "Dominoes",
    type: "Tile blocking",
    status: "ready",
    category: "board",
    href: "/dominoes/",
    accent: "#245c48",
    tilt: "-1.1deg",
    description: "The classic blocking game on a double-six set against up to three robots. Match the open ends, draw when stuck, go out first — or win the block with the lightest hand.",
    features: {
      Mode: "Solo vs robots",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "dominoes",
    badge: "New",
  },
  {
    id: "video-poker",
    title: "Video Poker",
    type: "Casino draw",
    status: "ready",
    category: "cards",
    href: "/video-poker/",
    accent: "#8a2f2f",
    tilt: "1deg",
    description: "Jacks-or-better five-card draw on a persistent bank: bet, hold, draw, and chase the 250x royal flush. Cash out anytime — profit converts straight into hub chips.",
    features: {
      Mode: "Solo vs house",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "videopoker",
    badge: "New",
  },
  {
    id: "roll-bug",
    title: "Roll-a-Bug",
    type: "Roll & draw party",
    status: "ready",
    category: "solo",
    href: "/roll-bug/",
    accent: "#c0392b",
    tilt: "0.8deg",
    description: "The schoolyard classic: roll the die for body, head, spots, wings, antennae, or feet, then hand-draw that part on your own canvas. Whoever finishes their bug first wins — then the gallery compares everyone's art. Optional proper-bug order and roll-streak challenges.",
    features: {
      Mode: "Pass-and-play, 1-8",
      Storage: "Local browser",
      Players: "1-8",
    },
    icon: "rollbug",
    badge: "New",
  },
  {
    id: "gomoku",
    title: "Gomoku",
    type: "Five in a row",
    status: "ready",
    category: "board",
    href: "/gomoku/",
    accent: "#5d4a26",
    tilt: "-0.9deg",
    description: "Line up five stones on a 15x15 board before the robot lines up its own. Easy plays loose; Sharp takes immediate wins, blocks yours, and scores every open three on the board.",
    features: {
      Mode: "Solo vs robot",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "gomoku",
    badge: "New",
  },
  {
    id: "set",
    title: "Set",
    type: "Pattern speed",
    status: "ready",
    category: "solo",
    href: "/set/",
    accent: "#7b4fa6",
    tilt: "1deg",
    description: "Eighty-one cards, four attributes each. Play solo, or share a table where the first to smash SET! gets five seconds to point out their find — miss it and you sit out.",
    features: {
      Mode: "Solo or live table",
      Storage: "Local, or in-memory table",
      Players: "1-6",
    },
    icon: "setgame",
    badge: "New",
  },
  {
    id: "hearts",
    title: "Hearts",
    type: "Trick evasion",
    status: "ready",
    category: "cards",
    href: "/hearts/",
    accent: "#8a2f3f",
    tilt: "-1deg",
    description: "The classic trick-taker against three robots: follow suit, duck every winner, and stay far away from hearts and the queen of spades. Win by having the lowest score when someone crosses 100 — or take all 26 points and shoot the moon.",
    features: {
      Mode: "Solo vs robots",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "hearts",
    badge: "New",
  },
  {
    id: "mancala",
    title: "Mancala",
    type: "Seed sowing",
    status: "ready",
    category: "board",
    href: "/mancala/",
    accent: "#7a5c3a",
    tilt: "0.8deg",
    description: "The ancient counting game on a wooden board: sow seeds pit to pit, land in your store for an extra turn, capture whole pits with a careful last drop. Two robot strengths.",
    features: {
      Mode: "Solo vs robot",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "mancala",
    badge: "New",
  },
  {
    id: "crazy-eights",
    title: "Eights",
    type: "Shedding cards",
    status: "ready",
    category: "cards",
    href: "/crazy-eights/",
    accent: "#1e5c46",
    tilt: "1.1deg",
    description: "The classic shedding game against up to three robots: match the suit or rank, eights are wild and name the next suit, and emptying your hand first wins the table.",
    features: {
      Mode: "Solo vs robots",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "eights",
    badge: "New",
  },
  {
    id: "snake",
    title: "Snake",
    type: "Arcade",
    status: "ready",
    category: "solo",
    href: "/snake/",
    accent: "#2f8c5a",
    tilt: "1.3deg",
    description: "Steer the snake, munch apples, and don't crash your own tail. Three speeds from Chill to Blitz, with your high score on permanent display.",
    features: {
      Mode: "Solo arcade",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "snake",
  },
  {
    id: "simon",
    title: "Simon Says",
    type: "Pattern memory",
    status: "ready",
    category: "solo",
    href: "/simon/",
    accent: "#8a4a8c",
    tilt: "-1deg",
    description: "Watch the pattern light up, then play it back from memory. Each level adds a step — how far can your brain stretch before the buzz?",
    features: {
      Mode: "Solo memory",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "simon",
  },
  {
    id: "sliding-puzzle",
    title: "Sliding Puzzle",
    type: "Classic shuffle",
    status: "ready",
    category: "solo",
    href: "/sliding-puzzle/",
    accent: "#6e5cb8",
    tilt: "1.1deg",
    description: "Unscramble the classic 15-puzzle — always-shuffled-solvable boards from 3×3 up to 5×5, a move counter, timer, and personal bests to chase.",
    features: {
      Mode: "Solo puzzle",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "sliding",
  },
  {
    id: "dots-and-boxes",
    title: "Dots and Boxes",
    type: "Pen-and-paper duel",
    status: "ready",
    category: "board",
    href: "/dots-and-boxes/",
    accent: "#3565b8",
    tilt: "-0.8deg",
    description: "Draw lines between dots, close boxes to score them and keep your turn — just like the paper classic, against a friend or a box-hungry robot.",
    features: {
      Mode: "Pass-and-play or vs robot",
      Storage: "In-browser, no storage needed",
      Players: "1-2",
    },
    icon: "dots",
  },
  {
    id: "lights-out",
    title: "Lights Out",
    type: "Toggle puzzle",
    status: "ready",
    category: "solo",
    href: "/lights-out/",
    accent: "#c07a2a",
    tilt: "1deg",
    description: "Tap a cell and it flips itself plus its four neighbors. Every deal is built from random taps, so it's always solvable — how few moves do you need?",
    features: {
      Mode: "Solo puzzle",
      Storage: "Local browser",
      Players: "1",
    },
    icon: "lights",
  },
];

const state = {
  selectedId: "g2048",
  filter: "all",
  search: "",
  pinned: new Set(),
  lastPlayed: {},
  lastPlayedAt: {},
};

const els = {
  gameStack: document.querySelector("#gameStack"),
  selectedArt: document.querySelector("#selectedArt"),
  selectedType: document.querySelector("#selectedType"),
  selectedTitle: document.querySelector("#selectedTitle"),
  selectedDescription: document.querySelector("#selectedDescription"),
  featureList: document.querySelector("#featureList"),
  launchGame: document.querySelector("#launchGame"),
  markFavorite: document.querySelector("#markFavorite"),
  gameStatus: document.querySelector("#gameStatus"),
  lastPlayed: document.querySelector("#lastPlayed"),
  resetHub: document.querySelector("#resetHub"),
  filters: document.querySelectorAll(".filter-pill"),
  search: document.querySelector("#searchGames"),
  surprise: document.querySelector("#surpriseGame"),
  profileChip: document.querySelector("#profileChip"),
  profileAvatar: document.querySelector("#profileAvatar"),
  profileName: document.querySelector("#profileName"),
  profileLevel: document.querySelector("#profileLevel"),
  profileBarFill: document.querySelector("#profileBarFill"),
  profileOverlay: document.querySelector("#profileOverlay"),
  editAvatar: document.querySelector("#editAvatar"),
  editName: document.querySelector("#editName"),
  avatarRow: document.querySelector("#avatarRow"),
  statChips: document.querySelector("#statChips"),
  statRank: document.querySelector("#statRank"),
  statPlays: document.querySelector("#statPlays"),
  statNext: document.querySelector("#statNext"),
  bestsList: document.querySelector("#bestsList"),
  achievementCount: document.querySelector("#achievementCount"),
  achievementGrid: document.querySelector("#achievementGrid"),
  saveProfile: document.querySelector("#saveProfile"),
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    state.selectedId = saved.selectedId || state.selectedId;
    state.filter = saved.filter || state.filter;
    state.search = saved.search || "";
    state.pinned = new Set(saved.pinned || []);
    state.lastPlayed = saved.lastPlayed || {};
    state.lastPlayedAt = saved.lastPlayedAt || {};
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      selectedId: state.selectedId,
      filter: state.filter,
      search: state.search,
      pinned: [...state.pinned],
      lastPlayed: state.lastPlayed,
      lastPlayedAt: state.lastPlayedAt,
    })
  );
}

function selectedGame() {
  return games.find((game) => game.id === state.selectedId) || games[0];
}

function statusLabel(status) {
  return status === "ready" ? "Ready locally" : "On the table";
}

function matchesFilter(game) {
  if (state.filter !== "all" && state.filter !== "ready") {
    const categoryMatch = state.filter === "solo"
      ? isSoloFriendly(game)
      : game.category === state.filter;
    if (!categoryMatch) return false;
  }
  if (!state.search) return true;
  const haystack = `${game.title} ${game.type} ${game.description}`.toLowerCase();
  return state.search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

function isSoloFriendly(game) {
  return game.category === "solo" || /Solo|robot/i.test(`${game.features.Mode} ${game.type}`);
}

function renderCards() {
  els.gameStack.innerHTML = "";
  const daily = window.GameHubDaily ? GameHubDaily.today() : null;
  const sorted = [...games].sort((first, second) => {
    const firstPinned = state.pinned.has(first.id) ? -1 : 0;
    const secondPinned = state.pinned.has(second.id) ? -1 : 0;
    return firstPinned - secondPinned;
  });

  const visible = sorted.filter(matchesFilter);
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = state.search
      ? `No games match “${state.search}”.`
      : "No games in this shelf yet.";
    els.gameStack.append(empty);
    return;
  }

  sorted.forEach((game) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "game-card";
    card.style.setProperty("--tilt", game.tilt);
    card.style.setProperty("--accent", game.accent);
    card.dataset.gameId = game.id;
    if (!matchesFilter(game)) card.classList.add("is-hidden");
    if (game.id === state.selectedId) card.classList.add("is-selected");

    card.innerHTML = `
      <header>
        <div>
          <p class="kicker">${game.type}</p>
          <h3>${game.title}</h3>
        </div>
        <div class="game-art">${icons[game.icon]}</div>
      </header>
      <p>${game.description}</p>
      <div class="card-meta">
        <span class="chip ${game.status}">${statusLabel(game.status)}</span>
        <span class="chip">${state.pinned.has(game.id) ? "Pinned" : game.features.Mode}</span>
        ${daily && daily.type === "featured" && daily.gameId === game.id && !daily.completed ? `<span class="chip badge-daily">🔥 Daily</span>` : ""}
        ${game.badge ? `<span class="chip badge-new">${game.badge}</span>` : ""}
      </div>
    `;

    card.addEventListener("click", () => {
      state.selectedId = game.id;
      saveState();
      render();
    });

    els.gameStack.append(card);
  });
}

function renderSelected() {
  const game = selectedGame();
  els.selectedArt.style.color = game.accent;
  els.selectedArt.innerHTML = icons[game.icon];
  els.selectedType.textContent = game.type;
  els.selectedTitle.textContent = game.title;
  els.selectedDescription.textContent = game.description;
  els.gameStatus.textContent = statusLabel(game.status);
  els.lastPlayed.textContent = state.lastPlayed[game.id] ? `Last opened ${state.lastPlayed[game.id]}` : "No recent launch";
  els.markFavorite.classList.toggle("is-pinned", state.pinned.has(game.id));
  els.markFavorite.querySelector("span").textContent = state.pinned.has(game.id) ? "Pinned" : "Pin";

  els.featureList.innerHTML = "";
  Object.entries(game.features).forEach(([label, value]) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    els.featureList.append(term, detail);
  });

  renderGameAchievements(game);

  if (game.href) {
    els.launchGame.href = game.href;
    els.launchGame.removeAttribute("aria-disabled");
    els.launchGame.querySelector("span").textContent = "Open";
  } else {
    els.launchGame.href = "#";
    els.launchGame.setAttribute("aria-disabled", "true");
    els.launchGame.querySelector("span").textContent = "Planned";
  }
}

function renderGameAchievements(game) {
  const wrap = document.querySelector("#gameAchievements");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (!window.GameHubProfile || !GameHubProfile.achievements) return;
  const related = GameHubProfile.achievements().filter((a) => a.game === game.id);
  if (!related.length) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  related.forEach((achievement) => {
    const chip = document.createElement("span");
    chip.className = achievement.unlockedAt ? "game-achieve is-unlocked" : "game-achieve";
    chip.title = achievement.description;
    chip.textContent = `${achievement.unlockedAt ? achievement.icon : "🔒"} ${achievement.title}`;
    wrap.append(chip);
  });
}

function renderJumpBack() {
  const section = document.querySelector("#jumpBack");
  const row = document.querySelector("#jumpRow");
  if (!section || !row) return;
  const recent = Object.entries(state.lastPlayedAt)
    .filter(([id]) => games.some((game) => game.id === id))
    .sort((a, b) => (b[1] > a[1] ? 1 : -1))
    .slice(0, 4);
  if (!recent.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  row.innerHTML = "";
  recent.forEach(([id]) => {
    const game = games.find((entry) => entry.id === id);
    const link = document.createElement("a");
    link.className = "jump-card";
    link.href = game.href;
    link.style.setProperty("--accent", game.accent);
    link.innerHTML = `
      <span class="jump-art">${icons[game.icon]}</span>
      <span class="jump-name">${game.title}</span>
      <span class="jump-when">${state.lastPlayed[id] || ""}</span>
    `;
    link.addEventListener("click", () => {
      state.lastPlayed[id] = state.lastPlayed[id];
      state.selectedId = id;
      saveState();
    });
    row.append(link);
  });
}

function bindSoundToggle() {
  const button = document.querySelector("#soundToggle");
  if (!button || !window.GameHubJuice) return;
  const update = () => {
    const waves = button.querySelector(".sound-waves");
    const off = button.querySelector(".sound-off");
    if (waves && off) {
      waves.style.display = GameHubJuice.muted ? "none" : "";
      off.style.display = GameHubJuice.muted ? "" : "none";
    }
  };
  button.addEventListener("click", () => {
    GameHubJuice.muted = !GameHubJuice.muted;
    update();
    GameHubJuice.tick();
  });
  window.addEventListener("gamehub-juice", update);
  update();
}

function renderFilters() {
  els.filters.forEach((filter) => {
    filter.classList.toggle("is-active", filter.dataset.filter === state.filter);
  });
}

function render() {
  renderCards();
  renderSelected();
  renderFilters();
}

const GAME_TITLES = Object.fromEntries(games.map((game) => [game.id, game.title]));

function renderProfile() {
  if (!window.GameHubProfile) return;
  const profile = GameHubProfile.get();
  const progress = GameHubProfile.levelProgress();
  const levelValue = GameHubProfile.level();
  els.profileAvatar.textContent = profile.avatar;
  els.profileName.textContent = profile.name || "Player";
  els.profileLevel.textContent = `Level ${levelValue} · ${profile.xp} chip${profile.xp === 1 ? "" : "s"}`;
  els.profileBarFill.style.width = `${(progress.into / progress.step) * 100}%`;
}

function openProfileEditor() {
  const profile = GameHubProfile.get();
  els.editAvatar.textContent = profile.avatar;
  els.editName.value = profile.name;
  els.statChips.textContent = profile.xp;
  els.statRank.textContent = GameHubProfile.rank();
  els.statPlays.textContent = profile.plays;
  els.statNext.textContent = GameHubProfile.levelProgress().next;
  if (window.GameHubDaily) {
    const streak = GameHubDaily.streak();
    document.querySelector("#statStreak").textContent = `${streak.current} days · best ${streak.best}`;
    document.querySelector("#statDailies").textContent = String(Object.keys(profile.dailyDone || {}).length);
  }
  els.avatarRow.innerHTML = "";
  GameHubProfile.AVATARS.forEach((emoji) => {
    const choice = document.createElement("button");
    choice.type = "button";
    choice.className = "profile-avatar-choice";
    choice.textContent = emoji;
    if (emoji === profile.avatar) choice.classList.add("is-active");
    choice.addEventListener("click", () => {
      els.editAvatar.textContent = emoji;
      els.avatarRow.querySelectorAll(".is-active").forEach((el) => el.classList.remove("is-active"));
      choice.classList.add("is-active");
    });
    els.avatarRow.append(choice);
  });
  els.bestsList.innerHTML = "";
  const bestEntries = Object.entries(profile.bests);
  if (!bestEntries.length) {
    const empty = document.createElement("li");
    empty.textContent = "Play something to set your first best!";
    els.bestsList.append(empty);
  }
  bestEntries
    .sort((a, b) => b[1].value - a[1].value)
    .forEach(([gameId, best]) => {
      const item = document.createElement("li");
      const title = document.createElement("span");
      title.textContent = GAME_TITLES[gameId] || gameId;
      const value = document.createElement("b");
      value.textContent = String(best.value);
      item.append(title, value);
      els.bestsList.append(item);
    });

  if (window.GameHubProfile && GameHubProfile.achievements) {
    const achievements = GameHubProfile.achievements();
    const unlocked = achievements.filter((a) => a.unlockedAt).length;
    els.achievementCount.textContent = `${unlocked} / ${achievements.length}`;
    els.achievementGrid.innerHTML = "";
    achievements.forEach((achievement) => {
      const cell = document.createElement("div");
      cell.className = achievement.unlockedAt ? "achievement-cell is-unlocked" : "achievement-cell";
      cell.title = achievement.unlockedAt
        ? `${achievement.title} — ${achievement.description}`
        : `${achievement.description}`;
      const icon = document.createElement("span");
      icon.className = "achievement-icon";
      icon.textContent = achievement.unlockedAt ? achievement.icon : "🔒";
      const name = document.createElement("span");
      name.className = "achievement-name";
      name.textContent = achievement.title;
      cell.append(icon, name);
      els.achievementGrid.append(cell);
    });
  }
  els.profileOverlay.hidden = false;
}

function bindProfile() {
  if (!window.GameHubProfile) return;
  els.profileChip.addEventListener("click", openProfileEditor);
  window.addEventListener("gamehub-profile", renderProfile);
  els.saveProfile.addEventListener("click", () => {
    GameHubProfile.setIdentity({ name: els.editName.value.trim(), avatar: els.editAvatar.textContent });
    renderProfile();
    els.profileOverlay.hidden = true;
  });
  els.profileOverlay.addEventListener("click", (event) => {
    if (event.target === els.profileOverlay) els.profileOverlay.hidden = true;
  });
  renderProfile();
}

function renderDaily() {
  if (!window.GameHubDaily) return;
  const daily = GameHubDaily.today();
  const card = document.querySelector("#dailyCard");
  if (!card) return;
  card.classList.toggle("is-done", daily.completed);
  document.querySelector("#dailyTitle").textContent = daily.completed
    ? `✅ ${daily.title} — done!`
    : daily.title;
  document.querySelector("#dailyDesc").textContent = `${daily.description} Worth +${daily.bonus} chips.`;
  document.querySelector("#dailyBarFill").style.width = `${Math.min(100, (daily.progress / daily.target) * 100)}%`;
  document.querySelector("#dailyCount").textContent = daily.completed
    ? "Complete"
    : `${daily.progress} / ${daily.target}`;

  const streak = GameHubDaily.streak();
  document.querySelector("#dailyStreak").textContent = `🔥 ${streak.current}-day streak · best ${streak.best}`;

  const dots = document.querySelector("#dailyDots");
  dots.innerHTML = "";
  GameHubDaily.history(7).forEach((day, index) => {
    const dot = document.createElement("span");
    dot.className = "daily-dot";
    if (day.done) dot.classList.add("is-done");
    if (index === 6) dot.classList.add("is-today");
    dot.title = day.dateKey;
    dots.append(dot);
  });

  const play = document.querySelector("#dailyPlay");
  if (daily.completed) {
    play.querySelector("span").textContent = "Play more";
    play.href = "/#all-games";
  } else if (daily.type === "featured" && daily.gameId) {
    const game = games.find((entry) => entry.id === daily.gameId);
    play.querySelector("span").textContent = `Play ${game ? game.title : "now"}`;
    play.href = game ? game.href : "/#all-games";
  } else {
    play.querySelector("span").textContent = "Pick a game 🎲";
    play.href = "#";
    play.onclick = (event) => {
      event.preventDefault();
      els.surprise.click();
    };
  }
}

function bindEvents() {
  els.filters.forEach((filter) => {
    filter.addEventListener("click", () => {
      state.filter = filter.dataset.filter;
      const visibleSelected = matchesFilter(selectedGame());
      if (!visibleSelected) {
        const next = games.find(matchesFilter);
        if (next) state.selectedId = next.id;
      }
      saveState();
      render();
    });
  });

  els.markFavorite.addEventListener("click", () => {
    const game = selectedGame();
    if (state.pinned.has(game.id)) state.pinned.delete(game.id);
    else state.pinned.add(game.id);
    saveState();
    render();
  });

  els.launchGame.addEventListener("click", (event) => {
    const game = selectedGame();
    if (!game.href) {
      event.preventDefault();
      return;
    }
    state.lastPlayed[game.id] = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date());
    state.lastPlayedAt[game.id] = new Date().toISOString();
    saveState();
  });

  els.search.addEventListener("input", () => {
    state.search = els.search.value.trim();
    const visibleSelected = matchesFilter(selectedGame());
    if (!visibleSelected) {
      const next = games.find(matchesFilter);
      if (next) state.selectedId = next.id;
    }
    saveState();
    renderCards();
  });

  els.surprise.addEventListener("click", () => {
    const visible = games.filter(matchesFilter);
    const pool = visible.length ? visible : games;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    state.selectedId = pick.id;
    if (!matchesFilter(pick)) {
      state.filter = "all";
      state.search = "";
      els.search.value = "";
    }
    saveState();
    render();
    pick.id && els.gameStack.querySelector(`[data-game-id="${pick.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });

  els.resetHub.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    state.selectedId = "g2048";
    state.filter = "all";
    state.search = "";
    els.search.value = "";
    state.pinned = new Set();
    state.lastPlayed = {};
    render();
  });
}

loadState();
els.search.value = state.search;
bindEvents();
bindProfile();
bindOffline();
bindSoundToggle();
render();
renderDaily();
renderJumpBack();
window.addEventListener("gamehub-profile", renderDaily);
window.addEventListener("gamehub-profile", renderJumpBack);

function bindOffline() {
  const pill = document.querySelector("#offlinePill");
  if (!pill) return;
  const update = () => {
    pill.hidden = navigator.onLine;
  };
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

// Cache the whole hub for offline play (airplane mode on a tablet).
// Needs a secure context: localhost, or HTTPS via the optional SSL env vars.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
