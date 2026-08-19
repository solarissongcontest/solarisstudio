import { createServerFn } from "@tanstack/react-start";

import type { IntegrityHumanDecision, IntegritySanctionType } from "@/integrations/televoting/integrity-moderation.server";

const decisions: IntegrityHumanDecision[] = [
  "cleared",
  "monitor",
  "false_declaration_confirmed",
  "ballot_excluded",
];

export const getMergedIntegrityModeration = createServerFn({ method: "GET" }).handler(async () => {
  const { loadIntegrityModerationServer } = await import(
    "@/integrations/televoting/integrity-moderation.server"
  );
  return loadIntegrityModerationServer();
});

export const saveMergedIntegrityDecision = createServerFn({ method: "POST" })
  .inputValidator((data: {
    preflightId: string;
    decision: IntegrityHumanDecision;
    reason: string;
    evidenceNotes?: string | null;
  }) => {
    if (!data?.preflightId) throw new Error("Missing integrity declaration");
    if (!decisions.includes(data.decision)) throw new Error("Unsupported organizer decision");
    return {
      preflightId: String(data.preflightId),
      decision: data.decision,
      reason: String(data.reason ?? ""),
      evidenceNotes: data.evidenceNotes == null ? null : String(data.evidenceNotes),
    };
  })
  .handler(async ({ data }) => {
    const { recordIntegrityDecisionServer } = await import(
      "@/integrations/televoting/integrity-moderation.server"
    );
    return recordIntegrityDecisionServer(data);
  });

export const excludeMergedIntegrityBallot = createServerFn({ method: "POST" })
  .inputValidator((data: { preflightId: string; reason: string }) => ({
    preflightId: String(data?.preflightId ?? ""),
    reason: String(data?.reason ?? ""),
  }))
  .handler(async ({ data }) => {
    const { excludeIntegrityBallotServer } = await import(
      "@/integrations/televoting/integrity-moderation.server"
    );
    return excludeIntegrityBallotServer(data);
  });

export const createMergedIntegritySanction = createServerFn({ method: "POST" })
  .inputValidator((data: {
    preflightId: string;
    sanctionType: IntegritySanctionType;
    expiresAt?: string | null;
    reason: string;
  }) => {
    if (!data?.preflightId) throw new Error("Missing integrity declaration");
    if (data.sanctionType !== "temporary" && data.sanctionType !== "permanent") {
      throw new Error("Unsupported sanction type");
    }
    return {
      preflightId: String(data.preflightId),
      sanctionType: data.sanctionType,
      expiresAt: data.expiresAt == null ? null : String(data.expiresAt),
      reason: String(data.reason ?? ""),
    };
  })
  .handler(async ({ data }) => {
    const { createIntegritySanctionServer } = await import(
      "@/integrations/televoting/integrity-moderation.server"
    );
    return createIntegritySanctionServer(data);
  });

export const revokeMergedIntegritySanction = createServerFn({ method: "POST" })
  .inputValidator((data: { sanctionId: string; reason: string }) => ({
    sanctionId: String(data?.sanctionId ?? ""),
    reason: String(data?.reason ?? ""),
  }))
  .handler(async ({ data }) => {
    const { revokeIntegritySanctionServer } = await import(
      "@/integrations/televoting/integrity-moderation.server"
    );
    return revokeIntegritySanctionServer(data);
  });
