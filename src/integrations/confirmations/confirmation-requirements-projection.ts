import type { ConfirmationRequirement } from "@/integrations/confirmations/admin";

const validStatuses = new Set<ConfirmationRequirement["status"]>([
  "required",
  "satisfied",
  "waived",
  "invalidated",
]);

/**
 * Validate the canonical exact-edition read projection before an Organizer
 * screen turns it into "no outstanding obligations". This is read-only
 * defense-in-depth and does not replace the database read capability/RLS.
 *
 * A genuine empty edition is represented by []; null is not an empty edition.
 * Duplicate countries are intentionally preserved for invariant diagnostics.
 */
export function validateConfirmationRequirementsProjection(
  data: unknown,
  editionId: string,
): ConfirmationRequirement[] {
  if (!editionId || !editionId.trim()) {
    throw new Error("An explicit Organizer edition is required for Confirmation requirements.");
  }
  if (!Array.isArray(data)) {
    throw new Error("Confirmation requirements returned an invalid projection. Obligation state is unknown.");
  }

  const seenIds = new Set<string>();
  for (const item of data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Confirmation requirements contained an invalid row. Obligation state is unknown.");
    }

    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== "string" || !row.id.trim() ||
      typeof row.editionId !== "string" || row.editionId !== editionId ||
      typeof row.countryId !== "string" || !row.countryId.trim() ||
      typeof row.countryName !== "string" || !row.countryName.trim() ||
      typeof row.status !== "string" ||
      !validStatuses.has(row.status as ConfirmationRequirement["status"]) ||
      typeof row.generation !== "number" ||
      !Number.isSafeInteger(row.generation) || row.generation < 1 ||
      typeof row.reason !== "string"
    ) {
      throw new Error("Confirmation requirements contained invalid or cross-edition truth. Obligation state is unknown.");
    }

    if (seenIds.has(row.id)) {
      throw new Error("Confirmation requirements contained duplicate requirement IDs. Obligation state is unknown.");
    }
    seenIds.add(row.id);
  }

  return data as ConfirmationRequirement[];
}
