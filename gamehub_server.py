from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import queue
import random
import re
import secrets
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, redirect, request, send_from_directory, session, stream_with_context


logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
BINGO_STATIC_DIR = BASE_DIR / "bingo" / "static"
BINGO_DATA_DIR = BASE_DIR / "bingo" / "data"
BINGO_CARDS_FILE = BINGO_DATA_DIR / "cards.json"
BULLS_AND_COWS_STATIC_DIR = BASE_DIR / "bulls_and_cows" / "static"
YACHT_STATIC_DIR = BASE_DIR / "yacht" / "static"
BOGGLE_STATIC_DIR = BASE_DIR / "boggle" / "static"
WORD_FIND_STATIC_DIR = BASE_DIR / "word_find" / "static"
BACKGAMMON_STATIC_DIR = BASE_DIR / "backgammon" / "static"
FIND_EM_STATIC_DIR = BASE_DIR / "find_em" / "static"
TOOLS_STATIC_DIR = BASE_DIR / "tools" / "static"
WHOAMI_STATIC_DIR = BASE_DIR / "whoami" / "static"
HANGMAN_STATIC_DIR = BASE_DIR / "hangman" / "static"
SHARED_STATIC_DIR = BASE_DIR / "shared"
MAX_USER_BYTES = int(os.environ.get("BINGO_MAX_USER_BYTES", 5 * 1024 * 1024))
COLOR_GAMES: dict[str, dict[str, Any]] = {}
COLOR_GAME_SUBSCRIBERS: dict[str, list[queue.Queue[dict[str, Any]]]] = {}
COLOR_GAMES_LOCK = threading.Lock()
BOGGLE_GAMES: dict[str, dict[str, Any]] = {}
BOGGLE_GAME_SUBSCRIBERS: dict[str, list[dict[str, Any]]] = {}
BOGGLE_GAME_TIMERS: dict[str, threading.Timer] = {}
BOGGLE_GAMES_LOCK = threading.Lock()
BACKGAMMON_GAMES: dict[str, dict[str, Any]] = {}
BACKGAMMON_GAME_SUBSCRIBERS: dict[str, list[queue.Queue[dict[str, Any]]]] = {}
BACKGAMMON_GAMES_LOCK = threading.Lock()
WHOAMI_GAMES: dict[str, dict[str, Any]] = {}
WHOAMI_GAME_SUBSCRIBERS: dict[str, list[queue.Queue[dict[str, Any]]]] = {}
WHOAMI_GAMES_LOCK = threading.Lock()
WHOAMI_MIN_PLAYERS = 2
WHOAMI_MAX_PLAYERS = 2
WHOAMI_POOL_SIZE = 24
WHOAMI_MAX_CHAT = 60
WHOAMI_MAX_EVENTS = 30
HANGMAN_GAMES: dict[str, dict[str, Any]] = {}
HANGMAN_GAME_SUBSCRIBERS: dict[str, list[queue.Queue[dict[str, Any]]]] = {}
HANGMAN_GAMES_LOCK = threading.Lock()
HANGMAN_MIN_PLAYERS = 2
HANGMAN_MAX_PLAYERS = 2
HANGMAN_MAX_WRONG = 6
HANGMAN_MAX_HISTORY = 8
HANGMAN_MAX_CATEGORY = 48
HANGMAN_MAX_WORD = 40
BATTLESHIP_GAMES: dict[str, dict[str, Any]] = {}
BATTLESHIP_GAME_SUBSCRIBERS: dict[str, list[dict[str, Any]]] = {}
BATTLESHIP_GAMES_LOCK = threading.Lock()
BATTLESHIP_SIZE = 10
BATTLESHIP_FLEET = (
    ("carrier", 5),
    ("battleship", 4),
    ("cruiser", 3),
    ("submarine", 3),
    ("destroyer", 2),
)
BATTLESHIP_MAX_PLAYERS = 2
BATTLESHIP_MAX_LOG = 12
CHECKERS_GAMES: dict[str, dict[str, Any]] = {}
CHECKERS_GAME_SUBSCRIBERS: dict[str, list[dict[str, Any]]] = {}
CHECKERS_GAMES_LOCK = threading.Lock()
CHECKERS_SIZES = (8, 10, 12)
CHECKERS_MAX_LOG = 12
# Moves without a capture before a game is declared a draw.
CHECKERS_DRAW_QUIET = 60
ORACLE_GAMES: dict[str, dict[str, Any]] = {}
ORACLE_GAME_SUBSCRIBERS: dict[str, list[dict[str, Any]]] = {}
ORACLE_GAMES_LOCK = threading.Lock()
ORACLE_GRID = 5
ORACLE_MAX_LOG = 15
# Role ids in the order open seats are auto-assigned.
ORACLE_ROLES = ("red-spymaster", "blue-spymaster", "red-operative", "blue-operative")
ORACLE_WORDS = (
    "AIRPLANE", "ALPS", "ANCHOR", "ANGEL", "ANTARCTICA", "APPLE", "ARM", "ATLANTIS",
    "AUSTRALIA", "AZTEC", "BACK", "BALL", "BANK", "BARK", "BAT", "BEACH", "BEAR",
    "BEAT", "BERLIN", "BILL", "BLOCK", "BOARD", "BOLT", "BOMB", "BOND", "BOOM",
    "BOOT", "BOTTLE", "BOW", "BOX", "BRAIN", "BRANCH", "BRIDGE", "BRUSH", "BUCK",
    "BUFFALO", "BUG", "BURN", "BUTTON", "CAPITAL", "CAR", "CARD", "CARRY", "CAST",
    "CASTLE", "CAT", "CELL", "CENTAUR", "CENTER", "CHANGE", "CHARGE", "CHART",
    "CHECK", "CHINA", "CIRCLE", "CLIFF", "CLOAK", "CLUB", "COAST", "COMB",
    "COMMANDER", "COMPOUND", "CONCERT", "COPPER", "CRANE", "CRASH", "CREAM",
    "CROWN", "CYCLOPS", "DANCE", "DAY", "DEATH", "DECK", "DEGREE", "DEPUTY",
    "DESERT", "DIAMOND", "DINOSAUR", "DISEASE", "DOCTOR", "DOG", "DRAFT", "DRAGON",
    "DRESS", "DRILL", "DRINK", "DROP", "DUCK", "EAGLE", "EARTH", "EGG", "EGYPT",
    "EMPIRE", "ENGLAND", "EUROPE", "FAIR", "FALL", "FAN", "FENCE", "FIELD", "FILM",
    "FIRE", "FISH", "FLUTE", "FLY", "FOOT", "FORCE", "FORK", "FRANCE", "GAMBLER",
    "GATE", "GIANT", "GLASS", "GOLD", "GRASS", "GREEN", "GUITAR", "GUN", "HAIR",
    "HALL", "HAM", "HAWK", "HELICOPTER", "HOLE", "HOLLYWOOD", "HONEY", "HOOK",
    "HORN", "HORSE", "HORSESHOE", "HOSPITAL", "HOTEL", "ICE", "IRON", "ISLAND",
    "IVORY", "JACK", "JAM", "JET", "JUPITER", "KANGAROO", "KEY", "KID", "KING",
    "KITCHEN", "KNIFE", "KNIGHT", "LABOR", "LASER", "LAW", "LEAD", "LEMON",
    "LEPRECHAUN", "LIFE", "LIGHT", "LION", "LITTER", "LOCK", "LONDON", "LUCK",
    "MAMMOTH", "MAP", "MARBLE", "MARSHMALLOW", "MASK", "MASS", "MATCH", "MEDIC",
    "MERCURY", "METAL", "MICROSCOPE", "MILITARY", "MOON", "MOUNT", "MOUTH", "MUD",
    "MUG", "NAIL", "NEEDLE", "NIGHT", "NOBLE", "NOSE", "NOVEL", "NURSE", "OASIS",
    "OCEAN", "OCTOPUS", "OIL", "OLIVE", "OLYMPUS", "ORANGE", "ORGAN", "OUTFIT",
    "OXYGEN", "PAPER", "PART", "PASS", "PASTE", "PENGUIN", "PIANO", "PILGRIM",
    "PIN", "PIRATE", "PLANE", "PLANT", "PLATE", "PLAY", "PLUTO", "POCKET", "POISON",
    "POLICE", "POND", "POOL", "PORT", "POST", "PUPIL", "PYRAMID", "QUEEN", "RACKET",
    "RAIN", "RAY", "RING", "ROBIN", "ROBOT", "ROCKET", "ROOF", "ROOT", "ROPE",
    "ROSE", "ROULETTE", "ROUND", "RULER", "SALT", "SATURN", "SCHOOL", "SCIENCE",
    "SCORPION", "SCREEN", "SCUBA", "SEASON", "SECOND", "SHADOW", "SHELL", "SHIP",
    "SHOE", "SHOOT", "SHOWER", "SINK", "SKY", "SLIP", "SNOW", "SOUL", "SPACE",
    "SPELL", "SPIDER", "SPIKE", "SPINE", "SPOT", "SPRING", "SPY", "SQUARE",
    "STADIUM", "STAFF", "STAIR", "STAMP", "STAR", "STEEL", "STICK", "STOLEN",
    "STONE", "STRAW", "STREAM", "STREET", "SUB", "SUGAR", "SUIT", "SUN",
    "SUPERHERO", "SWAMP", "SWAN", "SWING", "TABLE", "TAP", "TEACHER", "TELESCOPE",
    "TEMPLE", "THEATER", "THIEF", "THUMB", "TICK", "TIE", "TIME", "TOKYO", "TOOTH",
    "TORCH", "TOWER", "TRACK", "TRAIN", "TRIANGLE", "TRUNK", "TUBE", "TURKEY",
    "UNICORN", "VACUUM", "VAMPIRE", "VAN", "VET", "WAKE", "WALL", "WAR", "WARDROBE",
    "WASHINGTON", "WATCH", "WATER", "WAVE", "WEB", "WEREWOLF", "WHALE", "WHIP",
    "WIND", "WINE", "WIRE", "WITCH", "WORM", "YARD", "ZEUS",
)
# Idle remote tables are swept from memory so abandoned game codes do not
# accumulate until restart. TTL <= 0 disables the sweeper entirely.
GAME_TTL_SECONDS = int(os.environ.get("GAME_TTL_SECONDS", 6 * 60 * 60))
GAME_SWEEP_INTERVAL_SECONDS = int(os.environ.get("GAME_SWEEP_INTERVAL_SECONDS", 5 * 60))
BOGGLE_LETTER_DISTRIBUTION = (
    "E" * 12
    + "A" * 9
    + "I" * 9
    + "O" * 8
    + "N" * 6
    + "R" * 6
    + "T" * 6
    + "L" * 4
    + "S" * 4
    + "U" * 4
    + "D" * 4
    + "G" * 3
    + "B" * 2
    + "C" * 2
    + "M" * 2
    + "P" * 2
    + "F" * 2
    + "H" * 2
    + "V" * 2
    + "W" * 2
    + "Y" * 2
    + "K"
    + "J"
    + "X"
    + "Q"
    + "Z"
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_store() -> dict[str, Any]:
    if not BINGO_CARDS_FILE.exists():
        return {"cards": []}
    with BINGO_CARDS_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_store(store: dict[str, Any]) -> None:
    BINGO_DATA_DIR.mkdir(exist_ok=True)
    temp_file = BINGO_CARDS_FILE.with_suffix(".tmp")
    with temp_file.open("w", encoding="utf-8") as handle:
        json.dump(store, handle, indent=2)
    temp_file.replace(BINGO_CARDS_FILE)


def payload_size(payload: Any) -> int:
    return len(json.dumps(payload, separators=(",", ":")).encode("utf-8"))


def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def base64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def color_token_keys(secret_key: str) -> tuple[bytes, bytes]:
    secret_bytes = secret_key.encode("utf-8")
    encryption_key = hashlib.sha256(b"bulls-and-cows-encryption:" + secret_bytes).digest()
    signing_key = hashlib.sha256(b"bulls-and-cows-signing:" + secret_bytes).digest()
    return encryption_key, signing_key


def keystream(key: bytes, nonce: bytes, size: int) -> bytes:
    chunks = []
    counter = 0
    while sum(len(chunk) for chunk in chunks) < size:
        counter_bytes = counter.to_bytes(4, "big")
        chunks.append(hmac.new(key, nonce + counter_bytes, hashlib.sha256).digest())
        counter += 1
    return b"".join(chunks)[:size]


def xor_bytes(left: bytes, right: bytes) -> bytes:
    return bytes(left_byte ^ right_byte for left_byte, right_byte in zip(left, right))


def create_color_share_token(secret_key: str, game: dict[str, Any]) -> str:
    encryption_key, signing_key = color_token_keys(secret_key)
    payload = {
        "v": 1,
        "code": game["code"],
        "colors": game["colors"],
        "pegCount": game["pegCount"],
        "maxRounds": game["maxRounds"],
        "secret": game["secret"],
        "createdAt": game["createdAt"],
    }
    plaintext = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    nonce = secrets.token_bytes(16)
    ciphertext = xor_bytes(plaintext, keystream(encryption_key, nonce, len(plaintext)))
    tag = hmac.new(signing_key, nonce + ciphertext, hashlib.sha256).digest()[:16]
    return base64url_encode(nonce + ciphertext + tag)


def decode_color_share_token(secret_key: str, token: str) -> dict[str, Any] | None:
    try:
        raw = base64url_decode(token)
    except Exception:
        return None
    if len(raw) < 33:
        return None

    encryption_key, signing_key = color_token_keys(secret_key)
    nonce = raw[:16]
    ciphertext = raw[16:-16]
    tag = raw[-16:]
    expected_tag = hmac.new(signing_key, nonce + ciphertext, hashlib.sha256).digest()[:16]
    if not hmac.compare_digest(tag, expected_tag):
        return None

    plaintext = xor_bytes(ciphertext, keystream(encryption_key, nonce, len(ciphertext)))
    try:
        payload = json.loads(plaintext.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    if payload.get("v") != 1:
        return None
    return payload


def color_game_public(game: dict[str, Any]) -> dict[str, Any]:
    public = {
        "code": game["code"],
        "colors": game["colors"],
        "pegCount": game["pegCount"],
        "maxRounds": game["maxRounds"],
        "guesses": game["guesses"],
        "status": game["status"],
        "createdAt": game["createdAt"],
        "updatedAt": game["updatedAt"],
    }
    if game["status"] != "active":
        public["secret"] = game["secret"]
    return public


def random_color_secret(colors: list[str], peg_count: int) -> list[str]:
    return [secrets.choice(colors) for _ in range(peg_count)]


def score_color_guess(secret: list[str], guess: list[str]) -> dict[str, int]:
    exact = sum(1 for index, color in enumerate(guess) if secret[index] == color)
    secret_remaining: dict[str, int] = {}
    guess_remaining: list[str] = []

    for index, color in enumerate(guess):
        if secret[index] == color:
            continue
        secret_remaining[secret[index]] = secret_remaining.get(secret[index], 0) + 1
        guess_remaining.append(color)

    misplaced = 0
    for color in guess_remaining:
        if secret_remaining.get(color, 0) > 0:
            misplaced += 1
            secret_remaining[color] -= 1

    return {"exact": exact, "misplaced": misplaced}


def publish_color_game(code: str, event_name: str = "game") -> None:
    with COLOR_GAMES_LOCK:
        game = COLOR_GAMES.get(code)
        subscribers = list(COLOR_GAME_SUBSCRIBERS.get(code, []))
        payload = color_game_public(game) if game else None

    if payload is None:
        return

    for subscriber in subscribers:
        subscriber.put({"event": event_name, "data": payload})


def sse_message(event: str, data: Any) -> str:
    encoded = json.dumps(data, separators=(",", ":"))
    return f"event: {event}\ndata: {encoded}\n\n"


def game_is_expired(game: dict[str, Any], now: float) -> bool:
    try:
        updated = datetime.fromisoformat(str(game["updatedAt"]))
    except (KeyError, TypeError, ValueError):
        return False
    if updated.tzinfo is None:
        updated = updated.replace(tzinfo=timezone.utc)
    return (now - updated.timestamp()) >= GAME_TTL_SECONDS


def sweep_stale_games(now: float | None = None) -> list[str]:
    # Every remote game refreshes "updatedAt" on each mutating request, so this
    # only collects tables nobody has touched for GAME_TTL_SECONDS — including
    # ones a background tab still holds an SSE connection open against. Each
    # removed game's subscribers get a terminal "closed" event; anything they
    # request afterwards 404s exactly like a restarted server would.
    if GAME_TTL_SECONDS <= 0:
        return []
    current_time = time.time() if now is None else now
    removed: list[str] = []
    namespaces = (
        (COLOR_GAMES_LOCK, COLOR_GAMES, COLOR_GAME_SUBSCRIBERS, None),
        (BOGGLE_GAMES_LOCK, BOGGLE_GAMES, BOGGLE_GAME_SUBSCRIBERS, BOGGLE_GAME_TIMERS),
        (BACKGAMMON_GAMES_LOCK, BACKGAMMON_GAMES, BACKGAMMON_GAME_SUBSCRIBERS, None),
        (WHOAMI_GAMES_LOCK, WHOAMI_GAMES, WHOAMI_GAME_SUBSCRIBERS, None),
        (HANGMAN_GAMES_LOCK, HANGMAN_GAMES, HANGMAN_GAME_SUBSCRIBERS, None),
        (BATTLESHIP_GAMES_LOCK, BATTLESHIP_GAMES, BATTLESHIP_GAME_SUBSCRIBERS, None),
        (CHECKERS_GAMES_LOCK, CHECKERS_GAMES, CHECKERS_GAME_SUBSCRIBERS, None),
        (ORACLE_GAMES_LOCK, ORACLE_GAMES, ORACLE_GAME_SUBSCRIBERS, None),
    )
    for lock, games, subscribers, timers in namespaces:
        closed_queues: list[queue.Queue] = []
        with lock:
            expired_codes = [code for code, game in games.items() if game_is_expired(game, current_time)]
            for code in expired_codes:
                games.pop(code, None)
                closed_queues.extend(
                    entry["queue"] if isinstance(entry, dict) else entry
                    for entry in subscribers.pop(code, [])
                )
                if timers is not None:
                    timer = timers.pop(code, None)
                    if timer:
                        timer.cancel()
                removed.append(code)
        for subscriber_queue in closed_queues:
            subscriber_queue.put({"event": "closed", "data": {"reason": "expired"}})
    if removed:
        logger.info("TTL sweep removed %d idle game(s): %s", len(removed), ", ".join(removed))
    return removed


def start_game_sweeper() -> threading.Thread | None:
    if GAME_TTL_SECONDS <= 0 or GAME_SWEEP_INTERVAL_SECONDS <= 0:
        logger.info("Game TTL sweeping is disabled.")
        return None

    def sweep_loop() -> None:
        while True:
            time.sleep(GAME_SWEEP_INTERVAL_SECONDS)
            try:
                sweep_stale_games()
            except Exception:
                logger.exception("Game TTL sweep failed")

    sweeper = threading.Thread(target=sweep_loop, name="game-ttl-sweeper", daemon=True)
    sweeper.start()
    return sweeper


def normalize_boggle_word(word: str) -> str:
    return re.sub(r"[^A-Z]", "", word.upper())


def random_boggle_board(size: int) -> list[list[str]]:
    letters = random.SystemRandom().choices(BOGGLE_LETTER_DISTRIBUTION, k=size * size)
    cells = ["Qu" if letter == "Q" else letter for letter in letters]
    return [cells[index : index + size] for index in range(0, len(cells), size)]


def boggle_duplicate_words(game: dict[str, Any]) -> list[str]:
    counts: dict[str, int] = {}
    for player in game["players"].values():
        for word in player["words"]:
            normalized = normalize_boggle_word(word)
            if normalized:
                counts[normalized] = counts.get(normalized, 0) + 1
    return sorted(word for word, count in counts.items() if count > 1)


def boggle_public_game(game: dict[str, Any], player_id: str | None = None) -> dict[str, Any]:
    status = game["status"]
    players = []
    for player in game["players"].values():
        own_words = player_id == player["id"]
        show_words = status == "finished" or own_words
        players.append(
            {
                "id": player["id"],
                "name": player["name"],
                "ready": player["ready"],
                "connectedAt": player["connectedAt"],
                "wordCount": len(player["words"]),
                "words": player["words"] if show_words else [],
            }
        )

    return {
        "code": game["code"],
        "hostId": game["hostId"],
        "size": game["size"],
        "timerSeconds": game["timerSeconds"],
        "status": game["status"],
        "board": game["board"] if game["status"] in {"active", "finished"} else [],
        "startsAt": game["startsAt"],
        "endsAt": game["endsAt"],
        "createdAt": game["createdAt"],
        "updatedAt": game["updatedAt"],
        "players": players,
        "duplicateWords": boggle_duplicate_words(game) if game["status"] == "finished" else [],
        "challenges": game["challenges"] if game["status"] == "finished" else [],
    }


def publish_boggle_game(code: str, event_name: str = "game") -> None:
    with BOGGLE_GAMES_LOCK:
        game = BOGGLE_GAMES.get(code)
        subscribers = list(BOGGLE_GAME_SUBSCRIBERS.get(code, []))

    if not game:
        return

    for subscriber in subscribers:
        subscriber["queue"].put({"event": event_name, "data": boggle_public_game(game, subscriber.get("playerId"))})


def finish_boggle_game(code: str) -> None:
    with BOGGLE_GAMES_LOCK:
        game = BOGGLE_GAMES.get(code)
        if not game or game["status"] != "active":
            return
        game["status"] = "finished"
        game["updatedAt"] = utc_now()
        BOGGLE_GAME_TIMERS.pop(code, None)

    publish_boggle_game(code, "finished")


def schedule_boggle_finish(code: str, delay_seconds: int) -> None:
    existing = BOGGLE_GAME_TIMERS.pop(code, None)
    if existing:
        existing.cancel()
    timer = threading.Timer(delay_seconds, finish_boggle_game, args=(code,))
    timer.daemon = True
    BOGGLE_GAME_TIMERS[code] = timer
    timer.start()


def validate_boggle_game_payload(body: dict[str, Any]) -> tuple[dict[str, int] | None, str | None]:
    try:
        size = int(body.get("size") or 0)
        timer_seconds = int(body.get("timerSeconds") or 0)
    except (TypeError, ValueError):
        return None, "Board size and timer must be numbers."

    if size not in {4, 5, 6}:
        return None, "Choose a 4x4, 5x5, or 6x6 board."
    if timer_seconds < 60 or timer_seconds > 300:
        return None, "Timer must be between 60 seconds and 5 minutes."

    return {"size": size, "timerSeconds": timer_seconds}, None


def validate_color_game_payload(body: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    colors = body.get("colors")
    secret = body.get("secret")
    try:
        peg_count = int(body.get("pegCount") or 0)
        max_rounds = int(body.get("maxRounds") or 0)
    except (TypeError, ValueError):
        return None, "Pegs and rounds must be numbers."

    if not isinstance(colors, list):
        return None, "Choose between 2 and 10 colors."

    colors = [str(color).strip() for color in colors if str(color).strip()]
    if len(colors) < 2 or len(colors) > 10:
        return None, "Choose between 2 and 10 colors."
    if len(set(colors)) != len(colors):
        return None, "Colors must be unique."
    if peg_count < 3 or peg_count > 8:
        return None, "Choose between 3 and 8 pegs."
    if max_rounds < 4 or max_rounds > 20:
        return None, "Choose between 4 and 20 rounds."
    if secret is not None:
        if not isinstance(secret, list):
            return None, "Code must use one available color per peg."
        secret = [str(color).strip() for color in secret]
        if len(secret) != peg_count or any(color not in colors for color in secret):
            return None, "Code must use one available color per peg."

    return {"colors": colors, "pegCount": peg_count, "maxRounds": max_rounds, "secret": secret}, None


def validate_color_token_payload(payload: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    colors = payload.get("colors")
    secret = payload.get("secret")
    code = str(payload.get("code") or "").strip().upper()
    try:
        peg_count = int(payload.get("pegCount") or 0)
        max_rounds = int(payload.get("maxRounds") or 0)
    except (TypeError, ValueError):
        return None, "Share token has invalid settings."

    if not code:
        return None, "Share token is missing a game code."
    if not isinstance(colors, list):
        return None, "Share token has invalid colors."

    colors = [str(color).strip() for color in colors if str(color).strip()]
    if len(colors) < 2 or len(colors) > 10 or len(set(colors)) != len(colors):
        return None, "Share token has invalid colors."
    if peg_count < 3 or peg_count > 8:
        return None, "Share token has invalid peg count."
    if max_rounds < 4 or max_rounds > 20:
        return None, "Share token has invalid round count."
    if not isinstance(secret, list) or len(secret) != peg_count:
        return None, "Share token has invalid secret."

    secret = [str(color).strip() for color in secret]
    if any(color not in colors for color in secret):
        return None, "Share token has invalid secret."

    return {"code": code, "colors": colors, "pegCount": peg_count, "maxRounds": max_rounds, "secret": secret}, None


def initial_backgammon_points() -> list[dict[str, Any] | None]:
    return [
        {"color": "black", "count": 2},
        None,
        None,
        None,
        None,
        {"color": "white", "count": 5},
        None,
        {"color": "white", "count": 3},
        None,
        None,
        None,
        {"color": "black", "count": 5},
        {"color": "white", "count": 5},
        None,
        None,
        None,
        {"color": "black", "count": 3},
        None,
        {"color": "black", "count": 5},
        None,
        None,
        None,
        None,
        {"color": "white", "count": 2},
    ]


def create_backgammon_game(code: str) -> dict[str, Any]:
    now = utc_now()
    return {
        "code": code,
        "mode": "remote",
        "points": initial_backgammon_points(),
        "bar": {"white": 0, "black": 0},
        "borneOff": {"white": 0, "black": 0},
        "turn": "white",
        "dice": [],
        "usedDice": [],
        "rolled": False,
        "winner": None,
        "revision": 0,
        "createdAt": now,
        "updatedAt": now,
    }


def backgammon_opponent(color: str) -> str:
    return "black" if color == "white" else "white"


def backgammon_remaining_dice(game: dict[str, Any]) -> list[int]:
    used = set(game["usedDice"])
    return [die for index, die in enumerate(game["dice"]) if index not in used]


def backgammon_all_in_home(game: dict[str, Any], color: str) -> bool:
    if game["bar"][color] > 0:
        return False
    for index, point in enumerate(game["points"]):
        if not point or point["color"] != color:
            continue
        if color == "white" and index > 5:
            return False
        if color == "black" and index < 18:
            return False
    return True


def backgammon_can_oversize_bear_off(game: dict[str, Any], color: str, start: int) -> bool:
    for index, point in enumerate(game["points"]):
        if not point or point["color"] != color:
            continue
        if color == "white" and index > start:
            return False
        if color == "black" and index < start:
            return False
    return True


def backgammon_destination(game: dict[str, Any], color: str, start: int | str, die: int) -> int | str | None:
    if start == "bar":
        return 24 - die if color == "white" else die - 1

    destination = start - die if color == "white" else start + die
    if 0 <= destination <= 23:
        return destination
    if not backgammon_all_in_home(game, color):
        return None

    exact = destination == -1 if color == "white" else destination == 24
    if exact or backgammon_can_oversize_bear_off(game, color, start):
        return "off"
    return None


def backgammon_destination_open(game: dict[str, Any], color: str, destination: int | str) -> bool:
    if destination == "off":
        return True
    point = game["points"][destination]
    return not point or point["color"] == color or point["count"] == 1


def backgammon_legal_moves_from(game: dict[str, Any], start: int | str) -> list[dict[str, Any]]:
    if not game["rolled"] or game.get("winner"):
        return []
    color = game["turn"]
    if game["bar"][color] > 0 and start != "bar":
        return []
    if start == "bar":
        if game["bar"][color] <= 0:
            return []
    else:
        if not isinstance(start, int) or start < 0 or start > 23:
            return []
        point = game["points"][start]
        if not point or point["color"] != color or point["count"] <= 0:
            return []

    moves = []
    used = set(game["usedDice"])
    for die_index, die in enumerate(game["dice"]):
        if die_index in used:
            continue
        destination = backgammon_destination(game, color, start, int(die))
        if destination is None or not backgammon_destination_open(game, color, destination):
            continue
        moves.append({"from": start, "to": destination, "die": int(die), "dieIndex": die_index})
    return moves


def backgammon_all_legal_moves(game: dict[str, Any]) -> list[dict[str, Any]]:
    color = game["turn"]
    starts: list[int | str]
    if game["bar"][color] > 0:
        starts = ["bar"]
    else:
        starts = [index for index, point in enumerate(game["points"]) if point and point["color"] == color]
    moves: list[dict[str, Any]] = []
    for start in starts:
        moves.extend(backgammon_legal_moves_from(game, start))
    return moves


def advance_backgammon_turn(game: dict[str, Any]) -> None:
    game["turn"] = backgammon_opponent(game["turn"])
    game["dice"] = []
    game["usedDice"] = []
    game["rolled"] = False
    game["revision"] += 1
    game["updatedAt"] = utc_now()


def apply_backgammon_move(game: dict[str, Any], move: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    start = move.get("from")
    destination = move.get("to")
    try:
        die_index = int(move.get("dieIndex"))
    except (TypeError, ValueError):
        return None, "Move is missing a die."

    if isinstance(start, str) and start != "bar":
        return None, "Move starts from an invalid point."
    if isinstance(start, (int, float)):
        start = int(start)
    if isinstance(destination, str) and destination != "off":
        return None, "Move ends on an invalid point."
    if isinstance(destination, (int, float)):
        destination = int(destination)

    legal_move = next(
        (
            item
            for item in backgammon_legal_moves_from(game, start)
            if item["to"] == destination and item["dieIndex"] == die_index
        ),
        None,
    )
    if not legal_move:
        return None, "That move is not legal for the current dice."

    color = game["turn"]
    rival = backgammon_opponent(color)
    if start == "bar":
        game["bar"][color] -= 1
    else:
        point = game["points"][start]
        point["count"] -= 1
        if point["count"] == 0:
            game["points"][start] = None

    if destination == "off":
        game["borneOff"][color] += 1
    else:
        target = game["points"][destination]
        if not target:
            game["points"][destination] = {"color": color, "count": 1}
        elif target["color"] == color:
            target["count"] += 1
        else:
            game["bar"][rival] += 1
            game["points"][destination] = {"color": color, "count": 1}

    game["usedDice"].append(die_index)
    game["revision"] += 1
    game["updatedAt"] = utc_now()
    if game["borneOff"][color] >= 15:
        game["winner"] = color
        game["rolled"] = False
    elif not backgammon_remaining_dice(game) or not backgammon_all_legal_moves(game):
        advance_backgammon_turn(game)
    return game, None


def roll_backgammon_dice(game: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    if game["rolled"]:
        return None, "Dice are already active."
    if game.get("winner"):
        return None, "This game is already finished."
    first = random.SystemRandom().randint(1, 6)
    second = random.SystemRandom().randint(1, 6)
    game["dice"] = [first, first, first, first] if first == second else [first, second]
    game["usedDice"] = []
    game["rolled"] = True
    game["revision"] += 1
    game["updatedAt"] = utc_now()
    if not backgammon_all_legal_moves(game):
        advance_backgammon_turn(game)
    return game, None


def publish_backgammon_game(code: str, event_name: str = "game") -> None:
    with BACKGAMMON_GAMES_LOCK:
        game = BACKGAMMON_GAMES.get(code)
        subscribers = list(BACKGAMMON_GAME_SUBSCRIBERS.get(code, []))

    if not game:
        return

    for subscriber in subscribers:
        subscriber.put({"event": event_name, "data": game})


def backgammon_revision_matches(body: dict[str, Any], game: dict[str, Any]) -> bool:
    try:
        return int(body.get("revision", game["revision"])) == game["revision"]
    except (TypeError, ValueError):
        return False


def create_app() -> Flask:
    app = Flask(__name__)
    secret_key = os.environ.get("FLASK_SECRET_KEY")
    if not secret_key:
        # A per-process random key keeps sessions and share tokens unforgeable
        # when no explicit key is configured; the tradeoff is that restarts
        # invalidate existing share links. Set FLASK_SECRET_KEY for stable links.
        secret_key = secrets.token_hex(32)
        logger.warning(
            "FLASK_SECRET_KEY is not set; using a random per-process key. "
            "Sessions and share links will not survive a restart."
        )
    app.secret_key = secret_key

    def current_user() -> dict[str, str] | None:
        user = session.get("user")
        if isinstance(user, dict) and user.get("id"):
            return user
        return None

    def require_user():
        user = current_user()
        if not user:
            return None, (jsonify({"error": "Sign in before saving shared cards."}), 401)
        return user, None

    @app.get("/")
    def hub_index():
        return send_from_directory(BASE_DIR, "index.html")

    @app.get("/app.js")
    def hub_script():
        return send_from_directory(BASE_DIR, "app.js")

    @app.get("/styles.css")
    def hub_styles():
        return send_from_directory(BASE_DIR, "styles.css")

    @app.get("/shared/<path:filename>")
    def shared_static(filename: str):
        return send_from_directory(SHARED_STATIC_DIR, filename)

    @app.get("/bingo")
    def bingo_redirect():
        return redirect("/bingo/")

    @app.get("/bingo/")
    def bingo_index():
        return send_from_directory(BINGO_STATIC_DIR, "index.html")

    @app.get("/bingo/<path:filename>")
    def bingo_static(filename: str):
        return send_from_directory(BINGO_STATIC_DIR, filename)

    @app.get("/bulls-and-cows")
    def bulls_and_cows_redirect():
        return redirect("/bulls-and-cows/")

    @app.get("/bulls-and-cows/")
    def bulls_and_cows_index():
        return send_from_directory(BULLS_AND_COWS_STATIC_DIR, "index.html")

    @app.get("/bulls-and-cows/<path:filename>")
    def bulls_and_cows_static(filename: str):
        return send_from_directory(BULLS_AND_COWS_STATIC_DIR, filename)

    @app.get("/yacht")
    def yacht_redirect():
        return redirect("/yacht/")

    @app.get("/yacht/")
    def yacht_index():
        return send_from_directory(YACHT_STATIC_DIR, "index.html")

    @app.get("/yacht/<path:filename>")
    def yacht_static(filename: str):
        return send_from_directory(YACHT_STATIC_DIR, filename)

    @app.get("/boggle")
    def boggle_redirect():
        return redirect("/boggle/")

    @app.get("/boggle/")
    def boggle_index():
        return send_from_directory(BOGGLE_STATIC_DIR, "index.html")

    @app.get("/boggle/<path:filename>")
    def boggle_static(filename: str):
        return send_from_directory(BOGGLE_STATIC_DIR, filename)

    @app.get("/word-find")
    def word_find_redirect():
        return redirect("/word-find/")

    @app.get("/word-find/")
    def word_find_index():
        return send_from_directory(WORD_FIND_STATIC_DIR, "index.html")

    @app.get("/word-find/<path:filename>")
    def word_find_static(filename: str):
        return send_from_directory(WORD_FIND_STATIC_DIR, filename)

    @app.get("/backgammon")
    def backgammon_redirect():
        return redirect("/backgammon/")

    @app.get("/backgammon/")
    def backgammon_index():
        return send_from_directory(BACKGAMMON_STATIC_DIR, "index.html")

    @app.get("/backgammon/<path:filename>")
    def backgammon_static(filename: str):
        return send_from_directory(BACKGAMMON_STATIC_DIR, filename)

    @app.get("/find-em")
    def find_em_redirect():
        return redirect("/find-em/")

    @app.get("/find-em/")
    def find_em_index():
        return send_from_directory(FIND_EM_STATIC_DIR, "index.html")

    @app.get("/find-em/<path:filename>")
    def find_em_static(filename: str):
        return send_from_directory(FIND_EM_STATIC_DIR, filename)

    @app.get("/tools")
    def tools_redirect():
        return redirect("/tools/")

    @app.get("/tools/")
    def tools_index():
        return send_from_directory(TOOLS_STATIC_DIR, "index.html")

    @app.get("/tools/<path:filename>")
    def tools_static(filename: str):
        return send_from_directory(TOOLS_STATIC_DIR, filename)

    @app.get("/whoami")
    def whoami_redirect():
        return redirect("/whoami/")

    @app.get("/whoami/")
    def whoami_index():
        return send_from_directory(WHOAMI_STATIC_DIR, "index.html")

    @app.get("/whoami/<path:filename>")
    def whoami_static(filename: str):
        return send_from_directory(WHOAMI_STATIC_DIR, filename)

    @app.get("/hangman")
    def hangman_redirect():
        return redirect("/hangman/")

    @app.get("/hangman/")
    def hangman_index():
        return send_from_directory(HANGMAN_STATIC_DIR, "index.html")

    @app.get("/hangman/<path:filename>")
    def hangman_static(filename: str):
        return send_from_directory(HANGMAN_STATIC_DIR, filename)

    BATTLESHIP_STATIC_DIR = BASE_DIR / "battleship" / "static"

    @app.get("/battleship")
    def battleship_redirect():
        return redirect("/battleship/")

    @app.get("/battleship/")
    def battleship_index():
        return send_from_directory(BATTLESHIP_STATIC_DIR, "index.html")

    @app.get("/battleship/<path:filename>")
    def battleship_static(filename: str):
        return send_from_directory(BATTLESHIP_STATIC_DIR, filename)

    CHECKERS_STATIC_DIR = BASE_DIR / "checkers" / "static"

    @app.get("/checkers")
    def checkers_redirect():
        return redirect("/checkers/")

    @app.get("/checkers/")
    def checkers_index():
        return send_from_directory(CHECKERS_STATIC_DIR, "index.html")

    @app.get("/checkers/<path:filename>")
    def checkers_static(filename: str):
        return send_from_directory(CHECKERS_STATIC_DIR, filename)

    ORACLE_STATIC_DIR = BASE_DIR / "oracle" / "static"

    @app.get("/oracle")
    def oracle_redirect():
        return redirect("/oracle/")

    @app.get("/oracle/")
    def oracle_index():
        return send_from_directory(ORACLE_STATIC_DIR, "index.html")

    @app.get("/oracle/<path:filename>")
    def oracle_static(filename: str):
        return send_from_directory(ORACLE_STATIC_DIR, filename)

    @app.get("/share/<share_id>")
    def shared_card(share_id: str):
        return redirect(f"/bingo/?share={share_id}")

    @app.get("/api/me")
    def api_me():
        return jsonify({"user": current_user(), "maxUserBytes": MAX_USER_BYTES})

    @app.get("/healthz")
    def healthz():
        with COLOR_GAMES_LOCK:
            color_count = len(COLOR_GAMES)
        with BOGGLE_GAMES_LOCK:
            boggle_count = len(BOGGLE_GAMES)
        with BACKGAMMON_GAMES_LOCK:
            backgammon_count = len(BACKGAMMON_GAMES)
        with WHOAMI_GAMES_LOCK:
            whoami_count = len(WHOAMI_GAMES)
        with HANGMAN_GAMES_LOCK:
            hangman_count = len(HANGMAN_GAMES)
        with BATTLESHIP_GAMES_LOCK:
            battleship_count = len(BATTLESHIP_GAMES)
        with CHECKERS_GAMES_LOCK:
            checkers_count = len(CHECKERS_GAMES)
        with ORACLE_GAMES_LOCK:
            oracle_count = len(ORACLE_GAMES)
        return jsonify(
            {
                "ok": True,
                "games": {
                    "bulls-and-cows": color_count,
                    "boggle": boggle_count,
                    "backgammon": backgammon_count,
                    "whoami": whoami_count,
                    "hangman": hangman_count,
                    "battleship": battleship_count,
                    "checkers": checkers_count,
                    "oracle": oracle_count,
                },
            }
        )

    @app.post("/auth/dev-login")
    def dev_login():
        body = request.get_json(silent=True) or {}
        email = str(body.get("email") or "").strip().lower()
        name = str(body.get("name") or "").strip()
        if not email:
            return jsonify({"error": "Email is required."}), 400

        session["user"] = {
            "id": f"dev:{email}",
            "email": email,
            "name": name or email.split("@", 1)[0],
            "authProvider": "local-dev-oauth-placeholder",
        }
        return jsonify({"user": session["user"]})

    @app.post("/auth/logout")
    def logout():
        session.pop("user", None)
        return jsonify({"ok": True})

    @app.get("/auth/login")
    def oauth_login_placeholder():
        return jsonify(
            {
                "error": "OAuth provider is not configured.",
                "nextStep": (
                    "Set up a provider callback here, then exchange the OAuth "
                    "profile for session['user'] before calling /api/cards."
                ),
            }
        ), 501

    @app.get("/api/cards")
    def list_cards():
        user, error = require_user()
        if error:
            return error

        store = read_store()
        cards = [
            {
                "id": card["id"],
                "shareId": card["shareId"],
                "title": card["card"].get("title", "Untitled card"),
                "createdAt": card["createdAt"],
                "updatedAt": card["updatedAt"],
                "bytes": card["bytes"],
            }
            for card in store["cards"]
            if card["userId"] == user["id"]
        ]
        total = sum(card["bytes"] for card in store["cards"] if card["userId"] == user["id"])
        return jsonify({"cards": cards, "usedBytes": total, "maxUserBytes": MAX_USER_BYTES})

    @app.post("/api/cards")
    def save_card():
        user, error = require_user()
        if error:
            return error

        body = request.get_json(silent=True) or {}
        card = body.get("card")
        if not isinstance(card, dict):
            return jsonify({"error": "Missing card payload."}), 400

        size = payload_size(card)
        store = read_store()
        existing_total = sum(item["bytes"] for item in store["cards"] if item["userId"] == user["id"])
        if existing_total + size > MAX_USER_BYTES:
            return jsonify(
                {
                    "error": "This card would exceed your storage limit.",
                    "usedBytes": existing_total,
                    "cardBytes": size,
                    "maxUserBytes": MAX_USER_BYTES,
                }
            ), 413

        now = utc_now()
        saved = {
            "id": secrets.token_urlsafe(10),
            "shareId": secrets.token_urlsafe(8),
            "userId": user["id"],
            "card": card,
            "bytes": size,
            "createdAt": now,
            "updatedAt": now,
        }
        store["cards"].append(saved)
        write_store(store)

        return jsonify(
            {
                "id": saved["id"],
                "shareId": saved["shareId"],
                "shareUrl": f"/share/{saved['shareId']}",
                "usedBytes": existing_total + size,
                "maxUserBytes": MAX_USER_BYTES,
            }
        ), 201

    @app.get("/api/shared/<share_id>")
    def get_shared_card(share_id: str):
        store = read_store()
        for card in store["cards"]:
            if card["shareId"] == share_id:
                return jsonify({"card": card["card"], "createdAt": card["createdAt"]})
        return jsonify({"error": "Shared card was not found."}), 404

    @app.post("/api/bulls-and-cows/games")
    def create_color_game():
        body = request.get_json(silent=True) or {}
        game_config, error = validate_color_game_payload(body)
        if error:
            return jsonify({"error": error}), 400

        code = uuid.uuid4().hex[:10].upper()
        now = utc_now()
        game = {
            "code": code,
            "colors": game_config["colors"],
            "pegCount": game_config["pegCount"],
            "maxRounds": game_config["maxRounds"],
            "secret": game_config["secret"] or random_color_secret(game_config["colors"], game_config["pegCount"]),
            "guesses": [],
            "status": "active",
            "createdAt": now,
            "updatedAt": now,
        }
        with COLOR_GAMES_LOCK:
            COLOR_GAMES[code] = game
            COLOR_GAME_SUBSCRIBERS.setdefault(code, [])

        share_token = create_color_share_token(app.secret_key, game)
        return jsonify(
            {
                "creatorSecret": game["secret"],
                "game": color_game_public(game),
                "shareToken": share_token,
                "shareUrl": f"/bulls-and-cows/?token={share_token}",
            }
        ), 201

    @app.post("/api/bulls-and-cows/games/from-token")
    def create_color_game_from_token():
        body = request.get_json(silent=True) or {}
        token = str(body.get("token") or "").strip()
        payload = decode_color_share_token(app.secret_key, token)
        if not payload:
            return jsonify({"error": "Share token is not valid."}), 400

        game_config, error = validate_color_token_payload(payload)
        if error:
            return jsonify({"error": error}), 400

        with COLOR_GAMES_LOCK:
            game = COLOR_GAMES.get(game_config["code"])
            if not game:
                now = utc_now()
                game = {
                    "code": game_config["code"],
                    "colors": game_config["colors"],
                    "pegCount": game_config["pegCount"],
                    "maxRounds": game_config["maxRounds"],
                    "secret": game_config["secret"],
                    "guesses": [],
                    "status": "active",
                    "createdAt": str(payload.get("createdAt") or now),
                    "updatedAt": now,
                }
                COLOR_GAMES[game_config["code"]] = game
                COLOR_GAME_SUBSCRIBERS.setdefault(game_config["code"], [])

        return jsonify({"game": color_game_public(game), "shareToken": token, "shareUrl": f"/bulls-and-cows/?token={token}"})

    @app.get("/api/bulls-and-cows/games/<code>")
    def get_color_game(code: str):
        with COLOR_GAMES_LOCK:
            game = COLOR_GAMES.get(code.upper())
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            return jsonify({"game": color_game_public(game)})

    @app.post("/api/bulls-and-cows/games/<code>/guesses")
    def add_color_guess(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        guess = body.get("guess")
        if not isinstance(guess, list):
            return jsonify({"error": "Choose one color for each peg."}), 400

        guess = [str(color).strip() for color in guess]
        with COLOR_GAMES_LOCK:
            game = COLOR_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "active":
                return jsonify({"error": "This game is already finished."}), 409
            if len(guess) != game["pegCount"] or any(color not in game["colors"] for color in guess):
                return jsonify({"error": "Guess must use one available color per peg."}), 400

            feedback = score_color_guess(game["secret"], guess)
            round_number = len(game["guesses"]) + 1
            game["guesses"].append({"round": round_number, "guess": guess, "feedback": feedback})
            if feedback["exact"] == game["pegCount"]:
                game["status"] = "won"
            elif round_number >= game["maxRounds"]:
                game["status"] = "lost"
            game["updatedAt"] = utc_now()
            public_game = color_game_public(game)

        publish_color_game(code)
        return jsonify({"game": public_game})

    @app.get("/api/bulls-and-cows/games/<code>/events")
    def color_game_events(code: str):
        code = code.upper()
        subscriber: queue.Queue[dict[str, Any]] = queue.Queue()

        with COLOR_GAMES_LOCK:
            game = COLOR_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            COLOR_GAME_SUBSCRIBERS.setdefault(code, []).append(subscriber)
            initial_game = color_game_public(game)

        def stream():
            yield sse_message("game", initial_game)
            try:
                while True:
                    try:
                        message = subscriber.get(timeout=25)
                        yield sse_message(message["event"], message["data"])
                    except queue.Empty:
                        yield sse_message("ping", {"ok": True})
            finally:
                with COLOR_GAMES_LOCK:
                    subscribers = COLOR_GAME_SUBSCRIBERS.get(code, [])
                    if subscriber in subscribers:
                        subscribers.remove(subscriber)

        return Response(stream_with_context(stream()), mimetype="text/event-stream")

    @app.post("/api/boggle/games")
    def create_boggle_game():
        body = request.get_json(silent=True) or {}
        game_config, error = validate_boggle_game_payload(body)
        if error:
            return jsonify({"error": error}), 400

        code = uuid.uuid4().hex[:8].upper()
        now = utc_now()
        game = {
            "code": code,
            "hostId": None,
            "size": game_config["size"],
            "timerSeconds": game_config["timerSeconds"],
            "status": "lobby",
            "board": [],
            "startsAt": None,
            "endsAt": None,
            "players": {},
            "challenges": [],
            "createdAt": now,
            "updatedAt": now,
        }
        with BOGGLE_GAMES_LOCK:
            BOGGLE_GAMES[code] = game
            BOGGLE_GAME_SUBSCRIBERS.setdefault(code, [])

        return jsonify({"game": boggle_public_game(game), "shareUrl": f"/boggle/?game={code}"}), 201

    @app.get("/api/boggle/games/<code>")
    def get_boggle_game(code: str):
        code = code.upper()
        player_id = str(request.args.get("playerId") or "").strip()
        with BOGGLE_GAMES_LOCK:
            game = BOGGLE_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] == "active" and game["endsAt"] and time.time() >= float(game["endsAt"]):
                should_finish = True
            else:
                should_finish = False
            public_game = boggle_public_game(game, player_id or None)

        if should_finish:
            finish_boggle_game(code)
            with BOGGLE_GAMES_LOCK:
                public_game = boggle_public_game(BOGGLE_GAMES[code], player_id or None)

        return jsonify({"game": public_game})

    @app.post("/api/boggle/games/<code>/players")
    def join_boggle_game(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        name = str(body.get("name") or "").strip()
        player_id = str(body.get("playerId") or "").strip()
        if not name:
            return jsonify({"error": "Name is required."}), 400
        if len(name) > 32:
            return jsonify({"error": "Name must be 32 characters or fewer."}), 400

        with BOGGLE_GAMES_LOCK:
            game = BOGGLE_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "lobby" and (not player_id or player_id not in game["players"]):
                return jsonify({"error": "This game has already started."}), 409

            now = utc_now()
            if player_id and player_id in game["players"]:
                player = game["players"][player_id]
                player["name"] = name
            else:
                player_id = secrets.token_urlsafe(10)
                player = {
                    "id": player_id,
                    "name": name,
                    "ready": False,
                    "words": [],
                    "connectedAt": now,
                }
                game["players"][player_id] = player
                if not game["hostId"]:
                    game["hostId"] = player_id

            game["updatedAt"] = now
            public_game = boggle_public_game(game, player_id)

        publish_boggle_game(code)
        return jsonify({"game": public_game, "playerId": player_id})

    @app.post("/api/boggle/games/<code>/players/<player_id>/ready")
    def set_boggle_ready(code: str, player_id: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        ready = bool(body.get("ready", True))

        with BOGGLE_GAMES_LOCK:
            game = BOGGLE_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            player = game["players"].get(player_id)
            if not player:
                return jsonify({"error": "Player was not found."}), 404
            if game["status"] != "lobby":
                return jsonify({"error": "Ready can only change before the game starts."}), 409

            player["ready"] = ready
            game["updatedAt"] = utc_now()
            public_game = boggle_public_game(game, player_id)

        publish_boggle_game(code)
        return jsonify({"game": public_game})

    @app.post("/api/boggle/games/<code>/start")
    def start_boggle_game(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()

        with BOGGLE_GAMES_LOCK:
            game = BOGGLE_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "lobby":
                return jsonify({"error": "This game has already started."}), 409
            if player_id != game["hostId"]:
                return jsonify({"error": "Only the host can start the game."}), 403
            if not game["players"]:
                return jsonify({"error": "Add at least one player before starting."}), 400
            if any(not player["ready"] for player in game["players"].values()):
                return jsonify({"error": "Everyone in the lobby must be ready."}), 409

            starts_at = time.time()
            ends_at = starts_at + game["timerSeconds"]
            game["board"] = random_boggle_board(game["size"])
            game["status"] = "active"
            game["startsAt"] = starts_at
            game["endsAt"] = ends_at
            game["updatedAt"] = utc_now()
            public_game = boggle_public_game(game, player_id)

        schedule_boggle_finish(code, game["timerSeconds"])
        publish_boggle_game(code, "started")
        return jsonify({"game": public_game})

    @app.post("/api/boggle/games/<code>/players/<player_id>/words")
    def add_boggle_word(code: str, player_id: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        word = normalize_boggle_word(str(body.get("word") or ""))
        if len(word) < 3:
            return jsonify({"error": "Words must be at least 3 letters."}), 400

        with BOGGLE_GAMES_LOCK:
            game = BOGGLE_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            player = game["players"].get(player_id)
            if not player:
                return jsonify({"error": "Player was not found."}), 404
            if game["status"] != "active":
                return jsonify({"error": "Words can only be added while the timer is running."}), 409
            if game["endsAt"] and time.time() >= float(game["endsAt"]):
                should_finish = True
            else:
                should_finish = False
            if should_finish:
                public_game = boggle_public_game(game, player_id)
            else:
                if word not in [normalize_boggle_word(existing) for existing in player["words"]]:
                    player["words"].append(word)
                    game["updatedAt"] = utc_now()
                public_game = boggle_public_game(game, player_id)

        if should_finish:
            finish_boggle_game(code)
            return jsonify({"error": "The timer has finished.", "game": public_game}), 409

        publish_boggle_game(code)
        return jsonify({"game": public_game})

    @app.post("/api/boggle/games/<code>/challenges")
    def add_boggle_challenge(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        challenger_id = str(body.get("challengerId") or "").strip()
        target_id = str(body.get("targetId") or "").strip()
        word = normalize_boggle_word(str(body.get("word") or ""))
        if not challenger_id or not target_id or not word:
            return jsonify({"error": "Challenge needs a challenger, target, and word."}), 400

        with BOGGLE_GAMES_LOCK:
            game = BOGGLE_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "finished":
                return jsonify({"error": "Challenges open after the timer finishes."}), 409
            if challenger_id not in game["players"] or target_id not in game["players"]:
                return jsonify({"error": "Player was not found."}), 404
            target = game["players"][target_id]
            if word not in [normalize_boggle_word(existing) for existing in target["words"]]:
                return jsonify({"error": "That word is not on the target player's list."}), 404

            existing = next(
                (
                    challenge
                    for challenge in game["challenges"]
                    if challenge["challengerId"] == challenger_id
                    and challenge["targetId"] == target_id
                    and challenge["word"] == word
                ),
                None,
            )
            if existing:
                game["challenges"].remove(existing)
            else:
                game["challenges"].append(
                    {
                        "challengerId": challenger_id,
                        "targetId": target_id,
                        "word": word,
                        "createdAt": utc_now(),
                    }
                )
            game["updatedAt"] = utc_now()
            public_game = boggle_public_game(game, challenger_id)

        publish_boggle_game(code)
        return jsonify({"game": public_game})

    @app.get("/api/boggle/games/<code>/events")
    def boggle_game_events(code: str):
        code = code.upper()
        player_id = str(request.args.get("playerId") or "").strip() or None
        event_queue: queue.Queue[dict[str, Any]] = queue.Queue()
        subscriber = {"queue": event_queue, "playerId": player_id}

        with BOGGLE_GAMES_LOCK:
            game = BOGGLE_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            BOGGLE_GAME_SUBSCRIBERS.setdefault(code, []).append(subscriber)
            initial_game = boggle_public_game(game, player_id)

        def stream():
            yield sse_message("game", initial_game)
            try:
                while True:
                    try:
                        message = event_queue.get(timeout=25)
                        yield sse_message(message["event"], message["data"])
                    except queue.Empty:
                        yield sse_message("ping", {"ok": True})
            finally:
                with BOGGLE_GAMES_LOCK:
                    subscribers = BOGGLE_GAME_SUBSCRIBERS.get(code, [])
                    if subscriber in subscribers:
                        subscribers.remove(subscriber)

        return Response(stream_with_context(stream()), mimetype="text/event-stream")

    @app.post("/api/backgammon/games")
    def create_remote_backgammon_game():
        code = uuid.uuid4().hex[:8].upper()
        game = create_backgammon_game(code)
        with BACKGAMMON_GAMES_LOCK:
            BACKGAMMON_GAMES[code] = game
            BACKGAMMON_GAME_SUBSCRIBERS.setdefault(code, [])
        return jsonify({"game": game, "shareUrl": f"/backgammon/?game={code}"}), 201

    @app.get("/api/backgammon/games/<code>")
    def get_remote_backgammon_game(code: str):
        code = code.upper()
        with BACKGAMMON_GAMES_LOCK:
            game = BACKGAMMON_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            return jsonify({"game": game})

    @app.post("/api/backgammon/games/<code>/roll")
    def roll_remote_backgammon_game(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        with BACKGAMMON_GAMES_LOCK:
            game = BACKGAMMON_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if not backgammon_revision_matches(body, game):
                return jsonify({"error": "The board changed. Try again."}), 409
            game, error = roll_backgammon_dice(game)
            if error:
                return jsonify({"error": error}), 409
        publish_backgammon_game(code)
        return jsonify({"game": game})

    @app.post("/api/backgammon/games/<code>/moves")
    def move_remote_backgammon_game(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        with BACKGAMMON_GAMES_LOCK:
            game = BACKGAMMON_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if not backgammon_revision_matches(body, game):
                return jsonify({"error": "The board changed. Try again."}), 409
            game, error = apply_backgammon_move(game, body)
            if error:
                return jsonify({"error": error}), 400
        publish_backgammon_game(code)
        return jsonify({"game": game})

    @app.post("/api/backgammon/games/<code>/end-turn")
    def end_remote_backgammon_turn(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        with BACKGAMMON_GAMES_LOCK:
            game = BACKGAMMON_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if not backgammon_revision_matches(body, game):
                return jsonify({"error": "The board changed. Try again."}), 409
            if not game["rolled"] or game.get("winner"):
                return jsonify({"error": "There is no active turn to end."}), 409
            advance_backgammon_turn(game)
        publish_backgammon_game(code)
        return jsonify({"game": game})

    @app.get("/api/backgammon/games/<code>/events")
    def backgammon_game_events(code: str):
        code = code.upper()
        subscriber: queue.Queue[dict[str, Any]] = queue.Queue()
        with BACKGAMMON_GAMES_LOCK:
            game = BACKGAMMON_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            BACKGAMMON_GAME_SUBSCRIBERS.setdefault(code, []).append(subscriber)
            initial_game = game

        def stream():
            yield sse_message("game", initial_game)
            try:
                while True:
                    try:
                        message = subscriber.get(timeout=25)
                        yield sse_message(message["event"], message["data"])
                    except queue.Empty:
                        yield sse_message("ping", {"ok": True})
            finally:
                with BACKGAMMON_GAMES_LOCK:
                    subscribers = BACKGAMMON_GAME_SUBSCRIBERS.get(code, [])
                    if subscriber in subscribers:
                        subscribers.remove(subscriber)

        return Response(stream_with_context(stream()), mimetype="text/event-stream")

    def whoami_player_view(game: dict[str, Any], player_id: str | None) -> dict[str, Any]:
        players = [
            {
                "id": pid,
                "name": info["name"],
                "ready": info["ready"],
                "connectedAt": info["connectedAt"],
                "isHost": info.get("isHost", False),
            }
            for pid, info in game["players"].items()
        ]
        players.sort(key=lambda item: item["connectedAt"])
        view = {
            "code": game["code"],
            "seed": game["seed"],
            "count": game["count"],
            "status": game["status"],
            "players": players,
            "messages": game["messages"],
            "events": game["events"],
            "winnerId": game.get("winnerId"),
            "winReason": game.get("winReason"),
            "createdAt": game["createdAt"],
            "updatedAt": game["updatedAt"],
        }
        if player_id and player_id in game["players"]:
            info = game["players"][player_id]
            view["playerId"] = player_id
            view["yourSecretIndex"] = info.get("secretIndex")
            view["youAreHost"] = info.get("isHost", False)
            view["yourName"] = info["name"]
            # Expose only the opponent's id/name so the client can label UI.
            opponents = [
                {"id": other_id, "name": other["name"]}
                for other_id, other in game["players"].items()
                if other_id != player_id
            ]
            view["opponents"] = opponents
        return view

    def whoami_pick_secrets(seed: int, count: int, player_ids: list[str]) -> dict[str, int]:
        rng = random.Random(seed)
        # Use the same PRNG sequence the client uses, then jump past
        # `count` characters before sampling two distinct secret indices
        # so the picker does not bias the first character in the pool.
        for _ in range(count * 7):
            rng.random()
        order = list(range(count))
        rng.shuffle(order)
        return {pid: order[index] for index, pid in enumerate(player_ids)}

    def whoami_append_event(game: dict[str, Any], event: dict[str, Any]) -> None:
        game["events"].append(event)
        if len(game["events"]) > WHOAMI_MAX_EVENTS:
            del game["events"][: len(game["events"]) - WHOAMI_MAX_EVENTS]
        game["updatedAt"] = utc_now()

    def whoami_append_message(game: dict[str, Any], message: dict[str, Any]) -> None:
        game["messages"].append(message)
        if len(game["messages"]) > WHOAMI_MAX_CHAT:
            del game["messages"][: len(game["messages"]) - WHOAMI_MAX_CHAT]
        game["updatedAt"] = utc_now()

    def whoami_publish(code: str, event_name: str = "game") -> None:
        with WHOAMI_GAMES_LOCK:
            game = WHOAMI_GAMES.get(code)
            subscribers = list(WHOAMI_GAME_SUBSCRIBERS.get(code, []))
        if not game:
            return
        for subscriber in subscribers:
            player_id = subscriber.get("playerId")
            subscriber["queue"].put(
                {"event": event_name, "data": whoami_player_view(game, player_id)}
            )

    def whoami_get_player(code: str, player_id: str) -> tuple[dict[str, Any] | None, str | None, dict[str, Any] | None]:
        with WHOAMI_GAMES_LOCK:
            game = WHOAMI_GAMES.get(code)
            if not game:
                return None, "Game was not found.", None
            if player_id not in game["players"]:
                return None, "Player was not found.", None
            return game, None, game["players"][player_id]

    @app.post("/api/whoami/games")
    def create_whoami_game():
        now = utc_now()
        code = uuid.uuid4().hex[:8].upper()
        # Seed range 1..2**31-2; 0 is reserved as "no seed" by some clients.
        seed = secrets.randbelow(2**31 - 1) + 1
        game: dict[str, Any] = {
            "code": code,
            "seed": seed,
            "count": WHOAMI_POOL_SIZE,
            "status": "lobby",
            "players": {},
            "messages": [],
            "events": [],
            "winnerId": None,
            "winReason": None,
            "createdAt": now,
            "updatedAt": now,
        }
        with WHOAMI_GAMES_LOCK:
            WHOAMI_GAMES[code] = game
            WHOAMI_GAME_SUBSCRIBERS.setdefault(code, [])
        return jsonify({"game": whoami_player_view(game, None), "shareUrl": f"/whoami/?game={code}"}), 201

    @app.get("/api/whoami/games/<code>")
    def get_whoami_game(code: str):
        code = code.upper()
        player_id = str(request.args.get("playerId") or "").strip() or None
        with WHOAMI_GAMES_LOCK:
            game = WHOAMI_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            return jsonify({"game": whoami_player_view(game, player_id)})

    @app.post("/api/whoami/games/<code>/players")
    def join_whoami_game(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        name = str(body.get("name") or "").strip()
        provided_id = str(body.get("playerId") or "").strip()
        if not name:
            return jsonify({"error": "Name is required."}), 400
        if len(name) > 24:
            return jsonify({"error": "Name must be 24 characters or fewer."}), 400

        now = utc_now()
        with WHOAMI_GAMES_LOCK:
            game = WHOAMI_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "lobby":
                return jsonify({"error": "This game has already started."}), 409
            if provided_id and provided_id in game["players"]:
                player = game["players"][provided_id]
                player["name"] = name
                player_id = provided_id
            else:
                if len(game["players"]) >= WHOAMI_MAX_PLAYERS:
                    return jsonify({"error": "This game is full."}), 409
                player_id = secrets.token_urlsafe(8)
                is_host = not game["players"]
                game["players"][player_id] = {
                    "id": player_id,
                    "name": name,
                    "ready": False,
                    "connectedAt": now,
                    "secretIndex": None,
                    "isHost": is_host,
                }
            game["updatedAt"] = now

        whoami_publish(code, "joined")
        with WHOAMI_GAMES_LOCK:
            return jsonify({"game": whoami_player_view(WHOAMI_GAMES[code], player_id), "playerId": player_id})

    @app.post("/api/whoami/games/<code>/players/<player_id>/ready")
    def whoami_set_ready(code: str, player_id: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        ready = bool(body.get("ready", True))
        with WHOAMI_GAMES_LOCK:
            game = WHOAMI_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "lobby":
                return jsonify({"error": "Ready can only change before the game starts."}), 409
            player = game["players"].get(player_id)
            if not player:
                return jsonify({"error": "Player was not found."}), 404
            player["ready"] = ready
            game["updatedAt"] = utc_now()

        whoami_publish(code)
        with WHOAMI_GAMES_LOCK:
            return jsonify({"game": whoami_player_view(WHOAMI_GAMES[code], player_id)})

    @app.post("/api/whoami/games/<code>/start")
    def whoami_start_game(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        with WHOAMI_GAMES_LOCK:
            game = WHOAMI_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "lobby":
                return jsonify({"error": "This game has already started."}), 409
            if player_id and player_id not in game["players"]:
                return jsonify({"error": "Player was not found."}), 404
            if len(game["players"]) < WHOAMI_MIN_PLAYERS:
                return jsonify({"error": "Wait for an opponent to join."}), 409
            if any(not info["ready"] for info in game["players"].values()):
                return jsonify({"error": "Both players must be ready first."}), 409

            player_ids = list(game["players"].keys())
            secrets_for_players = whoami_pick_secrets(game["seed"], game["count"], player_ids)
            for pid, secret_index in secrets_for_players.items():
                game["players"][pid]["secretIndex"] = secret_index
                game["players"][pid]["ready"] = False
            game["status"] = "active"
            game["updatedAt"] = utc_now()
            whoami_append_event(
                game,
                {
                    "type": "system",
                    "text": "The game has started. Ask your first question!",
                    "at": utc_now(),
                },
            )

        whoami_publish(code, "started")
        with WHOAMI_GAMES_LOCK:
            return jsonify({"game": whoami_player_view(WHOAMI_GAMES[code], player_id or None)})

    @app.post("/api/whoami/games/<code>/messages")
    def whoami_send_message(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        text = str(body.get("text") or "").strip()
        player_id = str(body.get("playerId") or "").strip()
        if not text:
            return jsonify({"error": "Message is empty."}), 400
        if len(text) > 240:
            return jsonify({"error": "Message is too long (240 characters max)."}), 400
        with WHOAMI_GAMES_LOCK:
            game = WHOAMI_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] == "lobby":
                return jsonify({"error": "Chat opens once the game starts."}), 409
            player = game["players"].get(player_id)
            if not player:
                return jsonify({"error": "Player was not found."}), 404
            whoami_append_message(
                game,
                {
                    "id": secrets.token_urlsafe(6),
                    "fromId": player_id,
                    "fromName": player["name"],
                    "text": text,
                    "at": utc_now(),
                },
            )

        whoami_publish(code, "chat")
        with WHOAMI_GAMES_LOCK:
            return jsonify({"game": whoami_player_view(WHOAMI_GAMES[code], player_id)})

    @app.post("/api/whoami/games/<code>/questions")
    def whoami_ask_question(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        question_label = str(body.get("label") or "").strip()
        player_id = str(body.get("playerId") or "").strip()
        if not question_label:
            return jsonify({"error": "Question is empty."}), 400
        if len(question_label) > 140:
            return jsonify({"error": "Question is too long."}), 400
        with WHOAMI_GAMES_LOCK:
            game = WHOAMI_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "active":
                return jsonify({"error": "Questions can only be asked during an active game."}), 409
            asker = game["players"].get(player_id)
            if not asker:
                return jsonify({"error": "Player was not found."}), 404
            event = {
                "id": secrets.token_urlsafe(6),
                "type": "question",
                "askerId": player_id,
                "askerName": asker["name"],
                "label": question_label,
                "answer": None,
                "answeredById": None,
                "answeredByName": None,
                "at": utc_now(),
            }
            whoami_append_event(game, event)

        whoami_publish(code, "question")
        with WHOAMI_GAMES_LOCK:
            return jsonify({"game": whoami_player_view(WHOAMI_GAMES[code], player_id), "event": event})

    @app.post("/api/whoami/games/<code>/answers")
    def whoami_answer_question(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        event_id = str(body.get("eventId") or "").strip()
        answer = body.get("answer")
        player_id = str(body.get("playerId") or "").strip()
        if answer not in {"yes", "no"}:
            return jsonify({"error": "Answer must be yes or no."}), 400
        with WHOAMI_GAMES_LOCK:
            game = WHOAMI_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "active":
                return jsonify({"error": "The game is not active."}), 409
            event = next((item for item in game["events"] if item.get("id") == event_id and item.get("type") == "question"), None)
            if not event:
                return jsonify({"error": "Question has expired."}), 404
            if event.get("answer") is not None:
                return jsonify({"error": "That question already has an answer."}), 409
            if event["askerId"] == player_id:
                return jsonify({"error": "The asker cannot answer their own question."}), 400
            responder = game["players"].get(player_id)
            if not responder:
                return jsonify({"error": "Player was not found."}), 404
            event["answer"] = answer
            event["answeredById"] = player_id
            event["answeredByName"] = responder["name"]
            game["updatedAt"] = utc_now()

        whoami_publish(code, "answer")
        with WHOAMI_GAMES_LOCK:
            return jsonify({"game": whoami_player_view(WHOAMI_GAMES[code], player_id)})

    @app.post("/api/whoami/games/<code>/guess")
    def whoami_make_guess(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        try:
            guess_index = int(body.get("characterIndex"))
        except (TypeError, ValueError):
            return jsonify({"error": "Pick a character to guess."}), 400
        player_id = str(body.get("playerId") or "").strip()
        with WHOAMI_GAMES_LOCK:
            game = WHOAMI_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "active":
                return jsonify({"error": "The game is not active."}), 409
            if guess_index < 0 or guess_index >= game["count"]:
                return jsonify({"error": "That character is not in the pool."}), 400
            guesser = game["players"].get(player_id)
            if not guesser:
                return jsonify({"error": "Player was not found."}), 404
            opponent_id = next((pid for pid in game["players"] if pid != player_id), None)
            if not opponent_id:
                return jsonify({"error": "Waiting on an opponent."}), 409
            opponent_secret = game["players"][opponent_id]["secretIndex"]
            correct = opponent_secret is not None and opponent_secret == guess_index
            whoami_append_event(
                game,
                {
                    "id": secrets.token_urlsafe(6),
                    "type": "guess",
                    "guesserId": player_id,
                    "guesserName": guesser["name"],
                    "targetId": opponent_id,
                    "targetName": game["players"][opponent_id]["name"],
                    "characterIndex": guess_index,
                    "correct": correct,
                    "at": utc_now(),
                },
            )
            if correct:
                game["status"] = "finished"
                game["winnerId"] = player_id
                game["winReason"] = "correct_guess"
                game["updatedAt"] = utc_now()
            else:
                game["updatedAt"] = utc_now()

        whoami_publish(code, "guess")
        with WHOAMI_GAMES_LOCK:
            return jsonify({"game": whoami_player_view(WHOAMI_GAMES[code], player_id)})

    @app.get("/api/whoami/games/<code>/events")
    def whoami_game_events(code: str):
        code = code.upper()
        player_id = str(request.args.get("playerId") or "").strip() or None
        event_queue: queue.Queue[dict[str, Any]] = queue.Queue()
        subscriber = {"queue": event_queue, "playerId": player_id}
        with WHOAMI_GAMES_LOCK:
            game = WHOAMI_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            WHOAMI_GAME_SUBSCRIBERS.setdefault(code, []).append(subscriber)
            initial_game = whoami_player_view(game, player_id)

        def stream():
            yield sse_message("game", initial_game)
            try:
                while True:
                    try:
                        message = event_queue.get(timeout=25)
                        yield sse_message(message["event"], message["data"])
                    except queue.Empty:
                        yield sse_message("ping", {"ok": True})
            finally:
                with WHOAMI_GAMES_LOCK:
                    subscribers = WHOAMI_GAME_SUBSCRIBERS.get(code, [])
                    if subscriber in subscribers:
                        subscribers.remove(subscriber)

        return Response(stream_with_context(stream()), mimetype="text/event-stream")

    def hangman_normalize_word(text: str) -> str:
        # Hangman strips anything that isn't a letter or a space/hyphen/apostrophe,
        # and then squashes runs of whitespace. We keep spaces visible so the
        # guesser sees the gap layout, but we don't require the picker to type
        # exact spacing.
        cleaned = re.sub(r"[^A-Za-z\s\-']", "", text)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned.upper()

    def hangman_letters_in(word: str) -> set[str]:
        return {char for char in word if char.isalpha()}

    def hangman_build_pattern(word: str, guessed: set[str]) -> str:
        return "".join(
            char if (not char.isalpha()) or char in guessed else "_"
            for char in word
        )

    def hangman_is_won(word: str, guessed: set[str]) -> bool:
        return hangman_letters_in(word).issubset(guessed)

    def hangman_rotate_picker(game: dict[str, Any]) -> None:
        player_ids = list(game["players"].keys())
        if len(player_ids) < 2:
            return
        current = game.get("pickerId")
        try:
            index = player_ids.index(current) if current in player_ids else -1
        except ValueError:
            index = -1
        game["pickerId"] = player_ids[(index + 1) % len(player_ids)]

    def hangman_create_round(game: dict[str, Any], rotate: bool = True) -> dict[str, Any]:
        # Pick the next picker (rotate from the previous one) and return the
        # fresh, "pending" round record. The picker still needs to submit
        # the word before the guesser can play. Pass rotate=False to keep
        # the current picker (used when the table first opens so the host
        # picks the very first word).
        if rotate:
            hangman_rotate_picker(game)
        game["roundNumber"] = game.get("roundNumber", 0) + 1
        return {
            "number": game["roundNumber"],
            "pickerId": game["pickerId"],
            "status": "pending",
            "word": None,
            "guessed": [],
            "wrongCount": 0,
            "result": None,
            "setAt": None,
            "finishedAt": None,
        }

    def hangman_player_view(game: dict[str, Any], player_id: str | None) -> dict[str, Any]:
        players = [
            {
                "id": pid,
                "name": info["name"],
                "ready": info["ready"],
                "isHost": info.get("isHost", False),
                "connectedAt": info.get("connectedAt"),
            }
            for pid, info in game["players"].items()
        ]
        players.sort(key=lambda item: item.get("connectedAt") or "")

        round_data = game.get("currentRound")
        round_public: dict[str, Any] | None = None
        if round_data is not None:
            # The word is private to the picker during the "active" phase.
            # Once the round is "finished" we reveal it to everyone.
            show_word = round_data["status"] == "finished"
            is_picker = player_id is not None and player_id == round_data["pickerId"]
            word = round_data["word"] if (show_word or is_picker) else None
            guessed = {entry["letter"] for entry in round_data.get("guessed", [])}
            pattern = (
                hangman_build_pattern(round_data["word"], guessed)
                if (show_word or is_picker) and round_data.get("word")
                else None
            )
            round_public = {
                "number": round_data["number"],
                "pickerId": round_data["pickerId"],
                "status": round_data["status"],
                "word": word,
                "pattern": pattern,
                "guessed": list(round_data.get("guessed", [])),
                "wrongCount": round_data.get("wrongCount", 0),
                "maxWrong": HANGMAN_MAX_WRONG,
                "result": round_data.get("result"),
                "setAt": round_data.get("setAt"),
                "finishedAt": round_data.get("finishedAt"),
            }

        view = {
            "code": game["code"],
            "category": game.get("category"),
            "maxWrong": HANGMAN_MAX_WRONG,
            "status": game["status"],
            "players": players,
            "pickerId": game.get("pickerId"),
            "roundNumber": game.get("roundNumber", 0),
            "currentRound": round_public,
            "history": game.get("history", []),
            "score": game.get("score", {}),
            "roundsPlayed": game.get("roundsPlayed", 0),
            "createdAt": game["createdAt"],
            "updatedAt": game["updatedAt"],
        }
        if player_id and player_id in game["players"]:
            info = game["players"][player_id]
            view["playerId"] = player_id
            view["yourName"] = info["name"]
            view["youAreHost"] = info.get("isHost", False)
            view["youArePicker"] = (
                round_data is not None and player_id == round_data["pickerId"]
            )
            view["youCanPickNext"] = (
                game["status"] == "active"
                and (round_data is None or round_data["status"] == "finished")
                and player_id == game.get("pickerId")
            )
            opponents = [
                {"id": other_id, "name": other["name"]}
                for other_id, other in game["players"].items()
                if other_id != player_id
            ]
            view["opponents"] = opponents
        return view

    def hangman_publish(code: str, event_name: str = "game") -> None:
        with HANGMAN_GAMES_LOCK:
            game = HANGMAN_GAMES.get(code)
            subscribers = list(HANGMAN_GAME_SUBSCRIBERS.get(code, []))
        if not game:
            return
        for subscriber in subscribers:
            player_id = subscriber.get("playerId")
            subscriber["queue"].put(
                {"event": event_name, "data": hangman_player_view(game, player_id)}
            )

    @app.post("/api/hangman/games")
    def create_hangman_game():
        body = request.get_json(silent=True) or {}
        category = str(body.get("category") or "").strip()
        if len(category) > HANGMAN_MAX_CATEGORY:
            return jsonify({"error": f"Category must be {HANGMAN_MAX_CATEGORY} characters or fewer."}), 400

        now = utc_now()
        code = uuid.uuid4().hex[:8].upper()
        game: dict[str, Any] = {
            "code": code,
            "category": category or None,
            "hostId": None,
            "players": {},
            "status": "lobby",
            "pickerId": None,
            "roundNumber": 0,
            "currentRound": None,
            "history": [],
            "score": {},
            "roundsPlayed": 0,
            "createdAt": now,
            "updatedAt": now,
        }
        with HANGMAN_GAMES_LOCK:
            HANGMAN_GAMES[code] = game
            HANGMAN_GAME_SUBSCRIBERS.setdefault(code, [])
        return jsonify({"game": hangman_player_view(game, None), "shareUrl": f"/hangman/?game={code}"}), 201

    @app.get("/api/hangman/games/<code>")
    def get_hangman_game(code: str):
        code = code.upper()
        player_id = str(request.args.get("playerId") or "").strip() or None
        with HANGMAN_GAMES_LOCK:
            game = HANGMAN_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            return jsonify({"game": hangman_player_view(game, player_id)})

    @app.post("/api/hangman/games/<code>/players")
    def join_hangman_game(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        name = str(body.get("name") or "").strip()
        provided_id = str(body.get("playerId") or "").strip()
        if not name:
            return jsonify({"error": "Name is required."}), 400
        if len(name) > 24:
            return jsonify({"error": "Name must be 24 characters or fewer."}), 400

        now = utc_now()
        with HANGMAN_GAMES_LOCK:
            game = HANGMAN_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "lobby":
                return jsonify({"error": "This game has already started."}), 409
            if provided_id and provided_id in game["players"]:
                player = game["players"][provided_id]
                player["name"] = name
                player_id = provided_id
            else:
                if len(game["players"]) >= HANGMAN_MAX_PLAYERS:
                    return jsonify({"error": "This table is full."}), 409
                player_id = secrets.token_urlsafe(8)
                is_host = not game["players"]
                if is_host:
                    game["hostId"] = player_id
                game["players"][player_id] = {
                    "id": player_id,
                    "name": name,
                    "ready": False,
                    "isHost": is_host,
                    "connectedAt": now,
                }
            game["updatedAt"] = now

        hangman_publish(code, "joined")
        with HANGMAN_GAMES_LOCK:
            return jsonify({"game": hangman_player_view(HANGMAN_GAMES[code], player_id), "playerId": player_id})

    @app.post("/api/hangman/games/<code>/players/<player_id>/ready")
    def hangman_set_ready(code: str, player_id: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        ready = bool(body.get("ready", True))
        with HANGMAN_GAMES_LOCK:
            game = HANGMAN_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "lobby":
                return jsonify({"error": "Ready can only change before the table starts."}), 409
            player = game["players"].get(player_id)
            if not player:
                return jsonify({"error": "Player was not found."}), 404
            player["ready"] = ready
            game["updatedAt"] = utc_now()

        hangman_publish(code)
        with HANGMAN_GAMES_LOCK:
            return jsonify({"game": hangman_player_view(HANGMAN_GAMES[code], player_id)})

    @app.post("/api/hangman/games/<code>/start")
    def hangman_start_game(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        with HANGMAN_GAMES_LOCK:
            game = HANGMAN_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "lobby":
                return jsonify({"error": "This table has already started."}), 409
            if player_id and player_id not in game["players"]:
                return jsonify({"error": "Player was not found."}), 404
            if len(game["players"]) < HANGMAN_MIN_PLAYERS:
                return jsonify({"error": "Wait for an opponent to join."}), 409
            if any(not info["ready"] for info in game["players"].values()):
                return jsonify({"error": "Both players must be ready first."}), 409

            # Host picks first. Score starts at 0 for every player.
            host_id = game.get("hostId") or next(iter(game["players"]))
            game["status"] = "active"
            game["pickerId"] = host_id
            game["score"] = {pid: 0 for pid in game["players"]}
            game["currentRound"] = hangman_create_round(game, rotate=False)
            game["updatedAt"] = utc_now()

        hangman_publish(code, "started")
        with HANGMAN_GAMES_LOCK:
            return jsonify({"game": hangman_player_view(HANGMAN_GAMES[code], player_id or None)})

    @app.post("/api/hangman/games/<code>/rounds")
    def hangman_set_word(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        raw_word = str(body.get("word") or "")
        word = hangman_normalize_word(raw_word)
        if not player_id:
            return jsonify({"error": "Player is required."}), 400
        if not word:
            return jsonify({"error": "Enter a word with at least one letter."}), 400
        if len(word) > HANGMAN_MAX_WORD:
            return jsonify({"error": f"Word must be {HANGMAN_MAX_WORD} characters or fewer."}), 400
        if not any(char.isalpha() for char in word):
            return jsonify({"error": "Word must contain at least one letter."}), 400

        with HANGMAN_GAMES_LOCK:
            game = HANGMAN_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "active":
                return jsonify({"error": "The table is not in play."}), 409
            round_data = game.get("currentRound")
            if not round_data:
                return jsonify({"error": "There is no active round."}), 409
            if round_data["status"] != "pending":
                return jsonify({"error": "A word has already been set for this round."}), 409
            if player_id != round_data["pickerId"]:
                return jsonify({"error": "Only the picker can set the word."}), 403

            round_data["word"] = word
            round_data["status"] = "active"
            round_data["setAt"] = utc_now()
            game["updatedAt"] = utc_now()

        hangman_publish(code, "round")
        with HANGMAN_GAMES_LOCK:
            return jsonify({"game": hangman_player_view(HANGMAN_GAMES[code], player_id)})

    @app.post("/api/hangman/games/<code>/guess")
    def hangman_guess(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        letter = str(body.get("letter") or "").strip().upper()
        if len(letter) != 1 or not letter.isalpha():
            return jsonify({"error": "Pick a single letter A–Z."}), 400

        with HANGMAN_GAMES_LOCK:
            game = HANGMAN_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "active":
                return jsonify({"error": "The table is not in play."}), 409
            round_data = game.get("currentRound")
            if not round_data or round_data["status"] != "active":
                return jsonify({"error": "The guesser can only play during an active round."}), 409
            if player_id == round_data["pickerId"]:
                return jsonify({"error": "The picker waits while the guesser plays."}), 403
            if player_id not in game["players"]:
                return jsonify({"error": "Player was not found."}), 404

            already = {entry["letter"] for entry in round_data["guessed"]}
            if letter in already:
                return jsonify({"error": "That letter has already been guessed."}), 409

            word = round_data["word"]
            correct = letter in word
            round_data["guessed"].append(
                {
                    "letter": letter,
                    "correct": correct,
                    "byId": player_id,
                    "at": utc_now(),
                }
            )
            if not correct:
                round_data["wrongCount"] += 1

            if hangman_is_won(word, already | {letter}):
                round_data["status"] = "finished"
                round_data["result"] = "won"
                round_data["finishedAt"] = utc_now()
                game["score"][player_id] = game["score"].get(player_id, 0) + 1
                game["roundsPlayed"] = game.get("roundsPlayed", 0) + 1
                game["history"].insert(
                    0,
                    {
                        "number": round_data["number"],
                        "word": word,
                        "result": "won",
                        "winnerId": player_id,
                        "wrongCount": round_data["wrongCount"],
                    },
                )
            elif round_data["wrongCount"] >= HANGMAN_MAX_WRONG:
                round_data["status"] = "finished"
                round_data["result"] = "lost"
                round_data["finishedAt"] = utc_now()
                game["roundsPlayed"] = game.get("roundsPlayed", 0) + 1
                game["history"].insert(
                    0,
                    {
                        "number": round_data["number"],
                        "word": word,
                        "result": "lost",
                        "winnerId": round_data["pickerId"],
                        "wrongCount": round_data["wrongCount"],
                    },
                )
                # When the guesser loses, the picker "wins" the round for scoring.
                picker_id = round_data["pickerId"]
                if picker_id in game["score"]:
                    game["score"][picker_id] = game["score"].get(picker_id, 0) + 1
            if len(game["history"]) > HANGMAN_MAX_HISTORY:
                game["history"] = game["history"][:HANGMAN_MAX_HISTORY]
            game["updatedAt"] = utc_now()

        event_name = "guess" if round_data["status"] == "active" else "round"
        hangman_publish(code, event_name)
        with HANGMAN_GAMES_LOCK:
            return jsonify({"game": hangman_player_view(HANGMAN_GAMES[code], player_id)})

    @app.post("/api/hangman/games/<code>/next")
    def hangman_next_round(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        with HANGMAN_GAMES_LOCK:
            game = HANGMAN_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "active":
                return jsonify({"error": "The table is not in play."}), 409
            if player_id not in game["players"]:
                return jsonify({"error": "Player was not found."}), 404
            round_data = game.get("currentRound")
            if round_data and round_data["status"] != "finished":
                return jsonify({"error": "The current round is still in play."}), 409
            # The picker advances the round; the next round will then rotate
            # to the other player inside hangman_create_round.
            if player_id != game.get("pickerId"):
                return jsonify({"error": "Wait for the picker to advance the round."}), 403
            game["currentRound"] = hangman_create_round(game)
            game["updatedAt"] = utc_now()

        hangman_publish(code, "round")
        with HANGMAN_GAMES_LOCK:
            return jsonify({"game": hangman_player_view(HANGMAN_GAMES[code], player_id)})

    @app.get("/api/hangman/games/<code>/events")
    def hangman_game_events(code: str):
        code = code.upper()
        player_id = str(request.args.get("playerId") or "").strip() or None
        event_queue: queue.Queue[dict[str, Any]] = queue.Queue()
        subscriber = {"queue": event_queue, "playerId": player_id}
        with HANGMAN_GAMES_LOCK:
            game = HANGMAN_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            HANGMAN_GAME_SUBSCRIBERS.setdefault(code, []).append(subscriber)
            initial_game = hangman_player_view(game, player_id)

        def stream():
            yield sse_message("game", initial_game)
            try:
                while True:
                    try:
                        message = event_queue.get(timeout=25)
                        yield sse_message(message["event"], message["data"])
                    except queue.Empty:
                        yield sse_message("ping", {"ok": True})
            finally:
                with HANGMAN_GAMES_LOCK:
                    subscribers = HANGMAN_GAME_SUBSCRIBERS.get(code, [])
                    if subscriber in subscribers:
                        subscribers.remove(subscriber)

        return Response(stream_with_context(stream()), mimetype="text/event-stream")

    # ============================================================
    # CHECKERS — perfect-information board game with a creator-chosen
    # board width (8/10/12). The host plays red from the bottom, the
    # guest black from the top, and black opens. American rules:
    # mandatory captures, chained multi-jumps, crowning ends a move.
    # ============================================================

    def checkers_starting_rows(size: int) -> int:
        return size // 2 - 1

    def checkers_new_board(size: int) -> list[list[dict[str, Any] | None]]:
        rows = checkers_starting_rows(size)
        board: list[list[dict[str, Any] | None]] = [[None] * size for _ in range(size)]
        for r in range(rows):
            for c in range(size):
                if (r + c) % 2 == 1:
                    board[r][c] = {"color": "black", "king": False}
        for r in range(size - rows, size):
            for c in range(size):
                if (r + c) % 2 == 1:
                    board[r][c] = {"color": "red", "king": False}
        return board

    def checkers_create_game(size: int) -> dict[str, Any]:
        now = utc_now()
        return {
            "code": uuid.uuid4().hex[:8].upper(),
            "size": size,
            "status": "lobby",
            "round": 1,
            "turnId": None,
            "turnColor": None,
            "chainFrom": None,
            "quiet": 0,
            "winnerId": None,
            "winReason": None,
            "players": {},
            "board": checkers_new_board(size),
            "log": [],
            "createdAt": now,
            "updatedAt": now,
        }

    def checkers_append_log(game: dict[str, Any], text: str) -> None:
        game["log"].append({"text": text, "at": utc_now()})
        if len(game["log"]) > CHECKERS_MAX_LOG:
            del game["log"][: len(game["log"]) - CHECKERS_MAX_LOG]
        game["updatedAt"] = utc_now()

    def checkers_cell_label(size: int, row: int, col: int) -> str:
        # Rank numbers count up from the RED side (bottom) so both players
        # can reference squares the same way regardless of orientation.
        return f"{chr(ord('A') + col)}{size - row}"

    def checkers_piece_jumps(board: list[list[dict[str, Any] | None]], size: int, r: int, c: int) -> list[list[int]]:
        piece = board[r][c]
        if not piece:
            return []
        if piece["king"]:
            directions = [(-1, -1), (-1, 1), (1, -1), (1, 1)]
        elif piece["color"] == "black":
            directions = [(1, -1), (1, 1)]
        else:
            directions = [(-1, -1), (-1, 1)]
        jumps = []
        for dr, dc in directions:
            mr, mc = r + dr, c + dc
            lr, lc = r + 2 * dr, c + 2 * dc
            if not (0 <= lr < size and 0 <= lc < size):
                continue
            over = board[mr][mc]
            if over and over["color"] != piece["color"] and board[lr][lc] is None:
                jumps.append([lr, lc])
        return jumps

    def checkers_piece_steps(board: list[list[dict[str, Any] | None]], size: int, r: int, c: int) -> list[list[int]]:
        piece = board[r][c]
        if not piece:
            return []
        if piece["king"]:
            directions = [(-1, -1), (-1, 1), (1, -1), (1, 1)]
        elif piece["color"] == "black":
            directions = [(1, -1), (1, 1)]
        else:
            directions = [(-1, -1), (-1, 1)]
        steps = []
        for dr, dc in directions:
            sr, sc = r + dr, c + dc
            if 0 <= sr < size and 0 <= sc < size and board[sr][sc] is None:
                steps.append([sr, sc])
        return steps

    def checkers_any_jumps(board: list[list[dict[str, Any] | None]], size: int, color: str) -> bool:
        for r in range(size):
            for c in range(size):
                piece = board[r][c]
                if piece and piece["color"] == color and checkers_piece_jumps(board, size, r, c):
                    return True
        return False

    def checkers_legal_targets(game: dict[str, Any], r: int, c: int) -> list[list[int]]:
        """Targets for one piece, honoring mandatory captures and jump chains."""
        board, size = game["board"], game["size"]
        piece = board[r][c]
        if not piece or piece["color"] != game["turnColor"]:
            return []
        if game["chainFrom"] and game["chainFrom"] != [r, c]:
            return []
        jumps = checkers_piece_jumps(board, size, r, c)
        if jumps or game["chainFrom"] or checkers_any_jumps(board, size, piece["color"]):
            return jumps
        return checkers_piece_steps(board, size, r, c)

    def checkers_player_view(game: dict[str, Any], player_id: str | None) -> dict[str, Any]:
        players = []
        for pid, info in game["players"].items():
            players.append(
                {
                    "id": pid,
                    "name": info["name"],
                    "isHost": info.get("isHost", False),
                    "connectedAt": info.get("connectedAt"),
                    "color": info["color"],
                }
            )
        players.sort(key=lambda item: item["connectedAt"] or "")
        view: dict[str, Any] = {
            "code": game["code"],
            "status": game["status"],
            "round": game["round"],
            "size": game["size"],
            "players": players,
            "board": game["board"],
            "turnId": game["turnId"],
            "turnColor": game.get("turnColor"),
            "chainFrom": game["chainFrom"],
            "winnerId": game["winnerId"],
            "winReason": game["winReason"],
            "log": list(game["log"]),
            "createdAt": game["createdAt"],
            "updatedAt": game["updatedAt"],
        }
        if not player_id or player_id not in game["players"]:
            return view
        me = game["players"][player_id]
        view["playerId"] = player_id
        view["youAreHost"] = me.get("isHost", False)
        view["yourName"] = me["name"]
        view["yourColor"] = me["color"]
        view["yourTurn"] = game["status"] == "active" and game["turnId"] == player_id
        view["opponents"] = [
            {"id": pid, "name": p["name"], "color": p["color"]}
            for pid, p in game["players"].items()
            if pid != player_id
        ]
        return view

    def checkers_publish(code: str, event_name: str = "game") -> None:
        with CHECKERS_GAMES_LOCK:
            game = CHECKERS_GAMES.get(code)
            subscribers = list(CHECKERS_GAME_SUBSCRIBERS.get(code, []))
        if not game:
            return
        for subscriber in subscribers:
            player_id = subscriber.get("playerId")
            subscriber["queue"].put({"event": event_name, "data": checkers_player_view(game, player_id)})

    @app.post("/api/checkers/games")
    def create_checkers_game():
        body = request.get_json(silent=True) or {}
        try:
            size = int(body.get("size") or 8)
        except (TypeError, ValueError):
            return jsonify({"error": "Board size must be 8, 10, or 12."}), 400
        if size not in CHECKERS_SIZES:
            return jsonify({"error": "Board size must be 8, 10, or 12."}), 400
        game = checkers_create_game(size)
        with CHECKERS_GAMES_LOCK:
            CHECKERS_GAMES[game["code"]] = game
            CHECKERS_GAME_SUBSCRIBERS.setdefault(game["code"], [])
        return jsonify({"game": checkers_player_view(game, None), "shareUrl": f"/checkers/?game={game['code']}"}), 201

    @app.get("/api/checkers/games/<code>")
    def get_checkers_game(code: str):
        code = code.upper()
        player_id = str(request.args.get("playerId") or "").strip() or None
        with CHECKERS_GAMES_LOCK:
            game = CHECKERS_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            return jsonify({"game": checkers_player_view(game, player_id)})

    @app.post("/api/checkers/games/<code>/players")
    def join_checkers_game(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        name = str(body.get("name") or "").strip()
        provided_id = str(body.get("playerId") or "").strip()
        if not name:
            return jsonify({"error": "Name is required."}), 400
        if len(name) > 24:
            return jsonify({"error": "Name must be 24 characters or fewer."}), 400

        now = utc_now()
        with CHECKERS_GAMES_LOCK:
            game = CHECKERS_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "lobby":
                return jsonify({"error": "This game has already started."}), 409
            if provided_id and provided_id in game["players"]:
                player = game["players"][provided_id]
                player["name"] = name
                player_id = provided_id
            else:
                if len(game["players"]) >= 2:
                    return jsonify({"error": "This game is full."}), 409
                player_id = secrets.token_urlsafe(8)
                is_host = not game["players"]
                color = "red" if is_host else "black"
                game["players"][player_id] = {
                    "id": player_id,
                    "name": name,
                    "isHost": is_host,
                    "connectedAt": now,
                    "color": color,
                }
            game["updatedAt"] = now

        checkers_publish(code, "joined")
        with CHECKERS_GAMES_LOCK:
            return jsonify({"game": checkers_player_view(CHECKERS_GAMES[code], player_id), "playerId": player_id})

    @app.post("/api/checkers/games/<code>/start")
    def start_checkers_game(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        with CHECKERS_GAMES_LOCK:
            game = CHECKERS_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "lobby":
                return jsonify({"error": "This game has already started."}), 409
            if len(game["players"]) < 2:
                return jsonify({"error": "Wait for your opponent to join."}), 409
            if player_id and player_id not in game["players"]:
                return jsonify({"error": "Player was not found."}), 404
            game["status"] = "active"
            # Black opens, per convention.
            game["turnId"] = next(pid for pid, p in game["players"].items() if p["color"] == "black")
            game["turnColor"] = "black"
            game["updatedAt"] = utc_now()
            checkers_append_log(game, f"Round {game['round']}. Black moves first!")

        checkers_publish(code, "started")
        with CHECKERS_GAMES_LOCK:
            return jsonify({"game": checkers_player_view(CHECKERS_GAMES[code], player_id or None)})

    @app.post("/api/checkers/games/<code>/players/<player_id>/move")
    def checkers_move(code: str, player_id: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        move = body.get("move") or {}
        try:
            fr, fc = int(move["from"][0]), int(move["from"][1])
            tr, tc = int(move["to"][0]), int(move["to"][1])
        except (KeyError, TypeError, ValueError, IndexError):
            return jsonify({"error": "A move needs from/to squares."}), 400

        with CHECKERS_GAMES_LOCK:
            game = CHECKERS_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "active":
                return jsonify({"error": "The game is not in progress."}), 409
            if game["turnId"] != player_id:
                return jsonify({"error": "It is not your turn."}), 403
            player = game["players"].get(player_id)
            if not player:
                return jsonify({"error": "Player was not found."}), 404

            board, size = game["board"], game["size"]
            game["turnColor"] = player["color"]
            targets = checkers_legal_targets(game, fr, fc)
            if not targets:
                return jsonify({"error": "That piece cannot move right now."}), 400
            if [tr, tc] not in targets:
                return jsonify({"error": "That move is not legal."}), 400

            piece = board[fr][fc]
            is_jump = abs(tr - fr) == 2
            captured_label = None
            if is_jump:
                mid = board[(fr + tr) // 2][(fc + tc) // 2]
                captured_label = "a king" if mid and mid["king"] else "a man"
                board[(fr + tr) // 2][(fc + tc) // 2] = None
                game["quiet"] = 0
            else:
                game["quiet"] += 1
            board[tr][tc] = piece
            board[fr][fc] = None

            moved_label = "king" if piece["king"] else "man"
            text = f"{player['name']} moved the {player['color']} {moved_label} {checkers_cell_label(size, fr, fc)} to {checkers_cell_label(size, tr, tc)}"
            crowned = False
            if not piece["king"]:
                home_row = size - 1 if piece["color"] == "black" else 0
                if tr == home_row:
                    piece["king"] = True
                    crowned = True
                    text += " — crowned!"
            if is_jump and not captured_label:
                captured_label = "a man"
            if is_jump:
                text += f", capturing {captured_label}"
            checkers_append_log(game, text + ".")

            # Chained captures continue the same turn (a freshly crowned king
            # stops, per American rules).
            chained = is_jump and not crowned and checkers_piece_jumps(board, size, tr, tc)
            if chained:
                game["chainFrom"] = [tr, tc]
                checkers_append_log(game, f"{player['name']} must keep jumping!")
                public_view = checkers_player_view(game, player_id)
            else:
                game["chainFrom"] = None

                next_pid = next(pid for pid in game["players"] if pid != player_id)
                next_color = game["players"][next_pid]["color"]
                if game["quiet"] >= CHECKERS_DRAW_QUIET:
                    game["status"] = "finished"
                    game["winnerId"] = None
                    game["winReason"] = "draw"
                    game["turnId"] = None
                    checkers_append_log(game, "Draw — sixty quiet moves.")
                elif not checkers_any_legal_moves(game, next_color):
                    game["status"] = "finished"
                    game["winnerId"] = player_id
                    game["winReason"] = "no_moves"
                    game["turnId"] = None
                    checkers_append_log(game, f"{player['name']} wins!")
                else:
                    game["turnId"] = next_pid
                    game["turnColor"] = next_color
                public_view = checkers_player_view(game, player_id)

        # Publish outside the lock: threading.Lock is not reentrant and
        # checkers_publish takes it itself.
        checkers_publish(code, "move")
        return jsonify({"game": public_view})

    def checkers_any_legal_moves(game: dict[str, Any], color: str) -> bool:
        board, size = game["board"], game["size"]
        for r in range(size):
            for c in range(size):
                piece = board[r][c]
                if piece and piece["color"] == color:
                    if checkers_piece_jumps(board, size, r, c) or checkers_piece_steps(board, size, r, c):
                        return True
        return False

    @app.post("/api/checkers/games/<code>/rematch")
    def checkers_rematch(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        with CHECKERS_GAMES_LOCK:
            game = CHECKERS_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "finished":
                return jsonify({"error": "Finish the current game first."}), 409
            if player_id and player_id not in game["players"]:
                return jsonify({"error": "Player was not found."}), 404
            game["round"] += 1
            game["status"] = "lobby"
            game["turnId"] = None
            game["turnColor"] = None
            game["chainFrom"] = None
            game["quiet"] = 0
            game["winnerId"] = None
            game["winReason"] = None
            game["board"] = checkers_new_board(game["size"])
            # Swap colors so the other side opens the rematch.
            colors = ["red", "black"]
            for info in game["players"].values():
                info["color"] = colors.pop() if colors else "red"
            checkers_append_log(
                game,
                f"Round {game['round']}! Colors swapped — {' and '.join(p['name'] + ' plays ' + p['color'] for p in game['players'].values())}.",
            )

        checkers_publish(code, "rematch")
        with CHECKERS_GAMES_LOCK:
            return jsonify({"game": checkers_player_view(CHECKERS_GAMES[code], player_id or None)})

    @app.get("/api/checkers/games/<code>/events")
    def checkers_game_events(code: str):
        code = code.upper()
        player_id = str(request.args.get("playerId") or "").strip() or None
        event_queue: queue.Queue[dict[str, Any]] = queue.Queue()
        subscriber = {"queue": event_queue, "playerId": player_id}
        with CHECKERS_GAMES_LOCK:
            game = CHECKERS_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            CHECKERS_GAME_SUBSCRIBERS.setdefault(code, []).append(subscriber)
            initial_game = checkers_player_view(game, player_id)

        def stream():
            yield sse_message("game", initial_game)
            try:
                while True:
                    try:
                        message = event_queue.get(timeout=25)
                        yield sse_message(message["event"], message["data"])
                    except queue.Empty:
                        yield sse_message("ping", {"ok": True})
            finally:
                with CHECKERS_GAMES_LOCK:
                    subscribers = CHECKERS_GAME_SUBSCRIBERS.get(code, [])
                    if subscriber in subscribers:
                        subscribers.remove(subscriber)

        return Response(stream_with_context(stream()), mimetype="text/event-stream")

    # ============================================================
    # BATTLESHIP — remote two-player fleet game. Ship placements are
    # private: every view only exposes a player's own fleet plus the
    # public shot record, and sunk enemy ships are revealed cell by cell.
    # ============================================================

    def battleship_cell_key(row: int, col: int) -> str:
        return f"{row},{col}"

    def battleship_ship_cells(cells: list[list[int]]) -> dict[str, int]:
        # Map "r,c" -> index along the ship so hits can mark bow-to-stern order.
        return {battleship_cell_key(int(r), int(c)): i for i, (r, c) in enumerate(cells)}

    def battleship_new_player(player_id: str, name: str, is_host: bool, now: str) -> dict[str, Any]:
        return {
            "id": player_id,
            "name": name,
            "isHost": is_host,
            "connectedAt": now,
            "ships": None,
            "shots": {},
        }

    def battleship_create_game() -> dict[str, Any]:
        now = utc_now()
        return {
            "code": uuid.uuid4().hex[:8].upper(),
            "status": "lobby",
            "round": 1,
            "turnId": None,
            "winnerId": None,
            "winReason": None,
            "players": {},
            "log": [],
            "createdAt": now,
            "updatedAt": now,
        }

    def battleship_append_log(game: dict[str, Any], text: str) -> None:
        game["log"].append({"text": text, "at": utc_now()})
        if len(game["log"]) > BATTLESHIP_MAX_LOG:
            del game["log"][: len(game["log"]) - BATTLESHIP_MAX_LOG]
        game["updatedAt"] = utc_now()

    def battleship_opponent(game: dict[str, Any], player_id: str) -> dict[str, Any] | None:
        for pid, player in game["players"].items():
            if pid != player_id:
                return player
        return None

    def battleship_validate_fleet(payload: Any) -> tuple[dict[str, dict[str, Any]] | None, str | None]:
        if not isinstance(payload, list) or len(payload) != len(BATTLESHIP_FLEET):
            return None, "Fleet must include every ship exactly once."

        seen_names = set()
        occupied: set[str] = set()
        ships: dict[str, dict[str, Any]] = {}
        for entry in payload:
            if not isinstance(entry, dict):
                return None, "Each ship needs a name and cells."
            name = str(entry.get("name") or "").strip().lower()
            expected = next((item for item in BATTLESHIP_FLEET if item[0] == name), None)
            if not expected or name in seen_names:
                return None, "Fleet must include every ship exactly once."
            seen_names.add(name)
            cells = entry.get("cells")
            if not isinstance(cells, list) or len(cells) != expected[1]:
                return None, f"The {name.title()} must be exactly {expected[1]} cells."
            normalized: list[list[int]] = []
            for cell in cells:
                if not isinstance(cell, (list, tuple)) or len(cell) != 2:
                    return None, "Ship cells must be row/column pairs."
                try:
                    row, col = int(cell[0]), int(cell[1])
                except (TypeError, ValueError):
                    return None, "Ship cells must be row/column pairs."
                if not (0 <= row < BATTLESHIP_SIZE and 0 <= col < BATTLESHIP_SIZE):
                    return None, "All ships must sit inside the grid."
                normalized.append([row, col])
            rows = {r for r, _ in normalized}
            cols = {c for _, c in normalized}
            if len(rows) != 1 and len(cols) != 1:
                return None, "Ships must be straight lines."
            if len(rows) == 1 and len(cols) == 1:
                return None, "Ships must be straight lines."
            ordered = sorted(normalized)
            contiguous = all(
                (ordered[i + 1][0] - ordered[i][0]) + (ordered[i + 1][1] - ordered[i][1]) == 1
                for i in range(len(ordered) - 1)
            )
            if not contiguous:
                return None, "Ship cells must be contiguous."
            keys = [battleship_cell_key(r, c) for r, c in ordered]
            if any(key in occupied for key in keys):
                return None, "Ships cannot overlap."
            occupied.update(keys)
            ships[name] = {"cells": ordered, "hits": []}
        if len(seen_names) != len(BATTLESHIP_FLEET):
            return None, "Fleet must include every ship exactly once."
        return ships, None

    def battleship_fleet_is_sunk(ship: dict[str, Any]) -> bool:
        return len(ship["hits"]) >= len(ship["cells"])

    def battleship_ship_view(ship: dict[str, Any]) -> dict[str, Any]:
        hit_keys = {battleship_cell_key(r, c) for r, c in ship["hits"]}
        return {
            "name": ship["name"],
            "cells": ship["cells"],
            "hits": ship["hits"],
            "sunk": battleship_fleet_is_sunk(ship),
            "hitCells": sorted(hit_keys),
        }

    def battleship_player_view(game: dict[str, Any], player_id: str | None) -> dict[str, Any]:
        players = []
        for pid, info in game["players"].items():
            ships = info.get("ships")
            players.append(
                {
                    "id": pid,
                    "name": info["name"],
                    "isHost": info.get("isHost", False),
                    "connectedAt": info.get("connectedAt"),
                    "fleetReady": ships is not None,
                    "shipsSunk": sum(1 for s in ships.values() if battleship_fleet_is_sunk(s)) if ships else 0,
                }
            )
        players.sort(key=lambda item: item["connectedAt"] or "")

        view: dict[str, Any] = {
            "code": game["code"],
            "status": game["status"],
            "round": game["round"],
            "size": BATTLESHIP_SIZE,
            "fleetSpec": [{"name": name, "size": size} for name, size in BATTLESHIP_FLEET],
            "players": players,
            "turnId": game["turnId"],
            "winnerId": game["winnerId"],
            "winReason": game["winReason"],
            "log": list(game["log"]),
            "createdAt": game["createdAt"],
            "updatedAt": game["updatedAt"],
        }
        if not player_id or player_id not in game["players"]:
            return view

        me = game["players"][player_id]
        opponent = battleship_opponent(game, player_id)
        view["playerId"] = player_id
        view["youAreHost"] = me.get("isHost", False)
        view["yourName"] = me["name"]
        view["opponents"] = [{"id": pid, "name": p["name"]} for pid, p in game["players"].items() if pid != player_id]
        view["yourTurn"] = game["status"] == "active" and game["turnId"] == player_id

        # My fleet, always fully visible to me.
        view["yourFleet"] = (
            [battleship_ship_view(ship) for ship in me["ships"].values()] if me.get("ships") else None
        )
        # Shots I have fired: "r,c" -> result. Ship name on a hit is public
        # information in classic play ("you sank my cruiser").
        view["yourShots"] = me.get("shots", {})

        if opponent is not None:
            # Incoming shots the opponent fired at my board.
            view["incomingShots"] = [
                {"row": r, "col": c, "hit": shot["hit"], "ship": shot.get("ship")}
                for key, shot in opponent.get("shots", {}).items()
                for r, c in [key.split(",")]
            ]
            opp_ships = opponent.get("ships")
            # Sunk enemy ships become visible where they lie.
            sunk_ships = []
            if opp_ships:
                sunk_ships = [battleship_ship_view(ship) for ship in opp_ships.values() if battleship_fleet_is_sunk(ship)]
            view["sunkEnemyShips"] = sunk_ships
            # Only after the game ends does the full enemy fleet show.
            if game["status"] == "finished" and opp_ships:
                view["opponentFleet"] = [battleship_ship_view(ship) for ship in opp_ships.values()]
        else:
            view["incomingShots"] = []
            view["sunkEnemyShips"] = []
        return view

    def battleship_publish(code: str, event_name: str = "game") -> None:
        with BATTLESHIP_GAMES_LOCK:
            game = BATTLESHIP_GAMES.get(code)
            subscribers = list(BATTLESHIP_GAME_SUBSCRIBERS.get(code, []))
        if not game:
            return
        for subscriber in subscribers:
            player_id = subscriber.get("playerId")
            subscriber["queue"].put({"event": event_name, "data": battleship_player_view(game, player_id)})

    @app.post("/api/battleship/games")
    def create_battleship_game():
        game = battleship_create_game()
        with BATTLESHIP_GAMES_LOCK:
            BATTLESHIP_GAMES[game["code"]] = game
            BATTLESHIP_GAME_SUBSCRIBERS.setdefault(game["code"], [])
        return jsonify({"game": battleship_player_view(game, None), "shareUrl": f"/battleship/?game={game['code']}"}), 201

    @app.get("/api/battleship/games/<code>")
    def get_battleship_game(code: str):
        code = code.upper()
        player_id = str(request.args.get("playerId") or "").strip() or None
        with BATTLESHIP_GAMES_LOCK:
            game = BATTLESHIP_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            return jsonify({"game": battleship_player_view(game, player_id)})

    @app.post("/api/battleship/games/<code>/players")
    def join_battleship_game(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        name = str(body.get("name") or "").strip()
        provided_id = str(body.get("playerId") or "").strip()
        if not name:
            return jsonify({"error": "Name is required."}), 400
        if len(name) > 24:
            return jsonify({"error": "Name must be 24 characters or fewer."}), 400

        now = utc_now()
        with BATTLESHIP_GAMES_LOCK:
            game = BATTLESHIP_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "lobby":
                return jsonify({"error": "This battle has already started."}), 409
            if provided_id and provided_id in game["players"]:
                player = game["players"][provided_id]
                player["name"] = name
                player_id = provided_id
            else:
                if len(game["players"]) >= BATTLESHIP_MAX_PLAYERS:
                    return jsonify({"error": "This battle is full."}), 409
                player_id = secrets.token_urlsafe(8)
                is_host = not game["players"]
                game["players"][player_id] = battleship_new_player(player_id, name, is_host, now)
            game["updatedAt"] = now

        battleship_publish(code, "joined")
        with BATTLESHIP_GAMES_LOCK:
            return jsonify(
                {"game": battleship_player_view(BATTLESHIP_GAMES[code], player_id), "playerId": player_id}
            )

    @app.post("/api/battleship/games/<code>/start")
    def start_battleship_placement(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        with BATTLESHIP_GAMES_LOCK:
            game = BATTLESHIP_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "lobby":
                return jsonify({"error": "Placement already started."}), 409
            if len(game["players"]) < BATTLESHIP_MAX_PLAYERS:
                return jsonify({"error": "Wait for your opponent to join."}), 409
            if player_id and player_id not in game["players"]:
                return jsonify({"error": "Player was not found."}), 404
            game["status"] = "placement"
            game["updatedAt"] = utc_now()
            battleship_append_log(game, "Both admirals are on deck. Place your fleets!")

        battleship_publish(code, "started")
        with BATTLESHIP_GAMES_LOCK:
            return jsonify({"game": battleship_player_view(BATTLESHIP_GAMES[code], player_id or None)})

    @app.post("/api/battleship/games/<code>/players/<player_id>/fleet")
    def submit_battleship_fleet(code: str, player_id: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        ships, error = battleship_validate_fleet(body.get("ships"))
        if error:
            return jsonify({"error": error}), 400

        with BATTLESHIP_GAMES_LOCK:
            game = BATTLESHIP_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "placement":
                return jsonify({"error": "Fleets can only be set during placement."}), 409
            player = game["players"].get(player_id)
            if not player:
                return jsonify({"error": "Player was not found."}), 404
            if player.get("ships"):
                return jsonify({"error": "Your fleet is already anchored."}), 409

            for name, ship in ships.items():
                ship["name"] = name
            player["ships"] = ships
            game["updatedAt"] = utc_now()

            opponent = battleship_opponent(game, player_id)
            everyone_ready = all(p.get("ships") for p in game["players"].values())
            if everyone_ready and opponent is not None:
                game["status"] = "active"
                previous_winner = game.get("winnerId")
                if previous_winner:
                    # The admiral who lost the last round fires first.
                    game["turnId"] = next(
                        (pid for pid in game["players"] if pid != previous_winner),
                        next(iter(game["players"])),
                    )
                else:
                    game["turnId"] = secrets.choice(list(game["players"].keys()))
                first = game["players"][game["turnId"]]["name"]
                battleship_append_log(game, f"Fleets anchored. {first} fires first!")

        battleship_publish(code, "fleet" if game["status"] != "active" else "started")
        with BATTLESHIP_GAMES_LOCK:
            return jsonify({"game": battleship_player_view(BATTLESHIP_GAMES[code], player_id)})

    @app.post("/api/battleship/games/<code>/players/<player_id>/fire")
    def battleship_fire(code: str, player_id: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        try:
            row, col = int(body.get("row")), int(body.get("col"))
        except (TypeError, ValueError):
            return jsonify({"error": "Aim at a grid square."}), 400
        if not (0 <= row < BATTLESHIP_SIZE and 0 <= col < BATTLESHIP_SIZE):
            return jsonify({"error": "That shot lands off the map."}), 400

        with BATTLESHIP_GAMES_LOCK:
            game = BATTLESHIP_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "active":
                return jsonify({"error": "The battle is not in progress."}), 409
            if game["turnId"] != player_id:
                return jsonify({"error": "Hold fire — it is not your turn."}), 403
            shooter = game["players"].get(player_id)
            if not shooter:
                return jsonify({"error": "Player was not found."}), 404
            target = battleship_opponent(game, player_id)
            if not target:
                return jsonify({"error": "Waiting on an opponent."}), 409

            key = battleship_cell_key(row, col)
            if key in shooter["shots"]:
                return jsonify({"error": "You already fired at that square."}), 409

            col_label = chr(ord("A") + col)
            cell_label = f"{col_label}{row + 1}"
            hit_ship_name = None
            for ship in target["ships"].values():
                if [row, col] in ship["cells"]:
                    hit_ship_name = ship["name"]
                    ship["hits"].append([row, col])
                    break

            sunk_now = False
            if hit_ship_name:
                ship = target["ships"][hit_ship_name]
                sunk_now = battleship_fleet_is_sunk(ship)
                result_text = f"hit on the {hit_ship_name.title()}"
                if sunk_now:
                    result_text = f"sank the {hit_ship_name.title()}!"
            else:
                result_text = "miss"
            shooter["shots"][key] = {"hit": bool(hit_ship_name), "ship": hit_ship_name, "row": row, "col": col}
            shooter_name = shooter["name"]
            battleship_append_log(game, f"{shooter_name} fired at {cell_label} — {result_text}")

            remaining = sum(
                1 for ship in target["ships"].values() if not battleship_fleet_is_sunk(ship)
            )
            if remaining == 0:
                game["status"] = "finished"
                game["winnerId"] = player_id
                game["winReason"] = "fleet_sunk"
                game["turnId"] = None
                battleship_append_log(game, f"{shooter_name} wins the battle!")
            else:
                game["turnId"] = next(pid for pid in game["players"] if pid != player_id)
            public_view = battleship_player_view(game, player_id)

        battleship_publish(code, "shot")
        return jsonify({"game": public_view})

    @app.post("/api/battleship/games/<code>/rematch")
    def battleship_rematch(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        with BATTLESHIP_GAMES_LOCK:
            game = BATTLESHIP_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] not in {"finished"}:
                return jsonify({"error": "Finish the current battle first."}), 409
            if player_id and player_id not in game["players"]:
                return jsonify({"error": "Player was not found."}), 404
            game["round"] += 1
            game["status"] = "placement"
            game["winnerId"] = None
            game["winReason"] = None
            game["turnId"] = None
            for player in game["players"].values():
                player["ships"] = None
                player["shots"] = {}
            battleship_append_log(game, f"Round {game['round']}! Place your fleets.")

        battleship_publish(code, "rematch")
        with BATTLESHIP_GAMES_LOCK:
            return jsonify({"game": battleship_player_view(BATTLESHIP_GAMES[code], player_id or None)})

    @app.get("/api/battleship/games/<code>/events")
    def battleship_game_events(code: str):
        code = code.upper()
        player_id = str(request.args.get("playerId") or "").strip() or None
        event_queue: queue.Queue[dict[str, Any]] = queue.Queue()
        subscriber = {"queue": event_queue, "playerId": player_id}
        with BATTLESHIP_GAMES_LOCK:
            game = BATTLESHIP_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            BATTLESHIP_GAME_SUBSCRIBERS.setdefault(code, []).append(subscriber)
            initial_game = battleship_player_view(game, player_id)

        def stream():
            yield sse_message("game", initial_game)
            try:
                while True:
                    try:
                        message = event_queue.get(timeout=25)
                        yield sse_message(message["event"], message["data"])
                    except queue.Empty:
                        yield sse_message("ping", {"ok": True})
            finally:
                with BATTLESHIP_GAMES_LOCK:
                    subscribers = BATTLESHIP_GAME_SUBSCRIBERS.get(code, [])
                    if subscriber in subscribers:
                        subscribers.remove(subscriber)

        return Response(stream_with_context(stream()), mimetype="text/event-stream")

    # ============================================================
    # THE ORACLE — a Codenames-style word game for four roles: a red and a
    # blue team, each with a spymaster (sees the key) and an operative
    # (guesses). The key map is the hidden information: it is only ever sent
    # to spymasters, and to everyone once the game is over.
    # ============================================================

    def oracle_role_parts(role: str) -> tuple[str, str]:
        team, _, kind = role.partition("-")
        return team, kind

    def oracle_new_game() -> dict[str, Any]:
        now = utc_now()
        return {
            "code": uuid.uuid4().hex[:8].upper(),
            "status": "lobby",
            "round": 1,
            "players": {},
            "words": [],
            "key": [],
            "revealed": [False] * (ORACLE_GRID * ORACLE_GRID),
            "turnTeam": None,
            "phase": None,
            "clue": None,
            "guessesLeft": 0,
            "winnerTeam": None,
            "winReason": None,
            "log": [],
            "createdAt": now,
            "updatedAt": now,
        }

    def oracle_open_roles(game: dict[str, Any]) -> list[str]:
        taken = {p["role"] for p in game["players"].values()}
        return [role for role in ORACLE_ROLES if role not in taken]

    def oracle_append_log(game: dict[str, Any], text: str) -> None:
        game["log"].append({"text": text, "at": utc_now()})
        if len(game["log"]) > ORACLE_MAX_LOG:
            del game["log"][: len(game["log"]) - ORACLE_MAX_LOG]
        game["updatedAt"] = utc_now()

    def oracle_team_counts(game: dict[str, Any]) -> dict[str, int]:
        counts = {}
        for color in ("red", "blue"):
            counts[color] = sum(
                1 for i, color_at in enumerate(game["key"])
                if color_at == color and not game["revealed"][i]
            )
        return counts

    def oracle_deal(game: dict[str, Any]) -> None:
        words = random.SystemRandom().sample(ORACLE_WORDS, ORACLE_GRID * ORACLE_GRID)
        first = secrets.choice(["red", "blue"])
        key = (
            [first] * 9
            + [("blue" if first == "red" else "red")] * 8
            + ["neutral"] * 7
            + ["assassin"]
        )
        random.SystemRandom().shuffle(key)
        game["words"] = words
        game["key"] = key
        game["revealed"] = [False] * (ORACLE_GRID * ORACLE_GRID)
        game["turnTeam"] = first
        game["phase"] = "clue"
        game["clue"] = None
        game["guessesLeft"] = 0

    def oracle_player_view(game: dict[str, Any], player_id: str | None) -> dict[str, Any]:
        players = []
        for pid, info in game["players"].items():
            players.append(
                {
                    "id": pid,
                    "name": info["name"],
                    "role": info["role"],
                    "isHost": info.get("isHost", False),
                    "connectedAt": info.get("connectedAt"),
                }
            )
        players.sort(key=lambda item: (item["connectedAt"] or ""))
        clue = game["clue"]
        view: dict[str, Any] = {
            "code": game["code"],
            "status": game["status"],
            "round": game["round"],
            "grid": ORACLE_GRID,
            "players": players,
            "openRoles": oracle_open_roles(game),
            "turnTeam": game["turnTeam"],
            "phase": game["phase"],
            "clue": dict(clue) if clue else None,
            "guessesLeft": game["guessesLeft"],
            "words": list(game["words"]),
            "revealed": list(game["revealed"]),
            "revealedColors": [
                {"index": i, "color": game["key"][i]}
                for i in range(len(game["key"])) if game["revealed"][i]
            ],
            "remaining": oracle_team_counts(game) if game["key"] else {"red": 0, "blue": 0},
            "winnerTeam": game["winnerTeam"],
            "winReason": game["winReason"],
            "log": list(game["log"]),
            "createdAt": game["createdAt"],
            "updatedAt": game["updatedAt"],
        }
        # Once the game is over the board is public — everyone gets the key.
        if game["status"] == "finished":
            view["key"] = list(game["key"])
        if not player_id or player_id not in game["players"]:
            return view
        me = game["players"][player_id]
        view["playerId"] = player_id
        view["youAreHost"] = me.get("isHost", False)
        view["yourName"] = me["name"]
        view["yourRole"] = me["role"]
        team, kind = oracle_role_parts(me["role"])
        view["yourTeam"] = team
        view["yourKind"] = kind
        # The key map is the whole point of the game: spymasters only (the
        # finished-game reveal already went out to everyone above).
        if kind == "spymaster":
            view["key"] = list(game["key"])
        return view

    def oracle_publish(code: str, event_name: str = "game") -> None:
        with ORACLE_GAMES_LOCK:
            game = ORACLE_GAMES.get(code)
            subscribers = list(ORACLE_GAME_SUBSCRIBERS.get(code, []))
        if not game:
            return
        for subscriber in subscribers:
            player_id = subscriber.get("playerId")
            subscriber["queue"].put({"event": event_name, "data": oracle_player_view(game, player_id)})

    def oracle_pass_turn(game: dict[str, Any]) -> None:
        game["turnTeam"] = "blue" if game["turnTeam"] == "red" else "red"
        game["phase"] = "clue"
        game["clue"] = None
        game["guessesLeft"] = 0

    @app.post("/api/oracle/games")
    def create_oracle_game():
        game = oracle_new_game()
        with ORACLE_GAMES_LOCK:
            ORACLE_GAMES[game["code"]] = game
            ORACLE_GAME_SUBSCRIBERS.setdefault(game["code"], [])
        return jsonify({"game": oracle_player_view(game, None), "shareUrl": f"/oracle/?game={game['code']}"}), 201

    @app.get("/api/oracle/games/<code>")
    def get_oracle_game(code: str):
        code = code.upper()
        player_id = str(request.args.get("playerId") or "").strip() or None
        with ORACLE_GAMES_LOCK:
            game = ORACLE_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            return jsonify({"game": oracle_player_view(game, player_id)})

    @app.post("/api/oracle/games/<code>/players")
    def join_oracle_game(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        name = str(body.get("name") or "").strip()
        role = str(body.get("role") or "").strip().lower()
        provided_id = str(body.get("playerId") or "").strip()
        if not name:
            return jsonify({"error": "Name is required."}), 400
        if len(name) > 24:
            return jsonify({"error": "Name must be 24 characters or fewer."}), 400

        now = utc_now()
        with ORACLE_GAMES_LOCK:
            game = ORACLE_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "lobby":
                return jsonify({"error": "The game has already started."}), 409
            if provided_id and provided_id in game["players"]:
                player = game["players"][provided_id]
                player["name"] = name
                player_id = provided_id
            else:
                open_roles = oracle_open_roles(game)
                if not open_roles:
                    return jsonify({"error": "All four seats are taken."}), 409
                if role:
                    if role not in ORACLE_ROLES:
                        return jsonify({"error": "Unknown role."}), 400
                    if role not in open_roles:
                        return jsonify({"error": f"That seat is taken. Open: {', '.join(open_roles)}."}), 409
                else:
                    role = open_roles[0]
                player_id = secrets.token_urlsafe(8)
                is_host = not game["players"]
                game["players"][player_id] = {
                    "id": player_id,
                    "name": name,
                    "role": role,
                    "isHost": is_host,
                    "connectedAt": now,
                }
            game["updatedAt"] = now

        oracle_publish(code, "joined")
        with ORACLE_GAMES_LOCK:
            return jsonify({"game": oracle_player_view(ORACLE_GAMES[code], player_id), "playerId": player_id})

    @app.post("/api/oracle/games/<code>/start")
    def start_oracle_game(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        with ORACLE_GAMES_LOCK:
            game = ORACLE_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "lobby":
                return jsonify({"error": "The game has already started."}), 409
            if player_id and player_id not in game["players"]:
                return jsonify({"error": "Player was not found."}), 404
            if oracle_open_roles(game):
                return jsonify({"error": "All four seats must be filled first."}), 409
            oracle_deal(game)
            game["status"] = "active"
            game["updatedAt"] = utc_now()
            first_name = next(
                p["name"] for p in game["players"].values()
                if oracle_role_parts(p["role"])[0] == game["turnTeam"]
            )
            oracle_append_log(game, f"Round {game['round']}. The {game['turnTeam']} team acts first — {first_name}'s spymaster gives the first clue.")

        oracle_publish(code, "started")
        with ORACLE_GAMES_LOCK:
            return jsonify({"game": oracle_player_view(ORACLE_GAMES[code], player_id or None)})

    @app.post("/api/oracle/games/<code>/clue")
    def oracle_give_clue(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        word = str(body.get("word") or "").strip()
        raw_count = body.get("count")

        with ORACLE_GAMES_LOCK:
            game = ORACLE_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "active":
                return jsonify({"error": "The game is not in progress."}), 409
            player = game["players"].get(player_id)
            if not player:
                return jsonify({"error": "Player was not found."}), 404
            team, kind = oracle_role_parts(player["role"])
            if kind != "spymaster" or team != game["turnTeam"]:
                return jsonify({"error": "Only the acting team's spymaster gives clues."}), 403
            if game["phase"] != "clue":
                return jsonify({"error": "Your operative is still guessing."}), 409

            if not re.fullmatch(r"[A-Za-z][A-Za-z'-]*", word):
                return jsonify({"error": "Clues must be a single English word (letters, hyphen or apostrophe)."}), 400
            word_upper = word.upper()
            for i, board_word in enumerate(game["words"]):
                if game["revealed"][i]:
                    continue
                if word_upper == board_word or (len(word_upper) >= 3 and (word_upper in board_word or board_word in word_upper)):
                    return jsonify({"error": "Clues can't use a word (or part of one) that is on the board."}), 400

            unlimited = raw_count in {"infinite", "∞", -1, "-1"}
            if not unlimited:
                try:
                    count = int(raw_count)
                except (TypeError, ValueError):
                    return jsonify({"error": "Clue count must be 1-8 or unlimited."}), 400
                if not 1 <= count <= 8:
                    return jsonify({"error": "Clue count must be 1-8 or unlimited."}), 400

            game["clue"] = {
                "word": word_upper,
                "count": -1 if unlimited else count,
                "team": team,
                "by": player["name"],
            }
            game["phase"] = "guessing"
            game["guessesLeft"] = 99 if unlimited else count + 1
            oracle_append_log(game, f"{player['name']} ({team} spymaster) clues: {word_upper} {'∞' if unlimited else count}.")

        oracle_publish(code, "clue")
        with ORACLE_GAMES_LOCK:
            return jsonify({"game": oracle_player_view(ORACLE_GAMES[code], player_id)})

    @app.post("/api/oracle/games/<code>/guess")
    def oracle_guess(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        try:
            index = int(body.get("index"))
        except (TypeError, ValueError):
            return jsonify({"error": "Pick a card."}), 400

        with ORACLE_GAMES_LOCK:
            game = ORACLE_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "active":
                return jsonify({"error": "The game is not in progress."}), 409
            player = game["players"].get(player_id)
            if not player:
                return jsonify({"error": "Player was not found."}), 404
            team, kind = oracle_role_parts(player["role"])
            if kind != "operative" or team != game["turnTeam"]:
                return jsonify({"error": "Only the acting team's operative guesses."}), 403
            if game["phase"] != "guessing":
                return jsonify({"error": "Wait for your spymaster's clue."}), 409
            if not 0 <= index < ORACLE_GRID * ORACLE_GRID:
                return jsonify({"error": "That card is not on the board."}), 400
            if game["revealed"][index]:
                return jsonify({"error": "That card was already revealed."}), 409

            color = game["key"][index]
            game["revealed"][index] = True
            word = game["words"][index]
            other = "blue" if team == "red" else "red"
            finished = False

            if color == "assassin":
                game["winnerTeam"] = other
                game["winReason"] = "assassin"
                finished = True
                oracle_append_log(game, f"{player['name']} revealed {word} — THE ASSASSIN. The {other} team wins!")
            elif color == team:
                game["guessesLeft"] -= 1
                oracle_append_log(game, f"{player['name']} revealed {word} — it serves the {team} team.")
                if oracle_team_counts(game)[team] == 0:
                    game["winnerTeam"] = team
                    game["winReason"] = "all_words"
                    finished = True
                    oracle_append_log(game, f"The {team} team uncovered every one of their words. Victory!")
                elif game["guessesLeft"] <= 0:
                    oracle_pass_turn(game)
                    oracle_append_log(game, f"Out of guesses. The {game['turnTeam']} team is up.")
            elif color == other:
                oracle_append_log(game, f"{player['name']} revealed {word} — it belonged to the {other} team. Turn over.")
                if oracle_team_counts(game)[other] == 0:
                    game["winnerTeam"] = other
                    game["winReason"] = "all_words"
                    finished = True
                    oracle_append_log(game, f"That was the {other} team's last word. They win!")
                else:
                    oracle_pass_turn(game)
            else:
                oracle_append_log(game, f"{player['name']} revealed {word} — a bystander. Turn over.")
                oracle_pass_turn(game)

            if finished:
                game["status"] = "finished"
                game["phase"] = None
                game["guessesLeft"] = 0
            public_view = oracle_player_view(game, player_id)

        oracle_publish(code, "guess")
        return jsonify({"game": public_view})

    @app.post("/api/oracle/games/<code>/end-turn")
    def oracle_end_turn(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        with ORACLE_GAMES_LOCK:
            game = ORACLE_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "active":
                return jsonify({"error": "The game is not in progress."}), 409
            player = game["players"].get(player_id)
            if not player:
                return jsonify({"error": "Player was not found."}), 404
            team, kind = oracle_role_parts(player["role"])
            if kind != "operative" or team != game["turnTeam"]:
                return jsonify({"error": "Only the acting team's operative can end the turn."}), 403
            if game["phase"] != "guessing":
                return jsonify({"error": "There is nothing to end yet."}), 409
            oracle_append_log(game, f"{player['name']} ends the {team} team's turn.")
            oracle_pass_turn(game)

        oracle_publish(code, "turn")
        with ORACLE_GAMES_LOCK:
            return jsonify({"game": oracle_player_view(ORACLE_GAMES[code], player_id)})

    @app.post("/api/oracle/games/<code>/rematch")
    def oracle_rematch(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        with ORACLE_GAMES_LOCK:
            game = ORACLE_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "finished":
                return jsonify({"error": "Finish the current game first."}), 409
            if player_id and player_id not in game["players"]:
                return jsonify({"error": "Player was not found."}), 404
            game["round"] += 1
            game["winnerTeam"] = None
            game["winReason"] = None
            game["status"] = "active"
            oracle_deal(game)
            first_name = next(
                p["name"] for p in game["players"].values()
                if oracle_role_parts(p["role"])[0] == game["turnTeam"]
            )
            oracle_append_log(game, f"Round {game['round']}! Fresh visions — the {game['turnTeam']} team acts first ({first_name}'s spymaster).")

        oracle_publish(code, "rematch")
        with ORACLE_GAMES_LOCK:
            return jsonify({"game": oracle_player_view(ORACLE_GAMES[code], player_id or None)})

    @app.get("/api/oracle/games/<code>/events")
    def oracle_game_events(code: str):
        code = code.upper()
        player_id = str(request.args.get("playerId") or "").strip() or None
        event_queue: queue.Queue[dict[str, Any]] = queue.Queue()
        subscriber = {"queue": event_queue, "playerId": player_id}
        with ORACLE_GAMES_LOCK:
            game = ORACLE_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            ORACLE_GAME_SUBSCRIBERS.setdefault(code, []).append(subscriber)
            initial_game = oracle_player_view(game, player_id)

        def stream():
            yield sse_message("game", initial_game)
            try:
                while True:
                    try:
                        message = event_queue.get(timeout=25)
                        yield sse_message(message["event"], message["data"])
                    except queue.Empty:
                        yield sse_message("ping", {"ok": True})
            finally:
                with ORACLE_GAMES_LOCK:
                    subscribers = ORACLE_GAME_SUBSCRIBERS.get(code, [])
                    if subscriber in subscribers:
                        subscribers.remove(subscriber)

        return Response(stream_with_context(stream()), mimetype="text/event-stream")

    start_game_sweeper()

    return app
