import { QueryClient } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createAccountCacheIsolationHandler } from "./account-cache-isolation";

// Actual production namespaces, including the common admin gate and alias target.
const keys = [
  ["merged-televoting-admin"],
  ["v3-edition-rollout-probe", "ssc-22"],
  ["v3-participant-activity"],
  ["merged-televoting-audit", "all", "round"],
  ["merged-televoting-analytics", "round:22", "all-hods"],
  ["friend-voting-complete", "country", "combined", "all-hods", "all-editions"],
  ["friend-voting-network", "combined", "all-hods", "all-editions"],
  ["merged-integrity-declarations", "edition-22"],
  ["merged-combined-detail", "edition-22"],
  ["v3-organizer-voting-round-scope", "edition-22", "round-22"],
  ["televoting-result-integrity", "edition-22", "round-22"],
] as const;

function fixture() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return { client, apply: createAccountCacheIsolationHandler(client, () => {}) };
}

describe("canonical observational Organizer consumers across account transitions", () => {
  it("removes all private voting evidence and the admin decision before publishing another session", () => {
    const { client, apply } = fixture();
    try {
      apply({ id: "A" });
      for (const key of keys) client.setQueryData(key, { private: "A only" });
      client.setQueryData(["public-edition", "22"], "published");
      const order: string[] = [];
      const unsubscribe = client.getQueryCache().subscribe((event) => {
        if (event.type === "updated" && event.query.queryKey[0] === "fan-session") {
          order.push(String(keys.every((key) => client.getQueryData(key) === undefined)));
        }
      });
      apply({ id: "B" });
      unsubscribe();
      expect(order).toEqual(["true"]);
      expect(keys.map((key) => client.getQueryData(key))).toEqual(keys.map(() => undefined));
      expect(client.getQueryData(["public-edition", "22"])).toBe("published");
      expect(client.getQueryData(["fan-session"])).toEqual({ id: "B" });
    } finally { client.clear(); }
  });

  it("cancels pending old-account transports so late analytics cannot refill the new account cache", async () => {
    const { client, apply } = fixture();
    const completions: (() => void)[] = [];
    try {
      apply({ id: "A" });
      const oldReads = keys.map((key) => client.fetchQuery({
        queryKey: key,
        queryFn: () => new Promise<string>((resolve) => completions.push(() => resolve("A only"))),
      }).catch(() => undefined));
      apply({ id: "B" });
      for (const key of keys) client.setQueryData(key, "B readback");
      completions.forEach((resolve) => resolve());
      await Promise.all(oldReads);
      expect(keys.map((key) => client.getQueryData(key))).toEqual(keys.map(() => "B readback"));
    } finally { client.clear(); }
  });

  it("sign-out purges observational evidence while public standing remains reusable", () => {
    const { client, apply } = fixture();
    try {
      apply({ id: "A" });
      for (const key of keys) client.setQueryData(key, "private");
      client.setQueryData(["published-standing", "show-22"], ["public"]);
      apply(null);
      expect(keys.every((key) => client.getQueryData(key) === undefined)).toBe(true);
      expect(client.getQueryData(["published-standing", "show-22"])).toEqual(["public"]);
    } finally { client.clear(); }
  });

  it("rechecks the service gate on session changes and rejects stale server identity before authority checks", () => {
    const gate = readFileSync("src/components/admin/UnifiedServiceAdminGate.tsx", "utf8");
    expect(gate).toContain("const session = useFanSession()");
    expect(gate).toContain("state.user?.id === sessionUserId");
    expect(gate).toContain("userData.user.id !== sessionUserId");
    expect(gate).toContain("pathname, session.isPending, sessionUserId]");
    expect(gate).toContain('if (currentState.status !== "allowed")');
    expect(gate.indexOf("userData.user.id !== sessionUserId")).toBeLessThan(gate.indexOf("await hasSolarisOrganizerAccess"));
    expect(gate).not.toContain("onAuthStateChange");
  });
});
