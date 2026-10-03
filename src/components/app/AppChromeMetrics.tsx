import { useEffect } from "react";

/**
 * Shared V6 viewport and keyboard metrics.
 *
 * Public, Participant and Organizer surfaces consume the same root variables.
 * Pages never guess keyboard height or attach their own visualViewport policy.
 */
export function AppChromeMetrics() {
  useEffect(() => {
    const root = document.documentElement;

    const sync = () => {
      const viewport = window.visualViewport;
      const visualHeight = viewport?.height ?? window.innerHeight;
      const visualOffsetTop = viewport?.offsetTop ?? 0;
      const rawKeyboardInset = Math.max(
        0,
        window.innerHeight - visualHeight - visualOffsetTop,
      );
      const keyboardInset = rawKeyboardInset >= 100 ? rawKeyboardInset : 0;

      root.style.setProperty("--solaris-visual-viewport-height", `${visualHeight}px`);
      root.style.setProperty("--solaris-keyboard-inset", `${Math.ceil(keyboardInset)}px`);
      root.toggleAttribute("data-solaris-keyboard-open", keyboardInset > 0);
    };

    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);

    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
      root.style.removeProperty("--solaris-visual-viewport-height");
      root.style.removeProperty("--solaris-keyboard-inset");
      root.removeAttribute("data-solaris-keyboard-open");
    };
  }, []);

  return null;
}
