import { Link } from "@tanstack/react-router";
import { ArrowRight, Radio, Sparkles, Trophy, Vote } from "lucide-react";

import type { PublicContestState } from "@/lib/current-contest-state";

function StateIcon({ phase }: { phase: PublicContestState["phase"] }) {
  if (phase === "live") return <Radio className="size-4" aria-hidden="true" />;
  if (phase === "voting" || phase === "jury_voting") {
    return <Vote className="size-4" aria-hidden="true" />;
  }
  if (phase === "results_published" || phase === "post_edition") {
    return <Trophy className="size-4" aria-hidden="true" />;
  }
  return <Sparkles className="size-4" aria-hidden="true" />;
}

export function CurrentContestHero({
  state,
}: {
  state: PublicContestState;
}) {
  return (
    <section className="relative min-w-0 overflow-hidden rounded-[1.5rem] border border-border/70 bg-surface/70 p-5 sm:p-7">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative z-10 flex min-h-[230px] flex-col justify-between gap-8 sm:min-h-[280px]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-primary">
            <StateIcon phase={state.phase} />
            {state.statusLabel}
          </span>

          <h2 className="mt-4 max-w-4xl font-display text-3xl font-black leading-[1.02] tracking-[-0.045em] sm:text-5xl">
            {state.headline}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            {state.description}
          </p>
        </div>

        {state.primaryAction ? (
          <div>
            <Link
              to={state.primaryAction.to as any}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground transition-transform hover:translate-x-0.5"
            >
              {state.primaryAction.label}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
