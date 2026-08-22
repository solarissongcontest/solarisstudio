import { useEffect, useRef, type CSSProperties } from "react";

import { CountryFlagLayerController } from "@/components/CountryFlagLayerController";

type StarLayer = "far" | "mid" | "near";

type StarSpec = {
  id: string;
  layer: StarLayer;
  x: number;
  y: number;
  size: number;
  opacity: number;
  rotate: number;
  twinkle?: boolean;
};

/*
 * Keep the atmosphere without asking the GPU to animate an aquarium.
 * The old background rendered eighteen continuously drifting/filtering stars
 * plus three huge blurred animated glows on every public route. Eight mostly
 * static stars keep the performance budget tiny. They are intentionally large
 * enough to read as part of the Solaris identity rather than faint dust.
 */
const STARS: StarSpec[] = [
  { id: "f1", layer: "far", x: 7, y: 14, size: 11, opacity: 0.14, rotate: -21 },
  { id: "f2", layer: "far", x: 54, y: 13, size: 8.5, opacity: 0.12, rotate: 22, twinkle: true },
  { id: "f3", layer: "far", x: 91, y: 31, size: 9.5, opacity: 0.12, rotate: -8 },
  { id: "m1", layer: "mid", x: 16, y: 58, size: 15.5, opacity: 0.14, rotate: 18 },
  { id: "m2", layer: "mid", x: 77, y: 62, size: 17.5, opacity: 0.14, rotate: -26, twinkle: true },
  { id: "n1", layer: "near", x: -4, y: 84, size: 29, opacity: 0.13, rotate: 12 },
  { id: "n2", layer: "near", x: 66, y: 34, size: 25, opacity: 0.15, rotate: -15 },
  { id: "n3", layer: "near", x: 98, y: 92, size: 31, opacity: 0.13, rotate: 31 },
];

const layers: StarLayer[] = ["far", "mid", "near"];

type StarStyle = CSSProperties & Record<`--${string}`, string | number>;

export function SolarisAmbientBackground() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const precisePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;

    const writeMotion = () => {
      frame = 0;
      if (reduced.matches || !precisePointer.matches || document.hidden) {
        root.style.setProperty("--far-x", "0px");
        root.style.setProperty("--far-y", "0px");
        root.style.setProperty("--mid-x", "0px");
        root.style.setProperty("--mid-y", "0px");
        root.style.setProperty("--near-x", "0px");
        root.style.setProperty("--near-y", "0px");
        return;
      }

      root.style.setProperty("--far-x", `${pointerX * 1.25}px`);
      root.style.setProperty("--far-y", `${pointerY * 1}px`);
      root.style.setProperty("--mid-x", `${pointerX * 2.75}px`);
      root.style.setProperty("--mid-y", `${pointerY * 2}px`);
      root.style.setProperty("--near-x", `${pointerX * 4.5}px`);
      root.style.setProperty("--near-y", `${pointerY * 3.25}px`);
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(writeMotion);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!precisePointer.matches || reduced.matches) return;
      pointerX = event.clientX / Math.max(window.innerWidth, 1) - 0.5;
      pointerY = event.clientY / Math.max(window.innerHeight, 1) - 0.5;
      schedule();
    };

    const onPointerLeave = () => {
      pointerX = 0;
      pointerY = 0;
      schedule();
    };

    const onVisibilityChange = () => schedule();

    writeMotion();
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("mouseleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <>
      <CountryFlagLayerController />
      <div ref={rootRef} aria-hidden="true" className="solaris-ambient-background">
        <div className="solaris-ambient-glow solaris-ambient-glow-a" />
        <div className="solaris-ambient-glow solaris-ambient-glow-b" />
        <div className="solaris-ambient-glow solaris-ambient-glow-c" />

        {layers.map((layer) => (
          <div key={layer} className={`solaris-star-layer solaris-star-layer-${layer}`}>
            {STARS.filter((star) => star.layer === layer).map((star) => {
              const style: StarStyle = {
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: `${star.size}vmin`,
                "--star-opacity": star.opacity,
                "--star-rotate": `${star.rotate}deg`,
              };

              return (
                <span key={star.id} className="solaris-star-anchor" style={style}>
                  <img
                    src="/IMG_6171.png"
                    alt=""
                    draggable={false}
                    loading="eager"
                    decoding="async"
                    className={`solaris-star${star.twinkle ? " solaris-star-twinkle" : ""}`}
                  />
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
