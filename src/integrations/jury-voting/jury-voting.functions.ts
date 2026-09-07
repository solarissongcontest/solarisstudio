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
    const { runJuryIntegrityPreflightV4Server } = await import(
      "@/integrations/jury-voting/jury-integrity-v4.server"
    );
    return runJuryIntegrityPreflightV4Server(data);
  });

export const attestCountryJuryVote = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        token: z.string().uuid(),
        signedName: z.string().trim().min(1).max(120),
        acceptedAutomaticDetection: z.literal(true),
        acceptedIndependence: z.literal(true),
        acceptedCoordination: z.literal(true),
        acceptedPressure: z.literal(true),
        acceptedConsequences: z.literal(true),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { signFullVoteIntegrityAttestationServer } = await import(
      "@/integrations/televoting/integrity-attestation.server"
    );
    return signFullVoteIntegrityAttestationServer(data);
  });
