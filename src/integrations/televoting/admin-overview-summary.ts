const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The Organizer endpoint may never select the globally active edition implicitly. */
export function requireTelevotingOverviewEditionId(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Voting overview requires an explicit Organizer edition");
  }
  const id = value.trim();
  if (!UUID.test(id)) {
    throw new Error("Voting overview requires a valid Organizer edition id");
  }
  return id;
}

/**
 * Validate the canonical one-call Organizer voting projection.
 * A missing or malformed privileged readback must never become a believable
 * zero-round / zero-ballot state.
 */
export type TelevotingOverviewSummary = {
  editions: number;
  rounds: number;
  openRounds: number;
  submissions: number;
  blocked: number;
  activeEdition: string | null;
  remoteEditionId: string | null;
  linked: boolean;
};

function count(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Voting overview returned an invalid ${field} count`);
  }
  return value;
}

function optionalNonemptyString(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Voting overview returned an invalid ${field}`);
  }
  return value;
}

export function parseTelevotingOverviewSummary(input: unknown): TelevotingOverviewSummary {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Voting overview returned no valid canonical status");
  }

  const record = input as Record<string, unknown>;
  const editions = count(record, "editions");
  const rounds = count(record, "rounds");
  const openRounds = count(record, "openRounds");
  const submissions = count(record, "submissions");
  const blocked = count(record, "blocked");
  const activeEdition = optionalNonemptyString(record, "activeEdition");
  const remoteEditionId = optionalNonemptyString(record, "remoteEditionId");
  if (typeof record.linked !== "boolean") {
    throw new Error("Voting overview returned an invalid edition link state");
  }
  if (openRounds > rounds) {
    throw new Error("Voting overview returned more open rounds than configured rounds");
  }
  if (record.linked !== Boolean(remoteEditionId)) {
    throw new Error("Voting overview returned inconsistent edition link state");
  }

  return { editions, rounds, openRounds, submissions, blocked, activeEdition, remoteEditionId, linked: record.linked };
}
