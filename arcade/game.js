"use strict";

const PLAYER_MARK = "X";
const AI_MARK = "O";

const WIN_COMBINATIONS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

const AI_PERSONALITY = [
  "Interesting line.",
  "Predictable.",
  "I've sketched this before.",
  "Calculating...",
  "Nice try."
];

const STORAGE_KEYS = {
  stats: "arcade:tictactoe:stats",
  achievements: "arcade:tictactoe:achievements",
  muted: "arcade:tictactoe:muted"
};

const elements = {
  bootScreen: document.getElementById("bootScreen"),
  introScreen: document.getElementById("introScreen"),
  gameScreen: document.getElementById("gameScreen"),
  startBtn: document.getElementById("startBtn"),
  playAgainBtn: document.getElementById("playAgainBtn"),
  board: document.getElementById("board"),
  winningLine: document.getElementById("winningLine"),
  thinking: document.getElementById("thinkingIndicator"),
  turnText: document.getElementById("turnText"),
  aiMessage: document.getElementById("aiMessage"),
  endOverlay: document.getElementById("endOverlay"),
  endTitle: document.getElementById("endTitle"),
  endSubtitle: document.getElementById("endSubtitle"),
  exploreLink: document.getElementById("exploreProjectsLink"),
  muteToggle: document.getElementById("muteToggle"),
  particleLayer: document.getElementById("particleLayer"),
  statGames: document.getElementById("statGames"),
  statWins: document.getElementById("statWins"),
  statDraws: document.getElementById("statDraws"),
  statLosses: document.getElementById("statLosses"),
  achFirstGame: document.getElementById("ach-first-game"),
  achFirstDraw: document.getElementById("ach-first-draw"),
  achPersistentChallenger: document.getElementById("ach-persistent-challenger"),
  achMasterSurvivor: document.getElementById("ach-master-survivor")
};

const state = {
  board: Array(9).fill(""),
  isPlayerTurn: true,
  gameActive: false,
  aiTimer: null,
  aiMessageIndex: 0,
  winningCombo: null,
  stats: loadFromSession(STORAGE_KEYS.stats, {
    gamesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0
  }),
  achievements: loadFromSession(STORAGE_KEYS.achievements, {
    firstGame: false,
    firstDraw: false,
    persistentChallenger: false,
    masterSurvivor: false
  }),
  muted: sessionStorage.getItem(STORAGE_KEYS.muted) === "true"
};

const audio = {
  context: null,
  ensureContext() {
    if (!this.context) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.context = new AudioCtx();
      }
    }
    if (this.context?.state === "suspended") {
      this.context.resume().catch(() => {});
    }
  },
  beep({ frequency = 440, duration = 0.09, type = "sine", volume = 0.05, slideTo = null }) {
    if (state.muted || !this.context) {
      return;
    }

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (slideTo) {
      osc.frequency.linearRampToValueAtTime(slideTo, now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.context.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }
};

const cells = createBoardCells();
createParticles();
updateStatsUI();
updateAchievementUI();
updateMuteUI();
bindEvents();

function bindEvents() {
  elements.startBtn.addEventListener("click", runOpeningSequence);
  elements.playAgainBtn.addEventListener("click", () => {
    audio.ensureContext();
    audio.beep({ frequency: 380, duration: 0.08, type: "triangle", volume: 0.04 });
    startNewRound();
  });

  elements.muteToggle.addEventListener("click", () => {
    audio.ensureContext();
    state.muted = !state.muted;
    sessionStorage.setItem(STORAGE_KEYS.muted, String(state.muted));
    updateMuteUI();
    if (!state.muted) {
      audio.beep({ frequency: 520, duration: 0.07, type: "sine", volume: 0.035, slideTo: 620 });
    }
  });

  window.addEventListener("resize", () => {
    if (state.winningCombo) {
      renderWinningLine(state.winningCombo);
    }
  });
}
function runOpeningSequence() {
  audio.ensureContext();
  audio.beep({ frequency: 280, duration: 0.11, type: "square", volume: 0.04, slideTo: 360 });

  elements.bootScreen.classList.remove("is-active");
  elements.introScreen.classList.add("is-active");
  elements.introScreen.setAttribute("aria-hidden", "false");

  window.setTimeout(() => {
    elements.introScreen.classList.remove("is-active");
    elements.introScreen.setAttribute("aria-hidden", "true");
    elements.gameScreen.classList.add("is-active");
    elements.gameScreen.classList.add("is-ready");
    elements.gameScreen.setAttribute("aria-hidden", "false");
    startNewRound();
  }, 1600);
}

function startNewRound() {
  if (state.aiTimer) {
    window.clearTimeout(state.aiTimer);
  }

  state.board = Array(9).fill("");
  state.isPlayerTurn = true;
  state.gameActive = true;
  state.winningCombo = null;
  state.aiMessageIndex = state.aiMessageIndex % AI_PERSONALITY.length;

  elements.endOverlay.hidden = true;
  elements.exploreLink.hidden = true;
  elements.aiMessage.textContent = "";
  elements.turnText.textContent = "Your move: place X.";
  elements.thinking.hidden = true;
  elements.winningLine.classList.remove("is-visible");

  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    cell.disabled = false;
    cell.textContent = "";
    cell.classList.remove("mark-x", "mark-o", "placed");
    cell.setAttribute("aria-label", `Cell ${i + 1}, empty`);
  }
}

function handleCellSelect(event) {
  const cell = event.currentTarget;
  const index = Number(cell.dataset.index);

  if (!state.gameActive || !state.isPlayerTurn || state.board[index]) {
    return;
  }

  applyMove(index, PLAYER_MARK);
  audio.beep({ frequency: 520, duration: 0.08, type: "triangle", volume: 0.04 });

  const outcome = evaluateBoard();
  if (outcome) {
    finishGame(outcome);
    return;
  }

  state.isPlayerTurn = false;
  setBoardInteractivity(false);
  elements.turnText.textContent = "AI turn.";
  elements.thinking.hidden = false;

  const delay = randomInt(300, 600);
  state.aiTimer = window.setTimeout(() => {
    if (!state.gameActive) {
      return;
    }
    playAiTurn();
  }, delay);
}

function playAiTurn() {
  state.aiTimer = null;
  elements.thinking.hidden = true;

  const bestMove = findBestAiMove(state.board.slice());
  applyMove(bestMove, AI_MARK);
  audio.beep({ frequency: 320, duration: 0.09, type: "sawtooth", volume: 0.035, slideTo: 260 });

  elements.aiMessage.textContent = AI_PERSONALITY[state.aiMessageIndex % AI_PERSONALITY.length];
  state.aiMessageIndex += 1;

  const outcome = evaluateBoard();
  if (outcome) {
    finishGame(outcome);
    return;
  }

  state.isPlayerTurn = true;
  elements.turnText.textContent = "Your move: place X.";
  setBoardInteractivity(true);
}

function applyMove(index, mark) {
  state.board[index] = mark;
  const cell = cells[index];
  cell.textContent = mark;
  cell.classList.remove("placed");
  cell.classList.add(mark === PLAYER_MARK ? "mark-x" : "mark-o");
  cell.classList.add("placed");
  cell.disabled = true;
  cell.setAttribute("aria-label", `Cell ${index + 1}, ${mark}`);
}

function evaluateBoard() {
  for (const combo of WIN_COMBINATIONS) {
    const [a, b, c] = combo;
    const mark = state.board[a];
    if (mark && mark === state.board[b] && mark === state.board[c]) {
      return { type: "win", winner: mark, combo };
    }
  }

  if (state.board.every(Boolean)) {
    return { type: "draw", winner: null, combo: null };
  }

  return null;
}

function finishGame(outcome) {
  state.gameActive = false;
  state.isPlayerTurn = false;
  setBoardInteractivity(false);
  elements.thinking.hidden = true;

  if (outcome.type === "win" && outcome.combo) {
    state.winningCombo = outcome.combo;
    renderWinningLine(outcome.combo);
  } else {
    state.winningCombo = null;
    elements.winningLine.classList.remove("is-visible");
  }

  let resultType = "draw";
  if (outcome.type === "win" && outcome.winner === AI_MARK) {
    resultType = "ai-win";
    elements.turnText.textContent = "AI wins.";
    audio.beep({ frequency: 190, duration: 0.14, type: "square", volume: 0.045, slideTo: 140 });
  } else if (outcome.type === "draw") {
    resultType = "draw";
    elements.turnText.textContent = "Draw.";
    audio.beep({ frequency: 430, duration: 0.11, type: "sine", volume: 0.035 });
  } else {
    resultType = "player-win";
    elements.turnText.textContent = "You won.";
    audio.beep({ frequency: 680, duration: 0.09, type: "triangle", volume: 0.035, slideTo: 820 });
  }

  updateStats(resultType);
  updateAchievements();
  updateStatsUI();
  updateAchievementUI();
  showEndOverlay(resultType);
}

function showEndOverlay(resultType) {
  if (resultType === "ai-win") {
    elements.endTitle.textContent = "You couldn't beat my AI.";
    elements.endSubtitle.textContent = "Maybe you'll be more impressed by the AI I actually build.";
    elements.exploreLink.hidden = false;
  } else if (resultType === "draw") {
    elements.endTitle.textContent = "You survived.";
    elements.endSubtitle.textContent = "Very few visitors leave a mark on the page.";
    elements.exploreLink.hidden = true;
  } else {
    elements.endTitle.textContent = "Impossible outcome.";
    elements.endSubtitle.textContent = "If this happened, the ink smudged.";
    elements.exploreLink.hidden = true;
  }

  elements.endOverlay.hidden = false;
}

function updateStats(resultType) {
  state.stats.gamesPlayed += 1;
  if (resultType === "ai-win") {
    state.stats.losses += 1;
  } else if (resultType === "draw") {
    state.stats.draws += 1;
  } else {
    state.stats.wins += 1;
  }
  sessionStorage.setItem(STORAGE_KEYS.stats, JSON.stringify(state.stats));
}

function updateAchievements() {
  if (state.stats.gamesPlayed >= 1) {
    state.achievements.firstGame = true;
  }
  if (state.stats.draws >= 1) {
    state.achievements.firstDraw = true;
  }
  if (state.stats.gamesPlayed >= 10) {
    state.achievements.persistentChallenger = true;
  }
  if (state.stats.draws >= 5) {
    state.achievements.masterSurvivor = true;
  }
  sessionStorage.setItem(STORAGE_KEYS.achievements, JSON.stringify(state.achievements));
}

function updateStatsUI() {
  elements.statGames.textContent = String(state.stats.gamesPlayed);
  elements.statWins.textContent = String(state.stats.wins);
  elements.statDraws.textContent = String(state.stats.draws);
  elements.statLosses.textContent = String(state.stats.losses);
}

function updateAchievementUI() {
  elements.achFirstGame.classList.toggle("unlocked", state.achievements.firstGame);
  elements.achFirstDraw.classList.toggle("unlocked", state.achievements.firstDraw);
  elements.achPersistentChallenger.classList.toggle("unlocked", state.achievements.persistentChallenger);
  elements.achMasterSurvivor.classList.toggle("unlocked", state.achievements.masterSurvivor);
}

function updateMuteUI() {
  elements.muteToggle.setAttribute("aria-pressed", String(state.muted));
  elements.muteToggle.textContent = state.muted ? "Sound Off" : "Sound On";
}

function setBoardInteractivity(enabled) {
  for (let i = 0; i < cells.length; i += 1) {
    cells[i].disabled = !enabled || Boolean(state.board[i]) || !state.gameActive;
  }
}

function findBestAiMove(boardState) {
  let bestScore = -Infinity;
  const candidateMoves = [];
  const available = getAvailableMoves(boardState);

  for (const move of available) {
    boardState[move] = AI_MARK;
    const score = minimax(boardState, 0, false, -Infinity, Infinity);
    boardState[move] = "";

    if (score > bestScore) {
      bestScore = score;
      candidateMoves.length = 0;
      candidateMoves.push(move);
    } else if (score === bestScore) {
      candidateMoves.push(move);
    }
  }

  return candidateMoves[Math.floor(Math.random() * candidateMoves.length)];
}

function minimax(boardState, depth, isMaximizing, alpha, beta) {
  const terminal = evaluateBoardState(boardState);
  if (terminal) {
    if (terminal.winner === AI_MARK) {
      return 10 - depth;
    }
    if (terminal.winner === PLAYER_MARK) {
      return depth - 10;
    }
    return 0;
  }

  if (isMaximizing) {
    let bestScore = -Infinity;
    const availableMoves = getAvailableMoves(boardState);
    for (const move of availableMoves) {
      boardState[move] = AI_MARK;
      const score = minimax(boardState, depth + 1, false, alpha, beta);
      boardState[move] = "";
      bestScore = Math.max(bestScore, score);
      alpha = Math.max(alpha, score);
      if (beta <= alpha) {
        break;
      }
    }
    return bestScore;
  }

  let bestScore = Infinity;
  const availableMoves = getAvailableMoves(boardState);
  for (const move of availableMoves) {
    boardState[move] = PLAYER_MARK;
    const score = minimax(boardState, depth + 1, true, alpha, beta);
    boardState[move] = "";
    bestScore = Math.min(bestScore, score);
    beta = Math.min(beta, score);
    if (beta <= alpha) {
      break;
    }
  }
  return bestScore;
}

function evaluateBoardState(boardState) {
  for (const combo of WIN_COMBINATIONS) {
    const [a, b, c] = combo;
    const mark = boardState[a];
    if (mark && mark === boardState[b] && mark === boardState[c]) {
      return { winner: mark, combo };
    }
  }

  if (boardState.every(Boolean)) {
    return { winner: "draw", combo: null };
  }
  return null;
}

function getAvailableMoves(boardState) {
  const moves = [];
  for (let i = 0; i < boardState.length; i += 1) {
    if (!boardState[i]) {
      moves.push(i);
    }
  }
  return moves;
}

function renderWinningLine(combo) {
  const boardRect = elements.board.getBoundingClientRect();
  if (!boardRect.width || !boardRect.height) {
    return;
  }

  const boardOffsetX = elements.board.offsetLeft;
  const boardOffsetY = elements.board.offsetTop;
  const cellSize = boardRect.width / 3;
  const [start, , end] = combo;
  const startX = (start % 3 + 0.5) * cellSize;
  const startY = (Math.floor(start / 3) + 0.5) * cellSize;
  const endX = (end % 3 + 0.5) * cellSize;
  const endY = (Math.floor(end / 3) + 0.5) * cellSize;
  const lineLength = Math.hypot(endX - startX, endY - startY);
  const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);

  elements.winningLine.style.width = `${lineLength}px`;
  elements.winningLine.style.transform = `translate(${boardOffsetX + startX}px, ${boardOffsetY + startY}px) rotate(${angle}deg)`;
  elements.winningLine.classList.add("is-visible");
}

function createBoardCells() {
  const createdCells = [];
  for (let i = 0; i < 9; i += 1) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    cell.dataset.index = String(i);
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `Cell ${i + 1}, empty`);
    cell.addEventListener("click", handleCellSelect);
    elements.board.appendChild(cell);
    createdCells.push(cell);
  }
  return createdCells;
}

function createParticles() {
  const count = 12;
  for (let i = 0; i < count; i += 1) {
    const particle = document.createElement("span");
    particle.className = "particle";
    particle.style.setProperty("--x", `${Math.random() * 100}%`);
    particle.style.setProperty("--size", `${1 + Math.random() * 3}px`);
    particle.style.setProperty("--duration", `${8 + Math.random() * 8}s`);
    particle.style.setProperty("--delay", `${Math.random() * 6}s`);
    particle.style.setProperty("--drift", `${-20 + Math.random() * 40}px`);
    elements.particleLayer.appendChild(particle);
  }
}

function loadFromSession(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) {
      return { ...fallback };
    }
    const parsed = JSON.parse(raw);
    return { ...fallback, ...parsed };
  } catch {
    return { ...fallback };
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
