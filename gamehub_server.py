from __future__ import annotations

import base64
import hashlib
import hmac
import json
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


BASE_DIR = Path(__file__).resolve().parent
BINGO_STATIC_DIR = BASE_DIR / "bingo" / "static"
BINGO_DATA_DIR = BASE_DIR / "bingo" / "data"
BINGO_CARDS_FILE = BINGO_DATA_DIR / "cards.json"
COLOR_GUESSER_STATIC_DIR = BASE_DIR / "color_guesser" / "static"
YAHTZEE_STATIC_DIR = BASE_DIR / "yahtzee" / "static"
BOGGLE_STATIC_DIR = BASE_DIR / "boggle" / "static"
SHARED_STATIC_DIR = BASE_DIR / "shared"
MAX_USER_BYTES = int(os.environ.get("BINGO_MAX_USER_BYTES", 5 * 1024 * 1024))
COLOR_GAMES: dict[str, dict[str, Any]] = {}
COLOR_GAME_SUBSCRIBERS: dict[str, list[queue.Queue[dict[str, Any]]]] = {}
COLOR_GAMES_LOCK = threading.Lock()
BOGGLE_GAMES: dict[str, dict[str, Any]] = {}
BOGGLE_GAME_SUBSCRIBERS: dict[str, list[dict[str, Any]]] = {}
BOGGLE_GAME_TIMERS: dict[str, threading.Timer] = {}
BOGGLE_GAMES_LOCK = threading.Lock()
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
    encryption_key = hashlib.sha256(b"color-guesser-encryption:" + secret_bytes).digest()
    signing_key = hashlib.sha256(b"color-guesser-signing:" + secret_bytes).digest()
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

    return {"colors": colors, "pegCount": peg_count, "maxRounds": max_rounds}, None


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


def create_app() -> Flask:
    app = Flask(__name__)
    app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-only-change-me")

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

    @app.get("/color-guesser")
    def color_guesser_redirect():
        return redirect("/color-guesser/")

    @app.get("/color-guesser/")
    def color_guesser_index():
        return send_from_directory(COLOR_GUESSER_STATIC_DIR, "index.html")

    @app.get("/color-guesser/<path:filename>")
    def color_guesser_static(filename: str):
        return send_from_directory(COLOR_GUESSER_STATIC_DIR, filename)

    @app.get("/yahtzee")
    def yahtzee_redirect():
        return redirect("/yahtzee/")

    @app.get("/yahtzee/")
    def yahtzee_index():
        return send_from_directory(YAHTZEE_STATIC_DIR, "index.html")

    @app.get("/yahtzee/<path:filename>")
    def yahtzee_static(filename: str):
        return send_from_directory(YAHTZEE_STATIC_DIR, filename)

    @app.get("/boggle")
    def boggle_redirect():
        return redirect("/boggle/")

    @app.get("/boggle/")
    def boggle_index():
        return send_from_directory(BOGGLE_STATIC_DIR, "index.html")

    @app.get("/boggle/<path:filename>")
    def boggle_static(filename: str):
        return send_from_directory(BOGGLE_STATIC_DIR, filename)

    @app.get("/share/<share_id>")
    def shared_card(share_id: str):
        return redirect(f"/bingo/?share={share_id}")

    @app.get("/api/me")
    def api_me():
        return jsonify({"user": current_user(), "maxUserBytes": MAX_USER_BYTES})

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

    @app.post("/api/color-guesser/games")
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
            "secret": random_color_secret(game_config["colors"], game_config["pegCount"]),
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
                "shareUrl": f"/color-guesser/?token={share_token}",
            }
        ), 201

    @app.post("/api/color-guesser/games/from-token")
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

        return jsonify({"game": color_game_public(game), "shareToken": token, "shareUrl": f"/color-guesser/?token={token}"})

    @app.get("/api/color-guesser/games/<code>")
    def get_color_game(code: str):
        with COLOR_GAMES_LOCK:
            game = COLOR_GAMES.get(code.upper())
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            return jsonify({"game": color_game_public(game)})

    @app.post("/api/color-guesser/games/<code>/guesses")
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

    @app.get("/api/color-guesser/games/<code>/events")
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

    return app
