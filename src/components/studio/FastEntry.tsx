import { lazy, Suspense } from "react";

import type {
  Country,
  JuryVote,
  Televote,
  VoterOption,
} from "@/lib/data";
import type { VotingConfig } from "@/lib/voting";

const LazyFastJuryEntry = lazy(() =>
  import("./FastEntryImpl").then((module) => ({
    default: module.FastJuryEntry,
  })),
);

const LazyTelevoteEntry = lazy(() =>
  import("./FastEntryImpl").then((module) => ({
    default: module.TelevoteEntry,
  })),
);

function VoteEntryFallback() {
  return (
    <div className="rounded-2xl border border-border bg-surface/35 p-5 text-sm text-muted-foreground">
      Loading vote entry…
    </div>
  );
}

export function FastJuryEntry(props: {
  voters: VoterOption[];
  receivers: Country[];
  voting: VotingConfig;
  votes: JuryVote[];
  activeVoter: string;
  onVoterChange: (key: string) => void;
  onAssign: (voterKey: string, receiver: string, points: number) => void;
  onClear: (voterKey: string, points: number) => void;
  didNotVoteVoterKeys?: ReadonlySet<string>;
  onDidNotVoteChange?: (voterKey: string, didNotVote: boolean) => void;
}) {
  return (
    <Suspense fallback={<VoteEntryFallback />}>
      <LazyFastJuryEntry {...props} />
    </Suspense>
  );
}

export function TelevoteEntry(props: {
  countries: Country[];
  order: string[];
  votes: Televote[];
  onSet: (countryId: string, points: number) => void;
}) {
  return (
    <Suspense fallback={<VoteEntryFallback />}>
      <LazyTelevoteEntry {...props} />
    </Suspense>
  );
}
