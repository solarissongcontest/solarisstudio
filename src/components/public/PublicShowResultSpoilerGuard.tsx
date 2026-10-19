import { Link } from "@tanstack/react-router";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";

/**
 * Fail-closed presentation for a published Show whose result is protected by
 * the viewer's spoiler preference. Published result data may already exist in
 * client caches, but none of it is rendered through this branch until the
 * viewer deliberately reveals this specific Show.
 */
export function PublicShowResultSpoilerGuard({
  showName,
  showKind,
  onReveal,
}: {
  showName: string;
  showKind: string;
  onReveal: () => void;
}) {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl py-8" data-public-show-spoilers="protected">
        <PageHeader
          eyebrow={showKind.replace("-", " ")}
          title={showName}
          description="Published result available. Spoiler-free mode is hiding the outcome."
        />
        <Panel>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
            Spoiler-free mode
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold">Show result hidden</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Winner, rankings, points, qualification outcomes, result stories and detailed voting stay hidden until you deliberately reveal this published Show.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onReveal}
              className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Reveal show result
            </button>
            <Link
              to="/editions"
              className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold"
            >
              Explore editions
            </Link>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
