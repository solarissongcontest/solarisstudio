import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, CalendarClock, FileClock, History, Sparkles } from "lucide-react";

import { RulesRouteShell } from "@/components/rules/RulesRouteShell";
import {
  GovernanceDepthLayout,
  SolarisDepthEyebrow,
  SolarisDepthSurface,
} from "@/components/SolarisDepth";
import { rulebookReleaseAnchor } from "@/lib/public-library-governance";
import {
  BUNDLED_RULEBOOK_META,
  useRulebookReleaseHistory,
  type RulebookChange,
  type RulebookRelease,
} from "@/lib/rules-governance";

export const Route = createFileRoute("/rules/changes")({
  head: () => ({
    meta: [
      { title: "Rulebook History — Solaris Song Contest" },
      {
        name: "description",
        content: "Published SSC rulebook versions, effective dates and reasons for each change.",
      },
    ],
  }),
  component: RulebookChangesPage,
});

function RulebookChangesPage() {
  const history = useRulebookReleaseHistory();
  const releases = history.data ?? [];

  return (
    <RulesRouteShell phaseLabel="Rule history" resolvingTitle="Opening Rule history">
      <GovernanceDepthLayout tone="rules" context="rules" className="mx-auto max-w-4xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <SolarisDepthSurface variant="action">
          <header className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div>
              <SolarisDepthEyebrow tone="primary">Rules history</SolarisDepthEyebrow>
              <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
                Rule changes & history
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Published versions remain traceable. Each recorded change shows what moved, when it took effect and why TSBC changed it.
              </p>
            </div>
            <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/10 px-3 text-xs text-muted-foreground">
              <History className="size-4 text-primary" aria-hidden="true" />
              Bundled current · v{BUNDLED_RULEBOOK_META.version}
            </span>
          </header>
        </SolarisDepthSurface>

        {history.isLoading ? <LoadingState /> : null}
        {history.isError ? <ErrorState /> : null}
        {!history.isLoading && !history.isError && releases.length === 0 ? <EmptyState /> : null}

        {releases.length ? (
          <ol className="mt-5 grid gap-4">
            {releases.map((release, index) => (
              <li key={release.id ?? release.version}>
                <ReleaseSection release={release} newest={index === 0} />
              </li>
            ))}
          </ol>
        ) : null}
      </GovernanceDepthLayout>
    </RulesRouteShell>
  );
}

function ReleaseSection({ release, newest }: { release: RulebookRelease; newest: boolean }) {
  const changes = release.changes ?? [];
  return (
    <article
      id={rulebookReleaseAnchor(release.version)}
      className="scroll-mt-24 overflow-hidden rounded-[1.35rem] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,.025),transparent_38%),rgba(7,18,42,.72)] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid min-h-8 place-items-center rounded-xl border border-primary/15 bg-primary/[0.06] px-2.5 font-mono text-xs font-black text-primary">
          v{release.version}
        </span>
        {release.is_current ? (
          <span className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.05] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-200">
            Current published
          </span>
        ) : newest ? (
          <span className="rounded-full border border-white/[0.08] bg-black/10 px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
            Latest history record
          </span>
        ) : null}
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarClock className="size-3.5" aria-hidden="true" />
          {formatDate(release.effective_from ?? release.published_at)}
        </span>
      </div>

      <h2 className="mt-3 text-lg font-bold sm:text-xl">{release.title}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{release.summary}</p>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-full border border-white/[0.07] bg-black/10 px-2.5 py-1">
          {changes.length} {changes.length === 1 ? "recorded change" : "recorded changes"}
        </span>
        {release.base_version ? (
          <span className="rounded-full border border-white/[0.07] bg-black/10 px-2.5 py-1">
            Based on v{release.base_version}
          </span>
        ) : null}
      </div>

      {changes.length ? (
        <div className="mt-4 grid gap-2">
          {changes.map((change) => (
            <ChangeRow key={change.id ?? release.version + "-" + change.rule_id} change={change} />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-3 text-xs text-muted-foreground">
          No rule-by-rule change record is available for this release.
        </div>
      )}
    </article>
  );
}

function ChangeRow({ change }: { change: RulebookChange }) {
  const beforeTitle = change.before_snapshot?.title;
  const afterTitle = change.after_snapshot?.title;
  const afterSummary = change.after_snapshot?.summary;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/rules/$ruleId"
          params={{ ruleId: change.rule_id }}
          className="font-mono text-xs font-black text-primary"
        >
          Rule {change.rule_id}
        </Link>
        <span className="rounded-full border border-white/[0.07] px-2 py-0.5 text-[10px] font-bold capitalize text-muted-foreground">
          {change.change_kind}
        </span>
      </div>
      <h3 className="mt-2 text-sm font-bold">
        {afterTitle ?? beforeTitle ?? "Rule " + change.rule_id}
      </h3>
      {beforeTitle && afterTitle && beforeTitle !== afterTitle ? (
        <p className="mt-1 text-xs text-muted-foreground">Previously: {beforeTitle}</p>
      ) : null}
      {afterSummary ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{afterSummary}</p>
      ) : null}
      <div className="mt-3 flex gap-2 rounded-lg border border-amber-300/12 bg-amber-300/[0.035] p-2.5">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-amber-200" aria-hidden="true" />
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-100/80">Reason</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{change.rationale}</p>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <SolarisDepthSurface variant="quiet" className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
      <CalendarClock className="size-4 text-primary" /> Loading rulebook history…
    </SolarisDepthSurface>
  );
}

function ErrorState() {
  return (
    <div className="mt-5 rounded-xl border border-rose-300/15 bg-rose-300/[0.045] p-4">
      <p className="text-sm font-semibold">Rulebook history is temporarily unavailable.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        The bundled current rulebook remains available.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <SolarisDepthSurface variant="quiet" className="mt-5 text-center">
      <FileClock className="mx-auto size-6 text-primary" />
      <p className="mt-2 text-sm font-semibold">No published history yet</p>
      <Link to="/rules" className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-primary">
        <BookOpen className="size-4" /> Open current rules
      </Link>
    </SolarisDepthSurface>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Effective date not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}
