import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  guardReviewErrorMessage,
  nextGuardReviewPhase,
  parseGuardReviewInbox,
  parseGuardReviewReceipt,
} from "./terra-governance-guard-review";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261107001000_v3_tg5_guard_application_review.sql"),
  "utf8",
);
const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/world/membership/review.tsx"),
  "utf8",
);

const orgId = "67f9f20e-cc5b-4ca9-b00b-5e26ed989e2a";
const countryId = "5d0b25af-8888-4bf0-8c8f-46f7a4ba8a90";
const appId = "7873c955-7f46-4f85-9c78-66b1302dcab9";
const opId = "e8ea1955-acf1-43a0-a843-d9f00f250580";
const timestamp = "2026-11-06T22:15:00+00:00";

const application = {
  id: appId,
  countryId,
  countryName: "Country Example",
  countryCode: "EX",
  officialDesignation: "Republic of Example",
  governmentSystem: "Parliamentary republic",
  motivation: "Our country seeks to cooperate internationally.",
  contributions: "We offer logistical and technical support.",
  commitment: "We undertake to respect all GUARD international obligations.",
  status: "submitted",
  submittedAt: timestamp,
  revision: 1,
};

const inbox = {
  organizationId: orgId,
  organizationName: "GUARD",
  status: "submitted",
  canIntroduce: false,
  items: [application],
  nextCursor: null,
};

describe("WORLD-03 TG5B GUARD application review", () => {
  it("requires one authorized, bounded and phase-accurate private inbox", () => {
    expect(parseGuardReviewInbox(inbox, "submitted")).toEqual(inbox);
    expect(() => parseGuardReviewInbox(null, "submitted")).toThrow();
    expect(() => parseGuardReviewInbox({ ...inbox, status: "introduced" }, "submitted")).toThrow();
    expect(() => parseGuardReviewInbox({ ...inbox, canIntroduce: "true" }, "submitted")).toThrow();
    expect(() => parseGuardReviewInbox({ ...inbox, items: Array(21).fill(application) }, "submitted")).toThrow();
    expect(() => parseGuardReviewInbox({
      ...inbox,
      items: [{ ...application, motivation: undefined }],
    }, "submitted")).toThrow();
    expect(() => parseGuardReviewInbox({
      ...inbox,
      items: [{ ...application, countryId: orgId }],
    }, "submitted")).not.toThrow(); // A different valid UUID is not a schema defect.
    expect(() => parseGuardReviewInbox({
      ...inbox,
      items: [{ ...application, status: "introduced" }],
    }, "submitted")).toThrow();
  });

  it("requires a valid last-row keyset cursor, not unbounded offset pagination", () => {
    const page = Array.from({ length: 20 }, (_, i) => ({
      ...application,
      id: i === 19 ? appId : "fefefefe-ffff-4fff-8fff-" + i.toString().padStart(12, "0"),
    }));
    const cursor = { submittedAt: timestamp, id: appId };
    expect(parseGuardReviewInbox({ ...inbox, items: page, nextCursor: cursor }, "submitted").nextCursor)
      .toEqual(cursor);
    expect(() => parseGuardReviewInbox({ ...inbox, nextCursor: cursor }, "submitted")).toThrow();
    expect(() => parseGuardReviewInbox({
      ...inbox, items: page, nextCursor: { ...cursor, id: orgId },
    }, "submitted")).toThrow();
    expect(() => parseGuardReviewInbox({
      ...inbox, items: page, nextCursor: { ...cursor, submittedAt: "yesterday" },
    }, "submitted")).toThrow();
  });

  it("never treats review or introduction as admission", () => {
    expect(nextGuardReviewPhase("submitted", "review")).toBe("under_review");
    expect(nextGuardReviewPhase("under_review", "introduce")).toBe("introduced");
    expect(nextGuardReviewPhase("introduced", "introduce")).toBeNull();
    expect(nextGuardReviewPhase("submitted", "introduce")).toBeNull();
    expect(nextGuardReviewPhase("under_review", "review")).toBeNull();
    expect(migration).not.toMatch(/insert into public\.world_organization_memberships/i);
    expect(migration).not.toMatch(/update public\.world_organization_memberships/i);
    expect(migration).not.toMatch(/insert into public\.world_organization_representations/i);
  });

  it("rejects incomplete, scope-mismatched, stale or non-succeeded receipts", () => {
    const expected = {
      applicationId: appId, organizationId: orgId, countryId,
      expectedRevision: 1, targetStatus: "under_review" as const, operationId: opId,
    };
    const response = {
      status: "succeeded", operationId: opId,
      result: {
        ok: true, applicationId: appId, organizationId: orgId, countryId,
        status: "under_review", revision: 2, operationId: opId,
      },
    };
    expect(parseGuardReviewReceipt(response, expected)).toEqual({
      applicationId: appId, revision: 2, status: "under_review",
    });
    expect(() => parseGuardReviewReceipt({ ...response, status: "processing" }, expected)).toThrow();
    expect(() => parseGuardReviewReceipt({ ...response, operationId: orgId }, expected)).toThrow();
    expect(() => parseGuardReviewReceipt({
      ...response, result: { ...response.result, countryId: orgId },
    }, expected)).toThrow();
    expect(() => parseGuardReviewReceipt({
      ...response, result: { ...response.result, revision: 1 },
    }, expected)).toThrow();
    expect(() => parseGuardReviewReceipt({
      ...response, result: { ...response.result, status: "approved" },
    }, expected)).toThrow();
  });

  it("has DB-backed privacy, version, audit and authority boundaries", () => {
    expect(migration).toContain("create table public.world_membership_application_review_history");
    expect(migration).toContain("alter table public.world_membership_application_review_history enable row level security");
    expect(migration).toContain("revoke all on public.world_membership_application_review_history from public, anon, authenticated, service_role");
    expect(migration).toContain("create or replace function public.world_guard_review_inbox_v1(");
    expect(migration).toContain("create or replace function public.world_review_guard_application_v1(");
    expect(migration).toContain("'world.membership.review'");
    expect(migration).toContain("'world.membership.introduce'");
    expect(migration).toContain("public.world_access_allowed(");
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("private.studio2_complete_operation(");
    expect(migration).toContain("public.studio2_reconcile_operation(");
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("for update;");
    expect(migration).toContain("v_application.revision <> p_expected_revision");
    expect(migration).toContain("limit 21");
    expect(migration).toContain("v_items := v_items - 20");
    expect(migration).not.toMatch(/grant (insert|update|delete|all) on public\.world_membership_application_review_history to (authenticated|anon)/i);
  });

  it("has an actor-keyed private UI and never leaks internal diagnostics", () => {
    expect(route).toContain("useAuthenticatedUser");
    expect(route).toContain("currentUser.id, phase");
    expect(route).toContain("gcTime: 0");
    expect(route).toContain("noindex,nofollow");
    expect(route).toContain("mutation.mutate(");
    expect(route).toContain("Retry same operation");
    expect(route).toContain("General Assembly vote is still required");
    const privateDetail = "SQL raw table name and user's secret application";
    expect(guardReviewErrorMessage({ message: privateDetail })).not.toContain(privateDetail);
    expect(guardReviewErrorMessage({ code: "42501", message: privateDetail }))
      .toContain("authority");
  });
});
