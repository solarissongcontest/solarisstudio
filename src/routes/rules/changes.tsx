import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, CalendarClock, FileClock, GitCompareArrows } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { rulebookReleaseAnchor } from "@/lib/public-library-governance";
import { useRulebookReleaseHistory, type RulebookChange, type RulebookRelease } from "@/lib/rules-governance";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rules/changes")({
  head: () => ({
    meta: [
      { title: "Rulebook Changes — Solaris Song Contest" },
      {
        name: "description",
        content:
          "Published Solaris Song Contest rulebook versions, effective dates and rule-by-rule change explanations.",
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
      <div className="mx-auto max-w-6xl pb-20">
        <section className="relative overflow-hidden rounded-[2.25rem] border border-violet-200/15 bg-[#06152d] p-6 shadow-[0_28px_80px_rgba(0,3,24,.35)] sm:p-9">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(147,112,255,.18),transparent_30%),radial-gradient(circle_at_8%_90%,rgba(77,177,255,.13),transparent_32%)]" />
          <div className="relative">
            <Link to="/rules" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.08] px-3 text-xs font-bold text-muted-foreground transition hover:bg-white/[0.04] hover:text-white">
              <ArrowLeft className="size-4" /> Rules Hub
            </Link>
            <p className="mt-8 text-[10px] font-black uppercase tracking-[.22em] text-violet-200/70">TSBC · RULEBOOK GOVERNANCE</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-[-.055em] text-white sm:text-6xl">What changed, when, and why.</h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-200/70 sm:text-base">Published rule changes belong in a visible history rather than disappearing into a mysterious edit. Each release records its effective date and the reason for every changed regulation.</p>
          </div>
        </section>

        {history.isLoading ? <LoadingState /> : null}
        {history.isError ? <ErrorState /> : null}
        {!history.isLoading && !history.isError && releases.length === 0 ? <EmptyState /> : null}

        <div className="mt-6 space-y-5">
          {releases.map((release) => <ReleaseCard key={release.id ?? release.version} release={release} />)}
        </div>
      </div>
    </AppShell>
  );
}

function ReleaseCard({ release }: { release: RulebookRelease }) {
  const changes = release.changes ?? [];
  return (
    <article id={rulebookReleaseAnchor(release.version)} className={cn("scroll-mt-24 overflow-hidden rounded-[1.8rem] border bg-white/[0.025]", release.is_current ? "border-emerald-200/18" : "border-white/[0.08]")}> 
      <header className="grid gap-5 border-b border-white/[0.07] p-5 sm:grid-cols-[1fr_auto] sm:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-violet-200/15 bg-violet-200/[0.07] px-2.5 py-1 font-mono text-[10px] font-black text-violet-100">v{release.version}</span>
            {release.is_current ? <span className="rounded-full border border-emerald-200/15 bg-emerald-200/[0.07] px-2.5 py-1 text-[9px] font-black uppercase tracking-[.1em] text-emerald-100">Current rulebook</span> : null}
          </div>
          <h2 className="mt-3 text-xl font-black tracking-[-.025em] text-white">{release.title}</h2>
          <p className="mt-2 max-w-3xl text-xs leading-6 text-muted-foreground">{release.summary}</p>
        </div>
        <div className="min-w-44 rounded-2xl border border-white/[0.07] bg-black/10 p-4 text-xs text-muted-foreground">
          <p className="flex items-center gap-2"><CalendarClock className="size-3.5 text-sky-200" /> Effective {formatDate(release.effective_from ?? release.published_at)}</p>
          <p className="mt-2 flex items-center gap-2"><GitCompareArrows className="size-3.5 text-violet-200" /> {changes.length} recorded {changes.length === 1 ? "change" : "changes"}</p>
          {release.base_version ? <p className="mt-2">Based on v{release.base_version}</p> : null}
        </div>
      </header>

      {changes.length ? (
        <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-2">
          {changes.map((change) => <ChangeCard key={change.id ?? `${release.version}-${change.rule_id}`} change={change} />)}
        </div>
      ) : (
        <div className="p-6 text-xs text-muted-foreground">This release predates rule-by-rule change recording. Its publication record is still retained.</div>
      )}
    </article>
  );
}

function ChangeCard({ change }: { change: RulebookChange }) {
  const beforeTitle = change.before_snapshot?.title;
  const afterTitle = change.after_snapshot?.title;
  const afterSummary = change.after_snapshot?.summary;
  return (
    <div className="rounded-2xl border border-white/[0.075] bg-black/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/rules/$ruleId" params={{ ruleId: change.rule_id }} className="font-mono text-[10px] font-black text-sky-200 hover:text-white">Rule {change.rule_id}</Link>
        <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[8px] font-black uppercase tracking-[.1em] text-muted-foreground">{change.change_kind}</span>
      </div>
      <h3 className="mt-2 text-sm font-black text-white">{afterTitle ?? beforeTitle ?? `Rule ${change.rule_id}`}</h3>
      {beforeTitle && afterTitle && beforeTitle !== afterTitle ? <p className="mt-1 text-[10px] text-muted-foreground">Previously: {beforeTitle}</p> : null}
      {afterSummary ? <p className="mt-2 text-[11px] leading-5 text-slate-200/72">{afterSummary}</p> : null}
      <div className="mt-3 rounded-xl border border-amber-200/10 bg-amber-200/[0.035] p-3">
        <p className="text-[8px] font-black uppercase tracking-[.12em] text-amber-100/75">Why this changed</p>
        <p className="mt-1 text-[10px] leading-5 text-amber-50/75">{change.rationale}</p>
      </div>
    </div>
  );
}

function LoadingState() {
  return <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center text-sm text-muted-foreground">Loading published rulebook history…</div>;
}

function ErrorState() {
  return <div className="mt-6 rounded-2xl border border-rose-200/15 bg-rose-200/[0.04] p-6"><p className="font-bold text-rose-100">The rulebook history could not be loaded.</p><p className="mt-1 text-xs text-muted-foreground">The current bundled regulations remain available. Apparently even transparency pages are allowed to have database problems.</p></div>;
}

function EmptyState() {
  return <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center"><FileClock className="mx-auto size-7 text-sky-200"/><p className="mt-3 font-bold">No published release history yet</p><p className="mt-1 text-xs text-muted-foreground">The current regulations are still available from the Rules Hub.</p><Link to="/rules" className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-sky-200"><BookOpen className="size-4"/>Open rules</Link></div>;
}

function formatDate(value?: string | null) {
  if (!value) return "not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
