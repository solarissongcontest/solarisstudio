import {
  submitTelevoteWithReconciliation,
  verifiedTelevoteReceipt,
  verifiedTelevoteRecoveryReceipt,
  type TelevoteAcceptedVote,
  type TelevoteRecoveryHandle,
} from "@/lib/v3-televote-reconciliation";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { televotingPublicServer } from "@/integrations/televoting/public.server";
import { enforceTelevotingRateLimit } from "@/integrations/televoting/rate-limit.server";
import { getTelevotingNetworkSignals } from "@/integrations/televoting/network.server";

export type TelevoteReconciliationInput = {
  roundId: string;
  username: string;
  countryCode: string;
  entries: Array<{ target_country_code: string; points: number }>;
  preflightToken: string;
  fingerprintHash?: string | null;
  deviceTokenHash?: string | null;
};

export type TelevoteRecoveryInput = {
  roundId: string;
  operationId: string;
  recoverySecret: string;
};

export async function createMergedTelevotingRecoveryHandleServer(
  preflightToken: string,
): Promise<TelevoteRecoveryHandle | null> {
  const network = getTelevotingNetworkSignals();
  enforceTelevotingRateLimit(`vote-recovery-create:${network.ipHash ?? "anon"}`, {
    limit: 12,
    windowMs: 60_000,
    message: "Too many recovery requests. Please wait a moment.",
  });

  const { data, error } = await (supabaseAdmin as any).rpc(
    "v3_create_televote_recovery_handle",
    { p_preflight_token: preflightToken },
  );
  if (error) {
    // App deployment may precede the additive migration. Recovery remains an
    // enhancement; the existing in-memory preflight flow must keep working.
    if (error.code === "PGRST202") return null;
    throw new Error("The server could not create a ballot recovery handle");
  }

  const row = Array.isArray(data) ? data[0] : data;
  const operationId = String(row?.operation_id ?? "");
  const recoverySecret = String(row?.recovery_secret ?? "");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId) ||
    !/^[0-9a-f]{64}$/i.test(recoverySecret)
  ) {
    throw new Error("The server returned an invalid ballot recovery handle");
  }
  return { operationId, recoverySecret };
}

export async function reconcileMergedTelevotingRecoveryServer(data: TelevoteRecoveryInput) {
  const network = getTelevotingNetworkSignals();
  enforceTelevotingRateLimit(`vote-recovery:${network.ipHash ?? "anon"}`, {
    limit: 24,
    windowMs: 60_000,
    message: "Too many receipt recovery checks. Please wait a moment.",
  });

  const { data: receipt, error } = await (supabaseAdmin as any).rpc(
    "v3_reconcile_televote_recovery",
    {
      p_operation_id: data.operationId,
      p_recovery_secret: data.recoverySecret,
    },
  );
  if (error) {
    if (error.code === "PGRST202") return null;
    throw new Error("The server could not recover this ballot receipt");
  }
  const row = Array.isArray(receipt) ? receipt[0] : receipt;
  return verifiedTelevoteRecoveryReceipt(row, data.roundId);
}

export async function reconcileMergedTelevotingVoteServer(data: TelevoteReconciliationInput) {
  const network = getTelevotingNetworkSignals();
  enforceTelevotingRateLimit(`vote-receipt:${network.ipHash ?? data.deviceTokenHash ?? "anon"}`, {
    limit: 24,
    windowMs: 60_000,
    message: "Too many receipt checks. Please wait a moment.",
  });
  const { data: receipt, error } = await televotingPublicServer.schema("public" as never).rpc(
    "v3_reconcile_televote" as never,
    {
      p_preflight_token: data.preflightToken,
      p_round_id: data.roundId,
      p_username: data.username,
      p_country_code: data.countryCode,
      p_entries: data.entries,
    } as never,
  );
  if (error) {
    // Frontend/server deployment may precede the additive receipt migration.
    if (error.code === "PGRST202") return null;
    throw new Error("The server could not verify this ballot receipt");
  }
  return verifiedTelevoteReceipt(receipt, data.roundId, data.preflightToken);
}

export async function submitMergedTelevotingVoteServer(data: TelevoteReconciliationInput) {
  const network = getTelevotingNetworkSignals();

  enforceTelevotingRateLimit(`vote:${network.ipHash ?? data.deviceTokenHash ?? "anon"}`, {
    limit: 8,
    windowMs: 60_000,
    message: "Too many vote attempts from this connection. Please wait a moment.",
  });

  return submitTelevoteWithReconciliation(
    async () => {
      const { data: result, error } = await televotingPublicServer.rpc(
        "submit_vote_checked" as never,
        {
          p_round_id: data.roundId,
          p_username: data.username,
          p_country_code: data.countryCode,
          p_entries: data.entries,
          p_preflight_token: data.preflightToken,
          p_ip_hash: network.ipHash,
          p_fingerprint_hash: data.fingerprintHash ?? null,
          p_device_token_hash: data.deviceTokenHash ?? null,
          p_ip_country: network.ipCountry,
          p_is_vpn: network.isVpn,
        } as never,
      );

      if (error) throw new Error(error.message);
      return result as unknown as TelevoteAcceptedVote;
    },
    () => reconcileMergedTelevotingVoteServer(data),
  );
}
