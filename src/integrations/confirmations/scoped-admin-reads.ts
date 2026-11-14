import type { ConfirmationRecoveryCode } from "@/integrations/confirmations/admin";
import { confirmationsSupabase } from "@/integrations/confirmations/client";

export type ConfirmationScopedPage<T> = {
  edition_id: string;
  items: T[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  state_version?: string;
  server_time: string;
};

function requireEditionId(editionId: string) {
  const value = editionId.trim();
  if (!value) throw new Error("An explicit Organizer edition is required.");
  return value;
}

function parseScopedPage<T>(
  data: unknown,
  expectedEditionId: string,
  label: string,
): ConfirmationScopedPage<T> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${label} returned an invalid scoped projection.`);
  }

  const page = data as Partial<ConfirmationScopedPage<T>>;
  if (page.edition_id !== expectedEditionId || !Array.isArray(page.items)) {
    throw new Error(`${label} returned data for a different Organizer edition.`);
  }
  if (
    !Number.isSafeInteger(page.total) || page.total < 0 ||
    !Number.isSafeInteger(page.limit) || page.limit < 1 || page.limit > 200 ||
    !Number.isSafeInteger(page.offset) || page.offset < 0 || page.offset > 10000 ||
    typeof page.total !== "number" ||
    typeof page.limit !== "number" ||
    typeof page.offset !== "number" ||
    typeof page.has_more !== "boolean" ||
    typeof page.server_time !== "string"
  ) {
    throw new Error(`${label} returned incomplete projection metadata.`);
  }

  if (page.items.length > page.limit) {
    throw new Error(`${label} returned an oversized page.`);
  }
  for (const item of page.items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${label} included an invalid row.`);
    }
    const row = item as Record<string, unknown>;
    const nestedEdition = row.editions as { id?: unknown } | undefined;
    const nestedRound = row.submission_rounds as { edition_id?: unknown } | undefined;
    if (
      (row.edition_id !== undefined && row.edition_id !== expectedEditionId) ||
      (nestedEdition !== undefined && nestedEdition?.id !== expectedEditionId) ||
      (nestedRound !== undefined && nestedRound?.edition_id !== expectedEditionId)
    ) {
      throw new Error(`${label} included a row outside the selected edition.`);
    }
    if (label === "Confirmation responses" &&
        ["recovery_code", "ip_history", "tokens", "token", "ip_address"].some((key) => key in row)) {
      throw new Error("Confirmation response list unexpectedly contained private recovery or technical data.");
    }
  }
  return page as ConfirmationScopedPage<T>;
}

export async function loadConfirmationResponsesForEdition<T>(
  editionId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<ConfirmationScopedPage<T>> {
  const exactEditionId = requireEditionId(editionId);
  const { data, error } = await confirmationsSupabase.rpc(
    "admin_confirmation_responses_for_edition",
    {
      _edition_id: exactEditionId,
      _limit: options.limit ?? 100,
      _offset: options.offset ?? 0,
    },
  );
  if (error) throw error;
  return parseScopedPage<T>(data, exactEditionId, "Confirmation responses");
}

export async function loadConfirmationResponseForEdition<T>(
  editionId: string,
  submissionId: string,
): Promise<T> {
  const exactEditionId = requireEditionId(editionId);
  if (!submissionId.trim()) throw new Error("A Confirmation submission is required.");

  const { data, error } = await confirmationsSupabase.rpc(
    "admin_confirmation_response_for_edition",
    {
      _edition_id: exactEditionId,
      _submission_id: submissionId,
    },
  );
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Confirmation response returned an invalid scoped projection.");
  }

  const returnedEditionId = (data as { edition?: { id?: unknown } }).edition?.id;
  const returnedSubmissionId = (data as { id?: unknown }).id;
  if (returnedEditionId !== exactEditionId || returnedSubmissionId !== submissionId) {
    throw new Error("Confirmation response changed Organizer edition while loading.");
  }
  return data as T;
}

export async function loadConfirmationTechnicalForEdition<T>(
  editionId: string,
  submissionId: string,
): Promise<T> {
  const exactEditionId = requireEditionId(editionId);
  if (!submissionId.trim()) throw new Error("A Confirmation submission is required.");

  const { data, error } = await confirmationsSupabase.rpc(
    "admin_confirmation_technical_for_edition",
    {
      _edition_id: exactEditionId,
      _submission_id: submissionId,
    },
  );
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Confirmation technical data returned an invalid scoped projection.");
  }
  if ((data as { edition_id?: unknown; submission_id?: unknown }).edition_id !== exactEditionId ||
      (data as { submission_id?: unknown }).submission_id !== submissionId) {
    throw new Error("Confirmation technical data returned a different Organizer edition.");
  }
  return data as T;
}

export async function loadConfirmationRecoveryCodesForEdition(
  editionId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<ConfirmationScopedPage<ConfirmationRecoveryCode>> {
  const exactEditionId = requireEditionId(editionId);
  const { data, error } = await confirmationsSupabase.rpc(
    "admin_confirmation_recovery_codes_for_edition",
    {
      _edition_id: exactEditionId,
      _limit: options.limit ?? 100,
      _offset: options.offset ?? 0,
    },
  );
  if (error) throw error;
  return parseScopedPage<ConfirmationRecoveryCode>(
    data,
    exactEditionId,
    "Confirmation recovery access",
  );
}
