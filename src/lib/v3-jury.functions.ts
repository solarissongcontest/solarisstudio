import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { V3JuryReceipt } from "@/integrations/v3/jury-actions.server";

const entrySchema = z.object({
  target_country_id: z.string().uuid(),
  points: z.number().int().positive(),
});
const showSchema = z.object({ showId: z.string().uuid() });
const operationSchema = z.object({ operationId: z.string().uuid() });
const saveDraftSchema = showSchema.extend({
  selections: z.array(z.string().uuid().nullable()).max(50),
  expectedRevision: z.number().int().nonnegative(),
  deviceId: z.string().trim().min(1).max(120).nullable().optional(),
  sessionId: z.string().trim().min(1).max(120).nullable().optional(),
});
const submitSchema = showSchema.extend({
  entries: z.array(entrySchema).min(1).max(50),
  preflightId: z.string().uuid(),
  operationId: z.string().uuid(),
});

export const loadV3JuryDraft = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => showSchema.parse(data))
  .handler(async ({ data }) => {
    const { loadV3JuryDraftServer } = await import(
      "@/integrations/v3/jury-actions.server"
    );
    return loadV3JuryDraftServer(data.showId);
  });

export const saveV3JuryDraft = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveDraftSchema.parse(data))
  .handler(async ({ data }) => {
    const { saveV3JuryDraftServer } = await import(
      "@/integrations/v3/jury-actions.server"
    );
    return saveV3JuryDraftServer(data);
  });

export const submitV3JuryBallot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => submitSchema.parse(data))
  .handler(async ({ data }) => {
    const { submitV3JuryBallotServer } = await import(
      "@/integrations/v3/jury-actions.server"
    );
    return submitV3JuryBallotServer(data);
  });

export const reconcileV3JurySubmission = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => operationSchema.parse(data))
  .handler(async ({ data }) => {
    const { reconcileV3JurySubmissionServer } = await import(
      "@/integrations/v3/jury-actions.server"
    );
    return reconcileV3JurySubmissionServer(data.operationId);
  });

export const lookupV3JuryReceipt = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => showSchema.parse(data))
  .handler(async ({ data }) => {
    const { lookupV3JuryReceiptServer } = await import(
      "@/integrations/v3/jury-actions.server"
    );
    return lookupV3JuryReceiptServer(data.showId);
  });
