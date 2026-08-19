import { createHash } from "node:crypto";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function detectVpnOrProxy() {
  const threat = getRequestHeader("cf-threat-score");
  if (threat && Number(threat) >= 20) return true;

  const forwarded = getRequestHeader("x-forwarded-for") ?? "";
  if (forwarded.split(",").filter(Boolean).length > 1) return true;

  const warp = getRequestHeader("cf-warp-tag-id");
  const via = getRequestHeader("via");
  return Boolean(warp || via);
}

export function getTelevotingNetworkSignals() {
  let ipHash: string | null = null;
  try {
    const ip = getRequestIP({ xForwardedFor: true });
    if (ip) ipHash = sha256(ip);
  } catch {
    // Database duplicate checks and device identity still apply when an edge
    // runtime does not expose the connecting IP.
  }

  const ipCountry =
    getRequestHeader("cf-ipcountry") ??
    getRequestHeader("x-vercel-ip-country") ??
    null;

  return {
    ipHash,
    ipCountry: ipCountry && ipCountry !== "XX" ? ipCountry : null,
    isVpn: detectVpnOrProxy(),
  };
}
