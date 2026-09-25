/*
 * Sokoban level set. Tiles: # wall, space floor, . target, $ box,
 * * box-on-target, @ player, + player-on-target.
 * Every level is verified solvable by tools/verify_sokoban.py (BFS).
 */
const LEVELS = [
  {
    name: "First push",
    map: [
      "#######",
      "#     #",
      "# @$. #",
      "#     #",
      "#######",
    ],
  },
  {
    name: "Around the pillar",
    map: [
      "#######",
      "#  .  #",
      "#  #  #",
      "# $   #",
      "# @   #",
      "#######",
    ],
  },
  {
    name: "Two of a kind",
    map: [
      "########",
      "#      #",
      "# .  . #",
      "# $$   #",
      "#  @   #",
      "########",
    ],
  },
  {
    name: "Mirror image",
    map: [
      "#######",
      "#     #",
      "# . . #",
      "# $ $ #",
      "#  @  #",
      "#######",
    ],
  },
  {
    name: "Detour",
    map: [
      "########",
      "#      #",
      "# .$$. #",
      "#      #",
      "#  @   #",
      "########",
    ],
  },
  {
    name: "Traffic circle",
    map: [
      "########",
      "#      #",
      "# #..# #",
      "# $  $ #",
      "#   @  #",
      "########",
    ],
  },
  {
    name: "Four corners",
    map: [
      "########",
      "#.    .#",
      "# $  $ #",
      "#  @@  #",
      "# $  $ #",
      "#.    .#",
      "########",
    ],
  },
  {
    name: "Corridor pinball",
    map: [
      "#########",
      "#   #   #",
      "# $ $ . #",
      "#  .#   #",
      "#   # @ #",
      "#########",
    ],
  },
  {
    name: "Split the pair",
    map: [
      "#########",
      "#   #   #",
      "#  $ $  #",
      "#.     .#",
      "#   @   #",
      "#########",
    ],
  },
  {
    name: "The shift",
    map: [
      "#########",
      "#   #   #",
      "# $ # $ #",
      "#  . .  #",
      "# . # . #",
      "#  $#$  #",
      "#   @   #",
      "#########",
    ],
  },
];
