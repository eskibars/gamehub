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
ORACLE_WORDS = (    "AIRPLANE", "ALPS", "ANCHOR", "ANGEL", "ANTARCTICA", "APPLE", "ARM", "ATLANTIS",
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

TRAINING_GAMES: dict[str, dict[str, Any]] = {}
TRAINING_GAME_SUBSCRIBERS: dict[str, list[dict[str, Any]]] = {}
TRAINING_GAMES_LOCK = threading.Lock()
TRAINING_MAX_LOG = 15

# ============================================================
# TRAINING — a Ticket-to-Ride-style rail game. Each map below is the
# single source of truth for its games: the server plays on it and the
# client renders it from GET /api/training/map?map=<id>. Cities carry
# (x, y) in a 1000x640 viewBox plus a label placement hint; routes
# reference cities by id.
# ============================================================

TRAINING_MAPS = {
    "coastline": {
        "name": "Coastline",
        "blurb": "Twenty ports along a wide Atlantic shore.",
        "underlay": (
            {"kind": "water", "d": "M -20 -20 L 120 -20 C 70 150 90 330 -20 500 Z"},
            {"kind": "water", "d": "M 360 40 C 420 0 820 0 880 40 C 820 80 420 85 360 40 Z"},
            {"kind": "water", "d": "M 420 660 C 500 590 700 590 760 660 Z"},
            {"kind": "river", "d": "M 585 90 C 540 200 470 260 505 360 C 530 440 590 500 560 640"},
            {"kind": "park", "d": "M 560 240 C 620 230 660 240 680 260 C 640 280 590 270 560 250 Z"},
        ),
        "cities": (

    {"id": "seattle", "name": "Seattle", "x": 110, "y": 88, "label": "n"},
    {"id": "portland", "name": "Portland", "x": 92, "y": 176, "label": "w"},
    {"id": "sanfrancisco", "name": "San Francisco", "x": 108, "y": 330, "label": "w"},
    {"id": "losangeles", "name": "Los Angeles", "x": 214, "y": 480, "label": "sw"},
    {"id": "phoenix", "name": "Phoenix", "x": 330, "y": 448, "label": "n"},
    {"id": "elpaso", "name": "El Paso", "x": 432, "y": 505, "label": "s"},
    {"id": "saltlake", "name": "Salt Lake City", "x": 280, "y": 236, "label": "w"},
    {"id": "denver", "name": "Denver", "x": 402, "y": 266, "label": "e"},
    {"id": "minneapolis", "name": "Minneapolis", "x": 586, "y": 112, "label": "n"},
    {"id": "dallas", "name": "Dallas", "x": 546, "y": 468, "label": "w"},
    {"id": "houston", "name": "Houston", "x": 588, "y": 556, "label": "s"},
    {"id": "neworleans", "name": "New Orleans", "x": 722, "y": 538, "label": "s"},
    {"id": "miami", "name": "Miami", "x": 892, "y": 556, "label": "e"},
    {"id": "atlanta", "name": "Atlanta", "x": 800, "y": 430, "label": "e"},
    {"id": "washington", "name": "Washington", "x": 896, "y": 300, "label": "e"},
    {"id": "newyork", "name": "New York", "x": 922, "y": 208, "label": "w"},
    {"id": "boston", "name": "Boston", "x": 972, "y": 132, "label": "n"},
    {"id": "chicago", "name": "Chicago", "x": 658, "y": 234, "label": "w"},
    {"id": "toronto", "name": "Toronto", "x": 758, "y": 164, "label": "e"},
    {"id": "montreal", "name": "Montreal", "x": 878, "y": 92, "label": "n"},
        ),
        # (a, b, color, length) — colors: gray routes may be claimed with
        # any single suit. Lengths cap at 5 on this map.
        "routes": (

    ("seattle", "portland", "gray", 1),
    ("seattle", "minneapolis", "yellow", 4),
    ("portland", "sanfrancisco", "green", 3),
    ("portland", "saltlake", "blue", 3),
    ("sanfrancisco", "saltlake", "orange", 3),
    ("sanfrancisco", "losangeles", "pink", 3),
    ("losangeles", "phoenix", "yellow", 2),
    ("losangeles", "elpaso", "black", 3),
    ("phoenix", "elpaso", "white", 3),
    ("saltlake", "denver", "yellow", 3),
    ("denver", "minneapolis", "red", 4),
    ("denver", "dallas", "orange", 4),
    ("elpaso", "dallas", "red", 3),
    ("elpaso", "houston", "green", 4),
    ("dallas", "houston", "gray", 1),
    ("houston", "neworleans", "orange", 2),
    ("neworleans", "atlanta", "white", 4),
    ("neworleans", "miami", "blue", 3),
    ("atlanta", "miami", "green", 4),
    ("atlanta", "washington", "blue", 3),
    ("chicago", "atlanta", "green", 5),
    ("chicago", "toronto", "gray", 3),
    ("chicago", "minneapolis", "orange", 2),
    ("toronto", "montreal", "gray", 2),
    ("montreal", "boston", "pink", 2),
    ("montreal", "newyork", "orange", 3),
    ("boston", "newyork", "yellow", 2),
    ("newyork", "washington", "gray", 2),
        ),
        "tickets": (

    ("seattle", "portland", 4),
    ("sanfrancisco", "losangeles", 5),
    ("dallas", "houston", 4),
    ("boston", "newyork", 5),
    ("newyork", "washington", 5),
    ("toronto", "montreal", 5),
    ("houston", "neworleans", 5),
    ("losangeles", "phoenix", 5),
    ("seattle", "sanfrancisco", 8),
    ("portland", "saltlake", 8),
    ("sanfrancisco", "saltlake", 8),
    ("losangeles", "elpaso", 8),
    ("phoenix", "elpaso", 8),
    ("saltlake", "denver", 8),
    ("dallas", "neworleans", 9),
    ("neworleans", "miami", 8),
    ("atlanta", "miami", 9),
    ("washington", "boston", 9),
    ("newyork", "montreal", 8),
    ("chicago", "toronto", 8),
    ("minneapolis", "chicago", 6),
    ("denver", "minneapolis", 10),
    ("denver", "dallas", 10),
    ("elpaso", "dallas", 8),
    ("elpaso", "houston", 10),
    ("losangeles", "saltlake", 9),
    ("seattle", "losangeles", 12),
    ("seattle", "denver", 12),
    ("portland", "dallas", 13),
    ("losangeles", "houston", 13),
    ("miami", "washington", 12),
    ("toronto", "washington", 12),
    ("miami", "newyork", 14),
    ("seattle", "newyork", 17),
    ("losangeles", "miami", 16),
        ),
    },
    "continent": {
        "name": "Continent",
        "blurb": "A dense European web of capitals, canals, and passes.",
        "underlay": (
            {"kind": "water", "d": "M -20 -20 L 45 -20 C 30 150 35 350 -20 500 Z"},
            {"kind": "water", "d": "M -20 640 L 100 560 C 250 610 500 620 720 560 C 850 540 950 570 1020 640 Z"},
            {"kind": "water", "d": "M 290 -20 C 330 40 430 45 500 10 C 560 60 640 55 670 -20 Z"},
            {"kind": "park", "d": "M 350 200 C 380 190 410 195 420 210 C 400 225 370 220 350 205 Z"},
            {"kind": "park", "d": "M 250 320 C 280 310 310 315 325 330 C 300 345 270 340 250 330 Z"},
        ),
        "cities": (
    {"id": "dublin", "name": "Dublin", "x": 84, "y": 231, "label": "w"},
    {"id": "edinburgh", "name": "Edinburgh", "x": 235, "y": 119, "label": "n"},
    {"id": "london", "name": "London", "x": 292, "y": 237, "label": "sw"},
    {"id": "amsterdam", "name": "Amsterdam", "x": 413, "y": 179, "label": "w"},
    {"id": "copenhagen", "name": "Copenhagen", "x": 537, "y": 112, "label": "s"},
    {"id": "oslo", "name": "Oslo", "x": 521, "y": 45, "label": "w"},
    {"id": "stockholm", "name": "Stockholm", "x": 692, "y": 78, "label": "n"},
    {"id": "paris", "name": "Paris", "x": 363, "y": 318, "label": "w"},
    {"id": "frankfurt", "name": "Frankfurt", "x": 554, "y": 271, "label": "e"},
    {"id": "munich", "name": "Munich", "x": 655, "y": 329, "label": "e"},
    {"id": "zurich", "name": "Zurich", "x": 534, "y": 369, "label": "w"},
    {"id": "venice", "name": "Venice", "x": 678, "y": 396, "label": "e"},
    {"id": "rome", "name": "Rome", "x": 769, "y": 481, "label": "e"},
    {"id": "barcelona", "name": "Barcelona", "x": 390, "y": 475, "label": "w"},
    {"id": "madrid", "name": "Madrid", "x": 255, "y": 546, "label": "w"},
    {"id": "lisbon", "name": "Lisbon", "x": 84, "y": 582, "label": "w"},
    {"id": "berlin", "name": "Berlin", "x": 689, "y": 181, "label": "n"},
    {"id": "warsaw", "name": "Warsaw", "x": 857, "y": 168, "label": "e"},
    {"id": "vienna", "name": "Vienna", "x": 840, "y": 296, "label": "s"},
    {"id": "budapest", "name": "Budapest", "x": 941, "y": 313, "label": "s"},
        ),
        "routes": (
    ("dublin", "london", "blue", 2),
    ("edinburgh", "london", "orange", 2),
    ("london", "amsterdam", "gray", 2),
    ("london", "paris", "pink", 2),
    ("amsterdam", "copenhagen", "green", 3),
    ("amsterdam", "frankfurt", "yellow", 2),
    ("copenhagen", "oslo", "white", 2),
    ("copenhagen", "stockholm", "blue", 2),
    ("copenhagen", "berlin", "yellow", 3),
    ("oslo", "stockholm", "gray", 2),
    ("stockholm", "warsaw", "gray", 3),
    ("berlin", "warsaw", "pink", 3),
    ("berlin", "frankfurt", "red", 2),
    ("berlin", "munich", "blue", 3),
    ("frankfurt", "paris", "red", 3),
    ("frankfurt", "munich", "green", 2),
    ("paris", "zurich", "yellow", 3),
    ("zurich", "munich", "pink", 2),
    ("zurich", "venice", "orange", 2),
    ("munich", "venice", "gray", 2),
    ("venice", "rome", "green", 3),
    ("munich", "vienna", "white", 3),
    ("vienna", "budapest", "red", 2),
    ("vienna", "warsaw", "blue", 3),
    ("paris", "barcelona", "green", 4),
    ("barcelona", "madrid", "orange", 3),
    ("madrid", "lisbon", "pink", 3),
    ("budapest", "warsaw", "orange", 4),
        ),
        "tickets": (
    ("dublin", "london", 5),
    ("edinburgh", "london", 5),
    ("london", "paris", 5),
    ("madrid", "lisbon", 5),
    ("vienna", "budapest", 5),
    ("copenhagen", "oslo", 5),
    ("zurich", "munich", 5),
    ("amsterdam", "frankfurt", 5),
    ("oslo", "stockholm", 5),
    ("frankfurt", "munich", 5),
    ("london", "amsterdam", 5),
    ("berlin", "warsaw", 7),
    ("berlin", "munich", 7),
    ("venice", "rome", 7),
    ("munich", "vienna", 7),
    ("paris", "zurich", 7),
    ("stockholm", "warsaw", 7),
    ("copenhagen", "berlin", 7),
    ("barcelona", "madrid", 7),
    ("london", "frankfurt", 9),
    ("paris", "barcelona", 9),
    ("stockholm", "berlin", 9),
    ("amsterdam", "paris", 8),
    ("dublin", "paris", 8),
    ("edinburgh", "paris", 8),
    ("paris", "munich", 9),
    ("lisbon", "barcelona", 10),
    ("munich", "warsaw", 10),
    ("venice", "vienna", 10),
    ("rome", "munich", 10),
    ("rome", "zurich", 10),
    ("oslo", "warsaw", 10),
    ("copenhagen", "warsaw", 10),
    ("madrid", "paris", 13),
    ("copenhagen", "paris", 13),
    ("budapest", "berlin", 13),
    ("venice", "copenhagen", 13),
    ("venice", "warsaw", 12),
    ("rome", "vienna", 12),
    ("warsaw", "paris", 15),
        ),
    },
    "orient": {
        "name": "Orient",
        "blurb": "Steam ferries and mountain passes across monsoon coasts.",
        "underlay": (
            {"kind": "water", "d": "M -20 640 L -20 430 C 120 480 260 560 420 640 Z"},
            {"kind": "water", "d": "M 1020 -20 L 1020 640 L 880 640 C 940 400 920 120 980 -20 Z"},
            {"kind": "contour", "d": "M 300 280 C 380 200 500 190 600 260"},
            {"kind": "contour", "d": "M 340 270 C 400 220 500 215 570 265"},
            {"kind": "river", "d": "M 575 205 C 650 240 700 300 810 320"},
            {"kind": "river", "d": "M 372 315 C 430 330 480 330 520 300"},
        ),
        "cities": (
    {"id": "tokyo", "name": "Tokyo", "x": 906, "y": 92, "label": "n"},
    {"id": "osaka", "name": "Osaka", "x": 856, "y": 174, "label": "e"},
    {"id": "seoul", "name": "Seoul", "x": 758, "y": 118, "label": "n"},
    {"id": "beijing", "name": "Beijing", "x": 640, "y": 104, "label": "n"},
    {"id": "xian", "name": "Xi'an", "x": 560, "y": 196, "label": "w"},
    {"id": "shanghai", "name": "Shanghai", "x": 742, "y": 234, "label": "e"},
    {"id": "taipei", "name": "Taipei", "x": 818, "y": 266, "label": "e"},
    {"id": "manila", "name": "Manila", "x": 906, "y": 378, "label": "e"},
    {"id": "hongkong", "name": "Hong Kong", "x": 702, "y": 360, "label": "w"},
    {"id": "bangkok", "name": "Bangkok", "x": 572, "y": 470, "label": "s"},
    {"id": "singapore", "name": "Singapore", "x": 522, "y": 584, "label": "s"},
    {"id": "jakarta", "name": "Jakarta", "x": 398, "y": 606, "label": "s"},
    {"id": "kolkata", "name": "Kolkata", "x": 446, "y": 330, "label": "e"},
    {"id": "kathmandu", "name": "Kathmandu", "x": 372, "y": 300, "label": "n"},
    {"id": "delhi", "name": "Delhi", "x": 300, "y": 250, "label": "n"},
    {"id": "tashkent", "name": "Tashkent", "x": 226, "y": 160, "label": "w"},
    {"id": "karachi", "name": "Karachi", "x": 142, "y": 320, "label": "w"},
    {"id": "mumbai", "name": "Mumbai", "x": 214, "y": 402, "label": "w"},
    {"id": "dubai", "name": "Dubai", "x": 56, "y": 432, "label": "w"},
    {"id": "colombo", "name": "Colombo", "x": 240, "y": 546, "label": "s"},
        ),
        "routes": (
    ("tokyo", "osaka", "pink", 2),
    ("tokyo", "seoul", "blue", 3),
    ("osaka", "shanghai", "green", 3),
    ("osaka", "taipei", "gray", 2),
    ("seoul", "beijing", "yellow", 2),
    ("seoul", "shanghai", "red", 2),
    ("beijing", "xian", "orange", 2),
    ("xian", "shanghai", "gray", 3),
    ("beijing", "shanghai", "white", 3),
    ("shanghai", "hongkong", "red", 3),
    ("hongkong", "taipei", "gray", 2),
    ("taipei", "manila", "orange", 3),
    ("manila", "hongkong", "blue", 3),
    ("hongkong", "bangkok", "green", 3),
    ("bangkok", "singapore", "yellow", 3),
    ("singapore", "jakarta", "pink", 2),
    ("bangkok", "kolkata", "white", 3),
    ("kolkata", "kathmandu", "yellow", 2),
    ("kathmandu", "delhi", "gray", 2),
    ("delhi", "tashkent", "blue", 2),
    ("tashkent", "karachi", "red", 3),
    ("delhi", "karachi", "white", 3),
    ("delhi", "mumbai", "orange", 3),
    ("mumbai", "dubai", "white", 3),
    ("dubai", "karachi", "pink", 2),
    ("mumbai", "colombo", "green", 3),
    ("colombo", "singapore", "blue", 4),
        ),
        "tickets": (
    ("tokyo", "osaka", 5),
    ("seoul", "beijing", 5),
    ("beijing", "xian", 5),
    ("xian", "shanghai", 7),
    ("kolkata", "kathmandu", 5),
    ("kathmandu", "delhi", 5),
    ("dubai", "karachi", 5),
    ("hongkong", "taipei", 5),
    ("singapore", "jakarta", 5),
    ("seoul", "shanghai", 5),
    ("delhi", "tashkent", 5),
    ("osaka", "taipei", 5),
    ("tokyo", "seoul", 7),
    ("osaka", "shanghai", 7),
    ("shanghai", "hongkong", 7),
    ("hongkong", "bangkok", 7),
    ("bangkok", "singapore", 7),
    ("beijing", "shanghai", 7),
    ("delhi", "mumbai", 7),
    ("delhi", "karachi", 7),
    ("mumbai", "dubai", 7),
    ("mumbai", "colombo", 7),
    ("tashkent", "karachi", 7),
    ("taipei", "manila", 7),
    ("manila", "hongkong", 7),
    ("colombo", "singapore", 9),
    ("tokyo", "hongkong", 14),
    ("beijing", "hongkong", 14),
    ("singapore", "kolkata", 12),
    ("delhi", "dubai", 10),
    ("delhi", "singapore", 13),
    ("tokyo", "manila", 13),
    ("shanghai", "singapore", 15),
    ("osaka", "bangkok", 15),
    ("beijing", "delhi", 18),
    ("mumbai", "singapore", 13),
    ("taipei", "singapore", 14),
    ("colombo", "bangkok", 13),
        ),
    },
    "cleveland": {
        "name": "Cleveland",
        "blurb": "Neighborhoods along the Cuyahoga and the lakefront.",
        "underlay": (
            {"kind": "water", "d": "M -20 -20 L 1020 -20 L 1020 40 C 700 90 300 70 -20 60 Z"},
            {"kind": "river", "d": "M 330 280 C 300 340 350 380 320 430 C 300 470 340 490 330 540"},
            {"kind": "park", "d": "M 600 300 C 650 290 690 300 700 320 C 660 340 620 330 600 315 Z"},
        ),
        "trains": 19,
        "cities": (
            {"id": "west_park", "name": "West Park", "x": 140, "y": 150, "label": "n"},
            {"id": "lakewood", "name": "Lakewood", "x": 95, "y": 300, "label": "e"},
            {"id": "shoreway", "name": "Detroit-Shoreway", "x": 150, "y": 420, "label": "s"},
            {"id": "tremont", "name": "Tremont", "x": 290, "y": 490, "label": "s"},
            {"id": "flats", "name": "The Flats", "x": 360, "y": 400, "label": "s"},
            {"id": "shaker", "name": "Shaker Square", "x": 620, "y": 480, "label": "s"},
            {"id": "university", "name": "University Circle", "x": 740, "y": 400, "label": "e"},
            {"id": "heights", "name": "Cleveland Heights", "x": 850, "y": 330, "label": "e"},
            {"id": "collinwood", "name": "Collinwood", "x": 870, "y": 140, "label": "n"},
            {"id": "little_italy", "name": "Little Italy", "x": 720, "y": 200, "label": "n"},
            {"id": "playhouse", "name": "Playhouse Square", "x": 620, "y": 280, "label": "e"},
            {"id": "warehouse", "name": "Warehouse District", "x": 330, "y": 290, "label": "w"},
            {"id": "public_square", "name": "Public Square", "x": 500, "y": 330, "label": "e"},
        ),
        "routes": (
            ("west_park", "lakewood", "red", 2),
            ("lakewood", "shoreway", "orange", 2),
            ("shoreway", "tremont", "yellow", 2),
            ("tremont", "flats", "green", 1),
            ("flats", "shaker", "gray", 2),
            ("shaker", "university", "pink", 2),
            ("university", "heights", "black", 1),
            ("heights", "collinwood", "white", 2),
            ("collinwood", "little_italy", "red", 2),
            ("little_italy", "playhouse", "gray", 1),
            ("playhouse", "warehouse", "yellow", 3),
            ("warehouse", "west_park", "green", 2),
            ("west_park", "public_square", "green", 3),
            ("lakewood", "public_square", "blue", 3),
            ("shoreway", "public_square", "pink", 3),
            ("tremont", "public_square", "black", 2),
            ("flats", "public_square", "white", 2),
            ("shaker", "public_square", "red", 2),
            ("university", "public_square", "orange", 2),
            ("heights", "public_square", "yellow", 3),
            ("collinwood", "public_square", "green", 3),
            ("little_italy", "public_square", "blue", 2),
            ("playhouse", "public_square", "pink", 1),
            ("warehouse", "public_square", "black", 2),
        ),
        "tickets": (
            ("collinwood", "flats", 10),
            ("collinwood", "lakewood", 12),
            ("collinwood", "playhouse", 6),
            ("collinwood", "shaker", 10),
            ("collinwood", "shoreway", 12),
            ("collinwood", "tremont", 10),
            ("collinwood", "university", 6),
            ("collinwood", "warehouse", 10),
            ("collinwood", "west_park", 12),
            ("flats", "heights", 10),
            ("flats", "lakewood", 10),
            ("flats", "little_italy", 8),
            ("flats", "playhouse", 6),
            ("flats", "shoreway", 6),
            ("flats", "university", 8),
            ("flats", "warehouse", 8),
            ("flats", "west_park", 10),
            ("heights", "lakewood", 12),
            ("heights", "little_italy", 8),
            ("heights", "playhouse", 8),
        ),
    },
    "sanfrancisco": {
        "name": "San Francisco",
        "blurb": "Fog, hills, and forty-nine square miles of neighborhoods.",
        "underlay": (
            {"kind": "water", "d": "M 1020 -20 L 1020 640 L 740 640 C 690 500 730 300 660 170 C 640 120 630 60 640 -20 Z"},
            {"kind": "water", "d": "M -20 640 L -20 480 C 60 500 120 540 180 640 Z"},
            {"kind": "park", "d": "M 90 300 C 150 290 240 300 300 315 C 240 330 150 325 90 300 Z"},
            {"kind": "park", "d": "M 130 130 C 170 120 200 130 205 150 C 180 165 150 160 130 145 Z"},
        ),
        "trains": 16,
        "cities": (
            {"id": "pacific_heights", "name": "Pacific Heights", "x": 300, "y": 180, "label": "n"},
            {"id": "marina", "name": "Marina", "x": 430, "y": 110, "label": "n"},
            {"id": "fish_wharf", "name": "Fisherman's Wharf", "x": 600, "y": 150, "label": "e"},
            {"id": "embarcadero", "name": "Embarcadero", "x": 660, "y": 270, "label": "e"},
            {"id": "dogpatch", "name": "Dogpatch", "x": 640, "y": 410, "label": "e"},
            {"id": "mission", "name": "Mission", "x": 450, "y": 440, "label": "s"},
            {"id": "castro", "name": "Castro", "x": 330, "y": 400, "label": "w"},
            {"id": "haight", "name": "Haight-Ashbury", "x": 250, "y": 360, "label": "w"},
            {"id": "sunset", "name": "Sunset", "x": 120, "y": 420, "label": "s"},
            {"id": "richmond", "name": "Richmond", "x": 100, "y": 270, "label": "w"},
            {"id": "presidio", "name": "Presidio", "x": 170, "y": 150, "label": "n"},
            {"id": "union_square", "name": "Union Square", "x": 470, "y": 320, "label": "e"},
        ),
        "routes": (
            ("pacific_heights", "marina", "red", 2),
            ("marina", "fish_wharf", "orange", 2),
            ("fish_wharf", "embarcadero", "yellow", 1),
            ("embarcadero", "dogpatch", "green", 2),
            ("dogpatch", "mission", "gray", 2),
            ("mission", "castro", "pink", 1),
            ("castro", "haight", "black", 1),
            ("haight", "sunset", "white", 2),
            ("sunset", "richmond", "red", 2),
            ("richmond", "presidio", "gray", 1),
            ("presidio", "pacific_heights", "yellow", 1),
            ("pacific_heights", "union_square", "green", 2),
            ("marina", "union_square", "blue", 2),
            ("fish_wharf", "union_square", "pink", 2),
            ("embarcadero", "union_square", "black", 2),
            ("dogpatch", "union_square", "white", 2),
            ("mission", "union_square", "red", 1),
            ("castro", "union_square", "orange", 2),
            ("haight", "union_square", "yellow", 2),
            ("sunset", "union_square", "green", 3),
            ("richmond", "union_square", "blue", 3),
            ("presidio", "union_square", "pink", 3),
        ),
        "tickets": (
            ("castro", "dogpatch", 6),
            ("castro", "embarcadero", 8),
            ("castro", "fish_wharf", 8),
            ("castro", "marina", 8),
            ("castro", "pacific_heights", 8),
            ("castro", "presidio", 10),
            ("castro", "richmond", 10),
            ("castro", "sunset", 6),
            ("dogpatch", "fish_wharf", 6),
            ("dogpatch", "haight", 8),
            ("dogpatch", "marina", 8),
            ("dogpatch", "pacific_heights", 8),
            ("dogpatch", "presidio", 10),
            ("dogpatch", "richmond", 10),
            ("dogpatch", "sunset", 10),
            ("embarcadero", "haight", 8),
            ("embarcadero", "marina", 6),
            ("embarcadero", "mission", 6),
            ("embarcadero", "pacific_heights", 8),
            ("embarcadero", "presidio", 10),
        ),
    },
    "seattle": {
        "name": "Seattle",
        "blurb": "Ferries, hills, and coffee between two saltwater hubs.",
        "underlay": (
            {"kind": "water", "d": "M -20 -20 L 120 -20 C 80 120 60 300 120 500 C 140 560 150 600 150 640 L -20 640 Z"},
            {"kind": "water", "d": "M 455 245 C 470 240 480 250 478 268 C 474 282 458 285 450 275 C 446 264 448 252 455 245 Z"},
            {"kind": "water", "d": "M 655 265 C 685 270 700 300 695 330 C 688 360 668 370 655 355 C 645 330 645 295 655 265 Z"},
            {"kind": "contour", "d": "M 760 120 C 800 180 800 260 740 330"},
            {"kind": "contour", "d": "M 810 100 C 860 180 860 280 790 360"},
        ),
        "trains": 14,
        "cities": (
            {"id": "greenlake", "name": "Green Lake", "x": 250, "y": 115, "label": "n"},
            {"id": "udistrict", "name": "U District", "x": 500, "y": 110, "label": "n"},
            {"id": "capitol", "name": "Capitol Hill", "x": 640, "y": 290, "label": "e"},
            {"id": "beacon", "name": "Beacon Hill", "x": 620, "y": 420, "label": "s"},
            {"id": "columbia", "name": "Columbia City", "x": 700, "y": 500, "label": "s"},
            {"id": "sodo", "name": "SoDo", "x": 450, "y": 480, "label": "s"},
            {"id": "westseattle", "name": "West Seattle", "x": 270, "y": 510, "label": "s"},
            {"id": "magnolia", "name": "Magnolia", "x": 160, "y": 230, "label": "w"},
            {"id": "ballard", "name": "Ballard", "x": 140, "y": 110, "label": "n"},
            {"id": "westlake", "name": "Westlake", "x": 470, "y": 330, "label": "e"},
            {"id": "pike_place", "name": "Pike Place Market", "x": 390, "y": 340, "label": "s"},
        ),
        "routes": (
            ("greenlake", "udistrict", "red", 2),
            ("udistrict", "capitol", "orange", 2),
            ("capitol", "beacon", "yellow", 1),
            ("beacon", "columbia", "green", 1),
            ("columbia", "sodo", "gray", 2),
            ("sodo", "westseattle", "pink", 2),
            ("westseattle", "magnolia", "black", 3),
            ("magnolia", "ballard", "white", 1),
            ("ballard", "greenlake", "red", 1),
            ("greenlake", "pike_place", "green", 2),
            ("udistrict", "pike_place", "blue", 2),
            ("capitol", "pike_place", "pink", 2),
            ("beacon", "westlake", "black", 2),
            ("columbia", "westlake", "white", 3),
            ("sodo", "westlake", "red", 2),
            ("westseattle", "pike_place", "orange", 2),
            ("magnolia", "pike_place", "yellow", 2),
            ("ballard", "pike_place", "green", 3),
            ("westlake", "pike_place", "blue", 1),
        ),
        "tickets": (
            ("ballard", "capitol", 10),
            ("ballard", "udistrict", 6),
            ("ballard", "westlake", 8),
            ("ballard", "westseattle", 8),
            ("beacon", "pike_place", 6),
            ("beacon", "sodo", 6),
            ("beacon", "udistrict", 6),
            ("capitol", "columbia", 4),
            ("capitol", "greenlake", 8),
            ("capitol", "magnolia", 8),
            ("capitol", "westlake", 6),
            ("capitol", "westseattle", 8),
            ("columbia", "pike_place", 8),
            ("columbia", "westseattle", 8),
            ("greenlake", "magnolia", 4),
            ("greenlake", "westlake", 6),
            ("greenlake", "westseattle", 8),
            ("magnolia", "sodo", 10),
            ("magnolia", "udistrict", 8),
            ("magnolia", "westlake", 6),
        ),
    },

    "losangeles": {
        "name": "Los Angeles",
        "blurb": "From the ocean to the mountains, stuck on the 110.",
        "underlay": (
            {"kind": "water", "d": "M -20 640 L -20 460 C 100 460 200 520 320 560 C 420 590 500 620 560 640 Z"},
            {"kind": "river", "d": "M 430 90 C 460 180 430 260 460 330 C 480 400 470 500 500 610"},
            {"kind": "park", "d": "M 435 215 C 470 205 495 215 500 235 C 480 255 450 255 435 240 Z"},
            {"kind": "contour", "d": "M 600 60 C 680 90 740 150 760 230"},
            {"kind": "contour", "d": "M 640 40 C 730 80 790 150 815 240"},
        ),
        "trains": 14,
        "cities": (
            {"id": "santamonica", "name": "Santa Monica", "x": 100, "y": 310, "label": "w"},
            {"id": "venice", "name": "Venice", "x": 140, "y": 440, "label": "s"},
            {"id": "inglewood", "name": "Inglewood", "x": 330, "y": 550, "label": "s"},
            {"id": "southla", "name": "South LA", "x": 540, "y": 520, "label": "s"},
            {"id": "boyle", "name": "Boyle Heights", "x": 660, "y": 390, "label": "e"},
            {"id": "pasadena", "name": "Pasadena", "x": 730, "y": 190, "label": "e"},
            {"id": "burbank", "name": "Burbank", "x": 560, "y": 80, "label": "n"},
            {"id": "northridge", "name": "Northridge", "x": 230, "y": 80, "label": "n"},
            {"id": "downtown", "name": "Downtown", "x": 470, "y": 330, "label": "e"},
            {"id": "hollywood", "name": "Hollywood", "x": 400, "y": 170, "label": "n"},
        ),
        "routes": (
            ("santamonica", "venice", "red", 1),
            ("venice", "inglewood", "orange", 2),
            ("inglewood", "southla", "pink", 2),
            ("southla", "boyle", "green", 2),
            ("boyle", "pasadena", "gray", 2),
            ("pasadena", "burbank", "pink", 2),
            ("burbank", "northridge", "black", 3),
            ("northridge", "santamonica", "white", 2),
            ("santamonica", "hollywood", "gray", 3),
            ("venice", "downtown", "blue", 3),
            ("inglewood", "downtown", "pink", 2),
            ("southla", "downtown", "black", 2),
            ("boyle", "downtown", "white", 2),
            ("pasadena", "hollywood", "red", 3),
            ("burbank", "hollywood", "orange", 2),
            ("northridge", "hollywood", "yellow", 2),
            ("downtown", "hollywood", "green", 2),
        ),
        "tickets": (
            ("boyle", "burbank", 8),
            ("boyle", "hollywood", 8),
            ("boyle", "inglewood", 8),
            ("boyle", "venice", 10),
            ("burbank", "downtown", 8),
            ("burbank", "santamonica", 10),
            ("downtown", "northridge", 8),
            ("downtown", "pasadena", 8),
            ("downtown", "santamonica", 8),
            ("hollywood", "inglewood", 8),
            ("hollywood", "southla", 8),
            ("hollywood", "venice", 8),
            ("inglewood", "santamonica", 6),
            ("northridge", "pasadena", 10),
            ("northridge", "venice", 6),
            ("pasadena", "santamonica", 12),
            ("pasadena", "southla", 8),
            ("southla", "venice", 8),
            ("boyle", "northridge", 12),
            ("boyle", "santamonica", 12),
        ),
    },
    "atlanta": {
        "name": "Atlanta",
        "blurb": "Peachtree lines radiating from Five Points.",
        "underlay": (
            {"kind": "river", "d": "M 240 60 C 200 160 160 240 190 340 C 210 420 180 500 200 640"},
            {"kind": "park", "d": "M 555 315 C 590 305 620 315 628 335 C 600 350 570 345 555 330 Z"},
            {"kind": "contour", "d": "M 480 240 C 570 260 610 330 590 400 C 560 450 480 460 420 420 C 380 380 380 300 420 260 C 440 245 460 240 480 240"},
        ),
        "trains": 13,
        "cities": (
            {"id": "vinings", "name": "Vinings", "x": 250, "y": 230, "label": "w"},
            {"id": "west_midtown", "name": "West Midtown", "x": 340, "y": 150, "label": "n"},
            {"id": "midtown", "name": "Midtown", "x": 540, "y": 200, "label": "n"},
            {"id": "druid", "name": "Druid Hills", "x": 700, "y": 300, "label": "e"},
            {"id": "decatur", "name": "Decatur", "x": 700, "y": 420, "label": "e"},
            {"id": "cabbagetown", "name": "Cabbagetown", "x": 580, "y": 460, "label": "e"},
            {"id": "inman", "name": "Inman Park", "x": 592, "y": 418, "label": "e"},
            {"id": "west_end", "name": "West End", "x": 320, "y": 470, "label": "s"},
            {"id": "bankhead", "name": "Bankhead", "x": 170, "y": 350, "label": "w"},
            {"id": "fivepoints", "name": "Five Points", "x": 460, "y": 340, "label": "s"},
            {"id": "lenox", "name": "Lenox", "x": 620, "y": 150, "label": "n"},
        ),
        "routes": (
            ("vinings", "west_midtown", "red", 1),
            ("west_midtown", "midtown", "orange", 2),
            ("midtown", "druid", "yellow", 2),
            ("druid", "decatur", "green", 1),
            ("decatur", "cabbagetown", "gray", 1),
            ("cabbagetown", "inman", "pink", 1),
            ("inman", "west_end", "black", 2),
            ("west_end", "bankhead", "white", 2),
            ("bankhead", "vinings", "red", 2),
            ("vinings", "fivepoints", "green", 2),
            ("west_midtown", "fivepoints", "blue", 2),
            ("midtown", "lenox", "pink", 1),
            ("druid", "lenox", "black", 2),
            ("decatur", "fivepoints", "white", 2),
            ("cabbagetown", "fivepoints", "red", 2),
            ("inman", "fivepoints", "orange", 1),
            ("west_end", "fivepoints", "yellow", 2),
            ("bankhead", "fivepoints", "green", 3),
            ("fivepoints", "lenox", "blue", 2),
        ),
        "tickets": (
            ("bankhead", "cabbagetown", 10),
            ("bankhead", "decatur", 10),
            ("bankhead", "inman", 8),
            ("bankhead", "lenox", 10),
            ("bankhead", "west_midtown", 6),
            ("cabbagetown", "druid", 4),
            ("cabbagetown", "lenox", 8),
            ("cabbagetown", "vinings", 8),
            ("cabbagetown", "west_end", 6),
            ("cabbagetown", "west_midtown", 8),
            ("decatur", "inman", 4),
            ("decatur", "lenox", 6),
            ("decatur", "midtown", 6),
            ("decatur", "vinings", 8),
            ("decatur", "west_end", 8),
            ("decatur", "west_midtown", 8),
            ("druid", "fivepoints", 6),
            ("druid", "west_midtown", 8),
            ("fivepoints", "midtown", 6),
            ("inman", "lenox", 6),
        ),
    },
    "newyork": {
        "name": "New York",
        "blurb": "The island, the bridge, and the BMT, bound together.",
        "underlay": (
            {"kind": "water", "d": "M 320 40 C 335 150 350 280 400 380 L 430 440 L 360 470 C 320 340 300 180 290 40 Z"},
            {"kind": "river", "d": "M 540 280 C 570 320 600 340 620 380"},
            {"kind": "water", "d": "M 380 500 C 470 470 600 490 660 540 C 590 590 440 590 380 500 Z"},
            {"kind": "park", "d": "M 340 108 C 368 98 395 103 400 122 C 393 141 363 145 340 134 C 335 127 335 116 340 108 Z"},
        ),
        "trains": 11,
        "cities": (
            {"id": "harlem", "name": "Harlem", "x": 540, "y": 100, "label": "n"},
            {"id": "astoria", "name": "Astoria", "x": 660, "y": 170, "label": "e"},
            {"id": "williamsburg", "name": "Williamsburg", "x": 700, "y": 320, "label": "e"},
            {"id": "park_slope", "name": "Park Slope", "x": 590, "y": 460, "label": "s"},
            {"id": "brooklynhts", "name": "Brooklyn Heights", "x": 568, "y": 398, "label": "e"},
            {"id": "tribeca", "name": "Tribeca", "x": 430, "y": 415, "label": "s"},
            {"id": "greenwich", "name": "Greenwich Village", "x": 455, "y": 345, "label": "e"},
            {"id": "chelsea", "name": "Chelsea", "x": 380, "y": 270, "label": "w"},
            {"id": "upper_west", "name": "Upper West Side", "x": 310, "y": 150, "label": "w"},
            {"id": "upper_east", "name": "Upper East Side", "x": 420, "y": 120, "label": "n"},
            {"id": "times_square", "name": "Times Square", "x": 450, "y": 220, "label": "w"},
            {"id": "wallst", "name": "Wall Street", "x": 520, "y": 420, "label": "e"},
        ),
        "routes": (
            ("harlem", "astoria", "red", 1),
            ("astoria", "williamsburg", "orange", 2),
            ("williamsburg", "park_slope", "yellow", 2),
            ("park_slope", "brooklynhts", "green", 1),
            ("brooklynhts", "tribeca", "gray", 1),
            ("tribeca", "greenwich", "pink", 1),
            ("greenwich", "chelsea", "black", 1),
            ("chelsea", "upper_west", "white", 1),
            ("upper_west", "upper_east", "red", 1),
            ("upper_east", "harlem", "gray", 1),
            ("harlem", "times_square", "green", 2),
            ("astoria", "times_square", "blue", 2),
            ("williamsburg", "wallst", "pink", 2),
            ("park_slope", "wallst", "black", 1),
            ("brooklynhts", "wallst", "white", 1),
            ("tribeca", "wallst", "red", 1),
            ("greenwich", "times_square", "orange", 1),
            ("chelsea", "times_square", "yellow", 1),
            ("upper_west", "times_square", "green", 2),
            ("upper_east", "times_square", "blue", 1),
            ("times_square", "wallst", "pink", 2),
        ),
        "tickets": (
            ("astoria", "chelsea", 6),
            ("astoria", "greenwich", 6),
            ("astoria", "park_slope", 8),
            ("astoria", "upper_east", 4),
            ("astoria", "upper_west", 6),
            ("astoria", "wallst", 8),
            ("brooklynhts", "greenwich", 4),
            ("brooklynhts", "times_square", 6),
            ("brooklynhts", "williamsburg", 6),
            ("chelsea", "harlem", 6),
            ("chelsea", "tribeca", 4),
            ("chelsea", "upper_east", 4),
            ("chelsea", "wallst", 6),
            ("greenwich", "harlem", 6),
            ("greenwich", "upper_east", 4),
            ("greenwich", "upper_west", 4),
            ("greenwich", "wallst", 4),
            ("harlem", "upper_west", 4),
            ("harlem", "wallst", 8),
            ("harlem", "williamsburg", 6),
        ),
    },
    "melbourne": {
        "name": "Melbourne",
        "blurb": "Trams out of Flinders Street, up Swanston and beyond.",
        "underlay": (
            {"kind": "water", "d": "M -20 640 L -20 430 C 100 420 180 480 240 570 C 280 620 320 640 360 640 Z"},
            {"kind": "river", "d": "M 680 300 C 600 340 540 330 470 330 C 420 335 380 380 340 440"},
            {"kind": "park", "d": "M 450 160 C 490 150 520 158 528 175 C 505 190 470 188 450 175 Z"},
            {"kind": "park", "d": "M 420 415 C 460 405 495 415 500 432 C 470 448 435 440 420 425 Z"},
        ),
        "trains": 13,
        "cities": (
            {"id": "north_melbourne", "name": "North Melbourne", "x": 270, "y": 240, "label": "w"},
            {"id": "brunswick", "name": "Brunswick", "x": 430, "y": 100, "label": "n"},
            {"id": "carlton", "name": "Carlton", "x": 540, "y": 120, "label": "n"},
            {"id": "fitzroy", "name": "Fitzroy", "x": 580, "y": 160, "label": "n"},
            {"id": "collingwood", "name": "Collingwood", "x": 650, "y": 230, "label": "e"},
            {"id": "richmond", "name": "Richmond", "x": 620, "y": 390, "label": "e"},
            {"id": "st_kilda", "name": "St Kilda", "x": 490, "y": 510, "label": "s"},
            {"id": "port_melbourne", "name": "Port Melbourne", "x": 300, "y": 490, "label": "s"},
            {"id": "footscray", "name": "Footscray", "x": 160, "y": 360, "label": "w"},
            {"id": "flinders", "name": "Flinders Street", "x": 470, "y": 330, "label": "e"},
            {"id": "southern_cross", "name": "Southern Cross", "x": 360, "y": 270, "label": "w"},
        ),
        "routes": (
            ("north_melbourne", "brunswick", "red", 2),
            ("brunswick", "carlton", "orange", 1),
            ("carlton", "fitzroy", "yellow", 1),
            ("fitzroy", "collingwood", "green", 1),
            ("collingwood", "richmond", "gray", 2),
            ("richmond", "st_kilda", "pink", 2),
            ("st_kilda", "port_melbourne", "black", 2),
            ("port_melbourne", "footscray", "white", 2),
            ("footscray", "north_melbourne", "red", 2),
            ("north_melbourne", "southern_cross", "green", 1),
            ("brunswick", "flinders", "blue", 2),
            ("carlton", "flinders", "pink", 2),
            ("fitzroy", "flinders", "black", 2),
            ("collingwood", "flinders", "white", 2),
            ("richmond", "flinders", "red", 2),
            ("st_kilda", "flinders", "orange", 2),
            ("port_melbourne", "southern_cross", "yellow", 2),
            ("footscray", "southern_cross", "green", 2),
            ("flinders", "southern_cross", "blue", 1),
        ),
        "tickets": (
            ("brunswick", "collingwood", 6),
            ("brunswick", "fitzroy", 4),
            ("brunswick", "footscray", 8),
            ("brunswick", "richmond", 8),
            ("brunswick", "southern_cross", 6),
            ("brunswick", "st_kilda", 8),
            ("carlton", "collingwood", 4),
            ("carlton", "north_melbourne", 6),
            ("carlton", "richmond", 8),
            ("carlton", "southern_cross", 6),
            ("carlton", "st_kilda", 8),
            ("collingwood", "southern_cross", 6),
            ("collingwood", "st_kilda", 8),
            ("fitzroy", "richmond", 6),
            ("fitzroy", "southern_cross", 6),
            ("fitzroy", "st_kilda", 8),
            ("flinders", "footscray", 6),
            ("flinders", "north_melbourne", 4),
            ("flinders", "port_melbourne", 6),
            ("footscray", "st_kilda", 8),
        ),
    },
    "sydney": {
        "name": "Sydney",
        "blurb": "Harbour ferries and the T-lines out of Central.",
        "underlay": (
            {"kind": "water", "d": "M 500 290 C 540 240 600 220 640 200 C 680 180 660 150 700 130 L 760 170 C 700 220 640 260 560 300 C 540 310 520 305 500 290 Z"},
            {"kind": "water", "d": "M 500 290 C 440 260 380 250 300 220 C 260 205 230 195 175 185 L 175 210 C 260 235 380 285 490 315 Z"},
            {"kind": "water", "d": "M 1020 200 C 940 260 960 360 1020 420 Z"},
            {"kind": "park", "d": "M 640 440 C 675 430 705 440 712 460 C 695 478 660 478 640 462 Z"},
            {"kind": "park", "d": "M 458 340 C 472 334 486 340 488 355 C 480 368 464 370 456 358 C 453 350 454 344 458 340 Z"},
        ),
        "trains": 14,
        "cities": (
            {"id": "blacktown", "name": "Blacktown", "x": 118, "y": 138, "label": "w"},
            {"id": "ryde", "name": "West Ryde", "x": 330, "y": 110, "label": "n"},
            {"id": "chatswood", "name": "Chatswood", "x": 520, "y": 85, "label": "n"},
            {"id": "manly", "name": "Manly", "x": 690, "y": 110, "label": "e"},
            {"id": "bondi", "name": "Bondi Beach", "x": 730, "y": 420, "label": "e"},
            {"id": "coogee", "name": "Coogee", "x": 610, "y": 490, "label": "s"},
            {"id": "bankstown", "name": "Bankstown", "x": 350, "y": 545, "label": "s"},
            {"id": "newtown", "name": "Newtown", "x": 330, "y": 450, "label": "w"},
            {"id": "parramatta", "name": "Parramatta", "x": 170, "y": 180, "label": "w"},
            {"id": "circularquay", "name": "Circular Quay", "x": 500, "y": 290, "label": "e"},
            {"id": "central", "name": "Central", "x": 460, "y": 400, "label": "s"},
        ),
        "routes": (
            ("blacktown", "ryde", "red", 2),
            ("ryde", "chatswood", "orange", 2),
            ("chatswood", "manly", "yellow", 2),
            ("manly", "bondi", "green", 3),
            ("bondi", "coogee", "gray", 1),
            ("coogee", "bankstown", "pink", 2),
            ("bankstown", "newtown", "black", 1),
            ("newtown", "parramatta", "white", 3),
            ("parramatta", "blacktown", "red", 1),
            ("blacktown", "circularquay", "green", 3),
            ("ryde", "central", "blue", 3),
            ("chatswood", "circularquay", "pink", 2),
            ("manly", "circularquay", "black", 2),
            ("bondi", "central", "white", 2),
            ("coogee", "central", "red", 2),
            ("bankstown", "central", "orange", 2),
            ("newtown", "central", "yellow", 1),
            ("parramatta", "central", "green", 3),
            ("circularquay", "central", "blue", 1),
        ),
        "tickets": (
            ("bankstown", "bondi", 6),
            ("bankstown", "circularquay", 6),
            ("bankstown", "parramatta", 8),
            ("bankstown", "ryde", 10),
            ("blacktown", "central", 8),
            ("blacktown", "chatswood", 8),
            ("blacktown", "manly", 10),
            ("blacktown", "newtown", 8),
            ("bondi", "chatswood", 10),
            ("bondi", "circularquay", 6),
            ("bondi", "newtown", 6),
            ("bondi", "parramatta", 10),
            ("bondi", "ryde", 10),
            ("central", "chatswood", 6),
            ("central", "manly", 6),
            ("circularquay", "coogee", 6),
            ("circularquay", "newtown", 4),
            ("circularquay", "parramatta", 8),
            ("circularquay", "ryde", 8),
            ("coogee", "manly", 8),
        ),
    },
    "detroit": {
        "name": "Detroit",
        "blurb": "Motown blocks between the river and New Center.",
        "underlay": (
            {"kind": "water", "d": "M 300 640 C 380 560 520 520 640 470 C 760 430 900 430 1020 460 L 1020 640 Z"},
            {"kind": "water", "d": "M 690 480 C 715 470 740 478 745 495 C 735 510 705 508 692 497 Z"},
            {"kind": "park", "d": "M 440 90 C 480 80 515 88 522 105 C 500 122 460 118 440 105 Z"},
        ),
        "trains": 11,
        "cities": (
            {"id": "warrendale", "name": "Warrendale", "x": 110, "y": 370, "label": "w"},
            {"id": "corktown", "name": "Corktown", "x": 240, "y": 410, "label": "s"},
            {"id": "mexicantown", "name": "Mexicantown", "x": 370, "y": 430, "label": "s"},
            {"id": "riverfront", "name": "Riverfront", "x": 490, "y": 430, "label": "s"},
            {"id": "eastern", "name": "Eastern Market", "x": 640, "y": 390, "label": "e"},
            {"id": "hamtramck", "name": "Hamtramck", "x": 650, "y": 230, "label": "e"},
            {"id": "midtown", "name": "Midtown", "x": 460, "y": 220, "label": "n"},
            {"id": "woodbridge", "name": "Woodbridge", "x": 310, "y": 280, "label": "w"},
            {"id": "campus", "name": "Campus Martius", "x": 450, "y": 300, "label": "e"},
            {"id": "newcenter", "name": "New Center", "x": 530, "y": 140, "label": "n"},
        ),
        "routes": (
            ("warrendale", "corktown", "red", 1),
            ("corktown", "mexicantown", "orange", 1),
            ("mexicantown", "riverfront", "yellow", 1),
            ("riverfront", "eastern", "blue", 2),
            ("eastern", "hamtramck", "gray", 2),
            ("hamtramck", "midtown", "pink", 2),
            ("midtown", "woodbridge", "black", 2),
            ("woodbridge", "warrendale", "white", 2),
            ("warrendale", "campus", "green", 3),
            ("corktown", "campus", "blue", 2),
            ("mexicantown", "campus", "gray", 2),
            ("riverfront", "campus", "black", 1),
            ("eastern", "campus", "white", 2),
            ("hamtramck", "newcenter", "red", 2),
            ("midtown", "newcenter", "orange", 1),
            ("woodbridge", "campus", "yellow", 2),
            ("campus", "newcenter", "green", 2),
        ),
        "tickets": (
            ("campus", "hamtramck", 8),
            ("campus", "midtown", 6),
            ("corktown", "eastern", 8),
            ("corktown", "newcenter", 8),
            ("corktown", "riverfront", 4),
            ("corktown", "woodbridge", 6),
            ("eastern", "mexicantown", 6),
            ("eastern", "midtown", 8),
            ("eastern", "newcenter", 8),
            ("eastern", "warrendale", 10),
            ("eastern", "woodbridge", 8),
            ("hamtramck", "riverfront", 8),
            ("hamtramck", "woodbridge", 8),
            ("mexicantown", "newcenter", 8),
            ("mexicantown", "warrendale", 4),
            ("mexicantown", "woodbridge", 8),
            ("midtown", "warrendale", 8),
            ("newcenter", "riverfront", 6),
            ("newcenter", "warrendale", 10),
            ("newcenter", "woodbridge", 6),
        ),
    },
    "minneapolis": {
        "name": "Minneapolis",
        "blurb": "Lakes, loons, and the Blue and Green lines.",
        "underlay": (
            {"kind": "river", "d": "M 380 60 C 420 160 500 220 520 300 C 540 370 500 420 560 480 C 600 520 640 540 700 560"},
            {"kind": "water", "d": "M 245 360 C 268 352 285 362 282 380 C 275 395 252 393 244 378 Z"},
            {"kind": "water", "d": "M 210 405 C 230 398 245 408 242 424 C 234 436 214 432 206 420 Z"},
            {"kind": "water", "d": "M 255 445 C 275 438 292 448 288 464 C 278 476 258 470 252 458 Z"},
            {"kind": "park", "d": "M 545 495 C 570 488 592 495 596 510 C 580 522 558 518 545 508 Z"},
        ),
        "trains": 13,
        "cities": (
            {"id": "north_mpls", "name": "North Minneapolis", "x": 160, "y": 220, "label": "w"},
            {"id": "dinkytown", "name": "Dinkytown", "x": 500, "y": 200, "label": "n"},
            {"id": "northeast", "name": "Northeast", "x": 580, "y": 140, "label": "n"},
            {"id": "st_anthony", "name": "St. Anthony Main", "x": 630, "y": 270, "label": "e"},
            {"id": "seward", "name": "Seward", "x": 570, "y": 390, "label": "e"},
            {"id": "longfellow", "name": "Longfellow", "x": 650, "y": 470, "label": "e"},
            {"id": "nokomis", "name": "Nokomis", "x": 500, "y": 530, "label": "s"},
            {"id": "calhoun", "name": "Bde Maka Ska", "x": 240, "y": 410, "label": "w"},
            {"id": "lynlake", "name": "Lyn-Lake", "x": 330, "y": 360, "label": "w"},
            {"id": "downtown", "name": "Downtown", "x": 460, "y": 280, "label": "w"},
            {"id": "uptown", "name": "Uptown", "x": 320, "y": 430, "label": "s"},
        ),
        "routes": (
            ("north_mpls", "dinkytown", "red", 3),
            ("dinkytown", "northeast", "orange", 1),
            ("northeast", "st_anthony", "yellow", 1),
            ("st_anthony", "seward", "green", 1),
            ("seward", "longfellow", "gray", 1),
            ("longfellow", "nokomis", "pink", 2),
            ("nokomis", "calhoun", "black", 3),
            ("calhoun", "lynlake", "white", 1),
            ("lynlake", "north_mpls", "red", 2),
            ("north_mpls", "downtown", "green", 3),
            ("dinkytown", "downtown", "blue", 1),
            ("northeast", "downtown", "pink", 2),
            ("st_anthony", "downtown", "black", 2),
            ("seward", "downtown", "white", 2),
            ("longfellow", "downtown", "red", 2),
            ("nokomis", "uptown", "orange", 2),
            ("calhoun", "uptown", "yellow", 1),
            ("lynlake", "uptown", "green", 1),
            ("downtown", "uptown", "blue", 2),
        ),
        "tickets": (
            ("calhoun", "downtown", 6),
            ("calhoun", "longfellow", 10),
            ("calhoun", "north_mpls", 6),
            ("dinkytown", "longfellow", 6),
            ("dinkytown", "lynlake", 8),
            ("dinkytown", "seward", 6),
            ("dinkytown", "st_anthony", 4),
            ("dinkytown", "uptown", 6),
            ("downtown", "lynlake", 6),
            ("downtown", "nokomis", 8),
            ("longfellow", "north_mpls", 10),
            ("longfellow", "northeast", 6),
            ("longfellow", "st_anthony", 4),
            ("longfellow", "uptown", 8),
            ("lynlake", "nokomis", 6),
            ("nokomis", "seward", 6),
            ("north_mpls", "northeast", 8),
            ("north_mpls", "seward", 10),
            ("north_mpls", "st_anthony", 10),
            ("north_mpls", "uptown", 6),
        ),
    },
}

TRAINING_DEFAULT_MAP = "coastline"

TRAINING_ROUTE_POINTS = {1: 1, 2: 2, 3: 4, 4: 7, 5: 10}
TRAINING_TRAINS_PER_PLAYER = 25
TRAINING_END_TRAINS = 2
TRAINING_HAND_START = 4
TRAINING_MARKET_SIZE = 5
TRAINING_CARD_SUITS = ("red", "orange", "yellow", "green", "blue", "pink", "black", "white")
TRAINING_CARDS_PER_SUIT = 10
TRAINING_WILD_CARDS = 10

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
        (TRAINING_GAMES_LOCK, TRAINING_GAMES, TRAINING_GAME_SUBSCRIBERS, None),
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

    @app.get("/sw.js")
    def hub_service_worker():
        return send_from_directory(BASE_DIR, "sw.js")

    @app.get("/manifest.webmanifest")
    def hub_manifest():
        manifest = BASE_DIR / "manifest.webmanifest"
        return Response(
            manifest.read_text(encoding="utf-8"),
            mimetype="application/manifest+json",
        )

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

    TRAINING_STATIC_DIR = BASE_DIR / "training" / "static"

    @app.get("/training")
    def training_redirect():
        return redirect("/training/")

    @app.get("/training/")
    def training_index():
        return send_from_directory(TRAINING_STATIC_DIR, "index.html")

    @app.get("/training/<path:filename>")
    def training_static(filename: str):
        return send_from_directory(TRAINING_STATIC_DIR, filename)

    G2048_STATIC_DIR = BASE_DIR / "2048" / "static"

    @app.get("/2048")
    def g2048_redirect():
        return redirect("/2048/")

    @app.get("/2048/")
    def g2048_index():
        return send_from_directory(G2048_STATIC_DIR, "index.html")

    @app.get("/2048/<path:filename>")
    def g2048_static(filename: str):
        return send_from_directory(G2048_STATIC_DIR, filename)

    WORD_GUESS_STATIC_DIR = BASE_DIR / "word-guess" / "static"

    @app.get("/word-guess")
    def word_guess_redirect():
        return redirect("/word-guess/")

    @app.get("/word-guess/")
    def word_guess_index():
        return send_from_directory(WORD_GUESS_STATIC_DIR, "index.html")

    @app.get("/word-guess/<path:filename>")
    def word_guess_static(filename: str):
        return send_from_directory(WORD_GUESS_STATIC_DIR, filename)

    MINESWEEPER_STATIC_DIR = BASE_DIR / "minesweeper" / "static"

    @app.get("/minesweeper")
    def minesweeper_redirect():
        return redirect("/minesweeper/")

    @app.get("/minesweeper/")
    def minesweeper_index():
        return send_from_directory(MINESWEEPER_STATIC_DIR, "index.html")

    @app.get("/minesweeper/<path:filename>")
    def minesweeper_static(filename: str):
        return send_from_directory(MINESWEEPER_STATIC_DIR, filename)

    CONNECT_FOUR_STATIC_DIR = BASE_DIR / "connect-four" / "static"

    @app.get("/connect-four")
    def connect_four_redirect():
        return redirect("/connect-four/")

    @app.get("/connect-four/")
    def connect_four_index():
        return send_from_directory(CONNECT_FOUR_STATIC_DIR, "index.html")

    @app.get("/connect-four/<path:filename>")
    def connect_four_static(filename: str):
        return send_from_directory(CONNECT_FOUR_STATIC_DIR, filename)

    MEMORY_STATIC_DIR = BASE_DIR / "memory" / "static"

    @app.get("/memory")
    def memory_redirect():
        return redirect("/memory/")

    @app.get("/memory/")
    def memory_index():
        return send_from_directory(MEMORY_STATIC_DIR, "index.html")

    @app.get("/memory/<path:filename>")
    def memory_static(filename: str):
        return send_from_directory(MEMORY_STATIC_DIR, filename)

    SNAKE_STATIC_DIR = BASE_DIR / "snake" / "static"

    @app.get("/snake")
    def snake_redirect():
        return redirect("/snake/")

    @app.get("/snake/")
    def snake_index():
        return send_from_directory(SNAKE_STATIC_DIR, "index.html")

    @app.get("/snake/<path:filename>")
    def snake_static(filename: str):
        return send_from_directory(SNAKE_STATIC_DIR, filename)

    SIMON_STATIC_DIR = BASE_DIR / "simon" / "static"

    @app.get("/simon")
    def simon_redirect():
        return redirect("/simon/")

    @app.get("/simon/")
    def simon_index():
        return send_from_directory(SIMON_STATIC_DIR, "index.html")

    @app.get("/simon/<path:filename>")
    def simon_static(filename: str):
        return send_from_directory(SIMON_STATIC_DIR, filename)

    SLIDING_PUZZLE_STATIC_DIR = BASE_DIR / "sliding-puzzle" / "static"

    @app.get("/sliding-puzzle")
    def sliding_puzzle_redirect():
        return redirect("/sliding-puzzle/")

    @app.get("/sliding-puzzle/")
    def sliding_puzzle_index():
        return send_from_directory(SLIDING_PUZZLE_STATIC_DIR, "index.html")

    @app.get("/sliding-puzzle/<path:filename>")
    def sliding_puzzle_static(filename: str):
        return send_from_directory(SLIDING_PUZZLE_STATIC_DIR, filename)

    DOTS_AND_BOXES_STATIC_DIR = BASE_DIR / "dots-and-boxes" / "static"

    @app.get("/dots-and-boxes")
    def dots_and_boxes_redirect():
        return redirect("/dots-and-boxes/")

    @app.get("/dots-and-boxes/")
    def dots_and_boxes_index():
        return send_from_directory(DOTS_AND_BOXES_STATIC_DIR, "index.html")

    @app.get("/dots-and-boxes/<path:filename>")
    def dots_and_boxes_static(filename: str):
        return send_from_directory(DOTS_AND_BOXES_STATIC_DIR, filename)


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
        with TRAINING_GAMES_LOCK:
            training_count = len(TRAINING_GAMES)
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
                    "training": training_count,
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

    # ============================================================
    # TRAINING — a Ticket-to-Ride-style rail game for two players. Draw
    # train cards (two per turn from the deck or face-up market), claim
    # routes with matching cards (wilds fill any gap; gray routes accept
    # any single suit), and hold destination tickets that pay on a
    # connected path of your rails — or cost you if unfinished. When a
    # player is down to their last trains, everyone gets one final turn.
    # ============================================================

    def training_map_data(map_id: str) -> dict[str, Any]:
        return TRAINING_MAPS[map_id]

    def training_routes_for(map_id: str) -> list[dict[str, Any]]:
        return [
            {"id": i, "a": a, "b": b, "color": color, "length": length, "owner": None}
            for i, (a, b, color, length) in enumerate(training_map_data(map_id)["routes"])
        ]

    def training_build_deck() -> list[str]:
        deck = []
        for suit in TRAINING_CARD_SUITS:
            deck.extend([suit] * TRAINING_CARDS_PER_SUIT)
        deck.extend(["wild"] * TRAINING_WILD_CARDS)
        random.SystemRandom().shuffle(deck)
        return deck

    def training_build_ticket_deck(map_id: str) -> list[dict[str, Any]]:
        tickets = [
            {"id": i, "a": a, "b": b, "points": points}
            for i, (a, b, points) in enumerate(training_map_data(map_id)["tickets"])
        ]
        random.SystemRandom().shuffle(tickets)
        return tickets

    def training_new_game(map_id: str) -> dict[str, Any]:
        now = utc_now()
        return {
            "code": uuid.uuid4().hex[:8].upper(),
            "mapId": map_id,
            "trainsPerPlayer": int(training_map_data(map_id).get("trains") or TRAINING_TRAINS_PER_PLAYER),
            "status": "lobby",
            "round": 1,
            "players": {},
            "deck": training_build_deck(),
            "discard": [],
            "market": [],
            "ticketDeck": training_build_ticket_deck(map_id),
            "routes": {route["id"]: None for route in training_routes_for(map_id)},
            "turnId": None,
            "drawn": 0,
            "endTriggeredBy": None,
            "turnsRemaining": 0,
            "winnerColor": None,
            "standings": None,
            "log": [],
            "createdAt": now,
            "updatedAt": now,
        }

    def training_draw_from_pile(game: dict[str, Any]) -> str | None:
        if not game["deck"]:
            if not game["discard"]:
                return None
            random.SystemRandom().shuffle(game["discard"])
            game["deck"] = game["discard"]
            game["discard"] = []
        return game["deck"].pop()

    def training_refill_market(game: dict[str, Any]) -> None:
        while len(game["market"]) < TRAINING_MARKET_SIZE:
            card = training_draw_from_pile(game)
            if card is None:
                break
            game["market"].append(card)

    def training_append_log(game: dict[str, Any], text: str) -> None:
        game["log"].append({"text": text, "at": utc_now()})
        if len(game["log"]) > TRAINING_MAX_LOG:
            del game["log"][: len(game["log"]) - TRAINING_MAX_LOG]
        game["updatedAt"] = utc_now()

    def training_opponent(game: dict[str, Any], player_id: str) -> dict[str, Any]:
        for pid, player in game["players"].items():
            if pid != player_id:
                return player
        raise KeyError("opponent")

    def training_ticket_complete(game: dict[str, Any], player: dict[str, Any], ticket: dict[str, Any]) -> bool:
        routes = training_routes_for(game["mapId"])
        owned: dict[str, set[str]] = {}
        for route_id, owner in game["routes"].items():
            if owner != player["color"]:
                continue
            route = routes[route_id]
            owned.setdefault(route["a"], set()).add(route["b"])
            owned.setdefault(route["b"], set()).add(route["a"])
        if not owned:
            return False
        seen = {ticket["a"]}
        frontier = [ticket["a"]]
        while frontier:
            city = frontier.pop()
            if city == ticket["b"]:
                return True
            for neighbor in owned.get(city, ()):  # noqa: B007
                if neighbor not in seen:
                    seen.add(neighbor)
                    frontier.append(neighbor)
        return False

    def training_spend_cards(player: dict[str, Any], suit: str, length: int) -> list[str]:
        """Spend `length` cards of `suit` (wilds fill the gap). Returns the discard."""
        spent = []
        use_suit = min(player["hand"].get(suit, 0), length)
        for _ in range(use_suit):
            player["hand"][suit] -= 1
            spent.append(suit)
        wilds_needed = length - use_suit
        for _ in range(wilds_needed):
            player["hand"]["wild"] -= 1
            spent.append("wild")
        return spent

    def training_end_turn(game: dict[str, Any]) -> None:
        mover = game["players"].get(game["turnId"])
        game["drawn"] = 0
        if game["turnsRemaining"] > 0:
            game["turnsRemaining"] -= 1
            if game["turnsRemaining"] == 0:
                training_finish(game)
                return
        if mover and mover["trains"] <= TRAINING_END_TRAINS and game["endTriggeredBy"] is None:
            game["endTriggeredBy"] = mover["color"]
            game["turnsRemaining"] = len(game["players"])
            training_append_log(game, f"{mover['name']} is down to {mover['trains']} trains — the final round begins!")
        game["turnId"] = training_opponent(game, game["turnId"])["id"]

    def training_score_player(game: dict[str, Any], player: dict[str, Any]) -> dict[str, Any]:
        ticket_lines = []
        ticket_points = 0
        for ticket in player["keptTickets"]:
            complete = training_ticket_complete(game, player, ticket)
            delta = ticket["points"] if complete else -ticket["points"]
            ticket_points += delta
            ticket_lines.append({"a": ticket["a"], "b": ticket["b"], "points": ticket["points"], "complete": complete, "delta": delta})
        return {
            "color": player["color"],
            "name": player["name"],
            "routePoints": player["score"],
            "ticketPoints": ticket_points,
            "tickets": ticket_lines,
            "total": player["score"] + ticket_points,
        }

    def training_finish(game: dict[str, Any]) -> None:
        game["status"] = "finished"
        game["phase"] = None
        standings = sorted(
            (training_score_player(game, player) for player in game["players"].values()),
            key=lambda entry: entry["total"],
            reverse=True,
        )
        if len(standings) == 2 and standings[0]["total"] == standings[1]["total"]:
            game["winnerColor"] = None
        else:
            game["winnerColor"] = standings[0]["color"]
        game["standings"] = standings
        winner_name = standings[0]["name"]
        training_append_log(
            game,
            f"Final whistle! {winner_name} leads {standings[0]['total']} to {standings[1]['total']}.",
        )

    def training_player_view(game: dict[str, Any], player_id: str | None) -> dict[str, Any]:
        players = []
        for pid, info in game["players"].items():
            players.append(
                {
                    "id": pid,
                    "name": info["name"],
                    "color": info["color"],
                    "isHost": info.get("isHost", False),
                    "connectedAt": info.get("connectedAt"),
                    "trains": info["trains"],
                    "score": info["score"],
                    "handCount": sum(info["hand"].values()),
                    "ticketCount": len(info["keptTickets"]),
                    "ticketsDone": sum(
                        1 for t in info["keptTickets"] if training_ticket_complete(game, info, t)
                    ),
                }
            )
        players.sort(key=lambda item: item["connectedAt"] or "")
        view: dict[str, Any] = {
            "code": game["code"],
            "status": game["status"],
            "round": game["round"],
            "mapId": game["mapId"],
            "mapName": training_map_data(game["mapId"])["name"],
            "trainsPerPlayer": game["trainsPerPlayer"],
            "players": players,
            "turnId": game["turnId"],
            "drawn": game["drawn"],
            "endTriggeredBy": game["endTriggeredBy"],
            "turnsRemaining": game["turnsRemaining"],
            "market": list(game["market"]),
            "deckCount": len(game["deck"]),
            "discardCount": len(game["discard"]),
            "routes": {str(rid): owner for rid, owner in game["routes"].items() if owner},
            "winnerColor": game["winnerColor"],
            "standings": game["standings"],
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
        view["yourHand"] = dict(me["hand"])
        view["yourTrains"] = me["trains"]
        view["yourScore"] = me["score"]
        view["yourTickets"] = [
            {**ticket, "complete": training_ticket_complete(game, me, ticket)}
            for ticket in me["keptTickets"]
        ]
        view["pendingTickets"] = list(me["pendingTickets"])
        view["yourTurn"] = game["status"] == "active" and game["turnId"] == player_id
        return view

    def training_publish(code: str, event_name: str = "game") -> None:
        with TRAINING_GAMES_LOCK:
            game = TRAINING_GAMES.get(code)
            subscribers = list(TRAINING_GAME_SUBSCRIBERS.get(code, []))
        if not game:
            return
        for subscriber in subscribers:
            player_id = subscriber.get("playerId")
            subscriber["queue"].put({"event": event_name, "data": training_player_view(game, player_id)})

    @app.get("/api/training/maps")
    def training_maps():
        return jsonify(
            {
                "maps": [
                    {
                        "id": map_id,
                        "name": data["name"],
                        "blurb": data["blurb"],
                        "cities": len(data["cities"]),
                        "routes": len(data["routes"]),
                    }
                    for map_id, data in TRAINING_MAPS.items()
                ]
            }
        )

    @app.get("/api/training/map")
    def training_map():
        map_id = (request.args.get("map") or TRAINING_DEFAULT_MAP).strip().lower()
        if map_id not in TRAINING_MAPS:
            return jsonify({"error": "Unknown map."}), 404
        data = training_map_data(map_id)
        return jsonify(
            {
                "id": map_id,
                "name": data["name"],
                "underlay": list(data.get("underlay", [])),
                "cities": list(data["cities"]),
                "routes": [
                    {"id": i, "a": a, "b": b, "color": color, "length": length, "points": TRAINING_ROUTE_POINTS[length]}
                    for i, (a, b, color, length) in enumerate(data["routes"])
                ],
            }
        )

    @app.post("/api/training/games")
    def create_training_game():
        body = request.get_json(silent=True) or {}
        map_id = str(body.get("map") or TRAINING_DEFAULT_MAP).strip().lower()
        if map_id not in TRAINING_MAPS:
            return jsonify({"error": "Unknown map."}), 400
        game = training_new_game(map_id)
        with TRAINING_GAMES_LOCK:
            TRAINING_GAMES[game["code"]] = game
            TRAINING_GAME_SUBSCRIBERS.setdefault(game["code"], [])
        return jsonify({"game": training_player_view(game, None), "shareUrl": f"/training/?game={game['code']}"}), 201

    @app.get("/api/training/games/<code>")
    def get_training_game(code: str):
        code = code.upper()
        player_id = str(request.args.get("playerId") or "").strip() or None
        with TRAINING_GAMES_LOCK:
            game = TRAINING_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            return jsonify({"game": training_player_view(game, player_id)})

    @app.post("/api/training/games/<code>/players")
    def join_training_game(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        name = str(body.get("name") or "").strip()
        provided_id = str(body.get("playerId") or "").strip()
        if not name:
            return jsonify({"error": "Name is required."}), 400
        if len(name) > 24:
            return jsonify({"error": "Name must be 24 characters or fewer."}), 400

        now = utc_now()
        with TRAINING_GAMES_LOCK:
            game = TRAINING_GAMES.get(code)
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
                color = "red" if not game["players"] else "blue"
                game["players"][player_id] = {
                    "id": player_id,
                    "name": name,
                    "color": color,
                    "isHost": not game["players"],
                    "connectedAt": now,
                    "hand": {suit: 0 for suit in TRAINING_CARD_SUITS} | {"wild": 0},
                    "keptTickets": [],
                    "pendingTickets": [],
                    "trains": game["trainsPerPlayer"],
                    "score": 0,
                    "ready": False,
                }
            game["updatedAt"] = now

        training_publish(code, "joined")
        with TRAINING_GAMES_LOCK:
            return jsonify({"game": training_player_view(TRAINING_GAMES[code], player_id), "playerId": player_id})

    @app.post("/api/training/games/<code>/start")
    def start_training_game(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        with TRAINING_GAMES_LOCK:
            game = TRAINING_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "lobby":
                return jsonify({"error": "This game has already started."}), 409
            if len(game["players"]) < 2:
                return jsonify({"error": "Wait for your opponent to join."}), 409
            if player_id and player_id not in game["players"]:
                return jsonify({"error": "Player was not found."}), 404
            if player_id and not game["players"][player_id].get("isHost"):
                return jsonify({"error": "Only the host can start the game."}), 403
            for player in game["players"].values():
                for _ in range(TRAINING_HAND_START):
                    card = training_draw_from_pile(game)
                    if card:
                        player["hand"][card] = player["hand"].get(card, 0) + 1
                player["pendingTickets"] = [game["ticketDeck"].pop() for _ in range(min(3, len(game["ticketDeck"])))]
                player["ready"] = False
            training_refill_market(game)
            game["status"] = "tickets"
            game["turnId"] = secrets.choice(list(game["players"].keys()))
            game["updatedAt"] = utc_now()
            training_append_log(game, "All aboard! Choose your destination tickets (keep at least two).")

        training_publish(code, "started")
        with TRAINING_GAMES_LOCK:
            return jsonify({"game": training_player_view(TRAINING_GAMES[code], player_id or None)})

    @app.post("/api/training/games/<code>/keep")
    def training_keep_tickets(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        keep_ids = body.get("keep") or []
        with TRAINING_GAMES_LOCK:
            game = TRAINING_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            player = game["players"].get(player_id)
            if not player:
                return jsonify({"error": "Player was not found."}), 404
            if not player["pendingTickets"]:
                return jsonify({"error": "No tickets are waiting."}), 409
            if not isinstance(keep_ids, list):
                return jsonify({"error": "Pick which tickets to keep."}), 400
            min_keep = 2 if game["status"] == "tickets" else 1
            pending_by_id = {t["id"]: t for t in player["pendingTickets"]}
            try:
                kept = [pending_by_id[int(tid)] for tid in keep_ids]
            except (KeyError, TypeError, ValueError):
                return jsonify({"error": "Unknown ticket selected."}), 400
            if len(kept) < min_keep or len(kept) > len(player["pendingTickets"]):
                return jsonify({"error": f"Keep at least {min_keep} ticket(s)."}), 400
            player["keptTickets"].extend(kept)
            player["pendingTickets"] = []

            if game["status"] == "tickets":
                player["ready"] = True
                if all(p["ready"] for p in game["players"].values()):
                    game["status"] = "active"
                    first = game["players"][game["turnId"]]
                    training_append_log(game, f"Tickets sealed. {first['name']} drives first!")
                else:
                    training_append_log(game, f"{player['name']} sealed their tickets.")
            else:
                training_append_log(game, f"{player['name']} drew new tickets.")
                if game["status"] == "active" and game["turnId"] == player_id:
                    training_end_turn(game)

        training_publish(code, "kept")
        with TRAINING_GAMES_LOCK:
            return jsonify({"game": training_player_view(TRAINING_GAMES[code], player_id)})

    @app.post("/api/training/games/<code>/draw")
    def training_draw_card(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        source = str(body.get("source") or "deck")
        try:
            market_index = int(body.get("index")) if body.get("index") is not None else None
        except (TypeError, ValueError):
            return jsonify({"error": "Bad market slot."}), 400

        with TRAINING_GAMES_LOCK:
            game = TRAINING_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "active":
                return jsonify({"error": "The game is not in progress."}), 409
            player = game["players"].get(player_id)
            if not player:
                return jsonify({"error": "Player was not found."}), 404
            if game["turnId"] != player_id:
                return jsonify({"error": "It is not your turn."}), 403
            if game["drawn"] >= 2:
                return jsonify({"error": "You already drew two cards."}), 409

            if source == "market":
                if market_index is None or not 0 <= market_index < len(game["market"]):
                    return jsonify({"error": "That market slot is empty."}), 400
                card = game["market"].pop(market_index)
                training_refill_market(game)
            elif source == "deck":
                card = training_draw_from_pile(game)
                if card is None:
                    return jsonify({"error": "No cards left to draw."}), 409
            else:
                return jsonify({"error": "Draw from the deck or the market."}), 400

            player["hand"][card] = player["hand"].get(card, 0) + 1
            game["drawn"] += 1
            training_append_log(game, f"{player['name']} drew a {card} card.")
            if game["drawn"] >= 2:
                training_end_turn(game)

        training_publish(code, "draw")
        with TRAINING_GAMES_LOCK:
            return jsonify({"game": training_player_view(TRAINING_GAMES[code], player_id)})

    @app.post("/api/training/games/<code>/claim")
    def training_claim_route(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        try:
            route_id = int(body.get("routeId"))
        except (TypeError, ValueError):
            return jsonify({"error": "Pick a route."}), 400
        suit = str(body.get("color") or "").strip().lower()

        with TRAINING_GAMES_LOCK:
            game = TRAINING_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "active":
                return jsonify({"error": "The game is not in progress."}), 409
            player = game["players"].get(player_id)
            if not player:
                return jsonify({"error": "Player was not found."}), 404
            if game["turnId"] != player_id:
                return jsonify({"error": "It is not your turn."}), 403
            if game["drawn"] > 0:
                return jsonify({"error": "You already drew this turn."}), 409
            route = next((r for r in training_routes_for(game["mapId"]) if r["id"] == route_id), None)
            if not route:
                return jsonify({"error": "That route does not exist."}), 404
            if game["routes"].get(route_id):
                return jsonify({"error": "That line is already claimed."}), 409
            if player["trains"] < route["length"]:
                return jsonify({"error": "Not enough trains left."}), 400

            claim_suit = route["color"] if route["color"] != "gray" else suit
            if claim_suit not in TRAINING_CARD_SUITS:
                return jsonify({"error": "Pick a suit for the gray route."}), 400
            available = player["hand"].get(claim_suit, 0) + player["hand"].get("wild", 0)
            if available < route["length"]:
                return jsonify({"error": f"You need {route['length']} {claim_suit} (wilds help)."}), 400

            spent = training_spend_cards(player, claim_suit, route["length"])
            game["discard"].extend(spent)
            player["trains"] -= route["length"]
            player["score"] += TRAINING_ROUTE_POINTS[route["length"]]
            game["routes"][route_id] = player["color"]
            training_append_log(
                game,
                f"{player['name']} claimed {route['a'].title()}–{route['b'].title()} ({route['length']}) for {TRAINING_ROUTE_POINTS[route['length']]} points.",
            )
            training_end_turn(game)

        training_publish(code, "claim")
        with TRAINING_GAMES_LOCK:
            return jsonify({"game": training_player_view(TRAINING_GAMES[code], player_id)})

    @app.post("/api/training/games/<code>/tickets")
    def training_draw_tickets(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        with TRAINING_GAMES_LOCK:
            game = TRAINING_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "active":
                return jsonify({"error": "The game is not in progress."}), 409
            player = game["players"].get(player_id)
            if not player:
                return jsonify({"error": "Player was not found."}), 404
            if game["turnId"] != player_id:
                return jsonify({"error": "It is not your turn."}), 403
            if game["drawn"] > 0:
                return jsonify({"error": "You already drew this turn."}), 409
            if player["pendingTickets"]:
                return jsonify({"error": "Tickets are already waiting."}), 409
            if not game["ticketDeck"]:
                return jsonify({"error": "The ticket deck is empty."}), 409
            count = min(3, len(game["ticketDeck"]))
            player["pendingTickets"] = [game["ticketDeck"].pop() for _ in range(count)]
            training_append_log(game, f"{player['name']} surveying new destinations...")

        training_publish(code, "tickets")
        with TRAINING_GAMES_LOCK:
            return jsonify({"game": training_player_view(TRAINING_GAMES[code], player_id)})

    @app.post("/api/training/games/<code>/rematch")
    def training_rematch(code: str):
        code = code.upper()
        body = request.get_json(silent=True) or {}
        player_id = str(body.get("playerId") or "").strip()
        with TRAINING_GAMES_LOCK:
            game = TRAINING_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            if game["status"] != "finished":
                return jsonify({"error": "Finish the current game first."}), 409
            if player_id and player_id not in game["players"]:
                return jsonify({"error": "Player was not found."}), 404
            fresh = training_new_game(game["mapId"])
            game["round"] += 1
            game["deck"] = fresh["deck"]
            game["discard"] = []
            game["market"] = []
            game["ticketDeck"] = fresh["ticketDeck"]
            game["routes"] = fresh["routes"]
            game["turnId"] = None
            game["drawn"] = 0
            game["endTriggeredBy"] = None
            game["turnsRemaining"] = 0
            game["winnerColor"] = None
            game["standings"] = None
            game["status"] = "lobby"
            for player in game["players"].values():
                player["hand"] = {suit: 0 for suit in TRAINING_CARD_SUITS} | {"wild": 0}
                player["keptTickets"] = []
                player["pendingTickets"] = []
                player["trains"] = TRAINING_TRAINS_PER_PLAYER
                player["score"] = 0
                player["ready"] = False
            training_append_log(game, f"Round {game['round']}! Fresh track, fresh tickets.")

        training_publish(code, "rematch")
        with TRAINING_GAMES_LOCK:
            return jsonify({"game": training_player_view(TRAINING_GAMES[code], player_id or None)})

    @app.get("/api/training/games/<code>/events")
    def training_game_events(code: str):
        code = code.upper()
        player_id = str(request.args.get("playerId") or "").strip() or None
        event_queue: queue.Queue[dict[str, Any]] = queue.Queue()
        subscriber = {"queue": event_queue, "playerId": player_id}
        with TRAINING_GAMES_LOCK:
            game = TRAINING_GAMES.get(code)
            if not game:
                return jsonify({"error": "Game was not found."}), 404
            TRAINING_GAME_SUBSCRIBERS.setdefault(code, []).append(subscriber)
            initial_game = training_player_view(game, player_id)

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
                with TRAINING_GAMES_LOCK:
                    subscribers = TRAINING_GAME_SUBSCRIBERS.get(code, [])
                    if subscriber in subscribers:
                        subscribers.remove(subscriber)

        return Response(stream_with_context(stream()), mimetype="text/event-stream")

    start_game_sweeper()

    return app
