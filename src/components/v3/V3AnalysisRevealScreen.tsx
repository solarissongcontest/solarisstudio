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
