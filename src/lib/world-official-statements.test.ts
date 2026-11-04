import { describe, expect, it } from "vitest";
import {
  WORLD_STATEMENT_PAGE_SIZE,
  WorldStatementProjectionError,
  normalizeWorldStatementId,
  normalizeWorldStatementSlug,
  normalizeWorldStatementVersion,
  parseWorldStatementDetail,
  parseWorldStatementFeed,
  parseWorldStatementHistory,
  parseWorldStatementManageContext,
  parseWorldStatementReceipt,
} from "./world-official-statements";

const STMT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OFFICE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OP = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const summary = {
  id: STMT,
  title: "GUARD official position",
  publishedAt: "2026-11-04T13:00:00Z",
  statementType: "organization",
  revision: 1,
  organizationSlug: "guard",
  organizationName: "GUARD",
  officeTitle: null,
  issuerName: null,
};

describe("TG9 public statement read model", () => {
  it("accepts exactly a public-identity summary and discards unexpected user linkage", () => {
    expect(parseWorldStatementFeed({
      items: [{ ...summary, user_id: OP, privateDraftText: "hidden" }],
      hasMore: false, offset: 0,
    }, 0, "guard")).toEqual({
      items: [summary], hasMore: false, offset: 0,
    });
  });

  it("rejects malformed institutions, invented issuers and cross-institution data", () => {
    expect(() => parseWorldStatementFeed({
      items: [{ ...summary, organizationSlug: "fake private" }],
      hasMore: false, offset: 0,
    }, 0, "guard")).toThrow(WorldStatementProjectionError);
    expect(() => parseWorldStatementFeed({
      items: [{ ...summary, organizationSlug: "unity" }],
      hasMore: false, offset: 0,
    }, 0, "guard")).toThrow(/scope/);
    expect(() => parseWorldStatementFeed({
      items: [{ ...summary, issuerName: "Invented official" }],
      hasMore: false, offset: 0,
    }, 0, "guard")).toThrow(/issuer/);
  });

  it("requires both office and official name for officeholder attribution", () => {
    const officeholder = { ...summary, statementType: "officeholder",
      officeTitle: "Chairperson", issuerName: "Official Person" };
    expect(parseWorldStatementFeed({
      items: [officeholder], hasMore: false, offset: 0,
    }, 0, "guard").items[0].issuerName).toBe("Official Person");
    expect(() => parseWorldStatementFeed({
      items: [{ ...officeholder, issuerName: null }],
      hasMore: false, offset: 0,
    }, 0, "guard")).toThrow(/issuer/);
  });

  it("rejects duplicate IDs and noncanonical order", () => {
    expect(() => parseWorldStatementFeed({
      items: [summary, summary], hasMore: false, offset: 0,
    }, 0, "guard")).toThrow(/duplicate/);
    expect(() => parseWorldStatementFeed({
      items: [{ ...summary, publishedAt: "2026-01-01T00:00:00Z" }, summary],
      hasMore: false, offset: 0,
    }, 0, "guard")).toThrow(/ordering/);
  });

  it("enforces bounded, exact pagination and safely handles an empty published page", () => {
    expect(parseWorldStatementFeed({
      items: [], hasMore: false, offset: WORLD_STATEMENT_PAGE_SIZE,
    }, WORLD_STATEMENT_PAGE_SIZE, "guard")).toEqual({
      items: [], hasMore: false, offset: WORLD_STATEMENT_PAGE_SIZE,
    });
    expect(() => parseWorldStatementFeed({
      items: [summary], hasMore: true, offset: 0,
    }, 0, "guard")).toThrow(/pagination/);
    expect(() => parseWorldStatementFeed({
      items: [], hasMore: false, offset: 24,
    }, 12, "guard")).toThrow(/feed/);
  });

  it("fails closed for stale, wrong and malformed historical versions", () => {
    const detail = { ...summary, updatedAt: "2026-11-04T13:05:00Z", revision: 2,
      currentVersion: 2, shownVersion: 1, body: "First published position.",
      correctionReason: null, versionPublishedAt: "2026-11-04T13:00:00Z" };
    expect(parseWorldStatementDetail(detail, STMT, "guard", 1)?.shownVersion).toBe(1);
    expect(parseWorldStatementDetail(null, STMT, "guard", null)).toBeNull();
    expect(() => parseWorldStatementDetail(detail, STMT, "guard", 2)).toThrow(/identity/);
    expect(() => parseWorldStatementDetail({ ...detail, revision: 1 },
      STMT, "guard", 1)).toThrow(/identity/);
    expect(() => parseWorldStatementDetail({ ...detail, shownVersion: 2,
      correctionReason: null }, STMT, "guard", null)).toThrow(/correction reason/);
  });

  it("retains correction reason and public timestamp in a newer version", () => {
    const detail = { ...summary, revision: 3, currentVersion: 3, shownVersion: 3,
      updatedAt: "2026-11-04T14:00:00Z", body: "Corrected position.",
      correctionReason: "Corrected the previous position.", versionPublishedAt: "2026-11-04T14:00:00Z" };
    expect(parseWorldStatementDetail(detail, STMT, "guard", 3)?.correctionReason)
      .toBe("Corrected the previous position.");
  });

  it("pages historical version metadata without bulk historical body reads", () => {
    expect(parseWorldStatementHistory({
      offset: 0, hasMore: false, items: [
        { version: 3, publishedAt: "2026-11-04T14:00:00Z", correctionReason: "Correction three" },
        { version: 2, publishedAt: "2026-11-04T13:05:00Z", correctionReason: "Correction two" },
        { version: 1, publishedAt: "2026-11-04T13:00:00Z", correctionReason: null },
      ],
    }, 0)?.items.map(x => x.version)).toEqual([3, 2, 1]);
    expect(() => parseWorldStatementHistory({
      offset: 0, hasMore: false, items: [
        { version: 1, publishedAt: "2026-11-04T13:00:00Z", correctionReason: null },
        { version: 2, publishedAt: "2026-11-04T13:05:00Z", correctionReason: "Changed" },
      ],
    }, 0)).toThrow(/order/);
  });

  it("disallows guessed publisher offices or organization mismatch", () => {
    const context = {
      organizationId: ORG, organizationSlug: "guard",
      canPublishAsOrganization: false,
      offices: [{ id: OFFICE, title: "Chairperson" }],
    };
    expect(parseWorldStatementManageContext(context, "guard").offices).toHaveLength(1);
    expect(() => parseWorldStatementManageContext(context, "unity")).toThrow(/context/);
    expect(() => parseWorldStatementManageContext({ ...context, offices: [] }, "guard"))
      .toThrow(/empty/);
    expect(() => parseWorldStatementManageContext({
      ...context, offices: [context.offices[0], context.offices[0]],
    }, "guard")).toThrow(/duplicate/);
  });

  it("only accepts canonical operation receipts and never infers success", () => {
    const receipt = { ok: true, statementId: STMT, operationId: OP,
      revision: 2, replayed: true };
    expect(parseWorldStatementReceipt(receipt)).toEqual(receipt);
    expect(() => parseWorldStatementReceipt({
      ...receipt, replayed: "true",
    })).toThrow(/receipt/);
    expect(() => parseWorldStatementReceipt({ ...receipt, ok: false })).toThrow(/receipt/);
  });

  it("rejects malformed and abusive route segments before RPC", () => {
    expect(normalizeWorldStatementSlug("guard")).toBe("guard");
    expect(normalizeWorldStatementId(STMT)).toBe(STMT);
    expect(normalizeWorldStatementVersion("12")).toBe(12);
    expect(normalizeWorldStatementVersion(undefined)).toBeNull();
    expect(() => normalizeWorldStatementSlug("GUARD)or(true")).toThrow();
    expect(() => normalizeWorldStatementId("id=eq.any")).toThrow();
    expect(() => normalizeWorldStatementVersion("1e6")).toThrow();
    expect(() => normalizeWorldStatementVersion("0")).toThrow();
  });
});
