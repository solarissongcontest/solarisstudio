import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const entrySchema = z.object({
  target_country_id: z.string().uuid(),
  points: z.number().int().positive(),
});

const preflightSchema = z.object({
  showId: z.string().uuid(),
  entries: z.array(entrySchema).min(1).max(50),
  accessToken: z.string().min(20),
  fingerprintHash: z.string().nullable().optional(),
  deviceTokenHash: z.string().nullable().optional(),
});

export const preflightCountryJuryVote = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => preflightSchema.parse(data))
  .handler(async ({ data }) => {
    const { runJuryIntegrityPreflightServer } = await import(
      "@/integrations/jury-voting/jury-voting.server"
    );
    return runJuryIntegrityPreflightServer(data);
  });

export const attestCountryJuryVote = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        token: z.string().uuid(),
        signedName: z.string().trim().min(1).max(120),
        acceptedAutomaticDetection: z.literal(true),
        acceptedIndependence: z.literal(true),
        acceptedConsequences: z.literal(true),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { signVoteIntegrityAttestationServer } = await import(
      "@/integrations/televoting/preflight.server"
    );
    return signVoteIntegrityAttestationServer(data);
  });
