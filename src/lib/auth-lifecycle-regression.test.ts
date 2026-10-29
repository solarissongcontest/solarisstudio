import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { createAccountCacheIsolationHandler } from "./account-cache-isolation";
import { beginLifecycleGeneration } from "./lifecycle-generation";

describe("auth lifecycle generations", () => {
  it("rejects a cleaned-up subscription callback after remount while the new callback works", () => {
    const generationRef = { current: 0 };
    const first = beginLifecycleGeneration(generationRef);
    const publications: string[] = [];
    const callbackA = () => {
      if (first.isCurrent()) publications.push("A");
    };

    first.deactivate();
    const second = beginLifecycleGeneration(generationRef);
    const callbackB = () => {
      if (second.isCurrent()) publications.push("B");
    };

    callbackA();
    callbackB();
    expect(publications).toEqual(["B"]);
  });

  it("keeps private-cache purge ordering across A, sign-out and B and ignores delayed A", () => {
    const events: string[] = [];
    const client = {
      cancelQueries: vi.fn((filters: { queryKey?: readonly unknown[] }) => {
        events.push(filters.queryKey?.[0] === "fan-session" ? "cancel-session" : "cancel-private");
        return Promise.resolve();
      }),
      removeQueries: vi.fn(() => events.push("remove-private")),
      setQueryData: vi.fn((_key: unknown, user: { id: string } | null) =>
        events.push(`fan:${user?.id ?? "signed-out"}`),
      ),
    } as unknown as QueryClient;
    const generationRef = { current: 0 };
    const first = beginLifecycleGeneration(generationRef);
    const subscriptionA = createAccountCacheIsolationHandler(
      client,
      () => events.push("reset-attention"),
      first.isCurrent,
    );

    subscriptionA({ id: "A" });
    subscriptionA(null);
    first.deactivate();

    const second = beginLifecycleGeneration(generationRef);
    const subscriptionB = createAccountCacheIsolationHandler(
      client,
      () => events.push("reset-attention"),
      second.isCurrent,
    );
    subscriptionB({ id: "B" });
    const beforeDelayedA = [...events];
    subscriptionA({ id: "A" });

    expect(events).toEqual(beforeDelayedA);
    expect(events).toEqual([
      "cancel-private",
      "remove-private",
      "reset-attention",
      "cancel-session",
      "fan:A",
      "cancel-private",
      "remove-private",
      "reset-attention",
      "cancel-session",
      "fan:signed-out",
      "cancel-private",
      "remove-private",
      "reset-attention",
      "cancel-session",
      "fan:B",
    ]);
  });
  it("resets attention for the exact next SDK identity before publishing its fan-session", () => {
    const order: string[] = [];
    const client = {
      cancelQueries: () => Promise.resolve(),
      removeQueries: () => {},
      setQueryData: (_key: unknown, user: { id: string } | null) =>
        order.push(`fan:${user?.id ?? "anonymous"}`),
    } as unknown as QueryClient;
    const apply = createAccountCacheIsolationHandler(client, (viewerId) => {
      order.push(`attention:${viewerId ?? "anonymous"}`);
    });
    apply({ id: "A" });
    apply({ id: "B" });
    apply(null);
    expect(order).toEqual([
      "attention:A",
      "fan:A",
      "attention:B",
      "fan:B",
      "attention:anonymous",
      "fan:anonymous",
    ]);
  });
});
