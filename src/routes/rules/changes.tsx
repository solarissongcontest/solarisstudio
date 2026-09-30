import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, CalendarClock, FileClock } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { rulebookReleaseAnchor } from "@/lib/public-library-governance";
import {
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
    <AppShell>
      <div className="mx-auto max-w-4xl pb-20">
        <header className="border-b border-border/65 pb-5">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-primary/80">
            Rules
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">
            Rule changes & history
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Every published version stays visible. Each change records what moved, when it became effective and why TSBC changed it.
          </p>
        </header>

        {history.isLoading ? <LoadingState /> : null}
        {history.isError ? <ErrorState /> : null}
        {!history.isLoading && !history.isError && releases.length === 0 ? <EmptyState /> : null}

        {releases.length ? (
          <ol className="mt-6 border-l border-border/70 pl-5">
            {releases.map((release) => (
              <li key={release.id ?? release.version} className="relative pb-9 last:pb-0">
                <span
                  className={
                    release.is_current
                      ? "absolute -left-[1.55rem] top-1.5 size-3 rounded-full border-2 border-background bg-emerald-300"
                      : "absolute -left-[1.48rem] top-1.5 size-2.5 rounded-full border-2 border-background bg-muted-foreground"
                  }
                />
                <ReleaseSection release={release} />
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </AppShell>
  );
}

function ReleaseSection({ release }: { release: RulebookRelease }) {
  const changes = release.changes ?? [];
  return (
    <article id={rulebookReleaseAnchor(release.version)} className="scroll-mt-24">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-black text-primary">v{release.version}</span>
        {release.is_current ? (
          <span className="text-[11px] font-black uppercase tracking-[0.1em] text-emerald-200">
            Current
          </span>
        ) : null}
        <span className="text-xs text-muted-foreground">
          Effective {formatDate(release.effective_from ?? release.published_at)}
        </span>
      </div>

      <h2 className="mt-2 text-xl font-bold">{release.title}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{release.summary}</p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{changes.length} {changes.length === 1 ? "recorded change" : "recorded changes"}</span>
        {release.base_version ? <span>Based on v{release.base_version}</span> : null}
      </div>

      {changes.length ? (
        <div className="mt-4 divide-y divide-border/60 border-y border-border/60">
          {changes.map((change) => (
            <ChangeRow key={change.id ?? release.version + "-" + change.rule_id} change={change} />
          ))}
        </div>
      ) : (
        <p className="mt-4 border-y border-border/60 py-4 text-xs text-muted-foreground">
          No rule-by-rule change record is available for this release.
        </p>
      )}
    </article>
  );
}

function ChangeRow({ change }: { change: RulebookChange }) {
  const beforeTitle = change.before_snapshot?.title;
  const afterTitle = change.after_snapshot?.title;
  const afterSummary = change.after_snapshot?.summary;

  return (
    <div className="py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/rules/$ruleId"
          params={{ ruleId: change.rule_id }}
          className="font-mono text-xs font-black text-primary"
        >
          Rule {change.rule_id}
        </Link>
        <span className="text-[11px] font-semibold capitalize text-muted-foreground">
          {change.change_kind}
        </span>
      </div>
      <h3 className="mt-1 text-sm font-bold">
        {afterTitle ?? beforeTitle ?? "Rule " + change.rule_id}
      </h3>
      {beforeTitle && afterTitle && beforeTitle !== afterTitle ? (
        <p className="mt-1 text-xs text-muted-foreground">Previously: {beforeTitle}</p>
      ) : null}
      {afterSummary ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{afterSummary}</p>
      ) : null}
      <div className="mt-3 border-l-2 border-amber-300/35 pl-3">
        <p className="text-xs font-black uppercase tracking-[0.1em] text-amber-100/80">Reason</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{change.rationale}</p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mt-6 flex items-center gap-2 border-y border-border/60 py-5 text-sm text-muted-foreground">
      <CalendarClock className="size-4" /> Loading rulebook history…
    </div>
  );
}

function ErrorState() {
  return (
    <div className="mt-6 border-l-2 border-rose-300/45 px-4 py-2">
      <p className="text-sm font-semibold">Rulebook history is temporarily unavailable.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        The current rulebook is still available.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-6 border-y border-border/60 py-7 text-center">
      <FileClock className="mx-auto size-6 text-primary" />
      <p className="mt-2 text-sm font-semibold">No published history yet</p>
      <Link to="/rules" className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-primary">
        <BookOpen className="size-4" /> Open current rules
      </Link>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}
