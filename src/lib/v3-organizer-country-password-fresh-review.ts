import type { AdminCountryAccount } from "@/lib/country-account";

export type CountryPasswordReviewScope = {
  actorId: string;
  userId: string;
  countryId: string;
  countryName: string;
  email: string | null;
  status: "active" | "suspended";
  suspensionReason: string | null;
  updatedAt: string;
};

type FreshReviewDependencies = {
  getActorId: () => Promise<string | null>;
  readAccounts: () => Promise<readonly AdminCountryAccount[]>;
};

const actorChanged = "Organizer identity changed. Reopen the account and review the credential change again.";
const accountChanged = "Country account state changed. No password request was submitted. Reload the account and review the change again.";

/**
 * Defense-in-depth UI preflight, not a new password authority. The existing
 * admin-country-password Edge Function must still independently authorize the
 * authenticated actor and target account on every credential mutation.
 */
export async function verifyFreshCountryPasswordReview(
  review: CountryPasswordReviewScope,
  dependencies: FreshReviewDependencies,
): Promise<void> {
  if (!review.actorId || !review.userId || !review.countryId || !review.updatedAt) {
    throw new Error(accountChanged);
  }

  const actorBefore = await dependencies.getActorId();
  if (actorBefore !== review.actorId) throw new Error(actorChanged);

  const accounts = await dependencies.readAccounts();
  if (!Array.isArray(accounts)) throw new Error(accountChanged);

  const ownerMatches = accounts.filter((account) => account.user_id === review.userId);
  const countryMatches = accounts.filter((account) => account.country_id === review.countryId);
  if (
    ownerMatches.length !== 1 ||
    countryMatches.length !== 1 ||
    ownerMatches[0] !== countryMatches[0]
  ) {
    throw new Error(accountChanged);
  }

  const current = ownerMatches[0];
  if (
    current.country_name !== review.countryName ||
    current.email !== review.email ||
    current.status !== review.status ||
    current.suspension_reason !== review.suspensionReason ||
    current.updated_at !== review.updatedAt
  ) {
    throw new Error(accountChanged);
  }

  const actorAfter = await dependencies.getActorId();
  if (actorAfter !== review.actorId) throw new Error(actorChanged);
}
