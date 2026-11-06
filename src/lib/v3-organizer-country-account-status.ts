import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  applyCountryAccountStatusV3,
  type CountryAccountStatusOperationIdentity,
} from "@/lib/v3-country-account-status";

export type OrganizerCountryAccountStatusInput = {
  userId: string;
  countryId: string;
  currentUpdatedAt: string;
  targetStatus: "active" | "suspended";
  reason?: string | null;
  operationIdentity: CountryAccountStatusOperationIdentity;
};

/**
 * Organizer consumer for the canonical V3 country-account status command.
 * The reviewed country + account revision + operation identity are mandatory:
 * there is deliberately no fallback to the legacy user-only mutation and no
 * new operation allocation when an unresolved reviewed action is retried.
 */
export function useAdminSetCountryAccountStatusV3() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: OrganizerCountryAccountStatusInput) =>
      applyCountryAccountStatusV3({
        userId: input.userId,
        countryId: input.countryId,
        currentUpdatedAt: input.currentUpdatedAt,
        targetStatus: input.targetStatus,
        reason: input.targetStatus === "suspended" ? input.reason?.trim() || null : null,
        operationIdentity: input.operationIdentity,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-country-accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["my-country-account"] }),
      ]);
    },
  });
}
