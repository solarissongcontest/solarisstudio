import { televotingPublicServer } from "@/integrations/televoting/public.server";
import { enforceTelevotingRateLimit } from "@/integrations/televoting/rate-limit.server";
import { getTelevotingNetworkSignals } from "@/integrations/televoting/network.server";

export async function submitMergedTelevotingVoteServer(data: {
  roundId: string;
  username: string;
  countryCode: string;
  entries: Array<{ target_country_code: string; points: number }>;
  preflightToken: string;
  fingerprintHash?: string | null;
  deviceTokenHash?: string | null;
}) {
  const network = getTelevotingNetworkSignals();

  enforceTelevotingRateLimit(`vote:${network.ipHash ?? data.deviceTokenHash ?? "anon"}`, {
    limit: 8,
    windowMs: 60_000,
    message: "Too many vote attempts from this connection. Please wait a moment.",
  });

  const { data: result, error } = await televotingPublicServer.rpc("submit_vote_checked" as never, {
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
  } as never);

  if (error) throw new Error(error.message);
  return result as unknown as {
    id: string;
    risk_score: number;
    status: "active" | "suspicious";
    preflight_id: string;
  };
}
