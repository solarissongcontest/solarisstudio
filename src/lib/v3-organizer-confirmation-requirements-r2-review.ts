import type { ConfirmationRequirement } from "@/integrations/confirmations/admin";

export type RequirementActionReview = {
  actorId: string;
  editionId: string;
  requirement: ConfirmationRequirement;
};

export type RequirementReviewDependencies = {
  isCurrentScope: () => boolean;
  getActorId: () => Promise<string | null>;
  verifyRead: (editionId: string) => Promise<boolean>;
  loadRequirements: (editionId: string) => Promise<readonly ConfirmationRequirement[]>;
};

const changed = "Confirmation requirement changed during review. No command was submitted. Reload this edition and review the requirement again.";
const actorChanged = "Organizer identity changed during review. No command was submitted.";
const scopeChanged = "Organizer review context changed during verification. No command was submitted.";

/**
 * Verify the exact actor, edition and reviewed requirement before R2 submission.
 * This preflight is NOT an atomic backend CAS. The authoritative command must
 * still check permissions and current requirement state under a database lock.
 */
export async function verifyFreshConfirmationRequirementReview(
  review: RequirementActionReview,
  deps: RequirementReviewDependencies,
): Promise<void> {
  if (!review.actorId || !review.editionId || review.requirement.editionId !== review.editionId) {
    throw new Error(changed);
  }
  if (!deps.isCurrentScope()) throw new Error(scopeChanged);
  if (await deps.getActorId() !== review.actorId) throw new Error(actorChanged);
  if (!deps.isCurrentScope()) throw new Error(scopeChanged);

  if (await deps.verifyRead(review.editionId) !== true) {
    throw new Error("Confirmation read authorization changed. No command was submitted.");
  }
  if (!deps.isCurrentScope()) throw new Error(scopeChanged);
  const candidates = await deps.loadRequirements(review.editionId);
  if (!deps.isCurrentScope()) throw new Error(scopeChanged);
  if (!Array.isArray(candidates)) throw new Error(changed);
  const matching = candidates.filter((row) => row.id === review.requirement.id);
  if (matching.length !== 1) throw new Error(changed);

  const current = matching[0];
  if (
    current.editionId !== review.editionId ||
    current.countryId !== review.requirement.countryId ||
    current.generation !== review.requirement.generation ||
    current.status !== review.requirement.status ||
    current.reason !== review.requirement.reason ||
    current.updatedAt !== review.requirement.updatedAt
  ) {
    throw new Error(changed);
  }

  if (await deps.getActorId() !== review.actorId) throw new Error(actorChanged);
  if (!deps.isCurrentScope()) throw new Error(scopeChanged);
}
