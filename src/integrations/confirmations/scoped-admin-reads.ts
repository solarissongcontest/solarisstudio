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
    typeof page.total !== "number" ||
    typeof page.limit !== "number" ||
    typeof page.offset !== "number" ||
    typeof page.has_more !== "boolean" ||
    typeof page.server_time !== "string"
  ) {
    throw new Error(`${label} returned incomplete projection metadata.`);
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
      _limit: options.limit ?? 200,
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
  if (returnedEditionId !== exactEditionId) {
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
  if ((data as { edition_id?: unknown }).edition_id !== exactEditionId) {
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
      _limit: options.limit ?? 200,
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
