import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import {
  loadPublicResultSnapshots,
  type PublicResultSnapshotClient,
} from "@/lib/v3-public-result-snapshots";

/** Exact-show Public read: unlike archive selection this never substitutes a
 * different final when a nominated semi-final/private show has no publication. */
export async function loadV3PublicScoreboard(
  showId: string,
  client: PublicResultSnapshotClient = createConfirmationPublicRuntimeClient() as unknown as PublicResultSnapshotClient,
) {
  const snapshots = await loadPublicResultSnapshots(client, [showId]);
  return snapshots.get(showId) ?? null;
}
