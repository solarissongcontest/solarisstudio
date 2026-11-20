import { useState } from "react";
import { Share2 } from "lucide-react";

/** Ordinary-web counterpart of the installed Story reader's share action. */
export function PublicShareStoryButton({ title }: { title: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function shareStory() {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    // Published Story canonical paths are stable. Exclude transient search,
    // local filters, fragments and other browsing state from shared links.
    const url = new URL(window.location.pathname, window.location.origin).toString();
    setMessage(null);

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
        setMessage("Story shared.");
        return;
      }
    } catch (error) {
      if ((error as { name?: string } | null)?.name === "AbortError") return;
      // A platform share failure may still allow a safe clipboard fallback.
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setMessage("Story link copied.");
        return;
      }
    } catch {
      // Continue to a truthful browser-native manual option.
    }
    setMessage("Copy the address from your browser to share this story.");
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void shareStory()}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Share2 size={17} aria-hidden="true" />
        Share story
      </button>
      {message ? (
        <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {message}
        </span>
      ) : null}
    </div>
  );
}
