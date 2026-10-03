#!/usr/bin/env python3
"""Checks for the Boggle solo robot's vocabulary, pacing, and cross-off timing.

Two promises this guards:

1. The robot only ever hunts everyday words, at every strength setting. It
   used to hunt the whole Webster's Second dictionary, so even "Casual" would
   race you to words like "iao", "taen" or "roka".
2. Nobody's words are crossed out while the clock runs. Crossing out happens
   when the lists are compared at the end, so a shared word cannot spoil the
   result the moment the other hunter finds it.

Start the dev server first (``python app.py``), then:

    python3 tools/verify_boggle_robot.py

The browser section plays real rounds and fast-forwards the page clock, so it
needs no waiting. Set GAMEHUB_BASE to point at another host/port, or CHROME to
use a specific browser binary.
"""
from __future__ import annotations

import glob
import importlib.util
import os
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
COMMON_PATH = BASE_DIR / "boggle" / "static" / "common.js"
BOARD_PATH = BASE_DIR / "boggle" / "static" / "words.js"
TIER_DOC = BASE_DIR / "boggle" / "static" / "app.js"
GENERATOR = BASE_DIR / "tools" / "gen_boggle_common.py"

BASE = os.environ.get("GAMEHUB_BASE", "http://127.0.0.1:25001/boggle/")

# Words the player reported seeing from the "Casual" robot.
REPORTED_OBSCURE = ["iao", "ame", "taen", "nae", "atmo", "aer", "tiar", "kat", "roka"]

# Documented tier caps for a 3:00 round, mirroring SOLO_TIERS in app.js.
TIER_FINDS = {"casual": {4: 6, 5: 8, 6: 9}, "sharp": {4: 11, 5: 13, 6: 15}, "master": {4: 17, 5: 21, 6: 24}}
LADDER_GAMES = 4
LADDER_SECONDS = 180
CROSSOFF_ATTEMPTS = 6
CROSSOFF_SECONDS = 120

failures: list[str] = []


def check(cond: bool, msg: str) -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {msg}")
    if not cond:
        failures.append(msg)


def load_generator():
    """Import the vocabulary generator so the checks use its real logic."""
    spec = importlib.util.spec_from_file_location("gen_boggle_common", GENERATOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_common_words() -> list[str]:
    text = COMMON_PATH.read_text(encoding="utf-8")
    match = re.search(r"const WORDS = \[(.*?)\];", text, re.S)
    if not match:
        raise SystemExit(f"could not find the WORDS array in {COMMON_PATH}")
    return re.findall(r'"([^"]*)"', match.group(1))


def board_dictionary() -> set[str]:
    text = BOARD_PATH.read_text(encoding="utf-8")
    match = re.search(r"const RAW =\s*`(.*?)`;", text, re.S)
    if not match:
        raise SystemExit(f"could not find the RAW word list in {BOARD_PATH}")
    return {w for w in match.group(1).split("\n") if w}


def tier_caps_from_source() -> dict[str, dict[int, int]]:
    """Read the shipped SOLO_TIERS constants so the test cannot drift."""
    text = TIER_DOC.read_text(encoding="utf-8")
    caps: dict[str, dict[int, int]] = {}
    for tier, body in re.findall(r"(casual|sharp|master):\s*\{([^}]*\{[^}]*\}[^}]*)\}", text):
        found = re.search(r"finds:\s*\{([^}]*)\}", body)
        if found:
            caps[tier] = {
                int(size): int(count)
                for size, count in re.findall(r"(\d+):\s*(\d+)", found.group(1))
            }
    return caps


def reachable_words(board: list[list[str]], dictionary: set[str], accept) -> list[str]:
    """Every word on the board that `accept` allows (a plain DFS)."""
    size = len(board)
    found: set[str] = set()

    def step(r: int, c: int, prefix: str, seen: set[int]) -> None:
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                if dr == 0 and dc == 0:
                    continue
                nr, nc = r + dr, c + dc
                if not (0 <= nr < size and 0 <= nc < size):
                    continue
                key = nr * size + nc
                if key in seen:
                    continue
                tile = board[nr][nc]
                nxt = prefix + ("qu" if tile == "Qu" else tile.lower())
                if len(nxt) > 10 or not prefix_possible(nxt, dictionary):
                    continue
                if len(nxt) >= 3 and nxt in dictionary and accept(nxt):
                    found.add(nxt)
                seen.add(key)
                step(nr, nc, nxt, seen)
                seen.discard(key)

    for r in range(size):
        for c in range(size):
            tile = board[r][c]
            start = "qu" if tile == "Qu" else tile.lower()
            if not prefix_possible(start, dictionary):
                continue
            step(r, c, start, {r * size + c})
    return sorted(found)


_PREFIX_CACHE: dict[str, set[str]] = {}


def prefix_possible(prefix: str, dictionary: set[str]) -> bool:
    key = f"{len(dictionary)}"
    table = _PREFIX_CACHE.get(key)
    if table is None:
        table = {w[: i] for w in dictionary for i in range(1, len(w) + 1)}
        _PREFIX_CACHE[key] = table
    return prefix in table


def find_chrome() -> str:
    override = os.environ.get("CHROME")
    if override:
        return override
    pattern = os.path.expanduser(
        "~/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/"
        "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
    )
    found = sorted(glob.glob(pattern))
    if not found:
        raise SystemExit(
            "no Playwright Chromium found; run `playwright install chromium`"
        )
    return found[-1]


def static_checks() -> None:
    print("1. the everyday-word list is clean and reproducible")
    generator = load_generator()
    words = load_common_words()
    dictionary = board_dictionary()

    # Regenerating must reproduce the committed file exactly.
    before = COMMON_PATH.read_text(encoding="utf-8")
    generator.main()
    after = COMMON_PATH.read_text(encoding="utf-8")
    check(before == after, f"regenerating reproduces boggle/static/common.js ({len(words)} words)")

    check(all(len(w) >= 3 for w in words), "every word is at least 3 letters")
    check(all(len(w) <= 10 for w in words), "every word is at most 10 letters")
    check(all(re.fullmatch(r"[a-z]+", w) for w in words), "every word is plain lowercase")
    check(len(words) == len(set(words)), "no duplicate words")
    missing = [w for w in words if w not in dictionary]
    check(not missing, f"every word is a real board word (missing: {missing[:5]})")

    leaked = sorted(set(words) & generator.DENY)
    check(not leaked, f"no abbreviation or web-boilerplate tokens (leaked: {leaked[:8]})")

    still_there = [w for w in REPORTED_OBSCURE if w in words]
    check(not still_there, f"the reported obscure words are gone (still there: {still_there})")

    print("\n2. the tier ladder is documented where the test reads it")
    caps = tier_caps_from_source()
    check(set(caps) == {"casual", "sharp", "master"}, f"all three tiers parsed ({sorted(caps)})")
    for tier in ("casual", "sharp", "master"):
        check(caps.get(tier) == TIER_FINDS[tier], f"{tier} find caps match the shipped constants ({caps.get(tier)})")


def browser_checks() -> None:
    from playwright.sync_api import sync_playwright

    dictionary = board_dictionary()
    common = set(load_common_words())
    common_rank = {w: i for i, w in enumerate(load_common_words())}
    caps = tier_caps_from_source()

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=find_chrome(), headless=True)
        page = browser.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda err: errors.append(str(err)))
        page.clock.install()
        page.goto(BASE)
        page.wait_for_selector("#showSolo")

        def start_solo(tier: str, size: int, seconds: int) -> None:
            if page.is_visible("#newGameButton"):
                page.click("#newGameButton")
            page.click("#showSolo")
            page.select_option("#soloBoardSize", str(size))
            page.select_option("#soloTimerSeconds", str(seconds))
            page.check(f'input[name=soloDiff][value="{tier}"]')
            page.click("#soloForm button[type=submit]")
            page.wait_for_selector("#letterBoard .letter-cell")

        def read_board() -> list[list[str]]:
            cells = page.eval_on_selector_all(
                "#letterBoard .letter-cell", "els => els.map(e => e.textContent)"
            )
            size = int(page.eval_on_selector("#letterBoard", "el => getComputedStyle(el).getPropertyValue('--board-size')"))
            return [cells[i * size:(i + 1) * size] for i in range(size)]

        def robot_count() -> int:
            rows = page.eval_on_selector_all(
                ".player-row",
                "els => els.map(e => e.textContent)",
            )
            for row in rows:
                if "Robot" in row:
                    found = re.search(r"(\d+)\s+words", row)
                    if found:
                        return int(found.group(1))
            return 0

        def submit(word: str) -> None:
            page.fill("#wordInput", word)
            page.press("#wordInput", "Enter")

        def duplicate_labels() -> list[str]:
            return page.eval_on_selector_all(
                ".word-list li.duplicate span", "els => els.map(e => e.textContent)"
            )

        def robot_words() -> list[str]:
            return page.eval_on_selector_all(
                ".word-list",
                """sections => sections
                     .filter(s => /Robot/.test(s.querySelector('h3').textContent))
                     .flatMap(s => [...s.querySelectorAll('li span')].map(e => e.textContent))""",
            )

        def your_words() -> list[str]:
            return page.eval_on_selector_all(
                ".word-list",
                """sections => sections
                     .filter(s => s.querySelector('h3').textContent === 'Your Words')
                     .flatMap(s => [...s.querySelectorAll('li span')].map(e => e.textContent.toLowerCase()))""",
            )

        def run_round(seconds: int) -> None:
            """Walk the whole round on the page clock.

            fast_forward() fires each pending timer at most once, and every
            robot reveal schedules the next one, so the clock has to be stepped
            rather than advanced in a single jump.
            """
            stepped = 0
            while stepped < seconds + 10:
                page.clock.fast_forward(2000)
                stepped += 2
            page.wait_for_timeout(80)

        print("\n3. words are not crossed out until the round ends")
        overlap_seen = False
        crossoff_ok = True
        for attempt in range(CROSSOFF_ATTEMPTS):
            start_solo("casual", 4, CROSSOFF_SECONDS)
            board = read_board()
            band_end = len(common_rank) * 0.4
            # Everything the Casual robot could possibly hunt on this board.
            pool = [
                w for w in reachable_words(board, dictionary, lambda w: w in common)
                if common_rank[w] < band_end and len(w) <= 5
            ]
            if not pool:
                continue
            for word in pool:
                submit(word)
            submitted = your_words()

            # Walk the round: nothing may be struck through while it runs.
            stepped = 0
            while stepped < CROSSOFF_SECONDS:
                page.clock.fast_forward(2000)
                stepped += 2
                if page.eval_on_selector("#factStatus", "el => el.textContent") != "Active":
                    break
                struck = duplicate_labels()
                if struck:
                    crossoff_ok = False
                    print(f"      crossed out mid-round: {struck[:6]}")
                    break
            run_round(CROSSOFF_SECONDS)

            bot = set(robot_words())
            shared = sorted(set(submitted) & bot)
            if shared:
                overlap_seen = True
                crossed = {w.lower() for w in duplicate_labels()}
                crossoff_ok = crossoff_ok and set(shared).issubset(crossed)
                check(
                    set(shared).issubset(crossed),
                    f"after the buzzer a shared word is crossed out ({shared[:3]})",
                )
                break
        check(overlap_seen, f"created a shared word to test with ({CROSSOFF_ATTEMPTS} attempts)")
        check(crossoff_ok, "nothing was crossed out while the clock was running")

        print("\n4. the robot only ever plays everyday words")
        all_robot_words: list[str] = []
        for tier in ("casual", "sharp", "master"):
            start_solo(tier, 4, LADDER_SECONDS)
            run_round(LADDER_SECONDS)
            words = robot_words()
            all_robot_words.extend(words)
            obscure = [w for w in words if w not in common]
            check(
                not obscure,
                f"{tier} robot played only everyday words ({len(words)} words, obscure: {obscure[:5]})",
            )
            reported = [w for w in words if w in REPORTED_OBSCURE]
            check(not reported, f"{tier} robot did not play the reported obscure words ({reported})")

        print("\n5. harder tiers find more, and every tier stays under its cap")
        for size in (4, 5, 6):
            averages: dict[str, float] = {}
            for tier in ("casual", "sharp", "master"):
                counts = []
                for _ in range(LADDER_GAMES):
                    start_solo(tier, size, LADDER_SECONDS)
                    run_round(LADDER_SECONDS)
                    counts.append(robot_count())
                cap = caps[tier][size]
                averages[tier] = sum(counts) / len(counts)
                check(
                    all(0 < c <= cap for c in counts),
                    f"{size}x{size} {tier} stayed within 1..{cap} finds ({counts})",
                )
            check(
                averages["casual"] < averages["sharp"] < averages["master"],
                f"{size}x{size} average finds rise with the tier "
                f"({averages['casual']:.1f} < {averages['sharp']:.1f} < {averages['master']:.1f})",
            )

        check(not errors, f"no page errors (got {errors[:3]})")
        browser.close()


def main() -> None:
    print("Boggle robot checks")
    print("===================\n")
    static_checks()
    browser_checks()
    print()
    if failures:
        print(f"*** {len(failures)} CHECK(S) FAILED ***")
        for msg in failures:
            print(f"  - {msg}")
        sys.exit(1)
    print("ALL BOGGLE ROBOT CHECKS PASSED")


if __name__ == "__main__":
    main()
