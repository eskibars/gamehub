#!/usr/bin/env python3
"""BFS verifier for the Sokoban level set.

Every level in sokoban/static/levels.js must be provably solvable before it
ships. Run after editing levels:

    python3 tools/verify_sokoban.py

State space: (player position, frozenset of box positions). Explored with
BFS over the four push directions; boxes are never pulled, so a state path
is a legal move sequence.
"""
from __future__ import annotations

import json
import re
from collections import deque
from pathlib import Path

LEVELS_PATH = Path(__file__).resolve().parent.parent / "sokoban" / "static" / "levels.js"


def load_levels() -> list[dict]:
    text = LEVELS_PATH.read_text(encoding="utf-8")
    # Pull each { name, map } block out of the JS file.
    blocks = re.findall(r"map:\s*\[((?:\s*\"[^\"]*\",?)+)\s*\]", text)
    names = re.findall(r"name:\s*\"([^\"]+)\"", text)
    levels = []
    for name, block in zip(names, blocks):
        rows = re.findall(r"\"([^\"]*)\"", block)
        levels.append({"name": name, "map": rows})
    return levels


def parse(map_rows: list[str]):
    walls: set[tuple[int, int]] = set()
    targets: set[tuple[int, int]] = set()
    boxes: set[tuple[int, int]] = set()
    player = None
    height = len(map_rows)
    width = max(len(row) for row in map_rows)
    for y, row in enumerate(map_rows):
        for x, ch in enumerate(row):
            pos = (x, y)
            if ch == "#":
                walls.add(pos)
            elif ch == ".":
                targets.add(pos)
            elif ch == "$":
                boxes.add(pos)
            elif ch == "*":
                boxes.add(pos)
                targets.add(pos)
            elif ch == "@":
                player = pos
            elif ch == "+":
                player = pos
                targets.add(pos)
    return walls, targets, boxes, player, width, height


def dead_squares(walls, targets, width, height) -> set[tuple[int, int]]:
    """Corner squares: a box there can never be pushed out along either axis."""
    dead: set[tuple[int, int]] = set()
    for y in range(height):
        for x in range(width):
            pos = (x, y)
            if pos in walls or pos in targets:
                continue
            up, down = (x, y - 1) in walls, (x, y + 1) in walls
            left, right = (x - 1, y) in walls, (x + 1, y) in walls
            if (up or down) and (left or right):
                dead.add(pos)
    return dead


def reachable_squares(walls, boxes, player, width, height) -> set[tuple[int, int]]:
    seen = {player}
    queue = deque([player])
    while queue:
        x, y = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nxt = (x + dx, y + dy)
            if nxt in seen or nxt in walls or nxt in boxes:
                continue
            if not (0 <= nxt[0] < width and 0 <= nxt[1] < height):
                continue
            seen.add(nxt)
            queue.append(nxt)
    return seen


def solve(map_rows: list[str], max_states: int = 400_000) -> tuple[bool, int]:
    """Returns (solvable, pushes of the best solution)."""
    walls, targets, boxes, player, width, height = parse(map_rows)
    dead = dead_squares(walls, targets, width, height)
    start = (player, frozenset(boxes))
    queue = deque([(start[0], start[1], 0)])
    seen = {start}
    while queue:
        pos, box_set, pushes = queue.popleft()
        if box_set == targets:
            return True, pushes
        if pushes > 200 or len(seen) > max_states:
            continue
        reach = reachable_squares(walls, box_set, pos, width, height)
        for (bx, by) in box_set:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                stand = (bx - dx, by - dy)
                dest = (bx + dx, by + dy)
                if stand not in reach:
                    continue
                if dest in walls or dest in box_set or dest in dead:
                    continue
                if not (0 <= dest[0] < width and 0 <= dest[1] < height):
                    continue
                new_boxes = frozenset((box_set - {(bx, by)}) | {dest})
                state = (dest, new_boxes)
                if state in seen:
                    continue
                seen.add(state)
                queue.append((dest, new_boxes, pushes + 1))
    return False, -1


def main() -> None:
    levels = load_levels()
    failures = 0
    for index, level in enumerate(levels):
        ok, pushes = solve(level["map"])
        status = "PASS" if ok else "FAIL"
        if not ok:
            failures += 1
        print(f"{status} level {index + 1} \"{level['name']}\": pushes={pushes}")
    print("ALL LEVELS SOLVABLE" if not failures else f"*** {failures} UNSOLVABLE LEVELS ***")


if __name__ == "__main__":
    main()
