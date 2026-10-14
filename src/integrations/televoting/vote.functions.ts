import { createServerFn } from "@tanstack/react-start";

import { parseTelevoteRecoveryCode, serializeTelevoteRecoveryCode } from "@/lib/v3-televote-reconciliation";

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

function validateRoundId(value: unknown) {
  const roundId = String(value ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roundId))
    throw new Error("Invalid voting round");
  return roundId;
}

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

export const preflightMergedTelevotingVote = createServerFn({ method: "POST" })
  .inputValidator((data: TelevotingVoteInput) => validateBallot(data))
  .handler(async ({ data }) => {
    const { runVoteIntegrityPreflightServer } =
      await import("@/integrations/televoting/preflight.server");
    const report = await runVoteIntegrityPreflightServer(data);

    // Exchange the submission-capable preflight token for a separate
    // read-only recovery capability while the preflight is still server-side.
    // Only the low-privilege capability is persisted, and only in an HTTP-only
    // cookie. Missing migration support returns null and keeps the existing
    // rollout path backward-compatible.
    const { createMergedTelevotingRecoveryHandleServer } =
      await import("@/integrations/televoting/vote.server");
    const recovery = await createMergedTelevotingRecoveryHandleServer(report.token);
    if (recovery) {
      const { writeTelevoteRecoveryCookie } =
        await import("@/integrations/televoting/recovery-cookie.server");
      writeTelevoteRecoveryCookie(data.roundId, recovery);
    }

    return report;
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

// Reload recovery does not need the submission-capable preflight token. The
// HTTP-only cookie carries a separate read-only capability created at preflight.
export const reconcileMergedTelevotingRecoveryCookie = createServerFn({ method: "POST" })
  .inputValidator((data: { roundId: string }) => ({ roundId: validateRoundId(data?.roundId) }))
  .handler(async ({ data }) => {
    const { readTelevoteRecoveryCookie } =
      await import("@/integrations/televoting/recovery-cookie.server");
    const handle = readTelevoteRecoveryCookie(data.roundId);
    if (!handle) return null;
    const { reconcileMergedTelevotingRecoveryServer } =
      await import("@/integrations/televoting/vote.server");
    return reconcileMergedTelevotingRecoveryServer({ roundId: data.roundId, ...handle });
  });

// Portable recovery is explicit. The secret may be revealed only after the
// server has proved that the capability resolves to an accepted receipt.
export const exportMergedTelevotingRecoveryCode = createServerFn({ method: "POST" })
  .inputValidator((data: { roundId: string }) => ({ roundId: validateRoundId(data?.roundId) }))
  .handler(async ({ data }) => {
    const { readTelevoteRecoveryCookie } =
      await import("@/integrations/televoting/recovery-cookie.server");
    const handle = readTelevoteRecoveryCookie(data.roundId);
    if (!handle) return null;
    const { reconcileMergedTelevotingRecoveryServer } =
      await import("@/integrations/televoting/vote.server");
    const receipt = await reconcileMergedTelevotingRecoveryServer({ roundId: data.roundId, ...handle });
    return receipt ? serializeTelevoteRecoveryCode(handle) : null;
  });

export const recoverMergedTelevotingReceiptCode = createServerFn({ method: "POST" })
  .inputValidator((data: { roundId: string; recoveryCode: string }) => {
    const roundId = validateRoundId(data?.roundId);
    const parsed = parseTelevoteRecoveryCode(String(data?.recoveryCode ?? ""));
    if (!parsed) throw new Error("Invalid vote recovery code");
    return { roundId, ...parsed };
  })
  .handler(async ({ data }) => {
    const { reconcileMergedTelevotingRecoveryServer } =
      await import("@/integrations/televoting/vote.server");
    const receipt = await reconcileMergedTelevotingRecoveryServer(data);
    if (receipt) {
      // Adopt the same low-privilege recovery capability on this browser so
      // later reloads can recover without asking for the portable code again.
      const { writeTelevoteRecoveryCookie } =
        await import("@/integrations/televoting/recovery-cookie.server");
      writeTelevoteRecoveryCookie(data.roundId, {
        operationId: data.operationId,
        recoverySecret: data.recoverySecret,
      });
    }
    return receipt;
  });
