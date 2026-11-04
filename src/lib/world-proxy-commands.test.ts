import { describe, expect, it } from "vitest";

import {
  parseProxyDirectory,
  parseProxyItems,
  parseProxyReceipt,
} from "./world-proxy-commands";

const organizationId = "00000000-0000-4000-8000-000000000001";
const countryId = "00000000-0000-4000-8000-000000000002";
const repId = "00000000-0000-4000-8000-000000000003";
const personId = "00000000-0000-4000-8000-000000000004";
const proxyId = "00000000-0000-4000-8000-000000000005";
const operationId = "00000000-0000-4000-8000-000000000006";

const directory = {
  organization: { id: organizationId, slug: "guard", shortName: "GUARD" },
  representatives: [{
    id: repId, countryId, personId, revision: 2,
    displayName: "Verified Controller", role: "representative",
    votingAuthority: true, endsAt: null,
  }],
};
const item = {
  id: proxyId, representationId: repId, proxyPersonId: personId,
  proxyPersonName: "Verified Controller", countryId,
  organizationId, status: "requested", revision: 1,
  reason: "Temporary service at session",
  validFrom: "2026-12-01T12:00:00Z",
  validUntil: "2026-12-01T13:00:00Z",
  timeEffective: false,
};

describe("World proxy strict transport", () => {
  it("parses public institutional identities without inventing a new controller", () => {
    const parsed = parseProxyDirectory(directory, "guard");
    expect(parsed?.organization.id).toBe(organizationId);
    expect(parsed?.representatives).toEqual([{
      id: repId, personId, countryId, name: "Verified Controller", revision: 2,
    }]);
    expect(parseProxyDirectory(directory, "unity")).toBeNull();
    expect(parseProxyDirectory({ ...directory, representatives: null }, "guard")).toBeNull();
  });

  it("filters ended or nonvoting representatives from eligible identity choices", () => {
    const parsed = parseProxyDirectory({
      ...directory,
      representatives: [
        { ...directory.representatives[0], endsAt: "2026-01-01T00:00:00Z" },
        { ...directory.representatives[0], votingAuthority: false },
        { ...directory.representatives[0], personId: "invented" },
      ],
    }, "guard");
    expect(parsed?.representatives).toEqual([]);
  });

  it("requires every private proxy row to be structurally valid and bounded", () => {
    expect(parseProxyItems({ items: [item] }, "review")).toHaveLength(1);
    expect(parseProxyItems({ items: [item] }, "country")).toHaveLength(1);
    expect(() => parseProxyItems({ items: [{ ...item, revision: 0 }] }, "review")).toThrow();
    expect(() => parseProxyItems({ items: [{ ...item, countryId: null }] }, "review")).toThrow();
    expect(() => parseProxyItems({ items: [{ ...item, organizationId: null }] }, "country")).toThrow();
    expect(() => parseProxyItems({ items: [{ ...item, status: "unknown" }] }, "country")).toThrow();
    expect(() => parseProxyItems({ items: Array(26).fill(item) }, "review")).toThrow();
    expect(() => parseProxyItems({ items: Array(21).fill(item) }, "country")).toThrow();
  });

  it("will not accept an ambiguous, mismatched or fabricated mutation receipt", () => {
    const expected = { operationId, representationId: repId, status: "requested" as const };
    const receipt = {
      status: "succeeded",
      operationId,
      result: { ok: true, proxyId, representationId: repId, status: "requested", revision: 1 },
    };
    expect(parseProxyReceipt(receipt, expected)).toEqual({
      proxyId, revision: 1, operationId,
    });
    expect(() => parseProxyReceipt({ ...receipt, status: "pending" }, expected)).toThrow();
    expect(() => parseProxyReceipt({ ...receipt, operationId: personId }, expected)).toThrow();
    expect(() => parseProxyReceipt({
      ...receipt, result: { ...receipt.result, representationId: countryId },
    }, expected)).toThrow();
    expect(() => parseProxyReceipt({
      ...receipt, result: { ...receipt.result, status: "approved" },
    }, expected)).toThrow();
    expect(() => parseProxyReceipt({
      ...receipt, result: { ...receipt.result, revision: 0 },
    }, expected)).toThrow();
    expect(() => parseProxyReceipt(null, expected)).toThrow();
  });

  it("does not mistake time effectiveness for separate voting authority", () => {
    expect(parseProxyItems({
      items: [{ ...item, status: "approved", timeEffective: true }],
    }, "country")[0].timeEffective).toBe(true);
    expect(parseProxyItems({ items: [item] }, "review")[0].timeEffective).toBe(false);
  });
});
