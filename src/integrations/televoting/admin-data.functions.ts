import { createServerFn } from "@tanstack/react-start";
import { parseTelevotingOverviewSummary } from "./admin-overview-summary";

export const getMergedTelevotingOverview = createServerFn({ method: "POST" })
  .inputValidator((data: { editionId?: string | null } | undefined) => ({
    editionId: data?.editionId ? String(data.editionId) : null,
  }))
  .handler(async ({ data }) => {
    const {
      createSolarisAuthenticatedClientServer,
      requireSolarisOrganizerServer,
    } = await import("@/integrations/supabase/organizer.server");

    await requireSolarisOrganizerServer();
    const caller = createSolarisAuthenticatedClientServer();
    const { data: allowed, error: authorizationError } = await (caller as any).rpc(
      "studio2_access_allowed",
      {
        p_capability: "voting.read",
        p_edition_id: data.editionId,
        p_strict_before_cutover: false,
      },
    );
    if (authorizationError) {
      throw new Error("Could not verify Solaris capability: voting.read");
    }
    if (allowed !== true) {
      throw new Error("Missing Solaris capability: voting.read");
    }

    // Load the privileged Televoting client only after the caller has proved
    // the same named capability that owns /televoting/admin navigation.
    const { televotingAdmin } = await import(
      "@/integrations/televoting/client.server"
    );

    // One database round trip keeps the Cloudflare Worker comfortably below
    // its subrequest ceiling and makes the overview follow Organizer edition
    // context instead of aggregating every historical Televoting edition.
    const { data: rawSummary, error } = await televotingAdmin.rpc(
      "admin_overview_summary",
      { p_solaris_edition_id: data.editionId },
    );
    if (error) throw new Error(error.message);

    const summary = parseTelevotingOverviewSummary(rawSummary);
    // An edition-specific read must resolve the actual canonical edition.
    // Missing context is an error, not a new/empty voting setup prompt.
    if (data.editionId && summary.activeEdition === null) {
      throw new Error("Voting overview could not resolve the requested Solaris edition");
    }
    return summary;
  });
