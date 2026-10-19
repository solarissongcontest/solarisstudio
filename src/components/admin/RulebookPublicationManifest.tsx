import type { RulebookChange, RulebookRelease, RuleSnapshot } from "@/lib/rules-governance";

export function RulebookPublicationManifest({ release }: { release: RulebookRelease }) {
  const changes = release.changes ?? [];

  return (
    <div
      data-v3-organizer-rulebook-publication-manifest
      className="mt-3 rounded-xl border border-amber-100/15 bg-black/10 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-100">
          Exact release manifest
        </p>
        <span className="font-mono text-[9px] text-amber-100/65">
          v{release.version} · {changes.length} change{changes.length === 1 ? "" : "s"}
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-4 text-amber-50/65">
        Review the exact before/after wording and rationale that this draft currently contains before making it the official rulebook.
      </p>

      <div className="mt-3 space-y-2">
        {changes.map((change) => (
          <PublicationManifestChange key={change.id ?? `${change.rule_id}:${change.change_kind}`} change={change} />
        ))}
      </div>

      <p className="mt-3 text-[10px] leading-4 text-amber-50/65">
        The current legacy publish authority applies this draft immediately after confirmation. Canonical manifest-bound preflight, stale-state protection, idempotency and receipt evidence remain tracked in System #953.
      </p>
    </div>
  );
}

function PublicationManifestChange({ change }: { change: RulebookChange }) {
  return (
    <details className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-3" open>
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[10px] font-black text-sky-100">Rule {change.rule_id}</span>
          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-muted-foreground">
            {change.change_kind}
          </span>
        </div>
        <p className="mt-1 text-xs font-semibold text-foreground">
          {change.after_snapshot?.title ?? change.before_snapshot?.title ?? "Rule change"}
        </p>
      </summary>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <SnapshotReview label="Before" snapshot={change.before_snapshot} />
        <SnapshotReview label="After" snapshot={change.after_snapshot} />
      </div>

      <div className="mt-3 rounded-lg border border-white/[0.07] bg-black/10 p-2.5">
        <p className="text-[8px] font-black uppercase tracking-[0.1em] text-muted-foreground">Publication rationale</p>
        <p className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-slate-200/80">{change.rationale}</p>
      </div>
    </details>
  );
}

function SnapshotReview({ label, snapshot }: { label: "Before" | "After"; snapshot: RuleSnapshot | null }) {
  if (!snapshot) {
    return (
      <div className="rounded-lg border border-dashed border-white/[0.08] p-3">
        <p className="text-[8px] font-black uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        <p className="mt-2 text-[10px] text-muted-foreground">No rule snapshot in this side of the change.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/10 p-3">
      <p className="text-[8px] font-black uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xs font-semibold text-foreground">{snapshot.title ?? "Untitled rule"}</p>
      {snapshot.summary ? <p className="mt-1 text-[10px] font-semibold leading-4 text-sky-50/80">{snapshot.summary}</p> : null}
      {snapshot.body?.length ? (
        <div className="mt-2 space-y-1.5 text-[10px] leading-4 text-muted-foreground">
          {snapshot.body.map((paragraph, index) => <p key={`${label}-${index}`}>{paragraph}</p>)}
        </div>
      ) : null}
      {snapshot.important ? (
        <div className="mt-2 rounded-md border border-amber-200/10 bg-amber-200/[0.035] p-2 text-[9px] leading-4 text-amber-50/75">
          {snapshot.important}
        </div>
      ) : null}
    </div>
  );
}
