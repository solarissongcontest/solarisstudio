import { describe, expect, it } from "vitest";
import { isScopedV3MeSummary, parseV3MeSummary } from "./v3-me-summary";
import { buildV3MeProjection } from "./v3-me";

describe("Me server summary evidence", () => {
  it("does not convert unavailable receipt counts into zero", () => {
    expect(parseV3MeSummary({ available: false, country_id: null, receipt_count: null, history: [] }).receipt_count).toBeNull();
  });
  it("preserves a proven server count of zero", () => {
    expect(parseV3MeSummary({ available: true, country_id: "country", receipt_count: 0, history: [] }).receipt_count).toBe(0);
  });
  it("rejects invalid count evidence and malformed history rows", () => {
    const result = parseV3MeSummary({ available: true, country_id: "country", receipt_count: "5", history: [{ edition_id: "e", edition_name: "Edition", edition_number: 22 }, { edition_id: "other" }] });
    expect(result.receipt_count).toBeNull();
    expect(result.history).toHaveLength(1);
  });
  it("strips extra private fields from summaries", () => {
    const result = parseV3MeSummary({ available: true, country_id: "country", receipt_count: 1, history: [], edit_token: "private", request_hash: "private" });
    expect(result).not.toHaveProperty("edit_token");
    expect(result).not.toHaveProperty("request_hash");
  });
  it("keeps unknown history and activity distinct in the presentation", () => {
    const result = buildV3MeProjection({ identity: { userId: "user", displayName: "Account", delegationName: null, delegationFlagUrl: null, displayRole: null }, currentMembership: null, history: [], historyAvailable: false, activity: { verifiedReceiptCount: null, awaitingAuthoritativeReceiptCount: null, href: "/my-solaris/activity" }, following: { followedCountryCount: null, followedContentCount: null, href: "/my-solaris/activity" }, preferenceLinks: [], accountLinks: [], canEnterOrganizer: false, organizerHref: "/admin" });
    expect(result.historyAvailable).toBe(false);
    expect(result.activity.verifiedReceiptCount).toBeNull();
    expect(result.organizerAction).toBeNull();
  });
});

it("never counts another viewer's cached receipt summary even for the same country", () => {
  const summary = parseV3MeSummary({ viewer_id: "other", country_id: "country", available: true, receipt_count: 4, history: [] });
  expect(isScopedV3MeSummary(summary, "viewer", "country")).toBe(false);
  expect(isScopedV3MeSummary(summary, "other", "country")).toBe(true);
  expect(isScopedV3MeSummary(summary, "other", "different")).toBe(false);
});
