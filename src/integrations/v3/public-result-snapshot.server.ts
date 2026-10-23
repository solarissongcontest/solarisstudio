import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import {
  parseV3PublishedResultSnapshot,
  type V3PublishedResultSnapshot,
} from "@/lib/v3-public-result-snapshot";

type PublicResultSnapshotClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "unknown error");
  }
  return String(error ?? "unknown error");
}

/**
 * Caller-invariant Public Results authority.
 *
 * The browser nominates only a Show UUID. Publication state, exact immutable
 * Result Version and field-level Jury/Televote visibility are resolved by the
 * System-owned RPC. There is intentionally no direct-table compatibility
 * fallback: legacy/unversioned publication returns `null` until canonical
 * provenance exists.
 */
export async function loadV3PublishedResultSnapshot(
  showId: string,
): Promise<V3PublishedResultSnapshot | null> {
  const client = createConfirmationPublicRuntimeClient() as unknown as PublicResultSnapshotClient;
  const { data, error } = await client.rpc("v3_public_published_result_snapshot", {
    p_show_id: showId,
  });

  if (error) {
    throw new Error(`Could not load canonical published Result snapshot: ${errorMessage(error)}`);
  }

  return parseV3PublishedResultSnapshot(data);
}
