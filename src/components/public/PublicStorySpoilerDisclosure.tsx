import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Public Story browsing needs the same deliberate reveal as the installed app.
 * The parent must key this component by the effective spoiler preference so
 * turning protection back on cannot inherit an earlier disclosure.
 *
 * This controls display only. Publication safety remains the responsibility
 * of the canonical public Story reader, not of this client component.
 */
export function PublicStorySpoilerDisclosure({
  spoilerFree,
  children,
  subject = "published stories",
}: {
  spoilerFree: boolean;
  children: ReactNode;
  subject?: string;
}) {
  const [revealed, setRevealed] = useState(false);

  if (spoilerFree && !revealed) {
    return (
      <section
        data-public-story-spoiler-protected=""
        aria-labelledby="public-story-spoiler-title"
        className="mt-6 max-w-2xl border-y border-border py-8 sm:py-12"
      >
        <EyeOff size={22} aria-hidden="true" className="text-muted-foreground" />
        <h2 id="public-story-spoiler-title" className="mt-3 text-xl font-bold tracking-tight">
          Story details hidden
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">
          Spoiler-free mode is enabled. Titles, story moments and summaries remain
          hidden until you choose to reveal {subject}.
        </p>
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Eye size={17} aria-hidden="true" />
          Reveal {subject}
        </button>
      </section>
    );
  }

  return (
    <>
      {spoilerFree ? (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setRevealed(false)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <EyeOff size={16} aria-hidden="true" />
            Hide story details again
          </button>
        </div>
      ) : null}
      {children}
    </>
  );
}
