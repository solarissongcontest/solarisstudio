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
      cancelQueries: vi.fn(() => {
        events.push("cancel-private");
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
      "fan:A",
      "cancel-private",
      "remove-private",
      "reset-attention",
      "fan:signed-out",
      "cancel-private",
      "remove-private",
      "reset-attention",
      "fan:B",
    ]);
  });
});
