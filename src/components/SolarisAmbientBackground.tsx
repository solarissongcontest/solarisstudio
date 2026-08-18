import { useEffect, useRef, type CSSProperties } from "react";

type StarLayer = "far" | "mid" | "near";

type StarSpec = {
  id: string;
  layer: StarLayer;
  x: number;
  y: number;
  size: number;
  opacity: number;
  blur: number;
  rotate: number;
  driftX: number;
  driftY: number;
  scaleFrom: number;
  scaleTo: number;
  duration: number;
  delay: number;
  twinkle?: boolean;
  focusShift?: boolean;
};

const STARS: StarSpec[] = [
  { id: "f1", layer: "far", x: 5, y: 12, size: 7, opacity: .18, blur: 6.5, rotate: -21, driftX: 7, driftY: 5, scaleFrom: .96, scaleTo: 1.02, duration: 56, delay: -17, focusShift: true },
  { id: "f2", layer: "far", x: 23, y: 7, size: 4.5, opacity: .11, blur: 8, rotate: 13, driftX: -5, driftY: 4, scaleFrom: .94, scaleTo: 1.04, duration: 63, delay: -33 },
  { id: "f3", layer: "far", x: 48, y: 18, size: 5.5, opacity: .15, blur: 5.8, rotate: 31, driftX: 6, driftY: -5, scaleFrom: .97, scaleTo: 1.03, duration: 51, delay: -8, twinkle: true },
  { id: "f4", layer: "far", x: 71, y: 5, size: 8.5, opacity: .14, blur: 7.3, rotate: -8, driftX: -7, driftY: 6, scaleFrom: .95, scaleTo: 1.02, duration: 68, delay: -44 },
  { id: "f5", layer: "far", x: 92, y: 28, size: 4.2, opacity: .09, blur: 9, rotate: 24, driftX: -4, driftY: -5, scaleFrom: .98, scaleTo: 1.05, duration: 59, delay: -21 },
  { id: "f6", layer: "far", x: 15, y: 68, size: 6.2, opacity: .12, blur: 6.7, rotate: 42, driftX: 5, driftY: -4, scaleFrom: .96, scaleTo: 1.04, duration: 61, delay: -39, focusShift: true },
  { id: "f7", layer: "far", x: 61, y: 79, size: 5, opacity: .13, blur: 7.8, rotate: -34, driftX: -6, driftY: 4, scaleFrom: .95, scaleTo: 1.01, duration: 66, delay: -14 },

  { id: "m1", layer: "mid", x: -1, y: 35, size: 12, opacity: .18, blur: 1.8, rotate: -15, driftX: 15, driftY: 8, scaleFrom: .94, scaleTo: 1.06, duration: 42, delay: -12 },
  { id: "m2", layer: "mid", x: 17, y: 51, size: 7.2, opacity: .13, blur: 2.8, rotate: 22, driftX: -11, driftY: 9, scaleFrom: .96, scaleTo: 1.05, duration: 49, delay: -31, twinkle: true },
  { id: "m3", layer: "mid", x: 39, y: 32, size: 10.5, opacity: .2, blur: .9, rotate: 7, driftX: 12, driftY: -10, scaleFrom: .95, scaleTo: 1.04, duration: 37, delay: -19 },
  { id: "m4", layer: "mid", x: 67, y: 49, size: 6.3, opacity: .11, blur: 3.5, rotate: -28, driftX: -9, driftY: 8, scaleFrom: .94, scaleTo: 1.07, duration: 46, delay: -7, focusShift: true },
  { id: "m5", layer: "mid", x: 88, y: 63, size: 13, opacity: .17, blur: 1.4, rotate: 18, driftX: -14, driftY: -7, scaleFrom: .95, scaleTo: 1.05, duration: 44, delay: -27 },
  { id: "m6", layer: "mid", x: 29, y: 88, size: 8.5, opacity: .14, blur: 2.2, rotate: 34, driftX: 10, driftY: -8, scaleFrom: .96, scaleTo: 1.03, duration: 53, delay: -41 },

  { id: "n1", layer: "near", x: -7, y: 4, size: 24, opacity: .18, blur: .2, rotate: 9, driftX: 26, driftY: 15, scaleFrom: .92, scaleTo: 1.08, duration: 35, delay: -22 },
  { id: "n2", layer: "near", x: 72, y: 21, size: 19, opacity: .2, blur: 0, rotate: -17, driftX: -23, driftY: 13, scaleFrom: .94, scaleTo: 1.07, duration: 31, delay: -11, twinkle: true },
  { id: "n3", layer: "near", x: 6, y: 77, size: 17, opacity: .15, blur: .6, rotate: 27, driftX: 20, driftY: -16, scaleFrom: .93, scaleTo: 1.06, duration: 39, delay: -29 },
  { id: "n4", layer: "near", x: 54, y: 71, size: 27, opacity: .16, blur: 1.1, rotate: -7, driftX: -28, driftY: -12, scaleFrom: .91, scaleTo: 1.09, duration: 43, delay: -36, focusShift: true },
  { id: "n5", layer: "near", x: 93, y: 89, size: 22, opacity: .13, blur: .4, rotate: 35, driftX: -19, driftY: -15, scaleFrom: .95, scaleTo: 1.05, duration: 34, delay: -4 },
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

    const writeMotion = (x: number, y: number, scrollY: number) => {
      if (reduced.matches) {
        root.style.setProperty("--far-x", "0px");
        root.style.setProperty("--far-y", "0px");
        root.style.setProperty("--mid-x", "0px");
        root.style.setProperty("--mid-y", "0px");
        root.style.setProperty("--near-x", "0px");
        root.style.setProperty("--near-y", "0px");
        return;
      }

      const scrollWave = Math.sin(scrollY / 620);
      root.style.setProperty("--far-x", `${x * 2}px`);
      root.style.setProperty("--far-y", `${y * 1.5 + scrollWave * 1.5}px`);
      root.style.setProperty("--mid-x", `${x * 4.5}px`);
      root.style.setProperty("--mid-y", `${y * 3.5 + scrollWave * 3.5}px`);
      root.style.setProperty("--near-x", `${x * 8}px`);
      root.style.setProperty("--near-y", `${y * 6 + scrollWave * 6}px`);
    };

    let pointerX = 0;
    let pointerY = 0;

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => writeMotion(pointerX, pointerY, window.scrollY));
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!precisePointer.matches || reduced.matches) return;
      pointerX = event.clientX / window.innerWidth - 0.5;
      pointerY = event.clientY / window.innerHeight - 0.5;
      schedule();
    };

    const onPointerLeave = () => {
      pointerX = 0;
      pointerY = 0;
      schedule();
    };

    const onScroll = () => schedule();

    writeMotion(0, 0, window.scrollY);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onPointerLeave);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("mouseleave", onPointerLeave);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
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
              "--star-opacity-low": Math.max(.035, star.opacity * .78),
              "--star-opacity-high": Math.min(.28, star.opacity * 1.18),
              "--star-focus-opacity": Math.min(.26, star.opacity * 1.08),
              "--star-blur": `${star.blur}px`,
              "--star-rotate": `${star.rotate}deg`,
              "--star-drift-start-x": `${star.driftX * -.35}px`,
              "--star-drift-start-y": `${star.driftY * -.30}px`,
              "--star-drift-mid-x": `${star.driftX * .22}px`,
              "--star-drift-mid-y": `${star.driftY * -.12}px`,
              "--star-drift-x": `${star.driftX}px`,
              "--star-drift-y": `${star.driftY}px`,
              "--star-scale-from": star.scaleFrom,
              "--star-scale-mid": (star.scaleFrom + star.scaleTo) / 2,
              "--star-scale-to": star.scaleTo,
              "--star-duration": `${star.duration}s`,
              "--star-twinkle-duration": `${star.duration * .47}s`,
              "--star-focus-duration": `${star.duration * .78}s`,
              "--star-delay": `${star.delay}s`,
              "--star-twinkle-delay": `${star.delay * .7}s`,
              "--star-focus-delay": `${star.delay * .4}s`,
            };

            return (
              <span key={star.id} className="solaris-star-anchor" style={style}>
                <img
                  src="/IMG_6171.png"
                  alt=""
                  draggable={false}
                  className={`solaris-star${star.twinkle ? " solaris-star-twinkle" : ""}${star.focusShift ? " solaris-star-focus" : ""}`}
                />
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
