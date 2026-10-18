import { useState } from "react";

import type { V3EditionPageProjection } from "@/lib/v3-edition";
import { V3Surface } from "./V3Foundation";
import { V3EditionHubScreen } from "./V3EditionHubScreen";

function protectEditionProjection(
  projection: V3EditionPageProjection,
): V3EditionPageProjection {
  return {
    ...projection,
    story: projection.story
      ? {
          ...projection.story,
          title: "Published story hidden",
          subtitle: null,
          introduction:
            "Spoiler-free mode is hiding this edition's published story details until you deliberately reveal them.",
          publishedAt: null,
          items: [],
        }
      : null,
    results:
      projection.results.state === "available"
        ? {
            state: "empty",
            showHref: null,
            rows: [],
          }
        : projection.results,
  };
}

/**
 * Presentation boundary for Edition-owned spoiler previews. Publication state
 * remains authoritative in the server projection; this component only withholds
 * story copy and ranked result rows until the viewer deliberately reveals them.
 */
export function V3EditionSpoilerBoundary({
  projection,
  hideSpoilers,
}: {
  projection: V3EditionPageProjection;
  hideSpoilers: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const hasProtectedContent =
    projection.story !== null || projection.results.state === "available";
  const protectedMode = hideSpoilers && !revealed && hasProtectedContent;

  if (!protectedMode) {
    return <V3EditionHubScreen projection={projection} />;
  }

  return (
    <>
      <div className="mx-auto w-full max-w-5xl px-4 pt-5" data-v3-edition-spoilers="protected">
        <V3Surface className="p-5">
          <p className="v3-kicker">Spoiler-free mode</p>
          <h2 className="mt-2 text-lg font-bold tracking-[-0.02em]">
            Edition spoilers are hidden
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
            Published story details and official ranking previews stay hidden until you choose to reveal this edition. Other public edition information remains available.
          </p>
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="mt-4 min-h-11 rounded-xl bg-[var(--v3-accent)] px-4 font-semibold text-[var(--v3-bg-base)]"
          >
            Reveal edition spoilers
          </button>
        </V3Surface>
      </div>
      <V3EditionHubScreen projection={protectEditionProjection(projection)} />
    </>
  );
}
