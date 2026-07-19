"use strict";

const PLAYER_MARK = "X";
const AI_MARK = "O";
const TOKENS_PER_PLAYER = 3;
const REPETITION_LIMIT = 3;
const WIN_COMBINATIONS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8]
];
const AI_LINES = [
  "Ink is considering every route.",
  "A clean move changes everything.",
  "Searching the empty squares.",
  "The board remembers.",
  "No square is out of reach."
];
const STORAGE_KEYS = {
  stats: "ink-arcade:three-token:stats",
  achievements: "ink-arcade:three-token:achievements",
  muted: "ink-arcade:three-token:muted"
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
  phaseLabel: document.getElementById("phaseLabel"),
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
  statMovingRounds: document.getElementById("statMovingRounds"),
  achFirstGame: document.getElementById("ach-first-game"),
  achFirstDraw: document.getElementById("ach-first-draw"),
  achPersistentChallenger: document.getElementById("ach-persistent-challenger"),
  achMasterSurvivor: document.getElementById("ach-master-survivor"),
  achFirstMove: document.getElementById("ach-first-move")
};

const state = {
  board: Array(9).fill(""),
  placed: { X: 0, O: 0 },
  isPlayerTurn: true,
  gameActive: false,
  selectedIndex: null,
  aiTimer: null,
  aiMessageIndex: 0,
  winningCombo: null,
  enteredMovingPhase: false,
  positionVisits: new Map(),
  stats: loadFromSession(STORAGE_KEYS.stats, {
    gamesPlayed: 0, wins: 0, draws: 0, losses: 0, movingRounds: 0
  }),
  achievements: loadFromSession(STORAGE_KEYS.achievements, {
    firstGame: false, firstDraw: false, persistentChallenger: false,
    masterSurvivor: false, firstMove: false
  }),
  muted: sessionStorage.getItem(STORAGE_KEYS.muted) === "true"
};

const audio = {
  context: null,
  ensureContext() {
    if (!this.context) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.context = new AudioCtx();
    }
    if (this.context && this.context.state === "suspended") {
      this.context.resume().catch(() => {});
    }
  },
  beep(options) {
    const settings = Object.assign({
      frequency: 440, duration: 0.09, type: "sine", volume: 0.05, slideTo: null
    }, options);
    if (state.muted || !this.context) return;

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = settings.type;
    oscillator.frequency.setValueAtTime(settings.frequency, now);
    if (settings.slideTo) {
      oscillator.frequency.linearRampToValueAtTime(settings.slideTo, now + settings.duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(settings.volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + settings.duration + 0.01);
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
    if (state.winningCombo) renderWinningLine(state.winningCombo);
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
    elements.gameScreen.classList.add("is-active", "is-ready");
    elements.gameScreen.setAttribute("aria-hidden", "false");
    startNewRound();
  }, 1100);
}

function startNewRound() {
  clearAiTimer();
  state.board = Array(9).fill("");
  state.placed = { X: 0, O: 0 };
  state.isPlayerTurn = true;
  state.gameActive = true;
  state.selectedIndex = null;
  state.winningCombo = null;
  state.enteredMovingPhase = false;
  state.positionVisits = new Map();
  elements.endOverlay.hidden = true;
  elements.exploreLink.hidden = true;
  elements.aiMessage.textContent = "";
  elements.thinking.hidden = true;
  elements.winningLine.classList.remove("is-visible");
  updatePhaseUI();
  renderBoard();
  cells[0].focus();
}

function getPhase(placed) {
  const count = placed || state.placed;
  return count.X === TOKENS_PER_PLAYER && count.O === TOKENS_PER_PLAYER ? "moving" : "placing";
}

function updatePhaseUI() {
  const moving = getPhase() === "moving";
  elements.phaseLabel.textContent = moving
    ? "Phase 2 · move a token to any empty square"
    : "Phase 1 · placing tokens (" + state.placed.X + "/3 · " + state.placed.O + "/3)";

  if (!state.gameActive) return;
  if (!state.isPlayerTurn) {
    elements.turnText.textContent = "AI is making its move.";
  } else if (moving && state.selectedIndex === null) {
    elements.turnText.textContent = "Your move: select one of your X tokens.";
  } else if (moving) {
    elements.turnText.textContent = "Now choose any empty square.";
  } else {
    elements.turnText.textContent = "Your move: place an X on an empty square.";
  }
}

function renderBoard(action) {
  cells.forEach((cell, index) => {
    const mark = state.board[index];
    cell.textContent = mark;
    cell.className = "cell";
    if (mark) {
      cell.classList.add(mark === PLAYER_MARK ? "mark-x" : "mark-o");
      cell.setAttribute("aria-label", "Cell " + (index + 1) + ", " + mark);
    } else {
      cell.setAttribute("aria-label", "Cell " + (index + 1) + ", empty");
    }
    if (action && action.to === index) cell.classList.add("placed");
    if (state.selectedIndex === index) {
      cell.classList.add("is-selected");
      cell.setAttribute("aria-label", "Cell " + (index + 1) + ", X selected. Choose an empty square.");
    }
  });
  setBoardInteractivity();
}

function setBoardInteractivity() {
  const moving = getPhase() === "moving";
  cells.forEach((cell, index) => {
    if (!state.gameActive || !state.isPlayerTurn) {
      cell.disabled = true;
    } else if (!moving) {
      cell.disabled = Boolean(state.board[index]);
    } else {
      cell.disabled = state.board[index] === AI_MARK;
    }
  });
}

function handleCellSelect(event) {
  const index = Number(event.currentTarget.dataset.index);
  if (!state.gameActive || !state.isPlayerTurn) return;

  if (getPhase() === "placing") {
    if (!state.board[index]) makePlayerAction({ kind: "place", to: index });
    return;
  }

  const mark = state.board[index];
  if (mark === PLAYER_MARK) {
    state.selectedIndex = state.selectedIndex === index ? null : index;
    elements.aiMessage.textContent = state.selectedIndex === null
      ? "Selection cleared."
      : "Token selected. Any empty square is legal.";
    updatePhaseUI();
    renderBoard();
  } else if (mark === AI_MARK) {
    elements.aiMessage.textContent = "That token belongs to the AI.";
  } else if (state.selectedIndex === null) {
    elements.aiMessage.textContent = "Select one of your X tokens first.";
  } else {
    makePlayerAction({ kind: "move", from: state.selectedIndex, to: index });
  }
}

function makePlayerAction(action) {
  state.selectedIndex = null;
  applyActionToLiveState(action, PLAYER_MARK);
  audio.beep({
    frequency: action.kind === "move" ? 465 : 520,
    duration: 0.08, type: "triangle", volume: 0.04
  });
  finishTurn(PLAYER_MARK);
}

function finishTurn(mark) {
  registerMovingPhaseIfNeeded();
  const outcome = evaluateBoard(state.board);
  if (outcome) {
    finishGame(outcome);
    return;
  }

  state.isPlayerTurn = mark === AI_MARK;
  if (recordRepeatedPosition()) {
    finishGame({ type: "draw", reason: "repetition" });
    return;
  }

  updatePhaseUI();
  renderBoard();
  if (state.isPlayerTurn) {
    elements.thinking.hidden = false;
    elements.aiMessage.textContent = "Ink is weighing every legal move.";
    state.aiTimer = window.setTimeout(playAiTurn, 440);
  } else {
    elements.aiMessage.textContent = getPhase() === "moving"
      ? "Choose an X, then choose any empty square."
      : "The first three X tokens are placed freely.";
    const nextCell = cells.find((cell) => !cell.disabled);
    if (nextCell) nextCell.focus();
  }
}

function registerMovingPhaseIfNeeded() {
  if (getPhase() !== "moving" || state.enteredMovingPhase) return;
  state.enteredMovingPhase = true;
  state.stats.movingRounds += 1;
  state.achievements.firstMove = true;
  persistProgress();
  updateStatsUI();
  updateAchievementUI();
}

function recordRepeatedPosition() {
  if (getPhase() !== "moving") return false;
  const turn = state.isPlayerTurn ? PLAYER_MARK : AI_MARK;
  const key = state.board.join("") + "|" + turn;
  const visits = (state.positionVisits.get(key) || 0) + 1;
  state.positionVisits.set(key, visits);
  return visits >= REPETITION_LIMIT;
}

function playAiTurn() {
  state.aiTimer = null;
  if (!state.gameActive || state.isPlayerTurn) return;
  const action = chooseBestAiAction();
  elements.thinking.hidden = true;
  if (!action) {
    finishGame({ type: "draw", reason: "no-moves" });
    return;
  }
  applyActionToLiveState(action, AI_MARK);
  audio.beep({
    frequency: action.kind === "move" ? 295 : 320,
    duration: 0.09, type: "sawtooth", volume: 0.035, slideTo: 260
  });
  state.aiMessageIndex = (state.aiMessageIndex + 1) % AI_LINES.length;
  elements.aiMessage.textContent = AI_LINES[state.aiMessageIndex];
  finishTurn(AI_MARK);
}

function applyActionToLiveState(action, mark) {
  state.board = applyAction(state.board, action, mark);
  if (action.kind === "place") state.placed[mark] += 1;
  renderBoard(action);
}

function applyAction(board, action, mark) {
  const next = board.slice();
  if (action.kind === "move") next[action.from] = "";
  next[action.to] = mark;
  return next;
}

function finishGame(outcome) {
  clearAiTimer();
  state.gameActive = false;
  state.isPlayerTurn = false;
  state.selectedIndex = null;
  elements.thinking.hidden = true;

  if (outcome.type === "win") {
    state.winningCombo = outcome.combo;
    renderBoard();
    renderWinningLine(outcome.combo);
    audio.beep({
      frequency: outcome.winner === PLAYER_MARK ? 680 : 190,
      duration: 0.14, type: outcome.winner === PLAYER_MARK ? "triangle" : "square",
      volume: 0.045, slideTo: outcome.winner === PLAYER_MARK ? 820 : 140
    });
  } else {
    state.winningCombo = null;
    elements.winningLine.classList.remove("is-visible");
    audio.beep({ frequency: 430, duration: 0.11, type: "sine", volume: 0.035 });
  }

  updateProgressForResult(outcome);
  showEndOverlay(outcome);
}

function updateProgressForResult(outcome) {
  state.stats.gamesPlayed += 1;
  if (outcome.type === "draw") state.stats.draws += 1;
  else if (outcome.winner === PLAYER_MARK) state.stats.wins += 1;
  else state.stats.losses += 1;

  state.achievements.firstGame = true;
  if (state.stats.draws >= 1) state.achievements.firstDraw = true;
  if (state.stats.gamesPlayed >= 10) state.achievements.persistentChallenger = true;
  if (state.stats.draws >= 5) state.achievements.masterSurvivor = true;
  persistProgress();
  updateStatsUI();
  updateAchievementUI();
}

function showEndOverlay(outcome) {
  if (outcome.type === "draw") {
    elements.endTitle.textContent = outcome.reason === "repetition"
      ? "The ink looped back on itself."
      : "A perfectly balanced board.";
    elements.endSubtitle.textContent = "Three identical moving positions make this round a draw.";
    elements.exploreLink.hidden = true;
  } else if (outcome.winner === PLAYER_MARK) {
    elements.endTitle.textContent = "You found the line.";
    elements.endSubtitle.textContent = "A clean three in a row beats every prediction.";
    elements.exploreLink.hidden = true;
  } else {
    elements.endTitle.textContent = "The AI held the board.";
    elements.endSubtitle.textContent = "Try a different route through the moving phase.";
    elements.exploreLink.hidden = false;
  }
  elements.endOverlay.hidden = false;
}

function chooseBestAiAction() {
  const root = {
    board: state.board.slice(),
    placed: Object.assign({}, state.placed),
    turn: AI_MARK
  };
  const actions = orderActions(getLegalActions(root.board, root.placed, AI_MARK));
  if (!actions.length) return null;

  const immediateWin = actions.find((action) => {
    const next = applyAction(root.board, action, AI_MARK);
    const result = evaluateBoard(next);
    return result && result.winner === AI_MARK;
  });
  if (immediateWin) return immediateWin;

  const depth = getPhase(root.placed) === "moving" ? 7 : 6;
  const memo = new Map();
  let bestScore = -Infinity;
  let bestActions = [];
  for (const action of actions) {
    const next = makeSearchState(root, action, AI_MARK, PLAYER_MARK);
    const score = minimax(next, depth - 1, -Infinity, Infinity, new Set(), memo);
    if (score > bestScore) {
      bestScore = score;
      bestActions = [action];
    } else if (score === bestScore) {
      bestActions.push(action);
    }
  }
  return bestActions[Math.floor(Math.random() * bestActions.length)] || actions[0];
}

function minimax(node, depth, alpha, beta, path, memo) {
  const outcome = evaluateBoard(node.board);
  if (outcome && outcome.winner === AI_MARK) return 10000 + depth;
  if (outcome && outcome.winner === PLAYER_MARK) return -10000 - depth;
  if (depth === 0) return evaluatePosition(node.board);

  const stateKey = node.board.join("") + "|" + node.placed.X + node.placed.O + "|" + node.turn;
  if (path.has(stateKey)) return 0;
  const memoKey = stateKey + "|" + depth;
  if (memo.has(memoKey)) return memo.get(memoKey);

  const actions = orderActions(getLegalActions(node.board, node.placed, node.turn));
  if (!actions.length) return 0;

  path.add(stateKey);
  let value = node.turn === AI_MARK ? -Infinity : Infinity;
  for (const action of actions) {
    const nextTurn = node.turn === AI_MARK ? PLAYER_MARK : AI_MARK;
    const next = makeSearchState(node, action, node.turn, nextTurn);
    const score = minimax(next, depth - 1, alpha, beta, path, memo);
    if (node.turn === AI_MARK) {
      value = Math.max(value, score);
      alpha = Math.max(alpha, value);
    } else {
      value = Math.min(value, score);
      beta = Math.min(beta, value);
    }
    if (beta <= alpha) break;
  }
  path.delete(stateKey);
  memo.set(memoKey, value);
  return value;
}

function makeSearchState(node, action, mark, nextTurn) {
  const placed = Object.assign({}, node.placed);
  if (action.kind === "place") placed[mark] += 1;
  return { board: applyAction(node.board, action, mark), placed, turn: nextTurn };
}

function getLegalActions(board, placed, mark) {
  const empty = board.map((value, index) => value ? null : index).filter((index) => index !== null);
  if (placed[mark] < TOKENS_PER_PLAYER) {
    return empty.map((to) => ({ kind: "place", to }));
  }
  const owned = board.map((value, index) => value === mark ? index : null).filter((index) => index !== null);
  return owned.flatMap((from) => empty.map((to) => ({ kind: "move", from, to })));
}

function orderActions(actions) {
  const weights = [3, 1, 3, 1, 5, 1, 3, 1, 3];
  return actions.slice().sort((first, second) => weights[second.to] - weights[first.to]);
}

function evaluatePosition(board) {
  let score = 0;
  const weights = [3, 1, 3, 1, 5, 1, 3, 1, 3];
  for (const combo of WIN_COMBINATIONS) {
    const marks = combo.map((index) => board[index]);
    const aiCount = marks.filter((mark) => mark === AI_MARK).length;
    const playerCount = marks.filter((mark) => mark === PLAYER_MARK).length;
    if (aiCount && playerCount) continue;
    if (aiCount === 2) score += 120;
    else if (aiCount === 1) score += 15;
    else if (playerCount === 2) score -= 145;
    else if (playerCount === 1) score -= 18;
  }
  board.forEach((mark, index) => {
    if (mark === AI_MARK) score += weights[index];
    else if (mark === PLAYER_MARK) score -= weights[index];
  });
  return score;
}

function evaluateBoard(board) {
  for (const combo of WIN_COMBINATIONS) {
    const first = combo[0];
    const second = combo[1];
    const third = combo[2];
    const mark = board[first];
    if (mark && mark === board[second] && mark === board[third]) {
      return { type: "win", winner: mark, combo };
    }
  }
  return null;
}

function renderWinningLine(combo) {
  const boardRect = elements.board.getBoundingClientRect();
  if (!boardRect.width || !boardRect.height) return;
  const boardOffsetX = elements.board.offsetLeft;
  const boardOffsetY = elements.board.offsetTop;
  const cellSize = boardRect.width / 3;
  const start = combo[0];
  const end = combo[2];
  const startX = (start % 3 + 0.5) * cellSize;
  const startY = (Math.floor(start / 3) + 0.5) * cellSize;
  const endX = (end % 3 + 0.5) * cellSize;
  const endY = (Math.floor(end / 3) + 0.5) * cellSize;
  const length = Math.hypot(endX - startX, endY - startY);
  const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);
  elements.winningLine.style.width = String(length) + "px";
  elements.winningLine.style.transform = "translate(" + (boardOffsetX + startX) + "px, " + (boardOffsetY + startY) + "px) rotate(" + angle + "deg)";
  elements.winningLine.classList.add("is-visible");
}

function createBoardCells() {
  return Array.from({ length: 9 }, (_, index) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    cell.dataset.index = String(index);
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", "Cell " + (index + 1) + ", empty");
    cell.addEventListener("click", handleCellSelect);
    elements.board.appendChild(cell);
    return cell;
  });
}

function createParticles() {
  for (let index = 0; index < 12; index += 1) {
    const particle = document.createElement("span");
    particle.className = "particle";
    particle.style.setProperty("--x", String(Math.random() * 100) + "%");
    particle.style.setProperty("--size", String(1 + Math.random() * 3) + "px");
    particle.style.setProperty("--duration", String(8 + Math.random() * 8) + "s");
    particle.style.setProperty("--delay", String(Math.random() * 6) + "s");
    particle.style.setProperty("--drift", String(-20 + Math.random() * 40) + "px");
    elements.particleLayer.appendChild(particle);
  }
}

function updateStatsUI() {
  elements.statGames.textContent = String(state.stats.gamesPlayed);
  elements.statWins.textContent = String(state.stats.wins);
  elements.statDraws.textContent = String(state.stats.draws);
  elements.statLosses.textContent = String(state.stats.losses);
  elements.statMovingRounds.textContent = String(state.stats.movingRounds);
}

function updateAchievementUI() {
  elements.achFirstGame.classList.toggle("unlocked", state.achievements.firstGame);
  elements.achFirstDraw.classList.toggle("unlocked", state.achievements.firstDraw);
  elements.achPersistentChallenger.classList.toggle("unlocked", state.achievements.persistentChallenger);
  elements.achMasterSurvivor.classList.toggle("unlocked", state.achievements.masterSurvivor);
  elements.achFirstMove.classList.toggle("unlocked", state.achievements.firstMove);
}

function updateMuteUI() {
  elements.muteToggle.setAttribute("aria-pressed", String(state.muted));
  elements.muteToggle.textContent = state.muted ? "Sound Off" : "Sound On";
}

function persistProgress() {
  sessionStorage.setItem(STORAGE_KEYS.stats, JSON.stringify(state.stats));
  sessionStorage.setItem(STORAGE_KEYS.achievements, JSON.stringify(state.achievements));
}

function clearAiTimer() {
  if (!state.aiTimer) return;
  window.clearTimeout(state.aiTimer);
  state.aiTimer = null;
}

function loadFromSession(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? Object.assign({}, fallback, JSON.parse(raw)) : Object.assign({}, fallback);
  } catch {
    return Object.assign({}, fallback);
  }
}
