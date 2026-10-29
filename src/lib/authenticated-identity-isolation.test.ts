import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import * as isolation from "./account-cache-isolation";
const { createAccountCacheIsolationHandler } = isolation;
// The historical route used this exact unscoped key. Keep the regression executable on its baseline.
const authenticatedIdentityQueryKey = isolation.authenticatedIdentityQueryKey ?? (() => ["authenticated-identity-gate"] as const);

function fixture() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return { client, apply: createAccountCacheIsolationHandler(client, () => {}) };
}

describe("server identity isolation across account lifecycle", () => {
  it("prevents a delayed getSession read from overwriting a newer SDK session event", async () => {
    const { client, apply } = fixture();
    let resolveA!: (user: { id: string }) => void;
    try {
      const oldSession = client.fetchQuery({
        queryKey: ["fan-session"],
        queryFn: () => new Promise<{ id: string }>((resolve) => { resolveA = resolve; }),
      }).catch(() => undefined);
      apply({ id: "B" });
      resolveA({ id: "A" });
      await oldSession;
      expect(client.getQueryData(["fan-session"])).toEqual({ id: "B" });
    } finally { client.clear(); }
  });

  it("removes the verified identity on sign-out and preserves public cache", () => {
    const { client, apply } = fixture();
    try {
      apply({ id: "A" });
      client.setQueryData(authenticatedIdentityQueryKey("A"), { id: "A" });
      client.setQueryData(["public-edition"], { published: true });
      apply(null);
      expect(client.getQueryData(authenticatedIdentityQueryKey("A"))).toBeUndefined();
      expect(client.getQueryData(["fan-session"])).toBeNull();
      expect(client.getQueryData(["public-edition"])).toEqual({ published: true });
    } finally { client.clear(); }
  });

  it("changes an active identity observer's namespace when the current account changes", () => {
    const { client, apply } = fixture();
    apply({ id: "A" });
    client.setQueryData(authenticatedIdentityQueryKey("A"), { id: "A" });
    const observer = new QueryObserver(client, {
      queryKey: authenticatedIdentityQueryKey("A"), enabled: false,
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      expect(observer.getCurrentResult().data).toEqual({ id: "A" });
      apply({ id: "B" });
      observer.setOptions({ queryKey: authenticatedIdentityQueryKey("B"), enabled: false });
      expect(observer.getCurrentResult().data).toBeUndefined();
      client.setQueryData(authenticatedIdentityQueryKey("B"), { id: "B" });
      expect(observer.getCurrentResult().data).toEqual({ id: "B" });
      expect(client.getQueryData(authenticatedIdentityQueryKey("A"))).toBeUndefined();
    } finally { unsubscribe(); observer.destroy(); client.clear(); }
  });

  it("cancels a delayed A identity read before publishing B and cannot repopulate A", async () => {
    const { client, apply } = fixture();
    let resolveA!: (user: { id: string }) => void;
    try {
      apply({ id: "A" });
      const lateA = client.fetchQuery({
        queryKey: authenticatedIdentityQueryKey("A"),
        queryFn: () => new Promise<{ id: string }>((resolve) => { resolveA = resolve; }),
      }).catch(() => undefined);
      apply({ id: "B" });
      client.setQueryData(authenticatedIdentityQueryKey("B"), { id: "B" });
      resolveA({ id: "A" });
      await lateA;
      expect(client.getQueryData(authenticatedIdentityQueryKey("A"))).toBeUndefined();
      expect(client.getQueryData(authenticatedIdentityQueryKey("B"))).toEqual({ id: "B" });
      expect(client.getQueryData(["fan-session"])).toEqual({ id: "B" });
    } finally { client.clear(); }
  });
});
