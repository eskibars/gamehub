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
      <path d="M32 30c2.8-5.1 10.2-5.1 13 0-2.8 5.1-10.2 5.1-13 0z"></path>
      <circle cx="38.5" cy="30" r="2"></circle>
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
      <path d="M17 23l2-8 2 8M18 20h2"></path>
      <path d="M42 16h4a3 3 0 0 1 0 6h-4V16zM42 22h5"></path>
      <path d="M23 42a5 5 0 1 0 0 6"></path>
      <path d="M43 42v10h3a5 5 0 0 0 0-10h-3z"></path>
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
      <path d="M18 27c0-7 6-13 14-13s14 6 14 13"></path>
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
      <text x="48" y="20" font-family="ui-monospace, monospace" font-weight="900" font-size="9">A</text>
      <text x="54" y="20" font-family="ui-monospace, monospace" font-weight="900" font-size="9">_</text>
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
      <text x="16" y="20" font-family="ui-monospace, monospace" font-weight="900" font-size="10">2</text>
      <text x="49" y="36" font-family="ui-monospace, monospace" font-weight="900" font-size="10">4</text>
      <text x="49" y="52" font-family="ui-monospace, monospace" font-weight="900" font-size="10">8</text>
    </svg>`,
  wordguess: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="14" width="20" height="20" rx="4"></rect>
      <rect x="36" y="14" width="20" height="20" rx="4"></rect>
      <rect x="8" y="36" width="20" height="20" rx="4"></rect>
      <rect x="36" y="36" width="20" height="20" rx="4"></rect>
      <text x="13" y="29" font-family="ui-monospace, monospace" font-weight="900" font-size="13" style="fill:currentColor;stroke:none">W</text>
      <text x="41" y="29" font-family="ui-monospace, monospace" font-weight="900" font-size="13" style="fill:currentColor;stroke:none">O</text>
      <text x="13" y="51" font-family="ui-monospace, monospace" font-weight="900" font-size="13" style="fill:currentColor;stroke:none">R</text>
      <text x="41" y="51" font-family="ui-monospace, monospace" font-weight="900" font-size="13" style="fill:currentColor;stroke:none">D</text>
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
      <circle cx="41" cy="34" r="6"></circle>
      <path d="M19 27l3 8M30 55h4" transform="rotate(-8 22 29)"></path>
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
    description: "Track scores for players, or roll five lockable dice and fill legal category scores, in a Yahtzee!-like game.",
    features: {
      Mode: "Scorepad or dice",
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
    description: "A Mastermind-style code breaker with anonymous share codes and live server-sent updates.",
    features: {
      Mode: "Live code guessing",
      Storage: "In-memory share code",
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
    description: "Create a live word board, share a table link, ready up, race the timer, and compare lists together.",
    features: {
      Mode: "Live word hunt",
      Storage: "In-memory share code",
      Players: "Group table",
    },
    icon: "letters",
  },
  {
    id: "word-find",
    title: "Word Find Creator",
    type: "Puzzle maker",
    status: "ready",
    category: "board",
    href: "/word-find/",
    accent: "#a15a2f",
    tilt: "-1.1deg",
    description: "Build printable word-find puzzles from your own word list with overlapping hidden words in every direction.",
    features: {
      Mode: "Puzzle builder",
      Storage: "Local browser",
      Players: "Print or solve",
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
    description: "Play locally with enforced moves and automated turns, or create a live sharing code with streamed dice and moves.",
    features: {
      Mode: "Local or remote",
      Storage: "In-memory share code",
      Players: "2",
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
    description: "Guess the secret character your opponent picked. Both players share a board of procedurally-generated people, cats, and dogs, then ask yes/no questions to narrow it down.",
    features: {
      Mode: "Live character guessing",
      Storage: "In-memory share code",
      Players: "2",
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
    description: "Pass-and-play letter guessing. Type a word, hand the device, and watch the gallows fill in — or play remotely with a share code and an optional category that sticks for the whole table.",
    features: {
      Mode: "Local or remote",
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
    description: "Hide a five-ship fleet, then trade salvos over a share code. Hits ping on a live radar board, sunk ships surface where they lie, and the captain's log calls every shot.",
    features: {
      Mode: "Remote duel",
      Storage: "In-memory share code",
      Players: "2",
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
    description: "Draughts over a share code on the board width you pick — 8×8 classic, 10×10, or a huge 12×12. Forced captures, chained jumps, crowning, and colors that swap on rematch.",
    features: {
      Mode: "Remote duel",
      Storage: "In-memory share code",
      Players: "2",
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
];

const state = {
  selectedId: "g2048",
  filter: "all",
  search: "",
  pinned: new Set(),
  lastPlayed: {},
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
render();

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
