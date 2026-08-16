import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

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

export type TelevotingVoteEntry = {
  target_country_code: string;
  points: number;
};

export const submitMergedTelevotingVote = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      roundId: string;
      username: string;
      countryCode: string;
      entries: TelevotingVoteEntry[];
      fingerprintHash?: string | null;
      deviceTokenHash?: string | null;
    }) => {
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

      return {
        ...data,
        username,
      };
    },
  )
  .handler(async ({ data }) => {
    const { televotingAdmin } = await import("@/integrations/televoting/client.server");

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

    const { data: result, error } = await televotingAdmin.rpc("submit_vote", {
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
  });
