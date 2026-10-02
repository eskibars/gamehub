#!/usr/bin/env python3
"""End-to-end check for Word Guess practice themes.

Practice mode promises "endless practice rounds in 18 themed categories", so
every round it deals must match the theme the player selected. Start the dev
server first (``python app.py``), then:

    python3 tools/verify_word_guess.py

Checks, in order:

1. Picking a theme applies immediately, without needing a reload.
2. The "Category:" hint names the theme the pool is actually drawn from.
3. Dealt answers come from that theme, are accepted by the guess dictionary,
   and no off-theme answer leaks in.
4. A saved round that belongs to another theme (or to no theme at all) is
   discarded rather than served, so the hint can never mislabel an answer.
5. Every theme in the shared dictionary yields a usable pool — a theme too
   small for the five-letter board must be refused, not silently swapped for
   the general list.
6. Daily mode is untouched: no theme, no hint.

Set GAMEHUB_BASE to point at another host/port, or CHROME to use a specific
browser binary.
"""
from __future__ import annotations

import glob
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("GAMEHUB_BASE", "http://127.0.0.1:25001/word-guess/")
SETTINGS_KEY = "gamehub-wordguess-settings"
PRACTICE_KEY = "gamehub-wordguess-practice"
DEALS_PER_THEME = 6

failures: list[str] = []


def check(cond: bool, msg: str) -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {msg}")
    if not cond:
        failures.append(msg)


def find_chrome() -> str:
    """Playwright's bundled Chromium, as cached by `playwright install`."""
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
            "no Playwright Chromium found; run `playwright install chromium` "
            "or set CHROME to a browser binary"
        )
    return found[-1]


def theme_words(page, name: str) -> set[str]:
    """Five-letter words of a theme that the guess dictionary accepts."""
    return set(
        page.evaluate(
            """(name) => GameHubDictionaries.words(name, 5)
                 .map((w) => w.toUpperCase())
                 .filter((w) => VALID.has(w))""",
            name,
        )
    )


def enter_practice(page) -> None:
    page.click('input[name="mode"][value="practice"]', force=True)
    page.wait_for_timeout(120)


def deal(page, count: int) -> list[str]:
    """Deal fresh words through the real "New word" button."""
    out = []
    for _ in range(count):
        page.click("#newWordButton")
        page.wait_for_timeout(35)
        out.append(page.evaluate("state.answer"))
    return out


def hint_text(page) -> str:
    return page.evaluate("document.querySelector('#categoryHint').textContent")


def hint_visible(page) -> bool:
    return page.evaluate("!document.querySelector('#categoryHint').hidden")


def main() -> None:
    chrome = find_chrome()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=chrome)
        page = browser.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(BASE, wait_until="networkidle")
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(150)

        themes = page.evaluate("() => GameHubDictionaries.NAMES")
        birds = theme_words(page, "Birds")

        print("\n1. selecting a theme applies to the current session")
        enter_practice(page)
        page.select_option("#categorySelect", "Birds")
        page.wait_for_timeout(150)
        check(page.evaluate("state.categoryName") == "Birds",
              "state.categoryName picks up the selection immediately")
        check(page.evaluate("state.category") == "Birds",
              "the round's pool follows the selection immediately")
        check(page.evaluate("resolveCategory().pool.length") < 100,
              "the pool is the theme, not the full general list")

        print("\n2. the hint names the theme the pool came from")
        check(hint_visible(page), "the category hint is shown in practice mode")
        check(hint_text(page) == "Category: Birds",
              f"hint reads 'Category: Birds' (got {hint_text(page)!r})")

        print(f"\n3. dealt answers stay on theme ({DEALS_PER_THEME} deals)")
        dealt = deal(page, DEALS_PER_THEME)
        off = [w for w in dealt if w not in birds]
        check(not off, f"no off-theme answers (got {off})")
        check(all(page.evaluate("(w) => VALID.has(w)", w) for w in dealt),
              "every answer is accepted by the guess dictionary")
        check(all(len(w) == 5 and w.isalpha() for w in dealt),
              "every answer is five letters")

        print("\n4. a saved round from another theme is not served")
        page.evaluate(
            """(key) => localStorage.setItem(key, JSON.stringify(
                 { dayKey: "", answer: "PROXY", guesses: [], status: "playing" }))""",
            PRACTICE_KEY,
        )
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(150)
        check(page.evaluate("state.categoryName") == "Birds",
              "a reload restores the saved theme")
        enter_practice(page)
        page.wait_for_timeout(150)
        check(page.evaluate("state.answer") != "PROXY",
              "the off-theme saved answer is discarded")
        check(page.evaluate("state.answer") in birds,
              "the replacement answer comes from the saved theme")
        check(hint_text(page) == "Category: Birds",
              "the hint still agrees with the pool after the reload")

        print("\n5. every theme produces a matching pool")
        for name in themes:
            page.evaluate("(n) => { state.categoryName = n; }", name)
            page.evaluate("() => startRound(true)")
            page.wait_for_timeout(35)
            words = theme_words(page, name)
            active = page.evaluate("state.category")
            answers = [page.evaluate("state.answer")]
            for _ in range(DEALS_PER_THEME - 1):
                page.evaluate("() => startRound(true)")
                page.wait_for_timeout(20)
                answers.append(page.evaluate("state.answer"))
            on_theme = all(w in words for w in answers)
            check(active == name and on_theme and hint_text(page) == f"Category: {name}",
                  f"{name}: pool, answers, and hint agree ({len(words)} five-letter words)")

        print("\n6. daily mode is unaffected")
        page.click('input[name="mode"][value="daily"]', force=True)
        page.wait_for_timeout(150)
        check(page.evaluate("state.category") == "",
              "daily rounds carry no theme")
        check(not hint_visible(page),
              "the category hint stays hidden in daily mode")

        check(not errors, f"no page errors (got {errors})")
        browser.close()

    print()
    if failures:
        print(f"*** {len(failures)} CHECK(S) FAILED ***")
        for msg in failures:
            print(f"  - {msg}")
        sys.exit(1)
    print("ALL WORD GUESS THEME CHECKS PASSED")


if __name__ == "__main__":
    main()
