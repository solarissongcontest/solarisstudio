import { createServerFn } from "@tanstack/react-start";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const reconcileOrganizerTelevoteTotals = createServerFn({ method: "POST" })
  .inputValidator((data: { editionId: string; showId: string }) => {
    if (!data?.editionId || !data?.showId) throw new Error("Missing Televote edition or show");
    if (!UUID_PATTERN.test(data.editionId) || !UUID_PATTERN.test(data.showId)) {
      throw new Error("Invalid Televote edition or show");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const [{ requireMergedTelevotingAdminServer }, { supabaseAdmin }] = await Promise.all([
      import("@/integrations/televoting/admin-session.server"),
      import("@/integrations/supabase/client.server"),
    ]);

    await requireMergedTelevotingAdminServer();

    const { data: status, error: statusError } = await (supabaseAdmin as any).rpc(
      "studio2_televote_projection_status",
      { p_show_id: data.showId },
    );
    if (statusError) throw new Error(`Could not read canonical Televote source: ${statusError.message}`);
    if (!status || status.showId !== data.showId) {
      throw new Error("Canonical Televote source resolved a different show");
    }
    if (status.editionId !== data.editionId) {
      throw new Error("Canonical Televote source resolved a different edition");
    }
    if (status.sourceType !== "round" && status.sourceType !== "combined") {
      throw new Error("Canonical Televote source has an invalid source type");
    }
    if (!UUID_PATTERN.test(String(status.sourceId ?? ""))) {
      throw new Error("Canonical Televote source has an invalid source identity");
    }

    const { data: receipt, error: reconciliationError } = await (supabaseAdmin as any).rpc(
      "v3_reconcile_published_televote",
      {
        p_source_type: status.sourceType,
        p_source_id: status.sourceId,
      },
    );
    if (reconciliationError) {
      throw new Error(`Canonical Televote reconciliation failed: ${reconciliationError.message}`);
    }
    if (!receipt || receipt.ok !== true || receipt.showId !== data.showId || receipt.editionId !== data.editionId) {
      throw new Error("Canonical Televote reconciliation returned an invalid receipt");
    }
    return receipt;
  });
