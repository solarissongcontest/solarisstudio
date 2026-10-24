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
    const [{ requireMergedTelevotingAdminServer }, { televotingAdmin }] = await Promise.all([
      import("@/integrations/televoting/admin-session.server"),
      import("@/integrations/televoting/client.server"),
    ]);

    await requireMergedTelevotingAdminServer();

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
