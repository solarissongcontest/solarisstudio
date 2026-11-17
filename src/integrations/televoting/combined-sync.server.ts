import { requireCombinedTelevoteWriteApproval } from "@/integrations/televoting/combined-write-gate.server";

export type CombinedCanonicalSyncOutcome = {
  aggregationId: string;
  status:
    | "synced"
    | "up_to_date"
    | "immutable"
    | "custom"
    | "ambiguous_source";
  editionId?: string;
  showId?: string;
  participantCount?: number;
  message?: string;
};

/**
 * COM-00: Retire the dormant Combined participant synchronizer, including its
 * service-role deletes/inserts/aggregation updates. The owner-deferred
 * database rejects Combined table writes independently of this source guard.
 * Keep the API signature and denial unchanged; a future enablement must
 * introduce a canonical atomic command rather than reviving direct DML.
 */
export async function syncEditableCombinedParticipantsFromSolarisServer(
  aggregationId: string,
): Promise<CombinedCanonicalSyncOutcome> {
  void aggregationId;
  requireCombinedTelevoteWriteApproval();
  throw new Error("Combined Televote mutations are disabled pending canonical authority certification.");
}
