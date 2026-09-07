import { useEffect, useState } from "react";

import {
  CONFIRMATION_SUBMITTED_EVENT,
  TELEVOTE_SUBMITTED_EVENT,
} from "@/lib/submission-receipts";

export function AnniversarySubmissionMoment() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timeout: number | null = null;
    const show = (next: string) => {
      setMessage(next);
      if (timeout != null) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setMessage(null), 5200);
    };
    const confirmation = () => show("Your confirmation is now part of Solaris history. ✦");
    const televote = () => show("Your vote is now part of Solaris history. ✦");

    window.addEventListener(CONFIRMATION_SUBMITTED_EVENT, confirmation);
    window.addEventListener(TELEVOTE_SUBMITTED_EVENT, televote);
    return () => {
      window.removeEventListener(CONFIRMATION_SUBMITTED_EVENT, confirmation);
      window.removeEventListener(TELEVOTE_SUBMITTED_EVENT, televote);
      if (timeout != null) window.clearTimeout(timeout);
    };
  }, []);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 left-1/2 z-[120] w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl border border-amber-200/25 bg-[#081026]/95 px-4 py-3 text-center shadow-2xl backdrop-blur-xl lg:bottom-5"
    >
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-200">SSC Anniversary</p>
      <p className="mt-1 text-sm font-semibold text-white">{message}</p>
    </div>
  );
}
