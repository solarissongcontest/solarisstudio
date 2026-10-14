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
  if (username.length < 2 || username.length > 40)
    throw new Error("Username must be 2–40 characters");
  if (!data?.countryCode) throw new Error("Home country required");
  if (!Array.isArray(data.entries) || data.entries.length < 5)
    throw new Error("Vote for at least 5 entries");

  const total = data.entries.reduce((sum, entry) => sum + Number(entry.points || 0), 0);
  if (total !== 20) throw new Error("You must distribute exactly 20 points");
  if (
    data.entries.some(
      (entry) =>
        !entry.target_country_code ||
        !Number.isInteger(entry.points) ||
        entry.points < 1 ||
        entry.points > 10,
    )
  ) {
    throw new Error("Each selected entry must receive between 1 and 10 points");
  }
  if (
    new Set(data.entries.map((entry) => entry.target_country_code)).size !== data.entries.length
  ) {
    throw new Error("Duplicate voting entry");
  }

  return { ...data, username };
}

function validateRecoveryHandle(data: {
  roundId: string;
  operationId: string;
  recoverySecret: string;
}) {
  const roundId = String(data?.roundId ?? "").trim();
  const operationId = String(data?.operationId ?? "").trim();
  const recoverySecret = String(data?.recoverySecret ?? "").trim();
  if (!roundId) throw new Error("Missing round");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId))
    throw new Error("Invalid vote recovery operation");
  if (!/^[0-9a-f]{64}$/i.test(recoverySecret)) throw new Error("Invalid vote recovery secret");
  return { roundId, operationId, recoverySecret };
}

export const preflightMergedTelevotingVote = createServerFn({ method: "POST" })
  .inputValidator((data: TelevotingVoteInput) => validateBallot(data))
  .handler(async ({ data }) => {
    const { runVoteIntegrityPreflightServer } =
      await import("@/integrations/televoting/preflight.server");
    return runVoteIntegrityPreflightServer(data);
  });

// The preflight bearer token stays memory-only. This server endpoint exchanges
// it for a separate read-only receipt recovery capability that is safe to
// persist because it cannot submit or alter a ballot.
export const createMergedTelevotingRecoveryHandle = createServerFn({ method: "POST" })
  .inputValidator((data: { preflightToken: string }) => {
    const preflightToken = String(data?.preflightToken ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(preflightToken))
      throw new Error("Invalid voting preflight token");
    return { preflightToken };
  })
  .handler(async ({ data }) => {
    const { createMergedTelevotingRecoveryHandleServer } =
      await import("@/integrations/televoting/vote.server");
    return createMergedTelevotingRecoveryHandleServer(data.preflightToken);
  });

export const attestMergedTelevotingVote = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      token: string;
      signedName: string;
      acceptedAutomaticDetection: boolean;
      acceptedIndependence: boolean;
      acceptedCoordination: boolean;
      acceptedPressure: boolean;
      acceptedConsequences: boolean;
    }) => {
      if (!data?.token) throw new Error("Missing integrity-check token");
      return {
        token: String(data.token),
        signedName: String(data.signedName ?? "").trim(),
        acceptedAutomaticDetection: Boolean(data.acceptedAutomaticDetection),
        acceptedIndependence: Boolean(data.acceptedIndependence),
        acceptedCoordination: Boolean(data.acceptedCoordination),
        acceptedPressure: Boolean(data.acceptedPressure),
        acceptedConsequences: Boolean(data.acceptedConsequences),
      };
    },
  )
  .handler(async ({ data }) => {
    const { signFullVoteIntegrityAttestationServer } =
      await import("@/integrations/televoting/integrity-attestation.server");
    return signFullVoteIntegrityAttestationServer(data);
  });

export const submitMergedTelevotingVote = createServerFn({ method: "POST" })
  .inputValidator((data: TelevotingVoteInput & { preflightToken: string }) => {
    const validated = validateBallot(data);
    if (!data?.preflightToken)
      throw new Error("Run the automatic voting integrity check before submitting");
    return {
      ...validated,
      preflightToken: String(data.preflightToken),
    };
  })
  .handler(async ({ data }) => {
    const { submitMergedTelevotingVoteServer } =
      await import("@/integrations/televoting/vote.server");
    return submitMergedTelevotingVoteServer(data);
  });

// POST keeps the ballot identity and bearer capability out of navigation URLs.
// The backing SQL RPC is STABLE and remains readable during suspended writes.
export const reconcileMergedTelevotingVote = createServerFn({ method: "POST" })
  .inputValidator((data: TelevotingVoteInput & { preflightToken: string }) => {
    const validated = validateBallot(data);
    if (!data?.preflightToken) throw new Error("Missing ballot receipt capability");
    return { ...validated, preflightToken: String(data.preflightToken) };
  })
  .handler(async ({ data }) => {
    const { reconcileMergedTelevotingVoteServer } =
      await import("@/integrations/televoting/vote.server");
    return reconcileMergedTelevotingVoteServer(data);
  });

export const reconcileMergedTelevotingRecovery = createServerFn({ method: "POST" })
  .inputValidator(validateRecoveryHandle)
  .handler(async ({ data }) => {
    const { reconcileMergedTelevotingRecoveryServer } =
      await import("@/integrations/televoting/vote.server");
    return reconcileMergedTelevotingRecoveryServer(data);
  });
