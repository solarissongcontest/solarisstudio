import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  clearPrivateAccountQueries,
  createAccountCacheIsolationHandler,
  isPrivateAccountQuery,
} from "./account-cache-isolation";

const privateKeys = [
  ["hod-history", "actor-A"],
  ["hod-identity-suggestions", "actor-A"],
  ["permission-engine-context-read", "actor-A", "edition-1"],
  ["permission-engine-users", "actor-A"],
  ["permission-engine-approvals", "actor-A"],
  ["permission-engine-events", false, "actor-A"],
  ["authenticated-identity-gate"],
  ["organizer-access-gate", "actor-A"],
  ["v3-organizer", "confirmation-calendar", "actor-A", "edition-1"],
  ["v3-organizer", "delegations", "confirmation-requirements", "actor-A", "edition-1"],
  ["confirmation-requirements", "edition-1", "actor-A"],
  ["confirmation-requirements-read-access", "actor-A", "edition-1"],
] as const;

describe("V3 canonical private cache isolation for Organizer account changes", () => {
  it("recognizes HOD and Permission Engine private query roots", () => {
    for (const key of privateKeys) {
      expect(isPrivateAccountQuery(key)).toBe(true);
    }
    expect(isPrivateAccountQuery(["countries", "public"])).toBe(false);
    expect(isPrivateAccountQuery(["country-public-profile", "oland"])).toBe(false);
  });

  it("evicts private HOD and permission evidence on a real account switch", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const handler = createAccountCacheIsolationHandler(client, () => {});
    handler({ id: "actor-A" });
    for (const key of privateKeys) client.setQueryData([...key], { private: true });
    client.setQueryData(["countries", "public"], ["Oland"]);
    handler({ id: "actor-B" });
    for (const key of privateKeys) expect(client.getQueryData([...key])).toBeUndefined();
    expect(client.getQueryData(["countries", "public"])).toEqual(["Oland"]);
    client.clear();
  });

  it("does not retain old private queries through A to B to A or sign-out", () => {
    const client = new QueryClient();
    let resets = 0;
    const handler = createAccountCacheIsolationHandler(client, () => { resets++; });
    handler({ id: "actor-A" });
    client.setQueryData(["hod-history", "actor-A"], "A's private HOD history");
    handler({ id: "actor-B" });
    client.setQueryData(["permission-engine-users", "actor-B"], "B's private grants");
    handler({ id: "actor-A" });
    expect(client.getQueryData(["permission-engine-users", "actor-B"])).toBeUndefined();
    expect(client.getQueryData(["hod-history", "actor-A"])).toBeUndefined();
    client.setQueryData(["hod-identity-suggestions", "actor-A"], "A's private ballot hints");
    handler(null);
    expect(client.getQueryData(["hod-identity-suggestions", "actor-A"])).toBeUndefined();
    expect(resets).toBe(4);
    client.clear();
  });

  it("clears these roots through the same canonical cleanup helper", () => {
    const client = new QueryClient();
    client.setQueryData(["hod-history", "actor"], 1);
    client.setQueryData(["permission-engine-catalog", "actor"], 2);
    clearPrivateAccountQueries(client);
    expect(client.getQueryData(["hod-history", "actor"])).toBeUndefined();
    expect(client.getQueryData(["permission-engine-catalog", "actor"])).toBeUndefined();
    client.clear();
  });
});
