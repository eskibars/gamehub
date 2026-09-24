# Local First Game Hub

A small tabletop-style launcher for local-first game tools. The app uses one
Python/Flask stack and keeps play usable without login wherever possible.

## Run the hub

```sh
pip install -r requirements.txt
cp .env.example .env   # then edit values for this machine
python3 app.py
```

Then open `http://127.0.0.1:25001`.

## Configuration

Configuration comes from the environment; `.env` is loaded automatically via
python-dotenv. See `.env.example` for the full list with comments.

| Variable | Default | Purpose |
| --- | --- | --- |
| `FLASK_SECRET_KEY` | random per process | Signs sessions and Bulls and Cows share tokens. Set a stable value so share links survive restarts. |
| `HOST` / `PORT` | `127.0.0.1` / `25001` | Bind address for the dev server. |
| `FLASK_DEBUG` | `0` | `1` enables the Werkzeug debugger and auto-reloader (development only). |
| `BINGO_MAX_USER_BYTES` | `5242880` | Per-user cap on stored bingo cards. |
| `GAME_TTL_SECONDS` | `21600` | Idle remote games are swept from memory after this long; `0` disables sweeping. |
| `GAME_SWEEP_INTERVAL_SECONDS` | `300` | How often the TTL sweeper runs. |
| `LOG_LEVEL` | `INFO` | Python logging threshold. |

## Operations notes

- The hub is **single-process by design**: remote game state and SSE
  subscriber queues live in one process's memory, so run exactly one worker.
  Scale by memory limits, not replicas.
- Swept games emit a terminal `closed` SSE event before removal so connected
  clients can stop listening; requests for a swept (or restarted) game 404 as
  before. `GET /healthz` reports active game counts for monitoring.
- If you front the server with a proxy, disable response buffering for the
  `/api/*/games/*/events` endpoints so server-sent events stream through.

The ready tools are Bingo Card Builder, Color Guesser, Yahtzee Scorepad,
Boggle Table, Word Find Creator, Backgammon, Find 'em, Table Tools,
Who Am I? — a Guess Who-style character guessing game, Hangman,
Battleship, Checkers, The Oracle, Training, plus a solo/arcade shelf:
2048, Word Guess, Minesweeper, Connect Four, Memory Match, Snake,
Simon Says, Sliding Puzzle, and Dots and Boxes.

## Player profile

A shared identity spans the solo/arcade games: pick an avatar and name on
the hub (profile chip in the header), then earn **chips** every time you
finish a round — 2048 scores, Snake apples, Simon levels, Minesweeper
clears, robot victories, and so on. Chips buy levels and ranks (Newcomer
up to Hall of Famer), the hub header shows a live level bar, and the
player card keeps per-game personal bests. Everything lives in
`localStorage` via `shared/profile.js`; games integrate with a single
`GameHubProfile.award(...)` call, and the hub degrades gracefully when a
game skips it.

## Local-first storage

Bingo stores drafts in the browser and only requires sign-in when creating
share links or saving cards to server storage. Server storage is capped per
user with `BINGO_MAX_USER_BYTES`.

Color Guesser uses anonymous token links. A game creator sets the colors, peg
count, and round count; the hidden code is generated automatically. The shared
URL carries an opaque token that can recreate the game setup without login,
while live guesses flow over server-sent events while the Flask server is
running.

Yahtzee Scorepad stores its current game in browser storage. It can run as a
manual scorecard for players bringing their own dice, or as a dice roller with
lockable dice and suggested category scores.

Table Tools stores timer, dice, and deck preferences in browser storage. It
includes digital and sand-style countdown timers with custom durations, a dice
roller with configurable dice count, sides, modifier, and roll history, a card
draw that pulls from a shuffled 52-card deck (optional jokers) with a draw
history, and a coin flip with a running tally.

Find 'em loads kid-friendly prompt cards from `find_em/static/cards.json`,
randomizes the selected deck in the browser, and keeps the game shell available
offline after the first visit.

Who Am I? is a remote-by-default Guess Who clone. A share code spins up a
flask-side game that only stores the random seed, the player's secret
character index, and a small chat log. Both clients regenerate the same
24-character pool (a mix of people, cats, and dogs) from the seed, so the
server never ships the portraits themselves. Boards are dealt from shuffled
quota lists so every game gets a good spread of species, hair colors, hats,
glasses, and expressions. A character gallery for tuning the portrait
generator lives at `/whoami/characters.html?seed=N`.

Hangman runs locally on a single device for pass-and-play, or on two
devices with a share code. The picker types a word, the guesser reveals
letters one at a time, and the picker rotates after every round. An
optional category entered at the table shows for the rest of that
session. The server only keeps the share code, player names, current
round state, and a short history — it never persists the secret word
between rounds, and the word is hidden from the guesser until the round
ends.

Battleship is a remote two-player fleet duel over a share code. Each
admiral places a five-ship fleet privately, then shots alternate one per
turn. The server keeps both fleets in memory but every API view only
exposes a player's own ships plus the public shot record — sunk enemy
ships surface cell by cell, and full fleets are revealed only after the
game ends. A short captain's log records each salvo, and the loser of a
round fires first in the rematch.

Checkers is a remote two-player draughts game where the creator picks the
board width — 8×8, 10×10, or 12×12 — which also sets the starting rows
(3, 4, or 5 rows of men). American rules apply: mandatory captures,
chained multi-jumps that keep the turn, and crowning ends a move. The
host plays red from the bottom, black opens, and colors swap on rematch.
A draw is called after sixty moves without a capture.

The Oracle is a Codenames-style word game for exactly four players: two
teams of a spymaster and an operative. A 5×5 board of English words is
dealt with a secret key — nine words for the first team, eight for the
other, seven bystanders, and one assassin. The key map is sent only to
spymasters; operatives see plain cards until words are revealed. The
acting spymaster gives one word plus a number (or unlimited), the
operative guesses until they miss, hit their limit, or pass; revealing
the assassin loses instantly. Rematches deal a fresh board with the same
seats.

Training is a Ticket-to-Ride-style rail game where the creator picks the
map at setup. There are thirteen: **Coastline**, **Continent**, and
**Orient** at region scale (20 cities each), plus ten city-scale maps —
Cleveland, San Francisco, Seattle, Los Angeles, Atlanta, New York,
Melbourne, Sydney, Detroit, and Minneapolis — whose stops are real
neighborhoods (Embarcadero, Fremont, Fitzroy, Corktown...). Each turn you
draw two train cards from the deck or face-up market, claim a route by
spending a matching suit (wilds fill gaps, gray routes take any suit), or
survey new destination tickets. Tickets pay their points when a connected
path of your rails links the two stops, and cost the same when they don't.
Route points score immediately; when a player drops to two trains the
final round starts, and unfinished tickets turn negative at scoring.
City maps deal 3 starting tickets and a smaller train pool to match their
size. A board-only preview for map tuning lives at `/training/board.html`
(use the map dropdown or `?map=`).

## Solo & arcade shelf

Seven instantly-playable one-player (or one-device) games — no share
codes, no sign-in, best scores and streaks live in browser storage:

- **2048** (`/2048/`) — slide and merge tiles on a 4×4 grid. Arrow keys,
  WASD, or swipe; undo history, persistent best score, and the board
  survives a page refresh.
- **Word Guess** (`/word-guess/`) — a Wordle-style deduction game with a
  built-in ~2,500-word list. A deterministic daily word (same for
  everyone that day, progress saved) or endless practice rounds, hard
  mode, guess-distribution stats, and one-click emoji share grids.
- **Minesweeper** (`/minesweeper/`) — 9×9, 16×16, and 30×16 boards with
  a guaranteed-safe first click, flags (right-click, long-press, or flag
  mode), chording, and best times per difficulty.
- **Connect Four** (`/connect-four/`) — pass-and-play or three robot
  strengths; the hard robot runs a depth-8 alpha-beta minimax search with
  a positional evaluator. Round tallies persist between visits.
- **Memory Match** (`/memory/`) — emoji pair-matching for one to four
  players on one device; three board sizes, three themes, matches earn an
  extra turn.
- **Snake** (`/snake/`) — canvas arcade classic with three speeds, swipe
  controls, pause, and a persistent high score.
- **Simon Says** (`/simon/`) — the pattern-memory classic with WebAudio
  tones; playback speeds up as levels grow, best level is remembered.
- **Sliding Puzzle** (`/sliding-puzzle/`) — the 15-puzzle with 3×3 to 5×5
  boards, shuffled by random legal moves so every deal is solvable. Arrow
  keys or taps, move counter and timer, best line per size.
- **Dots and Boxes** (`/dots-and-boxes/`) — the pen-and-paper classic for
  two players on one device, or against a robot that grabs free boxes and
  avoids handing you a third edge. Closing a box scores it and keeps your
  turn.

The hub launcher groups these under the "Solo & Robot" filter, supports
text search across all games, and has a dice-button "Surprise me" that
jumps to a random game.

## Offline mode (tablet / airplane)

The hub is a fully offline-capable web app. A root service worker (`sw.js`)
pre-caches every game's page and static assets — 110 files — on first visit:

- **Navigations** are fetched network-first (so updates land when you're
  online) and fall back to the cached copy offline; unknown pages fall back
  to the cached hub.
- **Static assets** are served cache-first with a background refresh
  (stale-while-revalidate), so a tablet that launches online once gets
  fresh files without paying a latency cost.
- **API, auth, and SSE traffic is never intercepted** — remote multiplayer
  (share codes, live tables) simply reports it can't reach the server when
  offline, while every client-side game keeps working.

To run the hub from a tablet in airplane mode:

1. Open the hub once while online and let it sit for a couple of seconds
   while the worker pre-caches (the offline pill "✈️ Offline — every cached
   game still plays" appears automatically whenever you're offline).
2. **Add to Home Screen** (iOS Safari share sheet, or Chrome's install
   prompt on Android/ChromeOS). The manifest gives it a standalone window,
   its own icon, and a green theme.
3. Flip on airplane mode and play. Solo games (2048, Word Guess,
   Minesweeper, Sliding Puzzle, Snake, Simon, Memory, and all of Table
   Tools) work fully; pass-and-play games on one device work fully; remote
   share-code games need the server back.

Browsers only allow service workers in **secure contexts** — `localhost` is
fine, but a tablet reaching the hub over your LAN needs HTTPS. Set the two
optional env vars and restart:

```sh
openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout gamehub-key.pem -out gamehub-cert.pem -subj "/CN=gamehub.local"
# in .env:
# GAMEHUB_SSL_CERTFILE=gamehub-cert.pem
# GAMEHUB_SSL_KEYFILE=gamehub-key.pem
HOST=0.0.0.0 python3 app.py   # accept the self-signed cert on the tablet once
```

When you add or rename a game, regenerate the precache list with
`python3 tools/gen_sw_precache.py` — the worker's version string changes so
clients update on their next online launch.

## Legacy Bingo command

`cd bingo && python3 app.py` still works, but it now starts the same root Flask
app so the project stays on one stack. It reads the same `.env` and uses port
5001, overridable with `BINGO_PORT`.
