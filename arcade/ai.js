"use strict";

export const AI_TOTAL_GAME_TREES = 255168;

const SEARCH_ORDER = [4, 0, 2, 6, 8, 1, 3, 5, 7];
const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

export function chooseOptimalMove(boardState, aiMark, humanMark) {
  const memo = new Map();
  let nodesVisited = 0;

  const availableMoves = getAvailableMoves(boardState).sort(orderMoves);
  let bestMove = availableMoves[0] ?? 4;
  let bestScore = -Infinity;

  for (const move of availableMoves) {
    boardState[move] = aiMark;
    const score = minimax(boardState, 0, false, -Infinity, Infinity, aiMark, humanMark, memo, () => {
      nodesVisited += 1;
    });
    boardState[move] = "";

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return {
    move: bestMove,
    score: bestScore,
    nodesVisited
  };
}

function minimax(boardState, depth, isMaximizing, alpha, beta, aiMark, humanMark, memo, visitNode) {
  visitNode();
  const memoKey = `${boardState.join("")}:${isMaximizing ? "max" : "min"}:${depth}`;
  if (memo.has(memoKey)) {
    return memo.get(memoKey);
  }

  const terminalState = evaluateBoard(boardState);
  if (terminalState) {
    const terminalScore = scoreTerminalState(terminalState, depth, aiMark, humanMark);
    memo.set(memoKey, terminalScore);
    return terminalScore;
  }

  const moves = getAvailableMoves(boardState).sort(orderMoves);
  let bestScore = isMaximizing ? -Infinity : Infinity;

  for (const move of moves) {
    boardState[move] = isMaximizing ? aiMark : humanMark;
    const score = minimax(boardState, depth + 1, !isMaximizing, alpha, beta, aiMark, humanMark, memo, visitNode);
    boardState[move] = "";

    if (isMaximizing) {
      bestScore = Math.max(bestScore, score);
      alpha = Math.max(alpha, bestScore);
    } else {
      bestScore = Math.min(bestScore, score);
      beta = Math.min(beta, bestScore);
    }

    if (beta <= alpha) {
      break;
    }
  }

  memo.set(memoKey, bestScore);
  return bestScore;
}

function scoreTerminalState(terminalState, depth, aiMark, humanMark) {
  if (terminalState.winner === aiMark) {
    return 10 - depth;
  }

  if (terminalState.winner === humanMark) {
    return depth - 10;
  }

  return 0;
}

function evaluateBoard(boardState) {
  for (const combo of WIN_LINES) {
    const [a, b, c] = combo;
    const mark = boardState[a];
    if (mark && mark === boardState[b] && mark === boardState[c]) {
      return { winner: mark, combo };
    }
  }

  if (boardState.every(Boolean)) {
    return { winner: null, combo: null };
  }

  return null;
}

function getAvailableMoves(boardState) {
  const moves = [];

  for (let index = 0; index < boardState.length; index += 1) {
    if (!boardState[index]) {
      moves.push(index);
    }
  }

  return moves;
}

function orderMoves(left, right) {
  return SEARCH_ORDER.indexOf(left) - SEARCH_ORDER.indexOf(right);
}