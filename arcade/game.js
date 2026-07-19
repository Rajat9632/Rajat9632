"use strict";

/* ═══════════════════════════════════════════════════
   INK ARCADE — Game Engine
   "Challenge the Creator" · Tic-Tac-Toe
   ═══════════════════════════════════════════════════ */


/* ── CONSTANTS ──────────────────────────────────── */

const PLAYER = "X";
const AI     = "O";

const WIN_LINES = [
  [0,1,2], [3,4,5], [6,7,8],  // rows
  [0,3,6], [1,4,7], [2,5,8],  // cols
  [0,4,8], [2,4,6]            // diags
];

const TAUNTS = {
  opening: [
    "Let's see what you've got.",
    "The ink is watching.",
    "Every move is permanent.",
  ],
  midgame: [
    "Interesting choice.",
    "Predictable.",
    "I've seen this before.",
    "Not bad. Not good either.",
    "Bold.",
    "Calculated.",
  ],
  aiWin: [
    "The ink never lies.",
    "Better luck next sketch.",
    "I warned you.",
    "Every line led here.",
  ],
  draw: [
    "You survived. Barely.",
    "Stalemate. Respect.",
    "Not many manage that.",
    "A draw is a mark of discipline.",
  ],
};

const STORAGE_KEY = "ink-arcade:state";


/* ── STATE ──────────────────────────────────────── */

const state = {
  board: Array(9).fill(""),
  isPlayerTurn: true,
  gameActive: false,
  aiTimer: null,
  moveCount: 0,
  winCombo: null,
  stats: { games: 0, wins: 0, draws: 0, losses: 0, bestStreak: 0, currentStreak: 0 },
  milestones: { first: false, draw: false, tenacious: false, master: false },
  muted: false,
};


/* ── AUDIO ENGINE ───────────────────────────────── */

const audio = {
  ctx: null,

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) this.ctx = new Ctx();
  },

  resume() {
    if (this.ctx?.state === "suspended") this.ctx.resume().catch(() => {});
  },

  play(freq, dur = 0.09, type = "sine", vol = 0.04, slide = null) {
    if (state.muted || !this.ctx) return;
    this.resume();
    const now = this.ctx.currentTime;
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.linearRampToValueAtTime(slide, now + dur);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  },

  placeX()   { this.play(520, 0.07, "triangle", 0.04); },
  placeO()   { this.play(340, 0.09, "sawtooth", 0.03, 280); },
  win()      { this.play(680, 0.12, "triangle", 0.035, 820); },
  lose()     { this.play(200, 0.15, "square", 0.04, 140); },
  draw()     { this.play(430, 0.11, "sine", 0.035); },
  click()    { this.play(380, 0.06, "triangle", 0.03); },
  unlock()   { this.play(600, 0.08, "sine", 0.03, 800); },
  enter()    { this.play(280, 0.12, "square", 0.04, 380); },
};


/* ── DOM REFS ───────────────────────────────────── */

const $ = (id) => document.getElementById(id);

const dom = {
  phaseDiscovery: $("phaseDiscovery"),
  phaseChallenge: $("phaseChallenge"),
  phaseGame:      $("phaseGame"),

  inkCanvas:  $("inkCanvas"),
  enterBtn:   $("enterBtn"),
  beginBtn:   $("beginBtn"),

  board:       $("board"),
  winLine:     $("winLine"),
  winStroke:   $("winLineStroke"),
  thinkingBar: $("thinkingBar"),
  turnText:    $("turnIndicator"),
  aiTaunt:     $("aiTaunt"),

  muteToggle:  $("muteToggle"),
  soundOnIcon: $("soundOnIcon"),
  soundOffIcon:$("soundOffIcon"),

  scoreWins:   $("scoreWins"),
  scoreDraws:  $("scoreDraws"),
  scoreLosses: $("scoreLosses"),
  statGames:   $("statGames"),
  statStreak:  $("statStreak"),

  endOverlay:  $("endOverlay"),
  endIcon:     $("endIcon"),
  endTitle:    $("endTitle"),
  endSubtitle: $("endSubtitle"),
  exploreLink: $("exploreLink"),
  playAgainBtn:$("playAgainBtn"),

  gameStage:   document.querySelector(".game-stage"),
  ambientLayer:$("ambientParticles"),

  msFirst:     $("ms-first"),
  msDraw:      $("ms-draw"),
  msTenacious: $("ms-tenacious"),
  msMaster:    $("ms-master"),
};


/* ── CELLS ──────────────────────────────────────── */

const cells = [];

function createBoard() {
  for (let i = 0; i < 9; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cell";
    btn.dataset.index = i;
    btn.setAttribute("role", "gridcell");
    btn.setAttribute("aria-label", `Cell ${i + 1}, empty`);
    btn.addEventListener("click", onCellClick);
    dom.board.appendChild(btn);
    cells.push(btn);
  }
}


/* ── INK CANVAS — ambient background ────────────── */

function initInkCanvas() {
  const canvas = dom.inkCanvas;
  const ctx = canvas.getContext("2d");
  let w, h, dots;
  let animId;

  function resize() {
    w = canvas.width  = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function createDots() {
    dots = [];
    const count = Math.floor((w * h) / 18000);
    for (let i = 0; i < count; i++) {
      dots.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.5 + Math.random() * 1.5,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        alpha: 0.05 + Math.random() * 0.15,
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const color = isDark ? "200,196,188" : "26,26,26";

    for (const d of dots) {
      d.x += d.vx;
      d.y += d.vy;
      if (d.x < -10) d.x = w + 10;
      if (d.x > w + 10) d.x = -10;
      if (d.y < -10) d.y = h + 10;
      if (d.y > h + 10) d.y = -10;

      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color},${d.alpha})`;
      ctx.fill();
    }

    // Subtle connecting lines between close dots
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const dx = dots[i].x - dots[j].x;
        const dy = dots[i].y - dots[j].y;
        const dist = dx * dx + dy * dy;
        if (dist < 6400) { // 80px
          const alpha = (1 - dist / 6400) * 0.06;
          ctx.beginPath();
          ctx.moveTo(dots[i].x, dots[i].y);
          ctx.lineTo(dots[j].x, dots[j].y);
          ctx.strokeStyle = `rgba(${color},${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    animId = requestAnimationFrame(draw);
  }

  resize();
  createDots();
  draw();

  window.addEventListener("resize", () => { resize(); createDots(); });

  // Stop canvas when leaving discovery phase
  return () => { cancelAnimationFrame(animId); };
}


/* ── AMBIENT PARTICLES (game phase) ─────────────── */

function createAmbientParticles() {
  const count = 18;
  for (let i = 0; i < count; i++) {
    const dot = document.createElement("span");
    dot.className = "ambient-dot";
    const size = 1 + Math.random() * 2.5;
    dot.style.cssText = `
      left: ${Math.random() * 100}%;
      bottom: -10px;
      width: ${size}px;
      height: ${size}px;
      --dur: ${10 + Math.random() * 14}s;
      --delay: ${Math.random() * 10}s;
    `;
    dom.ambientLayer.appendChild(dot);
  }
}


/* ── PHASE TRANSITIONS ──────────────────────────── */

let stopCanvas = null;

function showPhase(phaseEl) {
  document.querySelectorAll(".phase").forEach(p => {
    p.classList.remove("is-active");
    p.setAttribute("aria-hidden", "true");
  });

  // Small delay so outgoing transition starts before incoming
  setTimeout(() => {
    phaseEl.classList.add("is-active");
    phaseEl.setAttribute("aria-hidden", "false");
  }, 80);
}


/* ── DISCOVERY SEQUENCE ─────────────────────────── */

function runDiscoverySequence() {
  const line1 = $("discoveryLine1");
  const line2 = $("discoveryLine2");
  const enterBtn = dom.enterBtn;

  // Staggered reveal
  setTimeout(() => line1.classList.add("is-revealed"), 400);
  setTimeout(() => line2.classList.add("is-revealed"), 1400);
  setTimeout(() => {
    enterBtn.classList.add("is-revealed");
    enterBtn.style.opacity = "1";
    enterBtn.style.transform = "translateY(0)";
  }, 2400);
}


/* ── GAME FLOW ──────────────────────────────────── */

function startNewRound() {
  if (state.aiTimer) clearTimeout(state.aiTimer);

  state.board = Array(9).fill("");
  state.isPlayerTurn = true;
  state.gameActive = true;
  state.moveCount = 0;
  state.winCombo = null;

  dom.endOverlay.hidden = true;
  dom.endOverlay.classList.remove("is-visible");
  dom.exploreLink.hidden = true;
  dom.aiTaunt.textContent = pickRandom(TAUNTS.opening);
  dom.turnText.textContent = "Your move";
  dom.thinkingBar.hidden = true;
  dom.thinkingBar.classList.remove("is-visible");
  dom.winLine.classList.remove("is-drawn");

  cells.forEach((c, i) => {
    c.disabled = false;
    c.innerHTML = "";
    c.className = "cell";
    c.setAttribute("aria-label", `Cell ${i + 1}, empty`);
  });
}

function onCellClick(e) {
  const cell = e.currentTarget;
  const idx = Number(cell.dataset.index);

  if (!state.gameActive || !state.isPlayerTurn || state.board[idx]) return;

  placeMove(idx, PLAYER);
  audio.placeX();
  spawnRipple(cell, e);
  state.moveCount++;

  const result = checkBoard(state.board);
  if (result) { endGame(result); return; }

  state.isPlayerTurn = false;
  lockBoard(true);
  dom.turnText.textContent = "AI is thinking";
  dom.thinkingBar.hidden = false;
  dom.thinkingBar.classList.add("is-visible");

  const delay = 350 + Math.random() * 300;
  state.aiTimer = setTimeout(() => {
    if (!state.gameActive) return;
    aiTurn();
  }, delay);
}

function aiTurn() {
  state.aiTimer = null;
  dom.thinkingBar.classList.remove("is-visible");
  setTimeout(() => { dom.thinkingBar.hidden = true; }, 200);

  const move = bestMove(state.board.slice());
  placeMove(move, AI);
  audio.placeO();
  state.moveCount++;

  dom.aiTaunt.textContent = pickRandom(TAUNTS.midgame);

  const result = checkBoard(state.board);
  if (result) { endGame(result); return; }

  state.isPlayerTurn = true;
  dom.turnText.textContent = "Your move";
  lockBoard(false);
}

function placeMove(idx, mark) {
  state.board[idx] = mark;
  const cell = cells[idx];
  cell.classList.add(mark === PLAYER ? "mark-x" : "mark-o");
  cell.disabled = true;
  cell.setAttribute("aria-label", `Cell ${idx + 1}, ${mark}`);

  // Create animated mark element
  const markEl = document.createElement("div");
  markEl.className = `cell__mark cell__mark--${mark.toLowerCase()}`;
  cell.appendChild(markEl);
}

function spawnRipple(cell, e) {
  const rect = cell.getBoundingClientRect();
  const ripple = document.createElement("span");
  ripple.className = "cell-ripple";
  const size = Math.max(rect.width, rect.height);
  ripple.style.width = ripple.style.height = size + "px";
  ripple.style.left = (e.clientX - rect.left - size / 2) + "px";
  ripple.style.top  = (e.clientY - rect.top  - size / 2) + "px";
  cell.appendChild(ripple);
  ripple.addEventListener("animationend", () => ripple.remove());
}

function lockBoard(locked) {
  cells.forEach((c, i) => {
    c.disabled = locked || Boolean(state.board[i]) || !state.gameActive;
  });
}


/* ── BOARD EVALUATION ───────────────────────────── */

function checkBoard(b) {
  for (const combo of WIN_LINES) {
    const [a, c_, e] = combo;
    const m = b[a];
    if (m && m === b[c_] && m === b[e]) {
      return { type: "win", winner: m, combo };
    }
  }
  if (b.every(Boolean)) return { type: "draw", winner: null, combo: null };
  return null;
}


/* ── MINIMAX AI (with alpha-beta pruning) ───────── */

function bestMove(b) {
  let best = -Infinity;
  const candidates = [];
  const open = openCells(b);

  for (const m of open) {
    b[m] = AI;
    const score = minimax(b, 0, false, -Infinity, Infinity);
    b[m] = "";
    if (score > best)  { best = score; candidates.length = 0; }
    if (score >= best) candidates.push(m);
  }

  // Among equally optimal moves, pick randomly for variety
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function minimax(b, depth, isMax, alpha, beta) {
  const res = evalBoard(b);
  if (res !== null) return res === AI ? 10 - depth : res === PLAYER ? depth - 10 : 0;

  if (isMax) {
    let v = -Infinity;
    for (const m of openCells(b)) {
      b[m] = AI;
      v = Math.max(v, minimax(b, depth + 1, false, alpha, beta));
      b[m] = "";
      alpha = Math.max(alpha, v);
      if (beta <= alpha) break;
    }
    return v;
  }

  let v = Infinity;
  for (const m of openCells(b)) {
    b[m] = PLAYER;
    v = Math.min(v, minimax(b, depth + 1, true, alpha, beta));
    b[m] = "";
    beta = Math.min(beta, v);
    if (beta <= alpha) break;
  }
  return v;
}

function evalBoard(b) {
  for (const [a, c_, e] of WIN_LINES) {
    const m = b[a];
    if (m && m === b[c_] && m === b[e]) return m;
  }
  return b.every(Boolean) ? "draw" : null;
}

function openCells(b) {
  const moves = [];
  for (let i = 0; i < 9; i++) if (!b[i]) moves.push(i);
  return moves;
}


/* ── END GAME ───────────────────────────────────── */

function endGame(result) {
  state.gameActive = false;
  state.isPlayerTurn = false;
  lockBoard(true);
  dom.thinkingBar.hidden = true;
  dom.thinkingBar.classList.remove("is-visible");

  // Draw winning line
  if (result.combo) {
    state.winCombo = result.combo;
    drawWinLine(result.combo);
  }

  let kind;
  if (result.type === "win" && result.winner === AI) {
    kind = "loss";
    dom.turnText.textContent = "AI wins";
    dom.aiTaunt.textContent = pickRandom(TAUNTS.aiWin);
    audio.lose();
  } else if (result.type === "draw") {
    kind = "draw";
    dom.turnText.textContent = "Draw";
    dom.aiTaunt.textContent = pickRandom(TAUNTS.draw);
    audio.draw();
  } else {
    kind = "win";
    dom.turnText.textContent = "You won?!";
    dom.aiTaunt.textContent = "Impossible. The ink smudged.";
    audio.win();
  }

  updateStats(kind);
  updateMilestones();
  renderStats();
  renderMilestones();
  persistState();

  // Show overlay after a moment
  setTimeout(() => showEndOverlay(kind), 800);
}

function drawWinLine(combo) {
  const boardRect = dom.board.getBoundingClientRect();
  const frameRect = dom.board.parentElement.getBoundingClientRect();
  if (!boardRect.width) return;

  const cellSize = boardRect.width / 3;
  const ox = boardRect.left - frameRect.left;
  const oy = boardRect.top  - frameRect.top;

  const [s, , e] = combo;
  const x1 = ox + (s % 3 + 0.5) * cellSize;
  const y1 = oy + (Math.floor(s / 3) + 0.5) * cellSize;
  const x2 = ox + (e % 3 + 0.5) * cellSize;
  const y2 = oy + (Math.floor(e / 3) + 0.5) * cellSize;

  const line = dom.winStroke;
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);

  // Calculate and set dasharray to actual length
  const len = Math.hypot(x2 - x1, y2 - y1);
  line.style.strokeDasharray = len;
  line.style.strokeDashoffset = len;

  // Force reflow then animate
  void line.getBoundingClientRect();
  dom.winLine.classList.add("is-drawn");
  line.style.strokeDashoffset = "0";
}

function showEndOverlay(kind) {
  const icons  = { loss: "✕", draw: "═", win: "✦" };
  const titles = {
    loss: "You couldn't beat my AI.",
    draw: "You survived.",
    win:  "Impossible outcome.",
  };
  const subtitles = {
    loss: "Maybe you'll be more impressed by the AI I actually build.",
    draw: "Very few visitors leave a mark on this page. Respect.",
    win:  "If this happened, the ink smudged somewhere.",
  };

  dom.endIcon.textContent = icons[kind];
  dom.endTitle.textContent = titles[kind];
  dom.endSubtitle.textContent = subtitles[kind];
  dom.exploreLink.hidden = kind !== "loss";

  dom.endOverlay.hidden = false;
  // Force reflow
  void dom.endOverlay.offsetHeight;
  dom.endOverlay.classList.add("is-visible");
}


/* ── STATS & MILESTONES ─────────────────────────── */

function updateStats(kind) {
  state.stats.games++;
  if (kind === "win")  state.stats.wins++;
  if (kind === "draw") {
    state.stats.draws++;
    state.stats.currentStreak++;
    state.stats.bestStreak = Math.max(state.stats.bestStreak, state.stats.currentStreak);
  }
  if (kind === "loss") {
    state.stats.losses++;
    state.stats.currentStreak = 0;
  }
}

function updateMilestones() {
  const s = state.stats;
  const m = state.milestones;
  const prev = { ...m };

  if (s.games >= 1)  m.first     = true;
  if (s.draws >= 1)  m.draw      = true;
  if (s.games >= 10) m.tenacious = true;
  if (s.draws >= 5)  m.master    = true;

  // Detect new unlocks for animation
  state._newUnlocks = [];
  for (const key of Object.keys(m)) {
    if (m[key] && !prev[key]) state._newUnlocks.push(key);
  }
}

function renderStats() {
  const s = state.stats;
  bumpValue(dom.scoreWins,   s.wins);
  bumpValue(dom.scoreDraws,  s.draws);
  bumpValue(dom.scoreLosses, s.losses);
  dom.statGames.textContent  = s.games;
  dom.statStreak.textContent = s.bestStreak;
}

function bumpValue(el, value) {
  el.textContent = value;
  el.classList.remove("bumped");
  void el.offsetWidth;
  el.classList.add("bumped");
}

function renderMilestones() {
  const map = {
    first:     dom.msFirst,
    draw:      dom.msDraw,
    tenacious: dom.msTenacious,
    master:    dom.msMaster,
  };

  for (const [key, el] of Object.entries(map)) {
    if (state.milestones[key]) {
      el.classList.add("unlocked");
      if (state._newUnlocks?.includes(key)) {
        el.classList.add("just-unlocked");
        audio.unlock();
        el.addEventListener("animationend", () => el.classList.remove("just-unlocked"), { once: true });
      }
    }
  }
}


/* ── MUTE TOGGLE ────────────────────────────────── */

function updateMuteUI() {
  const muted = state.muted;
  dom.muteToggle.setAttribute("aria-pressed", String(muted));
  dom.soundOnIcon.style.display  = muted ? "none" : "block";
  dom.soundOffIcon.style.display = muted ? "block" : "none";
}


/* ── PERSISTENCE ────────────────────────────────── */

function loadState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.stats)      Object.assign(state.stats, saved.stats);
    if (saved.milestones) Object.assign(state.milestones, saved.milestones);
    if (saved.muted != null) state.muted = saved.muted;
  } catch { /* ignore */ }
}

function persistState() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      stats: state.stats,
      milestones: state.milestones,
      muted: state.muted,
    }));
  } catch { /* ignore */ }
}


/* ── HELPERS ────────────────────────────────────── */

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}


/* ── INITIALIZATION ─────────────────────────────── */

(function init() {
  loadState();
  createBoard();
  createAmbientParticles();
  renderStats();
  renderMilestones();
  updateMuteUI();

  // Start discovery sequence
  stopCanvas = initInkCanvas();
  runDiscoverySequence();

  // ── Event: Enter button ──
  dom.enterBtn.addEventListener("click", () => {
    audio.init();
    audio.enter();
    if (stopCanvas) { stopCanvas(); stopCanvas = null; }
    showPhase(dom.phaseChallenge);
  });

  // ── Event: Begin button ──
  dom.beginBtn.addEventListener("click", () => {
    audio.init();
    audio.click();
    showPhase(dom.phaseGame);
    setTimeout(() => {
      dom.gameStage.classList.add("is-revealed");
      startNewRound();
    }, 400);
  });

  // ── Event: Play again ──
  dom.playAgainBtn.addEventListener("click", () => {
    audio.click();
    startNewRound();
  });

  // ── Event: Mute toggle ──
  dom.muteToggle.addEventListener("click", () => {
    audio.init();
    state.muted = !state.muted;
    updateMuteUI();
    persistState();
    if (!state.muted) audio.click();
  });

  // ── Event: Resize — redraw win line ──
  window.addEventListener("resize", () => {
    if (state.winCombo) drawWinLine(state.winCombo);
  });
})();
