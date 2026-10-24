type ConfettiOrigin = {
  x?: number;
  y?: number;
};

type ConfettiOptions = {
  particleCount?: number;
  spread?: number;
  origin?: ConfettiOrigin;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
};

const COLORS = ["#26ccff", "#a25afd", "#ff5e7e", "#88ff5a", "#fcff42", "#ffa62d"];
const DURATION_MS = 1_800;

/**
 * Tiny one-shot confetti burst used by the results broadcast.
 *
 * Solaris only needs the basic canvas-confetti call shape used by the broadcast
 * winner reveal. Keeping that narrow contract local avoids shipping a general
 * purpose animation package for one non-authoritative visual effect.
 */
export default function confetti(options: ConfettiOptions = {}) {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "2147483647",
  });
  document.body.append(canvas);
  context.scale(ratio, ratio);

  const count = Math.max(1, Math.min(240, Math.round(options.particleCount ?? 120)));
  const spread = ((options.spread ?? 70) * Math.PI) / 180;
  const originX = (options.origin?.x ?? 0.5) * width;
  const originY = (options.origin?.y ?? 0.5) * height;
  const particles: Particle[] = Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
    const speed = 7 + Math.random() * 9;
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 0.16 + Math.random() * 0.08,
      size: 4 + Math.random() * 5,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.35,
      color: COLORS[index % COLORS.length],
    };
  });

  const startedAt = performance.now();
  let previousAt = startedAt;

  const frame = (now: number) => {
    const elapsed = now - startedAt;
    const step = Math.min(2, Math.max(0.25, (now - previousAt) / 16.67));
    previousAt = now;
    context.clearRect(0, 0, width, height);
    context.globalAlpha = Math.max(0, 1 - elapsed / DURATION_MS);

    for (const particle of particles) {
      particle.vy += particle.gravity * step;
      particle.vx *= 0.995 ** step;
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.rotation += particle.spin * step;

      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.fillStyle = particle.color;
      context.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
      context.restore();
    }

    if (elapsed < DURATION_MS) {
      window.requestAnimationFrame(frame);
      return;
    }

    canvas.remove();
  };

  window.requestAnimationFrame(frame);
}
