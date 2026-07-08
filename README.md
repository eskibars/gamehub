# Local First Game Hub

A small tabletop-style launcher for local-first game tools. The app uses one
Python/Flask stack and keeps play usable without login wherever possible.

## Run the hub

```sh
python3 app.py
```

Then open `http://127.0.0.1:25001`.

The ready tools are Bingo Card Builder, Color Guesser, Yahtzee Scorepad,
Boggle Table, Word Find Creator, Backgammon, Find 'em, and Table Tools.

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

Table Tools stores timer and dice preferences in browser storage. It includes
digital and sand-style countdown timers with custom durations, plus a dice
roller with configurable dice count, sides, modifier, and roll history.

Find 'em loads kid-friendly prompt cards from `find_em/static/cards.json`,
randomizes the selected deck in the browser, and keeps the game shell available
offline after the first visit.

## Legacy Bingo command

`cd bingo && python3 app.py` still works, but it now starts the same root Flask
app so the project stays on one stack.
