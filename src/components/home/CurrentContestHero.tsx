import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { PublicStatus } from "@/components/public/PublicStatus";
import type { PublicContestState } from "@/lib/current-contest-state";

export function CurrentContestHero({
  state,
  compact = false,
}: {
  state: PublicContestState;
  compact?: boolean;
}) {
  return (
    <section className={compact ? "solaris-app-card solaris-app-current-contest relative min-w-0 overflow-hidden" : "relative min-w-0 overflow-hidden rounded-[1.5rem] border border-border/70 bg-surface/70 p-5 sm:p-7"}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-primary/10 blur-3xl"
      />

      <div className={compact ? "relative z-10 flex flex-col gap-4" : "relative z-10 flex min-h-[230px] flex-col justify-between gap-8 sm:min-h-[280px]"}>
        <div>
          <PublicStatus
            status={state.statusKey}
            label={state.statusLabel}
            className="min-h-8 px-3"
          />

          <h2 className={compact ? "mt-3 max-w-4xl text-2xl font-bold leading-tight tracking-[-0.03em]" : "mt-4 max-w-4xl font-display text-3xl font-black leading-[1.02] tracking-[-0.045em] sm:text-5xl"}>
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
