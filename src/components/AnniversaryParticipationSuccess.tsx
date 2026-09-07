import { useEffect, useRef, useState } from "react";

import "@/anniversary-participation-success.css";

const SUCCESS_PHRASES = [
  "Your vote has been recorded",
  "Your jury ballot has been recorded",
  "Your entry is public",
  "Reveal schedule saved",
];

export function AnniversaryParticipationSuccess() {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      const matched = mutations.some((mutation) =>
        [...mutation.addedNodes].some((node) => {
          const text = node.textContent ?? "";
          return SUCCESS_PHRASES.some((phrase) => text.includes(phrase));
        }),
      );
      if (!matched) return;

      setVisible(true);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setVisible(false), 5200);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <aside className="anniversary-participation-success" role="status" aria-live="polite">
      <span aria-hidden="true">✦</span>
      <div>
        <strong>Now part of Solaris history</strong>
        <p>This submission has joined the contest archive. Anniversary confetti has been kept away from the actual controls, mercifully.</p>
      </div>
    </aside>
  );
}
