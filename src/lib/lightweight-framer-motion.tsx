import {
  createElement,
  Fragment,
  forwardRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type MotionValue = string | number | undefined;
type MotionTarget = Record<string, MotionValue>;
type MotionTransition = {
  duration?: number;
  ease?: string | number[];
  type?: string;
  stiffness?: number;
  damping?: number;
};

type LightweightMotionProps = HTMLAttributes<HTMLElement> & {
  initial?: MotionTarget;
  animate?: MotionTarget;
  exit?: MotionTarget;
  transition?: MotionTransition;
  layout?: boolean;
};

function prefersReducedMotionNow() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return reduced;
}

function targetToKeyframe(target: MotionTarget): Keyframe {
  const frame: Keyframe = {};
  if (target.opacity !== undefined) frame.opacity = Number(target.opacity);

  const transform: string[] = [];
  if (target.x !== undefined) {
    const x = typeof target.x === "number" ? `${target.x}px` : target.x;
    transform.push(`translateX(${x})`);
  }
  if (target.y !== undefined) {
    const y = typeof target.y === "number" ? `${target.y}px` : target.y;
    transform.push(`translateY(${y})`);
  }
  if (target.scale !== undefined) transform.push(`scale(${target.scale})`);
  if (transform.length) frame.transform = transform.join(" ");

  return frame;
}

function easingFor(transition?: MotionTransition) {
  if (typeof transition?.ease === "string") return transition.ease;
  if (Array.isArray(transition?.ease) && transition.ease.length === 4) {
    return `cubic-bezier(${transition.ease.join(",")})`;
  }
  return transition?.type === "spring"
    ? "cubic-bezier(0.22, 1, 0.36, 1)"
    : "ease-out";
}

function durationFor(transition?: MotionTransition) {
  if (typeof transition?.duration === "number") {
    return Math.max(0, transition.duration * 1000);
  }
  if (transition?.type === "spring") {
    const stiffness = transition.stiffness ?? 380;
    const damping = transition.damping ?? 30;
    return Math.max(180, Math.min(520, 470 - stiffness * 0.35 + damping * 4));
  }
  return 300;
}

function createMotionElement(tag: "div" | "li" | "span") {
  return forwardRef<HTMLElement, LightweightMotionProps>(function LightweightMotionElement(
    { initial, animate, exit: _exit, transition, layout, style, ...props },
    forwardedRef,
  ) {
    const localRef = useRef<HTMLElement | null>(null);
    const previousRect = useRef<DOMRect | null>(null);
    useImperativeHandle(forwardedRef, () => localRef.current as HTMLElement);

    useLayoutEffect(() => {
      const element = localRef.current;
      if (!element) return;
      const nextRect = element.getBoundingClientRect();
      const previous = previousRect.current;
      previousRect.current = nextRect;

      if (!layout || !previous || prefersReducedMotionNow()) return;
      const deltaX = previous.left - nextRect.left;
      const deltaY = previous.top - nextRect.top;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;

      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: "translate(0, 0)" },
        ],
        {
          duration: durationFor(transition),
          easing: easingFor(transition),
        },
      );
    });

    useEffect(() => {
      const element = localRef.current;
      if (!element || !initial || !animate || prefersReducedMotionNow()) return;
      element.animate([targetToKeyframe(initial), targetToKeyframe(animate)], {
        duration: durationFor(transition),
        easing: easingFor(transition),
        fill: "both",
      });
    }, [initial, animate, transition]);

    return createElement(tag, {
      ...props,
      ref: localRef,
      style: style as CSSProperties | undefined,
    });
  });
}

export const motion = {
  div: createMotionElement("div"),
  li: createMotionElement("li"),
  span: createMotionElement("span"),
};

export function AnimatePresence({ children }: { children?: ReactNode }) {
  return createElement(Fragment, null, children);
}
