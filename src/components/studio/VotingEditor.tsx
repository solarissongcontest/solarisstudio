import { lazy, Suspense } from "react";

import type { VotingConfig } from "@/lib/voting";

const LazyVotingEditor = lazy(() =>
  import("./VotingEditorImpl").then((module) => ({
    default: module.VotingEditor,
  })),
);

export function VotingEditor({
  voting,
  onChange,
}: {
  voting: VotingConfig;
  onChange: (next: VotingConfig) => void;
}) {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-border bg-surface/35 p-5 text-sm text-muted-foreground">
          Loading voting editor…
        </div>
      }
    >
      <LazyVotingEditor voting={voting} onChange={onChange} />
    </Suspense>
  );
}
