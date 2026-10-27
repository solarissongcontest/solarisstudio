import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { createAccountCacheIsolationHandler } from "./account-cache-isolation";

// The exact namespaces used by Requirements and both Submission History readers.
const privateKeys = [
  ["confirmation-requirements", "edition"],
  ["confirmation-submission-versions", "submission"],
  ["confirmation-responses-for-version-history", "edition"],
  ["confirmation-response-version-current", "edition", "submission"],
] as const;

function fixture() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return { client, apply: createAccountCacheIsolationHandler(client, () => {}) };
}

describe("Organizer Confirmation private readers across account transitions", () => {
  it("removes requirement and historical submission data before publishing the next account", () => {
    const { client, apply } = fixture();
    try {
      apply({ id: "A" });
      for (const key of privateKeys) client.setQueryData(key, "A-private-response");
      client.setQueryData(["public-confirmation-calendar"], "published");
      const observed: boolean[] = [];
      const stop = client.getQueryCache().subscribe((event) => {
        if (event.type === "updated" && event.query.queryKey[0] === "fan-session") {
          observed.push(privateKeys.every((key) => client.getQueryData(key) === undefined));
        }
      });
      apply({ id: "B" });
      stop();
      expect(observed).toEqual([true]);
      expect(client.getQueryData(["public-confirmation-calendar"])).toBe("published");
    } finally { client.clear(); }
  });

  it("cancels late old-account transports before a new account can reuse the same edition or submission key", async () => {
    const { client, apply } = fixture();
    const complete: (() => void)[] = [];
    try {
      apply({ id: "A" });
      const pending = privateKeys.map((key) => client.fetchQuery({
        queryKey: key,
        queryFn: () => new Promise<string>((resolve) => complete.push(() => resolve("A-private-response"))),
      }).catch(() => undefined));
      apply({ id: "B" });
      for (const key of privateKeys) client.setQueryData(key, "B-canonical-readback");
      complete.forEach((resolve) => resolve());
      await Promise.all(pending);
      expect(privateKeys.map((key) => client.getQueryData(key))).toEqual(privateKeys.map(() => "B-canonical-readback"));
    } finally { client.clear(); }
  });

  it("purges private Confirmation history on sign-out", () => {
    const { client, apply } = fixture();
    try {
      apply({ id: "A" });
      for (const key of privateKeys) client.setQueryData(key, "A-private-response");
      apply(null);
      expect(privateKeys.every((key) => client.getQueryData(key) === undefined)).toBe(true);
    } finally { client.clear(); }
  });
});
