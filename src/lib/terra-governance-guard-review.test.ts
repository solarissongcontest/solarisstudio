import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  guardReviewErrorMessage,
  nextGuardReviewPhase,
  parseGuardReviewInbox,
  parseGuardReviewReceipt,
  parseGuardExternalIntakeReceipt,
  parseGuardReviewCountries,
  validateGuardExternalIntake,
} from "./terra-governance-guard-review";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261107001000_v3_tg5_guard_application_review.sql"),
  "utf8",
);
const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/world/membership/review.tsx"),
  "utf8",
);
const externalForm = readFileSync(
  resolve(process.cwd(), "src/components/world/GuardExternalApplicationForm.tsx"),
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
  intakeSource: "solaris",
  sourceReference: null,
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


  it("preserves private external provenance without impersonating a country controller", () => {
    expect(migration).toContain("add column intake_source text not null default 'solaris'");
    expect(migration).toContain("registered_by_user_id uuid references auth.users(id)");
    expect(migration).toContain("add constraint world_membership_application_external_controller_check");
    expect(migration).toContain("create table public.world_membership_application_external_provenance");
    expect(migration).toContain("alter table public.world_membership_application_external_provenance enable row level security");
    expect(migration).toContain("revoke all on public.world_membership_application_external_provenance");
    expect(migration).not.toContain("add column external_source_reference");
    expect(migration).toContain("submitted_by is null");
    expect(migration).toContain("create or replace function public.world_register_external_guard_application_v1(");
    expect(migration).toContain("'world.membership.application.registered_external'");
    expect(migration).toContain("'world.membership.introduce',p_organization_id,null");
    expect(migration).toContain("'world.membership.review',p_organization_id,null");
    expect(migration).toContain("revoke all on function public.world_register_external_guard_application_v1(");
    expect(migration).not.toMatch(/grant (insert|update|delete) on public\.world_membership_applications to authenticated/i);
    expect(() => parseGuardReviewInbox({
      ...inbox,
      items: [{ ...application, intakeSource: "external", sourceReference: "external message 2026-11-07" }],
    }, "submitted")).not.toThrow();
    expect(() => parseGuardReviewInbox({
      ...inbox,
      items: [{ ...application, intakeSource: "external", sourceReference: null }],
    }, "submitted")).toThrow();
    expect(() => parseGuardReviewInbox({
      ...inbox,
      items: [{ ...application, intakeSource: "made-up-source" }],
    }, "submitted")).toThrow();
  });

  it("requires verified country selection, full canonical application fields and exact external receipt", () => {
    const countries = [{ id: countryId, name: "Example", short_code: "EX" }];
    expect(parseGuardReviewCountries(countries)).toEqual(countries);
    expect(() => parseGuardReviewCountries(Array(201).fill(countries[0]))).toThrow();
    expect(() => parseGuardReviewCountries([countries[0], countries[0]])).toThrow();
    expect(validateGuardExternalIntake({
      officialDesignation: "Republic of Example",
      governmentSystem: "Democratic republic",
      motivation: "Seeking to join GUARD to support peace.",
      contributions: "Technical and logistical support.",
      commitment: "We pledge to follow all GUARD obligations.",
    }, "private message received Nov 7")).toEqual({});
    expect(validateGuardExternalIntake({
      officialDesignation: "",
      governmentSystem: "",
      motivation: "",
      contributions: "",
      commitment: "",
    }, "short").sourceReference).toContain("8 and 500");
    const expected = { organizationId: orgId, countryId, operationId: opId };
    const data = {
      status: "succeeded", operationId: opId,
      result: {
        ok: true, applicationId: appId, organizationId: orgId,
        countryId, status: "submitted", intakeSource: "external", operationId: opId,
      },
    };
    expect(parseGuardExternalIntakeReceipt(data, expected).applicationId).toBe(appId);
    expect(() => parseGuardExternalIntakeReceipt({
      ...data, result: { ...data.result, intakeSource: "solaris" },
    }, expected)).toThrow();
    expect(externalForm).toContain("loadGuardReviewCountries");
    expect(externalForm).toContain("registerExternalGuardApplication");
    expect(externalForm).toContain("Review registration");
    expect(externalForm).toContain("Confirm official registration");
    expect(externalForm).toContain('key: "commitment"');
    expect(route).toContain("<GuardExternalApplicationForm");
    expect(route).toContain('application.intakeSource === "external"');
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
    expect(migration).toContain("term_row.started_at <= now()");
    expect(migration).toContain("term_row.actual_end_at is null");
    expect(migration).not.toContain("term_row.ends_at is null");
    expect(migration).not.toContain("term_row.starts_at");
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
