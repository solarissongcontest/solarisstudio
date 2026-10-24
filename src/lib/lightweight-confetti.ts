type ConfettiOptions = {
  particleCount?: number;
  spread?: number;
  origin?: { y?: number };
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
};

const COLORS = ["#26ccff", "#a25afd", "#ff5e7e", "#fcff42"];
const DURATION_MS = 1_800;

/**
 * Narrow one-shot winner burst. Solaris does not need canvas-confetti's
 * general-purpose API for this non-authoritative visual effect.
 */
export default function confetti(options: ConfettiOptions = {}) {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
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

  const count = Math.max(1, Math.min(240, Math.round(options.particleCount ?? 120)));
  const spread = ((options.spread ?? 70) * Math.PI) / 180;
  const originY = (options.origin?.y ?? 0.5) * height;
  const particles: Particle[] = Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
    const speed = 7 + Math.random() * 9;
    return {
      x: width / 2,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 4 + Math.random() * 5,
      color: COLORS[index % COLORS.length],
    };
  });

  const startedAt = performance.now();
  const frame = (now: number) => {
    const elapsed = now - startedAt;
    context.clearRect(0, 0, width, height);
    context.globalAlpha = Math.max(0, 1 - elapsed / DURATION_MS);

    for (const particle of particles) {
      particle.vy += 0.2;
      particle.x += particle.vx;
      particle.y += particle.vy;
      context.fillStyle = particle.color;
      context.fillRect(particle.x, particle.y, particle.size, particle.size / 2);
    }

    if (elapsed < DURATION_MS) {
      window.requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  };

  window.requestAnimationFrame(frame);
}
