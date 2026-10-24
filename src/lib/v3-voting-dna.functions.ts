import { createServerFn } from "@tanstack/react-start";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const getV3PublicVotingDna = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("Voting DNA input is required");
    }
    const countryId = (input as { countryId?: unknown }).countryId;
    if (typeof countryId !== "string" || !UUID_PATTERN.test(countryId)) {
      throw new Error("Invalid Voting DNA country identity");
    }
    return { countryId };
  })
  .handler(async ({ data }) => {
    const { loadV3PublicVotingDna } = await import(
      "@/integrations/v3/voting-dna-source.server"
    );
    return loadV3PublicVotingDna(data.countryId);
  });
