import { createServerFn } from "@tanstack/react-start";

export type TelevotingVoteEntry = {
  target_country_code: string;
  points: number;
};

export type TelevotingVoteInput = {
  roundId: string;
  username: string;
  countryCode: string;
  entries: TelevotingVoteEntry[];
  fingerprintHash?: string | null;
  deviceTokenHash?: string | null;
};

function validateBallot(data: TelevotingVoteInput) {
  if (!data?.roundId) throw new Error("Missing round");
  const username = String(data?.username ?? "").trim();
  if (username.length < 2 || username.length > 40) throw new Error("Username must be 2–40 characters");
  if (!data?.countryCode) throw new Error("Home country required");
  if (!Array.isArray(data.entries) || data.entries.length < 5) throw new Error("Vote for at least 5 entries");

  const total = data.entries.reduce((sum, entry) => sum + Number(entry.points || 0), 0);
  if (total !== 20) throw new Error("You must distribute exactly 20 points");
  if (data.entries.some((entry) => !entry.target_country_code || !Number.isInteger(entry.points) || entry.points < 1 || entry.points > 10)) {
    throw new Error("Each selected entry must receive between 1 and 10 points");
  }
  if (new Set(data.entries.map((entry) => entry.target_country_code)).size !== data.entries.length) {
    throw new Error("Duplicate voting entry");
  }

  return { ...data, username };
}

export const preflightMergedTelevotingVote = createServerFn({ method: "POST" })
  .inputValidator((data: TelevotingVoteInput) => validateBallot(data))
  .handler(async ({ data }) => {
    const { runVoteIntegrityPreflightServer } = await import(
      "@/integrations/televoting/preflight.server"
    );
    return runVoteIntegrityPreflightServer(data);
  });

export const attestMergedTelevotingVote = createServerFn({ method: "POST" })
  .inputValidator((data: {
    token: string;
    signedName: string;
    acceptedAutomaticDetection: boolean;
    acceptedIndependence: boolean;
    acceptedConsequences: boolean;
  }) => {
    if (!data?.token) throw new Error("Missing integrity-check token");
    return {
      token: String(data.token),
      signedName: String(data.signedName ?? "").trim(),
      acceptedAutomaticDetection: Boolean(data.acceptedAutomaticDetection),
      acceptedIndependence: Boolean(data.acceptedIndependence),
      acceptedConsequences: Boolean(data.acceptedConsequences),
    };
  })
  .handler(async ({ data }) => {
    const { signVoteIntegrityAttestationServer } = await import(
      "@/integrations/televoting/preflight.server"
    );
    return signVoteIntegrityAttestationServer(data);
  });

export const submitMergedTelevotingVote = createServerFn({ method: "POST" })
  .inputValidator(
    (data: TelevotingVoteInput & { preflightToken: string }) => {
      const validated = validateBallot(data);
      if (!data?.preflightToken) throw new Error("Run the automatic voting integrity check before submitting");
      return {
        ...validated,
        preflightToken: String(data.preflightToken),
      };
    },
  )
  .handler(async ({ data }) => {
    const { submitMergedTelevotingVoteServer } = await import(
      "@/integrations/televoting/vote.server"
    );
    return submitMergedTelevotingVoteServer(data);
  });
