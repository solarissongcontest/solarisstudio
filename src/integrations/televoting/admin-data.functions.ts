import { createServerFn } from "@tanstack/react-start";

type TelevotingOverviewSummary = {
  editions: number;
  rounds: number;
  openRounds: number;
  submissions: number;
  blocked: number;
  activeEdition: string | null;
  remoteEditionId: string | null;
  linked: boolean;
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

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

    const summary =
      rawSummary && typeof rawSummary === "object" && !Array.isArray(rawSummary)
        ? (rawSummary as Record<string, unknown>)
        : {};

    return {
      editions: numberValue(summary.editions),
      rounds: numberValue(summary.rounds),
      openRounds: numberValue(summary.openRounds),
      submissions: numberValue(summary.submissions),
      blocked: numberValue(summary.blocked),
      activeEdition:
        typeof summary.activeEdition === "string" ? summary.activeEdition : null,
      remoteEditionId:
        typeof summary.remoteEditionId === "string" ? summary.remoteEditionId : null,
      linked: summary.linked === true,
    } satisfies TelevotingOverviewSummary;
  });
