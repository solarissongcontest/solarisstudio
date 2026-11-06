import { V3Screen, V3ScreenHeader, V3StatusChip, V3Surface } from "./V3Foundation";

export function V3AnalysisRevealScreen({
  replay,
  onReveal,
}: {
  replay: boolean;
  onReveal: () => void;
}) {
  return (
    <V3Screen>
      <V3ScreenHeader
        kicker={replay ? "Broadcast Intelligence" : "What-if analytics"}
        title={replay ? "Replay the voting" : "Result Lab"}
        description={
          replay
            ? "Explore an officially published voting replay."
            : "Explore hypothetical scenarios from officially published results."
        }
        editorial
      />
      <V3Surface
        level="raised"
        className="p-5"
        data-v3-result-lab-spoiler-protected={!replay ? "" : undefined}
        data-v3-broadcast-spoiler-protected={replay ? "" : undefined}
      >
        <V3StatusChip tone="warning">Spoiler-free</V3StatusChip>
        <h2 className="mt-4 text-xl font-bold">
          {replay ? "Voting replay spoilers are hidden" : "Result Lab spoilers are hidden"}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
          {replay
            ? "This replay reveals published points, placements and the winner."
            : "Simulations reveal official placements and a hypothetical winner."}
          {" "}Your spoiler-free setting stays on until you choose to reveal this show.
        </p>
        <button
          type="button"
          onClick={onReveal}
          className="mt-4 min-h-11 rounded-xl bg-[var(--v3-accent)] px-4 text-sm font-semibold text-[var(--v3-bg-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
        >
          {replay ? "Reveal this replay" : "Reveal this simulation"}
        </button>
        <p className="mt-3 text-xs leading-5 text-white/42">
          Revealing this result does not change your spoiler-free preference.
        </p>
      </V3Surface>
    </V3Screen>
  );
}

/** Canonical read failures are not permission to mount broad legacy analytics. */
export function V3AnalysisReadState({
  title,
  loading,
  retrying,
  onRetry,
}: {
  title: "Result Lab" | "Broadcast Intelligence";
  loading: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  const replay = title === "Broadcast Intelligence";
  return (
    <V3Screen>
      <V3Surface className="p-5" data-v3-analysis-authority-unavailable={!loading ? "" : undefined}>
        <h1 className="text-2xl font-bold">{replay ? "Replay the voting" : title}</h1>
        <p role="status" className="mt-2 text-sm text-[var(--v3-text-secondary)]">
          {loading
            ? replay
              ? "Preparing the published result replay…"
              : "Loading official inputs for a new simulation…"
            : "Official published analysis cannot be verified. No results or simulation are shown until the authoritative service is reachable."}
        </p>
        {!loading ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-4 min-h-11 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:opacity-50"
          >
            {retrying ? "Retrying official analysis…" : "Retry official analysis"}
          </button>
        ) : null}
      </V3Surface>
    </V3Screen>
  );
}
