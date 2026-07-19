bindEvents();
import { AI_TOTAL_GAME_TREES, chooseOptimalMove } from "./ai.js";
import { animateBootScreen, animateBoardReveal, attachButtonRipple, createParticleField, createAmbientMotion, highlightWinningLine, sleep, updateResultAccent } from "./animation.js";
import { createSoundEngine } from "./sound.js";

const PLAYER_MARK = "X";
const AI_MARK = "O";
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

const AI_LINES = [
  "Interesting.",
  "Expected.",
  "You saw that.",
  "Thinking...",
  "Optimal response found.",
  "Nice opening.",
  "Mistake detected.",
  "Searching..."
];

const STORAGE_KEYS = {
  stats: "quantum-grid:stats",
  achievements: "quantum-grid:achievements",
  volume: "quantum-grid:volume",
  muted: "quantum-grid:muted"
};

const elements = {
  bootScreen: document.getElementById("bootScreen"),
  bootLine: document.getElementById("bootLine"),
  bootPercent: document.getElementById("bootPercent"),
  bootFeed: document.getElementById("bootFeed"),
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
  achievementBanner: document.getElementById("achievementBanner"),
  exploreLink: document.getElementById("exploreProjectsLink"),
  muteToggle: document.getElementById("muteToggle"),
  volumeSlider: document.getElementById("volumeSlider"),
  particleLayer: document.getElementById("particleLayer"),
  toastStack: document.getElementById("toastStack"),
  statGames: document.getElementById("statGames"),
  statDraws: document.getElementById("statDraws"),
  statLosses: document.getElementById("statLosses"),
  statStreak: document.getElementById("statStreak"),
  statFastestDraw: document.getElementById("statFastestDraw"),
  achFirstMatch: document.getElementById("ach-first-match"),
  achPersistentChallenger: document.getElementById("ach-persistent-challenger"),
  achFiveDraws: document.getElementById("ach-five-draws"),
  achTenGames: document.getElementById("ach-ten-games"),
  achSurvivor: document.getElementById("ach-survivor"),
  achImpossibleChallenger: document.getElementById("ach-impossible-challenger")
};

const state = {
  board: Array(9).fill(""),
  active: false,
  playerTurn: true,
  pendingAiTimeout: null,
  pendingAiTicker: null,
  roundStartedAt: 0,
  focusIndex: 0,
  aiTurnCount: 0,
  stats: loadFromSession(STORAGE_KEYS.stats, {
    gamesPlayed: 0,
    draws: 0,
    losses: 0,
    currentStreak: 0,
    fastestDrawMs: null
  }),
  achievements: loadFromSession(STORAGE_KEYS.achievements, {
    firstMatch: false,
    persistentChallenger: false,
    fiveDraws: false,
    tenGames: false,
    survivor: false,
    impossibleChallenger: false
  }),
  muted: localStorage.getItem(STORAGE_KEYS.muted) === "true",
  volume: clamp(Number(localStorage.getItem(STORAGE_KEYS.volume) ?? "72"), 0, 100) / 100
};

const sound = createSoundEngine({
  muted: state.muted,
  volume: state.volume,
  onChange: persistSoundPreferences
});

const cells = createBoardCells();
createParticleField(elements.particleLayer, 24);
createAmbientMotion(document.documentElement);
updateSoundControls();
updateStatsUI();
updateAchievementsUI();
bindEvents();
runBootSequence();

function bindEvents() {
  elements.startBtn.addEventListener("click", beginArcadeSession);
  elements.playAgainBtn.addEventListener("click", restartRound);
  elements.muteToggle.addEventListener("click", handleMuteToggle);
  elements.volumeSlider.addEventListener("input", handleVolumeChange);

  window.addEventListener("resize", () => {
    if (state.lastWinningLine) {
      highlightWinningLine(elements.board, elements.winningLine, state.lastWinningLine);
    }
  });

  document.addEventListener("keydown", handleGlobalShortcut);
}

async function runBootSequence() {
  const frames = [
    [0, "Booting Quantum Grid..."],
    [12, "Loading portfolio arcade shell..."],
    [34, "Spinning up synthesis layer..."],
    [57, "Training creator AI..."],
    [81, "Finalizing scanline matrix..."],
    [100, "System ready."]
  ];

  await animateBootScreen({
    bootLine: elements.bootLine,
    bootPercent: elements.bootPercent,
    bootFeed: elements.bootFeed,
    frames,
    interval: 320
  });

  elements.bootScreen.classList.remove("is-active");
  elements.bootScreen.setAttribute("aria-hidden", "true");
  elements.introScreen.classList.add("is-active");
  elements.introScreen.setAttribute("aria-hidden", "false");
}

async function beginArcadeSession(event) {
  attachButtonRipple(event);
  await sound.unlock();
  sound.playBootRise();
  elements.introScreen.classList.remove("is-active");
  elements.introScreen.setAttribute("aria-hidden", "true");
  elements.gameScreen.classList.add("is-active");
  elements.gameScreen.setAttribute("aria-hidden", "false");
  animateBoardReveal(elements.board);
  restartRound();
}

function restartRound(event) {
  if (event) {
    attachButtonRipple(event);
    sound.playClick();
  }

  clearAiTimers();
  state.board = Array(9).fill("");
  state.active = true;
  state.playerTurn = true;
  state.roundStartedAt = performance.now();
  state.focusIndex = 0;
  state.lastWinningLine = null;

  elements.endOverlay.hidden = true;
  elements.exploreLink.hidden = true;
  elements.achievementBanner.hidden = true;
  elements.aiMessage.textContent = "";
  elements.turnText.textContent = "Your move. Place X.";
  elements.thinking.hidden = true;
  elements.winningLine.classList.remove("is-visible");
  updateResultAccent(null);

  cells.forEach((cell, index) => {
    cell.textContent = "";
    cell.className = "cell";
    cell.disabled = false;
    cell.tabIndex = index === 0 ? 0 : -1;
    cell.setAttribute("aria-label", `Cell ${index + 1}, empty`);
  });

  cells[0]?.focus();
}

function handleGlobalShortcut(event) {
  if (!state.active || !elements.gameScreen.classList.contains("is-active")) {
    return;
  }

  const key = event.key;
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "].includes(key)) {
    return;
  }

  const focusedCell = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
  if (!focusedCell || !focusedCell.classList.contains("cell")) {
    return;
  }

  if (key === "Enter" || key === " ") {
    event.preventDefault();
    focusedCell.click();
    return;
  }

  event.preventDefault();
  const currentIndex = Number(focusedCell.dataset.index);
  const nextIndex = moveFocusIndex(currentIndex, key);
  focusCell(nextIndex);
}

function moveFocusIndex(currentIndex, key) {
  const deltaMap = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -3,
    ArrowDown: 3
  };

  const tentative = currentIndex + (deltaMap[key] ?? 0);
  if (tentative < 0 || tentative > 8) {
    return currentIndex;
  }

  if ((key === "ArrowLeft" && currentIndex % 3 === 0) || (key === "ArrowRight" && currentIndex % 3 === 2)) {
    return currentIndex;
  }

  return tentative;
}

function focusCell(index) {
  if (index < 0 || index > 8 || cells[index].disabled) {
    return;
  }

  cells[state.focusIndex]?.setAttribute("tabindex", "-1");
  state.focusIndex = index;
  cells[index].setAttribute("tabindex", "0");
  cells[index].focus();
}

function handleCellSelect(event) {
  const cell = event.currentTarget;
  const index = Number(cell.dataset.index);

  if (!state.active || !state.playerTurn || state.board[index]) {
    return;
  }

  attachButtonRipple(event);
  sound.playPlace();
  commitMove(index, PLAYER_MARK);

  const playerOutcome = evaluateBoard(state.board);
  if (playerOutcome) {
    finalizeRound(playerOutcome);
    return;
  }

  state.playerTurn = false;
  lockBoard();
  beginAiThinkingCycle();
}

function beginAiThinkingCycle() {
  elements.turnText.textContent = "AI is thinking.";
  elements.thinking.hidden = false;
  const thinkingMessages = ["Analyzing...", "Searching...", "Calculating...", "Evaluating..."];
  let messageIndex = 0;

  elements.aiMessage.textContent = thinkingMessages[messageIndex];
  state.pendingAiTicker = window.setInterval(() => {
    messageIndex = (messageIndex + 1) % thinkingMessages.length;
    elements.aiMessage.textContent = thinkingMessages[messageIndex];
  }, 140);

  const delay = randomInt(400, 700);
  state.pendingAiTimeout = window.setTimeout(async () => {
    clearInterval(state.pendingAiTicker);
    state.pendingAiTicker = null;
    elements.aiMessage.textContent = `Found ${AI_TOTAL_GAME_TREES.toLocaleString()} possibilities.`;
    await sleep(160);
    if (!state.active) {
      return;
    }
    executeAiMove();
  }, delay);
}

function executeAiMove() {
  elements.thinking.hidden = true;
  state.pendingAiTimeout = null;

  const outcome = chooseOptimalMove(state.board.slice(), AI_MARK, PLAYER_MARK);
  commitMove(outcome.move, AI_MARK);
  state.aiTurnCount += 1;
  sound.playAiMove();

  const aiLine = AI_LINES[state.aiTurnCount % AI_LINES.length];
  elements.aiMessage.textContent = aiLine;

  const boardOutcome = evaluateBoard(state.board);
  if (boardOutcome) {
    finalizeRound(boardOutcome);
    return;
  }

  state.playerTurn = true;
  elements.turnText.textContent = "Your move. Place X.";
  unlockAvailableCells();
  focusCell(nextOpenCell());
}

function commitMove(index, mark) {
  state.board[index] = mark;
  const cell = cells[index];
  cell.textContent = mark;
  cell.classList.add(mark === PLAYER_MARK ? "mark-x" : "mark-o");
  cell.classList.add("placed");
  cell.disabled = true;
  cell.tabIndex = -1;
  cell.setAttribute("aria-label", `Cell ${index + 1}, ${mark}`);
}

function evaluateBoard(boardState) {
  for (const combo of WIN_LINES) {
    const [a, b, c] = combo;
    const mark = boardState[a];
    if (mark && mark === boardState[b] && mark === boardState[c]) {
      return { type: "win", winner: mark, combo };
    }
  }

  if (boardState.every(Boolean)) {
    return { type: "draw", winner: null, combo: null };
  }

  return null;
}

function finalizeRound(outcome) {
  state.active = false;
  state.playerTurn = false;
  lockBoard();
  clearAiTimers();
  elements.thinking.hidden = true;

  const isAiVictory = outcome.type === "win" && outcome.winner === AI_MARK;
  const isDraw = outcome.type === "draw";

  if (isAiVictory) {
    state.lastWinningLine = outcome.combo;
    highlightWinningLine(elements.board, elements.winningLine, outcome.combo);
    updateResultAccent("ai");
    sound.playVictoryTone(false);
  } else {
    state.lastWinningLine = null;
    elements.winningLine.classList.remove("is-visible");
    updateResultAccent("draw");
    sound.playDrawTone();
  }

  updateSessionStats(isAiVictory, isDraw);
  updateAchievementState();
  updateStatsUI();
  updateAchievementsUI();
  showRoundSummary(isAiVictory, isDraw);
}

function showRoundSummary(isAiVictory, isDraw) {
  if (isAiVictory) {
    elements.endTitle.textContent = "You couldn't beat my AI.";
    elements.endSubtitle.textContent = "Maybe you'll be more impressed by the AI I actually build.";
    elements.exploreLink.hidden = false;
    elements.achievementBanner.hidden = true;
  } else if (isDraw) {
    elements.endTitle.textContent = "You survived.";
    elements.endSubtitle.textContent = "Very few players force a draw.";
    elements.exploreLink.hidden = true;
    elements.achievementBanner.hidden = false;
    elements.achievementBanner.textContent = "Achievement unlocked: Survivor";
  } else {
    elements.endTitle.textContent = "Unexpected signal.";
    elements.endSubtitle.textContent = "The timeline should not have reached this branch.";
    elements.exploreLink.hidden = true;
    elements.achievementBanner.hidden = true;
  }

  elements.endOverlay.hidden = false;
}

function updateSessionStats(isAiVictory, isDraw) {
  state.stats.gamesPlayed += 1;
  if (isAiVictory) {
    state.stats.losses += 1;
    state.stats.currentStreak = 0;
  }

  if (isDraw) {
    state.stats.draws += 1;
    state.stats.currentStreak += 1;
    const drawDuration = Math.max(0, performance.now() - state.roundStartedAt);
    if (!state.stats.fastestDrawMs || drawDuration < state.stats.fastestDrawMs) {
      state.stats.fastestDrawMs = Math.round(drawDuration);
    }
  }

  sessionStorage.setItem(STORAGE_KEYS.stats, JSON.stringify(state.stats));
}

function updateAchievementState() {
  if (state.stats.gamesPlayed >= 1) {
    state.achievements.firstMatch = true;
  }
  if (state.stats.gamesPlayed >= 10) {
    state.achievements.persistentChallenger = true;
    state.achievements.tenGames = true;
  }
  if (state.stats.draws >= 5) {
    state.achievements.fiveDraws = true;
  }
  if (state.stats.draws >= 1) {
    state.achievements.survivor = true;
  }
  if (state.stats.gamesPlayed >= 25) {
    state.achievements.impossibleChallenger = true;
  }

  sessionStorage.setItem(STORAGE_KEYS.achievements, JSON.stringify(state.achievements));
}

function updateStatsUI() {
  elements.statGames.textContent = String(state.stats.gamesPlayed);
  elements.statDraws.textContent = String(state.stats.draws);
  elements.statLosses.textContent = String(state.stats.losses);
  elements.statStreak.textContent = String(state.stats.currentStreak);
  elements.statFastestDraw.textContent = state.stats.fastestDrawMs ? formatDuration(state.stats.fastestDrawMs) : "--";
}

function updateAchievementsUI() {
  setAchievementState(elements.achFirstMatch, state.achievements.firstMatch);
  setAchievementState(elements.achPersistentChallenger, state.achievements.persistentChallenger);
  setAchievementState(elements.achFiveDraws, state.achievements.fiveDraws);
  setAchievementState(elements.achTenGames, state.achievements.tenGames);
  setAchievementState(elements.achSurvivor, state.achievements.survivor);
  setAchievementState(elements.achImpossibleChallenger, state.achievements.impossibleChallenger);
}

function setAchievementState(element, unlocked) {
  element.classList.toggle("unlocked", unlocked);
}

function handleMuteToggle(event) {
  attachButtonRipple(event);
  state.muted = !state.muted;
  sound.setMuted(state.muted);
  updateSoundControls();
  if (!state.muted) {
    sound.playClick();
  }
}

function handleVolumeChange() {
  const volume = clamp(Number(elements.volumeSlider.value), 0, 100) / 100;
  state.volume = volume;
  sound.setVolume(volume);
  updateSoundControls();
}

function updateSoundControls() {
  elements.volumeSlider.value = String(Math.round(state.volume * 100));
  elements.muteToggle.setAttribute("aria-pressed", String(state.muted));
  elements.muteToggle.textContent = state.muted ? "Sound Off" : "Sound On";
}

function persistSoundPreferences(nextMuted, nextVolume) {
  localStorage.setItem(STORAGE_KEYS.muted, String(nextMuted));
  localStorage.setItem(STORAGE_KEYS.volume, String(Math.round(nextVolume * 100)));
}

function lockBoard() {
  cells.forEach((cell, index) => {
    cell.disabled = true;
    cell.tabIndex = index === state.focusIndex ? 0 : -1;
  });
}

function unlockAvailableCells() {
  cells.forEach((cell, index) => {
    if (!state.board[index]) {
      cell.disabled = false;
    }
  });
}

function nextOpenCell() {
  const index = state.board.findIndex((value) => !value);
  return index === -1 ? 0 : index;
}

function clearAiTimers() {
  if (state.pendingAiTimeout) {
    window.clearTimeout(state.pendingAiTimeout);
    state.pendingAiTimeout = null;
  }
  if (state.pendingAiTicker) {
    window.clearInterval(state.pendingAiTicker);
    state.pendingAiTicker = null;
  }
}

function createBoardCells() {
  const createdCells = [];

  for (let index = 0; index < 9; index += 1) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    cell.dataset.index = String(index);
    cell.dataset.row = String(Math.floor(index / 3));
    cell.dataset.column = String(index % 3);
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `Cell ${index + 1}, empty`);
    cell.tabIndex = index === 0 ? 0 : -1;
    cell.addEventListener("click", handleCellSelect);
    cell.addEventListener("pointerdown", attachButtonRipple);
    elements.board.appendChild(cell);
    createdCells.push(cell);
  }

  return createdCells;
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatDuration(milliseconds) {
  const totalSeconds = milliseconds / 1000;
  return `${totalSeconds.toFixed(1)}s`;
}
