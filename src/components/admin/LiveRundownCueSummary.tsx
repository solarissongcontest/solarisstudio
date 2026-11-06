export type LiveRundownCueSummaryProps = {
  current: string | null;
  next: string | null;
};

/**
 * Read-only show-day cue orientation. Labels come from the governed rundown
 * projection; no client timer, draft command, or fabricated broadcast status.
 */
export function LiveRundownCueSummary({ current, next }: LiveRundownCueSummaryProps) {
  if (!current && !next) return null;

  return (
    <div
      role="group"
      aria-label="Verified live rundown cues"
      className="grid gap-3 sm:grid-cols-2"
    >
      <div className="rounded-xl border border-sky-200/10 bg-sky-200/[0.035] p-3">
        <p className="admin-section-label">Now · on air</p>
        <p className="mt-2 text-sm font-semibold text-foreground">
          {current ?? "No cue is on air"}
        </p>
      </div>
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
        <p className="admin-section-label">Next · queued</p>
        <p className="mt-2 text-sm font-semibold text-foreground">
          {next ?? "No next cue is queued"}
        </p>
      </div>
    </div>
  );
}
