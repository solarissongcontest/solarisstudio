import { createHash } from "node:crypto";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

import { televotingPublicServer } from "@/integrations/televoting/public.server";
import { enforceTelevotingRateLimit } from "@/integrations/televoting/rate-limit.server";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function detectVpn() {
  const flags = [
    getRequestHeader("cf-warp-tag-id"),
    getRequestHeader("via"),
    getRequestHeader("x-forwarded-proto"),
  ];
  const threat = getRequestHeader("cf-threat-score");
  if (threat && Number(threat) >= 20) return true;

  const proxy = getRequestHeader("x-forwarded-for") ?? "";
  if (proxy.split(",").filter(Boolean).length > 1) return true;

  return flags.some(
    (header) => typeof header === "string" && header.length > 0 && header !== "https",
  );
}

export async function submitMergedTelevotingVoteServer(data: {
  roundId: string;
  username: string;
  countryCode: string;
  entries: Array<{ target_country_code: string; points: number }>;
  fingerprintHash?: string | null;
  deviceTokenHash?: string | null;
}) {
  let ipHash: string | null = null;
  try {
    const ip = getRequestIP({ xForwardedFor: true });
    if (ip) ipHash = sha256(ip);
  } catch {
    // The durable database duplicate checks still apply.
  }

  enforceTelevotingRateLimit(`vote:${ipHash ?? data.deviceTokenHash ?? "anon"}`, {
    limit: 8,
    windowMs: 60_000,
    message: "Too many vote attempts from this connection. Please wait a moment.",
  });

  const ipCountry =
    getRequestHeader("cf-ipcountry") ??
    getRequestHeader("x-vercel-ip-country") ??
    null;

  const { data: result, error } = await televotingPublicServer.rpc("submit_vote", {
    p_round_id: data.roundId,
    p_username: data.username,
    p_country_code: data.countryCode,
    p_entries: data.entries,
    p_ip_hash: ipHash,
    p_fingerprint_hash: data.fingerprintHash ?? null,
    p_device_token_hash: data.deviceTokenHash ?? null,
    p_ip_country: ipCountry && ipCountry !== "XX" ? ipCountry : null,
    p_is_vpn: detectVpn(),
  });

  if (error) throw new Error(error.message);
  return result as { id: string; risk_score: number };
}
