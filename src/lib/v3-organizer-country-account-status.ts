import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  applyCountryAccountStatusV3,
  createCountryAccountStatusOperationIdentity,
  type CountryAccountStatusOperationIdentity,
} from "@/lib/v3-country-account-status";

export type OrganizerCountryAccountStatusInput = {
  userId: string;
  countryId: string;
  currentUpdatedAt: string;
  targetStatus: "active" | "suspended";
  reason?: string | null;
};

type PendingCountryAccountStatusIdentity = {
  userId: string;
  countryId: string;
  targetStatus: OrganizerCountryAccountStatusInput["targetStatus"];
  operationIdentity: CountryAccountStatusOperationIdentity;
};

const pendingIdentityByFingerprint = new Map<string, PendingCountryAccountStatusIdentity>();
const pendingFingerprintByOperation = new Map<string, string>();

function normalizedCountryAccountStatusInput(input: OrganizerCountryAccountStatusInput) {
  return {
    userId: input.userId,
    countryId: input.countryId,
    currentUpdatedAt: input.currentUpdatedAt,
    targetStatus: input.targetStatus,
    reason: input.targetStatus === "suspended" ? input.reason?.trim() || null : null,
  };
}

function countryAccountStatusFingerprint(input: OrganizerCountryAccountStatusInput) {
  return JSON.stringify(normalizedCountryAccountStatusInput(input));
}

function rememberCountryAccountStatusIdentity(
  fingerprint: string,
  pending: PendingCountryAccountStatusIdentity,
) {
  for (const [existingFingerprint, existing] of pendingIdentityByFingerprint.entries()) {
    if (
      existing.userId === pending.userId &&
      existing.countryId === pending.countryId &&
      existing.targetStatus === pending.targetStatus &&
      existingFingerprint !== fingerprint
    ) {
      pendingIdentityByFingerprint.delete(existingFingerprint);
      pendingFingerprintByOperation.delete(existing.operationIdentity.operationId);
    }
  }

  pendingIdentityByFingerprint.set(fingerprint, pending);
  pendingFingerprintByOperation.set(pending.operationIdentity.operationId, fingerprint);
}

function forgetCountryAccountStatusIdentity(operationId: string) {
  const fingerprint = pendingFingerprintByOperation.get(operationId);
  if (!fingerprint) return;
  pendingFingerprintByOperation.delete(operationId);
  pendingIdentityByFingerprint.delete(fingerprint);
}

/**
 * Freeze one operation identity for the exact reviewed account transition.
 * If transport and the bounded reconciliation lookup both fail, reopening and
 * retrying the same reviewed semantics reuses the original operation instead of
 * allocating a second official suspension/restoration command.
 */
export function prepareOrganizerCountryAccountStatusOperationIdentity(
  input: OrganizerCountryAccountStatusInput,
): CountryAccountStatusOperationIdentity {
  const fingerprint = countryAccountStatusFingerprint(input);
  const pending = pendingIdentityByFingerprint.get(fingerprint);
  if (pending) return pending.operationIdentity;

  const operationIdentity = createCountryAccountStatusOperationIdentity();
  rememberCountryAccountStatusIdentity(fingerprint, {
    userId: input.userId,
    countryId: input.countryId,
    targetStatus: input.targetStatus,
    operationIdentity,
  });
  return operationIdentity;
}

/**
 * Organizer consumer for the canonical V3 country-account status command.
 * The reviewed country + account revision are mandatory: there is deliberately
 * no fallback to the legacy user-only mutation. An unresolved reviewed action
 * retains the same operation identity until authoritative settlement.
 */
export function useAdminSetCountryAccountStatusV3() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: OrganizerCountryAccountStatusInput) => {
      const normalized = normalizedCountryAccountStatusInput(input);
      const operationIdentity = prepareOrganizerCountryAccountStatusOperationIdentity(input);
      const receipt = await applyCountryAccountStatusV3({
        ...normalized,
        operationIdentity,
      });
      forgetCountryAccountStatusIdentity(operationIdentity.operationId);
      return receipt;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-country-accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["my-country-account"] }),
      ]);
    },
  });
}
