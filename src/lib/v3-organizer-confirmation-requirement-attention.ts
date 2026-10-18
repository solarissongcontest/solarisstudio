import type { ConfirmationRequirement } from "@/integrations/confirmations/admin";

export type ConfirmationRequirementAttentionSummary = {
  needsAttention: ConfirmationRequirement[];
  satisfied: ConfirmationRequirement[];
  waived: ConfirmationRequirement[];
  invalidated: ConfirmationRequirement[];
  totalEffective: number;
  resolvedEffective: number;
};

export function summarizeConfirmationRequirementAttention(
  requirements: readonly ConfirmationRequirement[],
): ConfirmationRequirementAttentionSummary {
  const needsAttention: ConfirmationRequirement[] = [];
  const satisfied: ConfirmationRequirement[] = [];
  const waived: ConfirmationRequirement[] = [];
  const invalidated: ConfirmationRequirement[] = [];

  for (const requirement of requirements) {
    switch (requirement.status) {
      case "required":
        needsAttention.push(requirement);
        break;
      case "satisfied":
        satisfied.push(requirement);
        break;
      case "waived":
        waived.push(requirement);
        break;
      case "invalidated":
        invalidated.push(requirement);
        break;
    }
  }

  const byCountry = (left: ConfirmationRequirement, right: ConfirmationRequirement) =>
    left.countryName.localeCompare(right.countryName, undefined, { sensitivity: "base" }) ||
    left.generation - right.generation;

  needsAttention.sort(byCountry);
  satisfied.sort(byCountry);
  waived.sort(byCountry);
  invalidated.sort(byCountry);

  return {
    needsAttention,
    satisfied,
    waived,
    invalidated,
    totalEffective: needsAttention.length + satisfied.length + waived.length,
    resolvedEffective: satisfied.length + waived.length,
  };
}
