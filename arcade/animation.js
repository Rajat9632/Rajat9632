"use strict";

export async function animateBootScreen({ bootLine, bootPercent, bootFeed, frames, interval = 300 }) {
  const feedEntries = [];

  for (const [percent, label] of frames) {
    bootLine.textContent = label;
    bootPercent.textContent = `${percent}%`;
    feedEntries.unshift(label);

    bootFeed.innerHTML = feedEntries
      .slice(0, 4)
      .map((entry) => `<li>${entry}</li>`)
      .join("");

    await sleep(interval);
  }
}

export function createParticleField(layer, count = 20) {
  for (let index = 0; index < count; index += 1) {
    const particle = document.createElement("span");
    particle.className = "particle";
    particle.style.setProperty("--x", `${Math.random() * 100}%`);
    particle.style.setProperty("--size", `${2 + Math.random() * 4}px`);
    particle.style.setProperty("--delay", `${Math.random() * 10}s`);
    particle.style.setProperty("--duration", `${8 + Math.random() * 7}s`);
    particle.style.setProperty("--drift", `${-30 + Math.random() * 60}px`);
    layer.appendChild(particle);
  }
}

export function createAmbientMotion(root) {
  const start = performance.now();

  const tick = (time) => {
    const elapsed = (time - start) / 1000;
    const x = Math.sin(elapsed * 0.4) * 18;
    const y = Math.cos(elapsed * 0.32) * 14;
    const glow = 0.65 + Math.sin(elapsed * 3.2) * 0.05;
    root.style.setProperty("--orb-x", `${x}px`);
    root.style.setProperty("--orb-y", `${y}px`);
    root.style.setProperty("--flicker", glow.toFixed(3));
    window.requestAnimationFrame(tick);
  };

  window.requestAnimationFrame(tick);
}

export function animateBoardReveal(board) {
  board.animate(
    [
      { opacity: 0, transform: "scale(0.965) translateY(12px)" },
      { opacity: 1, transform: "scale(1) translateY(0)" }
    ],
    {
      duration: 520,
      easing: "cubic-bezier(0.18, 0.84, 0.28, 1)"
    }
  );
}

export function attachButtonRipple(event) {
  if (!event) {
    return;
  }

  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const rect = target.getBoundingClientRect();
  const ripple = document.createElement("span");
  ripple.className = "ripple";

  const x = (event.clientX || rect.width / 2) - rect.left;
  const y = (event.clientY || rect.height / 2) - rect.top;
  const size = Math.max(rect.width, rect.height) * 1.2;

  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${x - size / 2}px`;
  ripple.style.top = `${y - size / 2}px`;

  target.appendChild(ripple);
  window.setTimeout(() => ripple.remove(), 700);
}

export function highlightWinningLine(board, line, combo) {
  const boardRect = board.getBoundingClientRect();
  const shellRect = board.parentElement?.getBoundingClientRect();
  if (!boardRect.width || !boardRect.height || !shellRect) {
    return;
  }

  const cellSize = boardRect.width / 3;
  const [start, , end] = combo;
  const startX = boardRect.left - shellRect.left + (start % 3 + 0.5) * cellSize;
  const startY = boardRect.top - shellRect.top + (Math.floor(start / 3) + 0.5) * cellSize;
  const endX = boardRect.left - shellRect.left + (end % 3 + 0.5) * cellSize;
  const endY = boardRect.top - shellRect.top + (Math.floor(end / 3) + 0.5) * cellSize;
  const lineLength = Math.hypot(endX - startX, endY - startY);
  const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);

  line.style.width = `${lineLength}px`;
  line.style.transform = `translate(${startX}px, ${startY}px) rotate(${angle}deg)`;
  line.classList.add("is-visible");
}

export function updateResultAccent(state) {
  document.documentElement.dataset.result = state ?? "idle";
}

export function sleep(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}
