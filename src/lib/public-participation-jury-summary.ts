/**
 * Public-only projection of the canonical country jury context RPC.
 * An unreadable response is unknown, never proof that no ballot exists.
 * This module does not grant eligibility or authorize voting.
 */

export type VotingRoundSummary = {
  id: string;
  name: string;
  opensAt: string | null;
  closesAt: string | null;
};

export type JurySummary = {
  signedIn: boolean;
  restriction: "country_account_required" | "account_suspended" | null;
  openRound: VotingRoundSummary | null;
  completedOpenRound: VotingRoundSummary | null;
};

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

function asOptionalTimestamp(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("Jury voting schedule could not be verified.");
  }
  return value;
}

export function projectJurySummary(input: unknown): Omit<JurySummary, "signedIn"> {
  const context = asRecord(input);
  if (!context) throw new Error("Jury voting status could not be verified.");

  if (context.ok !== true) {
    if (context.ok === false &&
        (context.error === "country_account_required" || context.error === "account_suspended")) {
      return {
        restriction: context.error,
        openRound: null,
        completedOpenRound: null,
      };
    }
    throw new Error("Jury voting status could not be verified.");
  }

  if (!Array.isArray(context.rounds)) {
    throw new Error("Jury voting rounds could not be verified.");
  }

  let openRound: VotingRoundSummary | null = null;
  let completedOpenRound: VotingRoundSummary | null = null;
  for (const value of context.rounds) {
    const round = asRecord(value);
    if (
      !round ||
      typeof round.status !== "string" ||
      typeof round.eligible !== "boolean" ||
      typeof round.already_submitted !== "boolean"
    ) {
      throw new Error("Jury voting rounds could not be verified.");
    }

    if (round.status !== "open" || !round.eligible) continue;
    if (typeof round.show_id !== "string" || !round.show_id) {
      throw new Error("Jury voting show identity could not be verified.");
    }

    const summary: VotingRoundSummary = {
      id: round.show_id,
      name: typeof round.show_name === "string" && round.show_name.trim()
        ? round.show_name
        : "Jury voting",
      opensAt: asOptionalTimestamp(round.opened_at ?? round.opens_at),
      closesAt: asOptionalTimestamp(round.closed_at ?? round.closes_at),
    };

    if (round.already_submitted) {
      completedOpenRound ??= summary;
    } else {
      openRound ??= summary;
    }
  }

  return {
    restriction: null,
    openRound,
    completedOpenRound,
  };
}
