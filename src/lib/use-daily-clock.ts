import { useEffect, useState } from "react";

/** Update date-sensitive UI at midnight without re-rendering it every second. */
export function useDailyClock() {
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(24, 0, 1, 0);
      timer = window.setTimeout(
        () => {
          setClock(new Date());
          schedule();
        },
        Math.max(1_000, next.getTime() - now.getTime()),
      );
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  return clock;
}
