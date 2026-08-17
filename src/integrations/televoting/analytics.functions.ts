import { createServerFn } from "@tanstack/react-start";

export type MergedAnalysisScope =
  | { mode: "all_editions" }
  | { mode: "edition"; editionId: string }
  | { mode: "edition_range"; fromEditionId: string; toEditionId: string }
  | { mode: "round"; roundId: string };

function validateScope(scope: MergedAnalysisScope): MergedAnalysisScope {
  if (!scope || typeof scope !== "object") throw new Error("Invalid analysis scope");
  switch (scope.mode) {
    case "all_editions": return { mode: "all_editions" };
    case "edition":
      if (!scope.editionId) throw new Error("Missing edition");
      return { mode: "edition", editionId: String(scope.editionId) };
    case "edition_range":
      if (!scope.fromEditionId || !scope.toEditionId) throw new Error("Missing edition range");
      return { mode: "edition_range", fromEditionId: String(scope.fromEditionId), toEditionId: String(scope.toEditionId) };
    case "round":
      if (!scope.roundId) throw new Error("Missing round");
      return { mode: "round", roundId: String(scope.roundId) };
  }
}

export const getMergedScopedAnalytics = createServerFn({ method: "POST" })
  .inputValidator((data: { scope: MergedAnalysisScope; hodPersonId?: string | null }) => ({
    scope: validateScope(data.scope),
    hodPersonId: data.hodPersonId ? String(data.hodPersonId) : null,
  }))
  .handler(async ({ data }) => {
    const { getMergedScopedAnalyticsServer } = await import("@/integrations/televoting/analytics.server");
    return getMergedScopedAnalyticsServer(data.scope, { hodPersonId: data.hodPersonId });
  });