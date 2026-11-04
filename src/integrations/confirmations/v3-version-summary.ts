import { confirmationsSupabase } from "@/integrations/confirmations/client";

export type ConfirmationVersionSummary = {
  submission_id: string;
  version_count: number;
  latest_created_at: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAGE = 200;
const MAX_TOTAL = 5_000;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Confirmation history summary response.");
  }
  return value as Record<string, unknown>;
}

/**
 * Read only version counts for submission identities already obtained from the
 * canonical exact-edition Responses V2 projection. The database rechecks every
 * id against the selected edition. No global version feed is downloaded.
 */
export async function loadConfirmationVersionSummariesForEdition(
  editionId: string,
  submissionIds: readonly string[],
): Promise<Map<string, ConfirmationVersionSummary>> {
  if (!UUID.test(editionId)) {
    throw new Error("Select an exact Organizer edition before loading version summaries.");
  }
  if (submissionIds.length > MAX_TOTAL || submissionIds.some((id) => !UUID.test(id))) {
    throw new Error("Invalid bounded Confirmation version summary request.");
  }
  const unique = [...new Set(submissionIds)];
  if (unique.length !== submissionIds.length) {
    throw new Error("Duplicate Confirmation submission identity in canonical response batch.");
  }

  const summaries = new Map<string, ConfirmationVersionSummary>();
  for (let offset = 0; offset < unique.length; offset += MAX_PAGE) {
    const pageIds = unique.slice(offset, offset + MAX_PAGE);
    const { data, error } = await confirmationsSupabase.rpc(
      "admin_confirmation_version_summary_v2",
      { p_edition_id: editionId, p_submission_ids: pageIds },
    );
    if (error) throw error;

    const payload = record(data);
    if (payload.editionId !== editionId || payload.schemaVersion !== 1) {
      throw new Error("Confirmation history summary crossed the selected edition boundary.");
    }
    if (!Array.isArray(payload.rows) || payload.rows.length > pageIds.length) {
      throw new Error("Invalid bounded Confirmation history summary page.");
    }

    const allowed = new Set(pageIds);
    for (const candidate of payload.rows) {
      const row = record(candidate);
      const id = row.submission_id;
      const count = row.version_count;
      const timestamp = row.latest_created_at;
      if (
        typeof id !== "string" ||
        !allowed.has(id) ||
        summaries.has(id) ||
        typeof count !== "number" ||
        !Number.isInteger(count) ||
        count < 1 ||
        (timestamp !== null && (typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp))))
      ) {
        throw new Error("Invalid or cross-edition Confirmation version summary row.");
      }
      summaries.set(id, {
        submission_id: id,
        version_count: count,
        latest_created_at: timestamp,
      });
    }
  }

  return summaries;
}
