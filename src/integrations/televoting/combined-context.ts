export type CombinedContextSource = {
  source_round_id: string | null;
  enabled: boolean;
};

export type CombinedContextBinding = {
  remote_round_id: string;
  edition_id: string;
  show_id: string | null;
};

export type CombinedContextShow = {
  id: string;
  edition_id: string;
};

export type CombinedPublicationTarget = {
  editionId: string;
  showId: string;
  sourceRoundIds: string[];
};

export function resolveCombinedPublicationTarget(input: {
  sources: CombinedContextSource[];
  bindings: CombinedContextBinding[];
  shows: CombinedContextShow[];
  expectedEditionId?: string;
  expectedShowId?: string;
}): CombinedPublicationTarget {
  const sourceRoundIds = [
    ...new Set(
      input.sources
        .filter((source) => source.enabled && source.source_round_id)
        .map((source) => String(source.source_round_id)),
    ),
  ];

  if (!sourceRoundIds.length) {
    throw new Error("Every published Combined result must include a Solaris-bound source round");
  }

  const bindingByRound = new Map(
    input.bindings.map((binding) => [String(binding.remote_round_id), binding]),
  );
  const targets = sourceRoundIds.map((roundId) => {
    const binding = bindingByRound.get(roundId);
    if (!binding?.show_id) {
      throw new Error(`Combined source round ${roundId} is not bound to a Solaris show`);
    }
    return {
      roundId,
      editionId: String(binding.edition_id),
      showId: String(binding.show_id),
    };
  });

  const targetKeys = new Set(targets.map((target) => `${target.editionId}:${target.showId}`));
  if (targetKeys.size !== 1) {
    throw new Error("Enabled Combined source rounds must resolve to one Solaris edition and show");
  }

  const target = targets[0]!;
  const show = input.shows.find((candidate) => String(candidate.id) === target.showId);
  if (!show || String(show.edition_id) !== target.editionId) {
    throw new Error("Combined source binding does not belong to its canonical Solaris edition");
  }

  if (
    (input.expectedEditionId && input.expectedEditionId !== target.editionId) ||
    (input.expectedShowId && input.expectedShowId !== target.showId)
  ) {
    throw new Error("Combined result does not belong to the requested Solaris edition and show");
  }

  return {
    editionId: target.editionId,
    showId: target.showId,
    sourceRoundIds: targets.map((target) => target.roundId),
  };
}
