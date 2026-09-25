/*
 * Chess — full-rules chess with pass-and-play and three robot strengths.
 * The engine lives in this file: 64-square board, legal move generation
 * (castling, en passant, promotion, pins via king-safety filtering), and a
 * negamax search with alpha-beta, MVV-LVA ordering, and quiescence so the
 * Master robot plays real chess.
 */
(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   * Engine                                                              *
   * ------------------------------------------------------------------ */

  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const MATE = 100000;
  const VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

  // Piece-square tables (white's view, index 0 = a8). Simplified eval tables.
  const PST = {
    p: [
       0,  0,  0,  0,  0,  0,  0,  0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
       5,  5, 10, 25, 25, 10,  5,  5,
       0,  0,  0, 20, 20,  0,  0,  0,
       5, -5,-10,  0,  0,-10, -5,  5,
       5, 10, 10,-20,-20, 10, 10,  5,
       0,  0,  0,  0,  0,  0,  0,  0,
    ],
    n: [
      -50,-40,-30,-30,-30,-30,-40,-50,
      -40,-20,  0,  0,  0,  0,-20,-40,
      -30,  0, 10, 15, 15, 10,  0,-30,
      -30,  5, 15, 20, 20, 15,  5,-30,
      -30,  0, 15, 20, 20, 15,  0,-30,
      -30,  5, 10, 15, 15, 10,  5,-30,
      -40,-20,  0,  5,  5,  0,-20,-40,
      -50,-40,-30,-30,-30,-30,-40,-50,
    ],
    b: [
      -20,-10,-10,-10,-10,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0,  5, 10, 10,  5,  0,-10,
      -10,  5,  5, 10, 10,  5,  5,-10,
      -10,  0, 10, 10, 10, 10,  0,-10,
      -10, 10, 10, 10, 10, 10, 10,-10,
      -10,  5,  0,  0,  0,  0,  5,-10,
      -20,-10,-10,-10,-10,-10,-10,-20,
    ],
    r: [
       0,  0,  0,  0,  0,  0,  0,  0,
       5, 10, 10, 10, 10, 10, 10,  5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
       0,  0,  0,  5,  5,  0,  0,  0,
    ],
    q: [
      -20,-10,-10, -5, -5,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0,  5,  5,  5,  5,  0,-10,
       -5,  0,  5,  5,  5,  5,  0, -5,
        0,  0,  5,  5,  5,  5,  0, -5,
      -10,  5,  5,  5,  5,  5,  0,-10,
      -10,  0,  5,  0,  0,  0,  0,-10,
      -20,-10,-10, -5, -5,-10,-10,-20,
    ],
    k: [
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -20,-30,-30,-40,-40,-30,-30,-20,
      -10,-20,-20,-20,-20,-20,-20,-10,
       20, 20,  0,  0,  0,  0, 20, 20,
       20, 30, 10,  0,  0, 10, 30, 20,
    ],
  };

  const isWhitePiece = (p) => p === p.toUpperCase();

  function fenToState(fen) {
    const [placement, turn, castling, ep, half, full] = fen.split(" ");
    const board = new Array(64).fill(null);
    let idx = 0;
    for (const ch of placement) {
      if (ch === "/") continue;
      if (/\d/.test(ch)) idx += Number(ch);
      else board[idx++] = ch;
    }
    let epSquare = -1;
    if (ep && ep !== "-") {
      const file = ep.charCodeAt(0) - 97;
      const rank = Number(ep[1]); // 1..8 counting from white's side
      epSquare = (8 - rank) * 8 + file;
    }
    return {
      board,
      whiteToMove: turn === "w",
      castling: {
        K: castling.includes("K"), Q: castling.includes("Q"),
        k: castling.includes("k"), q: castling.includes("q"),
      },
      ep: epSquare,
      halfmove: Number(half) || 0,
      fullmove: Number(full) || 1,
    };
  }

  function attackedBy(state, sq, byWhite) {
    const r = sq >> 3, c = sq & 7;
    const board = state.board;
    const at = (rr, cc) => (rr < 0 || rr > 7 || cc < 0 || cc > 7) ? null : board[rr * 8 + cc];

    // Pawns: a white pawn on (r+1, c±1) attacks (r, c); black on (r-1, c±1).
    const pr = byWhite ? r + 1 : r - 1;
    const pawn = byWhite ? "P" : "p";
    if (at(pr, c - 1) === pawn || at(pr, c + 1) === pawn) return true;

    const knight = byWhite ? "N" : "n";
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      if (at(r + dr, c + dc) === knight) return true;
    }

    const king = byWhite ? "K" : "k";
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr || dc) {
          if (at(r + dr, c + dc) === king) return true;
        }
      }
    }

    const rq = byWhite ? ["R", "Q"] : ["r", "q"];
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr <= 7 && cc >= 0 && cc <= 7) {
        const piece = board[rr * 8 + cc];
        if (piece) {
          if (piece === rq[0] || piece === rq[1]) return true;
          break;
        }
        rr += dr; cc += dc;
      }
    }

    const bq = byWhite ? ["B", "Q"] : ["b", "q"];
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr <= 7 && cc >= 0 && cc <= 7) {
        const piece = board[rr * 8 + cc];
        if (piece) {
          if (piece === bq[0] || piece === bq[1]) return true;
          break;
        }
        rr += dr; cc += dc;
      }
    }
    return false;
  }

  function kingSquare(state, white) {
    const target = white ? "K" : "k";
    for (let i = 0; i < 64; i += 1) {
      if (state.board[i] === target) return i;
    }
    return -1;
  }

  function inCheck(state, white = state.whiteToMove) {
    const k = kingSquare(state, white);
    return k >= 0 && attackedBy(state, k, !white);
  }

  function genPseudo(state) {
    const moves = [];
    const { board, whiteToMove, castling } = state;
    const white = whiteToMove;

    const push = (from, to, extra = {}) => {
      moves.push({
        from, to,
        piece: board[from],
        captured: extra.epCapture ? board[extra.epCaptureSq] : board[to],
        promo: extra.promo || null,
        castle: extra.castle || null,
        epCapture: Boolean(extra.epCapture),
        double: Boolean(extra.double),
      });
    };

    for (let sq = 0; sq < 64; sq += 1) {
      const piece = board[sq];
      if (!piece || isWhitePiece(piece) !== white) continue;
      const r = sq >> 3, c = sq & 7;
      const type = piece.toLowerCase();

      if (type === "p") {
        const dir = white ? -1 : 1;
        const startRow = white ? 6 : 1;
        const promoRow = white ? 0 : 7;
        const one = (r + dir) * 8 + c;
        if (r + dir >= 0 && r + dir <= 7 && !board[one]) {
          if (r + dir === promoRow) {
            for (const promo of ["Q", "R", "B", "N"]) push(sq, one, { promo });
          } else {
            push(sq, one);
            if (r === startRow) {
              const two = (r + 2 * dir) * 8 + c;
              if (!board[two]) push(sq, two, { double: true });
            }
          }
        }
        for (const dc of [-1, 1]) {
          const cc = c + dc;
          if (cc < 0 || cc > 7 || r + dir < 0 || r + dir > 7) continue;
          const to = (r + dir) * 8 + cc;
          const target = board[to];
          if (target && isWhitePiece(target) !== white) {
            if (r + dir === promoRow) {
              for (const promo of ["Q", "R", "B", "N"]) push(sq, to, { promo });
            } else {
              push(sq, to);
            }
          } else if (!target && to === state.ep) {
            push(sq, to, { epCapture: true, epCaptureSq: r * 8 + cc });
          }
        }
      } else if (type === "n") {
        for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
          const to = rr * 8 + cc;
          if (!board[to] || isWhitePiece(board[to]) !== white) push(sq, to);
        }
      } else if (type === "k") {
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            if (!dr && !dc) continue;
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
            const to = rr * 8 + cc;
            if (!board[to] || isWhitePiece(board[to]) !== white) push(sq, to);
          }
        }
        // Castling — rights, empty squares, and no attacked transit squares.
        if (white && sq === 60) {
          if (castling.K && !board[61] && !board[62] && board[63] === "R" &&
              !attackedBy(state, 60, false) && !attackedBy(state, 61, false) && !attackedBy(state, 62, false)) {
            push(sq, 62, { castle: "K" });
          }
          if (castling.Q && !board[59] && !board[58] && !board[57] && board[56] === "R" &&
              !attackedBy(state, 60, false) && !attackedBy(state, 59, false) && !attackedBy(state, 58, false)) {
            push(sq, 58, { castle: "Q" });
          }
        } else if (!white && sq === 4) {
          if (castling.k && !board[5] && !board[6] && board[7] === "r" &&
              !attackedBy(state, 4, true) && !attackedBy(state, 5, true) && !attackedBy(state, 6, true)) {
            push(sq, 6, { castle: "K" });
          }
          if (castling.q && !board[3] && !board[2] && !board[1] && board[0] === "r" &&
              !attackedBy(state, 4, true) && !attackedBy(state, 3, true) && !attackedBy(state, 2, true)) {
            push(sq, 2, { castle: "Q" });
          }
        }
      } else {
        const dirs = type === "r" ? [[-1,0],[1,0],[0,-1],[0,1]]
          : type === "b" ? [[-1,-1],[-1,1],[1,-1],[1,1]]
          : [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
        for (const [dr, dc] of dirs) {
          let rr = r + dr, cc = c + dc;
          while (rr >= 0 && rr <= 7 && cc >= 0 && cc <= 7) {
            const to = rr * 8 + cc;
            const target = board[to];
            if (!target) {
              push(sq, to);
            } else {
              if (isWhitePiece(target) !== white) push(sq, to);
              break;
            }
            rr += dr; cc += dc;
          }
        }
      }
    }
    return moves;
  }

  function makeMove(state, move) {
    const { board } = state;
    const undo = {
      captured: move.captured,
      capturedSq: move.epCapture ? (move.to + (isWhitePiece(move.piece) ? 8 : -8)) : move.to,
      castling: { ...state.castling },
      ep: state.ep,
      halfmove: state.halfmove,
      fullmove: state.fullmove,
    };

    board[move.from] = null;
    if (move.epCapture) board[undo.capturedSq] = null;
    board[move.to] = move.promo
      ? (isWhitePiece(move.piece) ? move.promo : move.promo.toLowerCase())
      : move.piece;

    if (move.castle === "K") {
      if (state.whiteToMove) { board[63] = null; board[61] = "R"; }
      else { board[7] = null; board[5] = "r"; }
    } else if (move.castle === "Q") {
      if (state.whiteToMove) { board[56] = null; board[59] = "R"; }
      else { board[0] = null; board[3] = "r"; }
    }

    const type = move.piece.toLowerCase();
    if (type === "k") {
      if (state.whiteToMove) { state.castling.K = false; state.castling.Q = false; }
      else { state.castling.k = false; state.castling.q = false; }
    }
    if (move.from === 63 || move.to === 63) state.castling.K = false;
    if (move.from === 56 || move.to === 56) state.castling.Q = false;
    if (move.from === 7 || move.to === 7) state.castling.k = false;
    if (move.from === 0 || move.to === 0) state.castling.q = false;

    state.ep = move.double ? (move.from + move.to) / 2 : -1;
    state.halfmove = (type === "p" || move.captured) ? 0 : state.halfmove + 1;
    if (!state.whiteToMove) state.fullmove += 1;
    state.whiteToMove = !state.whiteToMove;
    return undo;
  }

  function unmakeMove(state, move, undo) {
    const { board } = state;
    state.whiteToMove = !state.whiteToMove;
    board[move.from] = move.piece;
    board[move.to] = null;
    if (move.captured) board[undo.capturedSq] = undo.captured;
    if (move.castle === "K") {
      if (state.whiteToMove) { board[61] = null; board[63] = "R"; }
      else { board[5] = null; board[7] = "r"; }
    } else if (move.castle === "Q") {
      if (state.whiteToMove) { board[59] = null; board[56] = "R"; }
      else { board[3] = null; board[0] = "r"; }
    }
    state.castling = undo.castling;
    state.ep = undo.ep;
    state.halfmove = undo.halfmove;
    state.fullmove = undo.fullmove;
  }

  function legalMoves(state) {
    const result = [];
    for (const move of genPseudo(state)) {
      const undo = makeMove(state, move);
      if (!inCheck(state, !state.whiteToMove)) result.push(move);
      unmakeMove(state, move, undo);
    }
    return result;
  }

  function insufficientMaterial(board) {
    const pieces = [];
    for (let i = 0; i < 64; i += 1) {
      const p = board[i];
      if (p && p.toLowerCase() !== "k") pieces.push({ p, sq: i });
    }
    if (pieces.length === 0) return true;
    if (pieces.length === 1) {
      const t = pieces[0].p.toLowerCase();
      return t === "n" || t === "b";
    }
    if (pieces.length === 2) {
      const [a, b] = pieces;
      if (a.p.toLowerCase() === "b" && b.p.toLowerCase() === "b" &&
          isWhitePiece(a.p) !== isWhitePiece(b.p)) {
        const dark = (sq) => (((sq >> 3) + (sq & 7)) & 1) === 1;
        return dark(a.sq) === dark(b.sq);
      }
    }
    return false;
  }

  function positionKey(state) {
    return state.board.map((p) => p || ".").join("") +
      (state.whiteToMove ? " w " : " b ") +
      (state.castling.K ? "K" : "") + (state.castling.Q ? "Q" : "") +
      (state.castling.k ? "k" : "") + (state.castling.q ? "q" : "") +
      state.ep;
  }

  /* ------------------------------------------------------------------ *
   * Search                                                              *
   * ------------------------------------------------------------------ */

  function evaluate(state) {
    let score = 0;
    for (let i = 0; i < 64; i += 1) {
      const p = state.board[i];
      if (!p) continue;
      const type = p.toLowerCase();
      const table = PST[type];
      if (isWhitePiece(p)) score += VALUES[type] + table[i];
      else score -= VALUES[type] + table[i ^ 56];
    }
    return state.whiteToMove ? score : -score;
  }

  function moveOrderScore(move) {
    let score = 0;
    if (move.captured) score += 10 * VALUES[move.captured.toLowerCase()] - VALUES[move.piece.toLowerCase()];
    if (move.promo) score += VALUES[move.promo.toLowerCase()];
    const type = move.piece.toLowerCase();
    const white = isWhitePiece(move.piece);
    const to = white ? move.to : move.to ^ 56;
    const from = white ? move.from : move.from ^ 56;
    score += PST[type][to] - PST[type][from];
    return score;
  }

  let nodes = 0;
  let nodeCap = 350000;

  function quiesce(state, alpha, beta, depth) {
    nodes += 1;
    const stand = evaluate(state);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (depth <= 0 || nodes > nodeCap) return alpha;
    const captures = legalMoves(state)
      .filter((m) => m.captured || m.promo)
      .sort((a, b) => moveOrderScore(b) - moveOrderScore(a));
    for (const move of captures) {
      const undo = makeMove(state, move);
      const score = -quiesce(state, -beta, -alpha, depth - 1);
      unmakeMove(state, move, undo);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function negamax(state, depth, alpha, beta, ply) {
    nodes += 1;
    if (state.halfmove >= 100) return 0;
    if (depth <= 0) return quiesce(state, alpha, beta, 4);
    const moves = legalMoves(state);
    if (!moves.length) return inCheck(state) ? -(MATE - ply) : 0;
    moves.sort((a, b) => moveOrderScore(b) - moveOrderScore(a));
    for (const move of moves) {
      const undo = makeMove(state, move);
      const score = -negamax(state, depth - 1, -beta, -alpha, ply + 1);
      unmakeMove(state, move, undo);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
      if (nodes > nodeCap) return alpha;
    }
    return alpha;
  }

  const LEVELS = {
    rookie: { depth: 1, window: 90, blunder: 0.3 },
    club: { depth: 2, window: 35, blunder: 0.05 },
    master: { depth: 3, window: 0, blunder: 0 },
  };

  function pickRobotMove(state, levelId) {
    const level = LEVELS[levelId] || LEVELS.club;
    nodes = 0;
    nodeCap = level.depth >= 3 ? 350000 : 120000;
    const moves = legalMoves(state);
    if (!moves.length) return null;
    if (Math.random() < level.blunder) {
      return moves[Math.floor(Math.random() * moves.length)];
    }
    moves.sort((a, b) => moveOrderScore(b) - moveOrderScore(a));
    const scored = [];
    let alpha = -MATE;
    for (const move of moves) {
      const undo = makeMove(state, move);
      let score;
      if (level.depth >= 3) {
        // Running alpha prunes the master's tree; scores below alpha come
        // back as upper bounds, which never changes the best move.
        score = -negamax(state, level.depth - 1, -MATE, -alpha, 1);
      } else {
        score = -negamax(state, level.depth - 1, -MATE, MATE, 1);
      }
      unmakeMove(state, move, undo);
      scored.push({ move, score });
      if (score > alpha) alpha = score;
    }
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0].score;
    const pool = scored.filter((entry) => entry.score >= best - level.window);
    return pool[Math.floor(Math.random() * pool.length)].move;
  }

  /* ------------------------------------------------------------------ *
   * SAN                                                                 *
   * ------------------------------------------------------------------ */

  const FILES = "abcdefgh";
  const GLYPHS = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

  function sqName(sq) {
    return FILES[sq & 7] + (8 - (sq >> 3));
  }

  function toSAN(state, move, legal) {
    let text;
    if (move.castle === "K") text = "O-O";
    else if (move.castle === "Q") text = "O-O-O";
    else {
      const type = move.piece.toLowerCase();
      if (type === "p") {
        text = move.captured ? FILES[move.from & 7] + "x" : "";
        text += sqName(move.to);
        if (move.promo) text += "=" + move.promo;
      } else {
        text = type.toUpperCase();
        const rivals = legal.filter((m) =>
          m.piece === move.piece && m.to === move.to && m.from !== move.from);
        if (rivals.length) {
          const sameFile = rivals.some((m) => (m.from & 7) === (move.from & 7));
          const sameRank = rivals.some((m) => (m.from >> 3) === (move.from >> 3));
          if (!sameFile) text += FILES[move.from & 7];
          else if (!sameRank) text += String(8 - (move.from >> 3));
          else text += sqName(move.from);
        }
        if (move.captured) text += "x";
        text += sqName(move.to);
      }
    }
    const undo = makeMove(state, move);
    if (inCheck(state)) text += legalMoves(state).length ? "+" : "#";
    unmakeMove(state, move, undo);
    return text;
  }

  /* ------------------------------------------------------------------ *
   * Game controller                                                     *
   * ------------------------------------------------------------------ */

  const els = {
    board: document.querySelector("#board"),
    turnPill: document.querySelector("#turnPill"),
    clock: document.querySelector("#clock"),
    overlay: document.querySelector("#overlay"),
    overlayTitle: document.querySelector("#overlayTitle"),
    overlaySub: document.querySelector("#overlaySub"),
    playAgain: document.querySelector("#playAgain"),
    newGame: document.querySelector("#newGameButton"),
    undo: document.querySelector("#undoButton"),
    flip: document.querySelector("#flipButton"),
    moveList: document.querySelector("#moveList"),
    capTop: document.querySelector("#capTop"),
    capBottom: document.querySelector("#capBottom"),
    matTop: document.querySelector("#matTop"),
    matBottom: document.querySelector("#matBottom"),
    thinking: document.querySelector("#thinkingPill"),
    promoOverlay: document.querySelector("#promoOverlay"),
    promoRow: document.querySelector("#promoRow"),
    modeRow: document.querySelector("#modeRow"),
    topName: document.querySelector("#topName"),
    bottomName: document.querySelector("#bottomName"),
  };

  const game = {
    state: fenToState(START_FEN),
    mode: "pass", // pass | rookie | club | master (robot plays black)
    history: [], // { move, undo, san, key }
    keyCounts: new Map(),
    flipped: false,
    manualFlip: false,
    selected: null,
    legalCache: [],
    over: null,
    awarded: false,
    startedAt: Date.now(),
    robotTimer: null,
    robotToken: 0,
  };

  function resetGame() {
    if (game.robotTimer) clearTimeout(game.robotTimer);
    game.robotToken += 1;
    game.state = fenToState(START_FEN);
    game.history = [];
    game.keyCounts = new Map([[positionKey(game.state), 1]]);
    game.selected = null;
    game.legalCache = [];
    game.over = null;
    game.awarded = false;
    game.manualFlip = false;
    game.flipped = false;
    game.startedAt = Date.now();
    els.overlay.hidden = true;
    els.thinking.hidden = true;
    render();
  }

  function currentMode() {
    const checked = els.modeRow.querySelector("input[name=mode]:checked");
    return checked ? checked.value : "pass";
  }

  function levelTitle(mode) {
    return { rookie: "Rookie", club: "Club", master: "Master" }[mode] || "Club";
  }

  function applyMove(move) {
    const legal = game.legalCache.length ? game.legalCache : legalMoves(game.state);
    const san = toSAN(game.state, move, legal);
    const undo = makeMove(game.state, move);
    const key = positionKey(game.state);
    game.keyCounts.set(key, (game.keyCounts.get(key) || 0) + 1);
    game.history.push({ move, undo, san, key });
    game.selected = null;
    game.legalCache = [];

    if (move.captured) GameHubJuice.pop(300);
    else if (move.promo) GameHubJuice.coin();
    else GameHubJuice.tick();
    if (inCheck(game.state)) GameHubJuice.boom();

    render();
    const end = detectEnd();
    if (end) finishGame(end);
    else scheduleRobot();
  }

  function detectEnd() {
    const state = game.state;
    if (!legalMoves(state).length) {
      if (inCheck(state)) {
        return {
          title: "Checkmate",
          sub: winnerName(!state.whiteToMove),
          winnerWhite: !state.whiteToMove,
        };
      }
      return { title: "Stalemate", sub: "No legal moves — it's a draw.", winnerWhite: null };
    }
    const key = positionKey(state);
    if ((game.keyCounts.get(key) || 0) >= 3) {
      return { title: "Draw", sub: "Threefold repetition.", winnerWhite: null };
    }
    if (state.halfmove >= 100) {
      return { title: "Draw", sub: "Fifty moves without progress.", winnerWhite: null };
    }
    if (insufficientMaterial(state.board)) {
      return { title: "Draw", sub: "Neither side can force a mate.", winnerWhite: null };
    }
    return null;
  }

  function winnerName(whiteWon) {
    if (game.mode === "pass") return `${whiteWon ? "White" : "Black"} wins!`;
    const humanWon = whiteWon === true; // Human is always white vs the robot.
    return humanWon
      ? `You beat the ${levelTitle(game.mode)} robot!`
      : `The ${levelTitle(game.mode)} robot wins.`;
  }

  function finishGame(end) {
    game.over = end;
    els.overlayTitle.textContent = end.title;
    els.overlaySub.textContent = end.sub;
    els.overlay.hidden = false;
    if (game.awarded) return;
    game.awarded = true;

    if (game.mode === "pass") {
      if (end.winnerWhite !== null) {
        GameHubProfile?.award("chess", 3, "Pass-and-play checkmate", 1);
        GameHubJuice.win();
      } else {
        GameHubProfile?.award("chess", 1, "Finished a chess game", 0);
      }
      return;
    }
    const humanWins = end.winnerWhite === true;
    const reward = { rookie: 4, club: 8, master: 15 }[game.mode] || 4;
    if (humanWins) {
      GameHubProfile?.achieve("chess-robot");
      if (game.mode === "master") GameHubProfile?.achieve("chess-master");
      GameHubProfile?.award("chess", reward, `Beat the ${levelTitle(game.mode)} robot`, reward);
      GameHubJuice.win();
    } else if (end.winnerWhite === false) {
      GameHubProfile?.award("chess", 1, `Fought the ${levelTitle(game.mode)} robot`, 0);
      GameHubJuice.lose();
    } else {
      GameHubProfile?.award("chess", 2, "Drew against the robot", 0);
    }
  }

  function scheduleRobot() {
    if (game.mode === "pass" || game.over || game.state.whiteToMove) return;
    const token = game.robotToken;
    els.thinking.hidden = false;
    game.robotTimer = setTimeout(() => {
      if (token !== game.robotToken || game.over) return;
      const move = pickRobotMove(game.state, game.mode);
      els.thinking.hidden = true;
      if (move) applyMove(move);
    }, 220);
  }

  /* ------------------------------------------------------------------ *
   * Rendering                                                           *
   * ------------------------------------------------------------------ */

  function displayOrder() {
    const order = [];
    for (let i = 0; i < 64; i += 1) order.push(game.flipped ? 63 - i : i);
    return order;
  }

  function render() {
    const whiteTurn = game.state.whiteToMove;
    els.turnPill.textContent = game.over
      ? "Game over"
      : `${whiteTurn ? "⚪ White" : "⚫ Black"} to move${inCheck(game.state) ? " — check!" : ""}`;
    els.turnPill.classList.toggle("is-black-turn", !whiteTurn && !game.over);

    const targets = new Map(game.legalCache.map((m) => [m.to, m]));
    const last = game.history[game.history.length - 1];
    const checkSq = inCheck(game.state) ? kingSquare(game.state, game.state.whiteToMove) : -1;

    els.board.innerHTML = "";
    for (const sq of displayOrder()) {
      const cellDiv = document.createElement("div");
      const r = sq >> 3, c = sq & 7;
      const light = (r + c) % 2 === 0;
      cellDiv.className = `square ${light ? "light" : "dark"}`;

      if (game.selected === sq) cellDiv.classList.add(light ? "sel-light" : "sel-dark");
      else if (last && (sq === last.move.from || sq === last.move.to)) {
        cellDiv.classList.add(light ? "last-move-light" : "last-move-dark");
      }
      if (sq === checkSq) cellDiv.classList.add(light ? "check-light" : "check-dark");

      if (r === (game.flipped ? 7 : 0)) {
        const fileLabel = document.createElement("span");
        fileLabel.className = "coord file";
        fileLabel.textContent = FILES[c];
        cellDiv.append(fileLabel);
      }
      if (c === (game.flipped ? 0 : 7)) {
        const rankLabel = document.createElement("span");
        rankLabel.className = "coord rank";
        rankLabel.textContent = String(8 - r);
        cellDiv.append(rankLabel);
      }

      const piece = game.state.board[sq];
      if (piece) {
        const span = document.createElement("span");
        span.className = `piece ${isWhitePiece(piece) ? "white-side" : "black-side"}`;
        span.textContent = GLYPHS[piece.toLowerCase()];
        if (last && sq === last.move.to) span.classList.add("pop");
        cellDiv.append(span);
      }

      if (!game.over && targets.has(sq)) {
        const marker = document.createElement("span");
        marker.className = targets.get(sq).captured ? "move-ring" : "move-dot";
        cellDiv.append(marker);
      }

      cellDiv.addEventListener("click", () => onSquareClick(sq));
      els.board.append(cellDiv);
    }

    renderCaptures();
    renderMoveList();
  }

  function renderCaptures() {
    const capturedByWhite = [];
    const capturedByBlack = [];
    let matWhite = 0;
    let matBlack = 0;
    for (const { move } of game.history) {
      if (!move.captured) continue;
      const value = { p: 1, n: 3, b: 3, r: 5, q: 9 }[move.captured.toLowerCase()] || 0;
      if (isWhitePiece(move.captured)) {
        capturedByBlack.push(move.captured);
        matBlack += value;
      } else {
        capturedByWhite.push(move.captured);
        matWhite += value;
      }
    }
    const glyph = (p) => GLYPHS[p.toLowerCase()];
    const whiteTray = capturedByWhite.map(glyph).join("");
    const blackTray = capturedByBlack.map(glyph).join("");
    const diff = matWhite - matBlack;
    const topIsWhite = !game.flipped;
    els.capTop.innerHTML = "";
    els.capBottom.innerHTML = "";
    const topSpan = document.createElement("span");
    const bottomSpan = document.createElement("span");
    if (topIsWhite) {
      topSpan.className = "black-caps";
      topSpan.textContent = blackTray;
      bottomSpan.className = "white-caps";
      bottomSpan.textContent = whiteTray;
      els.matTop.textContent = diff < 0 ? `+${-diff}` : "";
      els.matBottom.textContent = diff > 0 ? `+${diff}` : "";
    } else {
      topSpan.className = "white-caps";
      topSpan.textContent = whiteTray;
      bottomSpan.className = "black-caps";
      bottomSpan.textContent = blackTray;
      els.matTop.textContent = diff > 0 ? `+${diff}` : "";
      els.matBottom.textContent = diff < 0 ? `+${-diff}` : "";
    }
    els.capTop.append(topSpan);
    els.capBottom.append(bottomSpan);
  }

  function renderMoveList() {
    els.moveList.innerHTML = "";
    if (!game.history.length) {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.className = "empty";
      span.textContent = "No moves yet — white opens.";
      li.append(span);
      els.moveList.append(li);
      return;
    }
    for (let i = 0; i < game.history.length; i += 2) {
      const li = document.createElement("li");
      const no = document.createElement("span");
      no.className = "move-no";
      no.textContent = `${i / 2 + 1}.`;
      const w = document.createElement("span");
      w.textContent = game.history[i].san;
      const b = document.createElement("span");
      if (game.history[i + 1]) b.textContent = game.history[i + 1].san;
      if (i === game.history.length - 1) w.classList.add("latest");
      if (i + 1 === game.history.length - 1) b.classList.add("latest");
      li.append(no, w, b);
      els.moveList.append(li);
    }
    els.moveList.scrollTop = els.moveList.scrollHeight;
  }

  /* ------------------------------------------------------------------ *
   * Interaction                                                         *
   * ------------------------------------------------------------------ */

  function onSquareClick(sq) {
    if (game.over) return;
    if (game.mode !== "pass" && !game.state.whiteToMove) return; // robot's move
    const piece = game.state.board[sq];

    if (game.selected !== null) {
      const candidates = game.legalCache.filter((m) => m.from === game.selected && m.to === sq);
      if (candidates.length > 1) {
        askPromotion(candidates);
        return;
      }
      if (candidates.length === 1) {
        applyMove(candidates[0]);
        return;
      }
    }

    if (piece && isWhitePiece(piece) === game.state.whiteToMove) {
      game.selected = sq;
      game.legalCache = legalMoves(game.state).filter((m) => m.from === sq);
      GameHubJuice.tick();
    } else {
      game.selected = null;
      game.legalCache = [];
    }
    render();
  }

  function askPromotion(candidates) {
    els.promoRow.innerHTML = "";
    const white = game.state.whiteToMove;
    for (const move of candidates) {
      const button = document.createElement("button");
      button.type = "button";
      button.style.color = white ? "#fdf6e3" : "#23211d";
      button.style.textShadow = white
        ? "0 0 1.5px #241d14"
        : "0 1px 1px rgba(255,250,240,0.3)";
      button.textContent = GLYPHS[move.promo.toLowerCase()];
      button.addEventListener("click", () => {
        els.promoOverlay.hidden = true;
        applyMove(move);
      });
      els.promoRow.append(button);
    }
    els.promoOverlay.hidden = false;
  }

  function undoMove() {
    if (game.robotTimer) clearTimeout(game.robotTimer);
    game.robotToken += 1;
    els.thinking.hidden = true;
    if (!game.history.length) return;
    const steps = game.mode !== "pass" && game.history.length >= 2 && !game.over ? 2 : 1;
    for (let i = 0; i < steps; i += 1) {
      const entry = game.history.pop();
      if (!entry) break;
      unmakeMove(game.state, entry.move, entry.undo);
      const count = game.keyCounts.get(entry.key) || 1;
      if (count <= 1) game.keyCounts.delete(entry.key);
      else game.keyCounts.set(entry.key, count - 1);
    }
    game.over = null;
    game.awarded = false;
    game.selected = null;
    game.legalCache = [];
    els.overlay.hidden = true;
    render();
  }

  function bindEvents() {
    els.newGame.addEventListener("click", () => {
      GameHubJuice.tick();
      resetGame();
    });
    els.playAgain.addEventListener("click", resetGame);
    els.undo.addEventListener("click", undoMove);
    els.flip.addEventListener("click", () => {
      game.flipped = !game.flipped;
      game.manualFlip = true;
      render();
    });
    els.modeRow.addEventListener("change", () => {
      game.mode = currentMode();
      GameHubJuice.tick();
      resetGame();
      updatePlayerNames();
      if (game.mode !== "pass") scheduleRobot();
    });
  }

  function updatePlayerNames() {
    if (game.mode === "pass") {
      els.topName.textContent = game.flipped ? "⚪ White" : "⚫ Black";
      els.bottomName.textContent = game.flipped ? "⚫ Black" : "⚪ White";
    } else {
      els.topName.textContent = `🤖 ${levelTitle(game.mode)}`;
      els.bottomName.textContent = "🧑 You (white)";
    }
  }

  // Pass mode auto-flips so the mover sees their pieces at the bottom,
  // unless the player manually flipped the board this game.
  const baseApplyMove = applyMove;
  applyMove = function (move) {
    baseApplyMove(move);
    if (game.mode === "pass" && !game.over && !game.manualFlip) {
      game.flipped = !game.flipped;
      updatePlayerNames();
      render();
    }
  };

  // Elapsed game clock.
  setInterval(() => {
    if (game.over) return;
    const elapsed = Math.floor((Date.now() - game.startedAt) / 1000);
    els.clock.textContent =
      `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  }, 1000);

  bindEvents();
  updatePlayerNames();
  resetGame();
})();
