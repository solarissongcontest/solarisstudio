import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { createAccountCacheIsolationHandler } from "./account-cache-isolation";
import { organizerAccessDecision } from "./v3-organizer-access-state";

const options = {
  queryKey: ["organizer-access-gate", "organizer-a"],
  retry: false,
  gcTime: 0,
} as const;

describe("Organizer authorization read recovery", () => {
  it("keeps read outages distinct from a proven denial and recovers on explicit retry", async () => {
    const client = new QueryClient();
    let unavailable = true;
    const observer = new QueryObserver(client, {
      ...options,
      queryFn: async () => {
        if (unavailable) throw new Error("Access service unavailable");
        return false;
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      expect(organizerAccessDecision(observer.getCurrentResult())).toBe("checking");
      await observer.refetch();
      expect(organizerAccessDecision(observer.getCurrentResult())).toBe("unavailable");
      unavailable = false;
      await observer.refetch();
      expect(organizerAccessDecision(observer.getCurrentResult())).toBe("denied");
    } finally {
      unsubscribe();
      client.clear();
    }
  });

  it("closes protected content after a failed refresh even when React Query retains a cached grant", async () => {
    const client = new QueryClient();
    let unavailable = false;
    const observer = new QueryObserver(client, {
      ...options,
      queryFn: async () => {
        if (unavailable) throw new Error("Connection lost");
        return true;
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      await observer.refetch();
      expect(organizerAccessDecision(observer.getCurrentResult())).toBe("allowed");
      unavailable = true;
      await observer.refetch();
      expect(observer.getCurrentResult().data).toBe(true);
      expect(organizerAccessDecision(observer.getCurrentResult())).toBe("unavailable");
      unavailable = false;
      await observer.refetch();
      expect(organizerAccessDecision(observer.getCurrentResult())).toBe("allowed");
    } finally {
      unsubscribe();
      client.clear();
    }
  });

  it("does not infer access from missing evidence", () => {
    expect(
      organizerAccessDecision({
        isPending: false,
        isError: false,
        isFetching: false,
        data: undefined,
      }),
    ).toBe("unavailable");
    expect(
      organizerAccessDecision({ isPending: false, isError: true, isFetching: true, data: true }),
    ).toBe("checking");
  });
});

describe("authorization evidence across account changes", () => {
  it("purges identity and Organizer grants and cancels late identity responses before publishing B", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const applySession = createAccountCacheIsolationHandler(client, () => {});
    applySession({ id: "A" });
    client.setQueryData(["organizer-access-gate", "A"], true);
    client.setQueryData(["authenticated-identity-gate", "A"], { id: "A" });
    client.setQueryData(["countries"], ["public"]);
    let finish: (value: { id: string }) => void = () => {};
    const pending = client
      .fetchQuery({
        queryKey: ["authenticated-identity-gate"],
        queryFn: () =>
          new Promise<{ id: string }>((resolve) => {
            finish = resolve;
          }),
      })
      .catch(() => undefined);
    applySession(null);
    applySession({ id: "B" });
    finish({ id: "A" });
    await pending;
    expect(client.getQueryData(["authenticated-identity-gate"])).toBeUndefined();
    expect(client.getQueryData(["authenticated-identity-gate", "A"])).toBeUndefined();
    expect(client.getQueryData(["organizer-access-gate", "A"])).toBeUndefined();
    expect(client.getQueryData(["fan-session"])).toEqual({ id: "B" });
    expect(client.getQueryData(["countries"])).toEqual(["public"]);
    client.clear();
  });
});

describe("Permissions workspace account isolation", () => {
  it("removes privileged directory, audit and approval data and cancels late approval reads", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const applySession = createAccountCacheIsolationHandler(client, () => {});
    applySession({ id: "A" });
    const privateKeys = [
      ["permission-engine-users"],
      ["permission-engine-summary"],
      ["permission-engine-events", true],
      ["permission-engine-evaluation", "permissions.read", "ssc22"],
    ];
    for (const key of privateKeys) client.setQueryData(key, { privateTo: "A" });
    let finish: (value: string[]) => void = () => {};
    const pending = client
      .fetchQuery({
        queryKey: ["permission-engine-approvals"],
        queryFn: () =>
          new Promise<string[]>((resolve) => {
            finish = resolve;
          }),
      })
      .catch(() => undefined);
    applySession({ id: "B" });
    finish(["A private approval"]);
    await pending;
    for (const key of privateKeys) expect(client.getQueryData(key)).toBeUndefined();
    expect(client.getQueryData(["permission-engine-approvals"])).toBeUndefined();
    expect(client.getQueryData(["fan-session"])).toEqual({ id: "B" });
    client.clear();
  });
});
