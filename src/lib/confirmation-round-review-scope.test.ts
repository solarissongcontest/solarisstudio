import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { assertConfirmationRoundPreviewMatchesRequest, assertConfirmationRoundReceiptMatchesRequest, isCurrentConfirmationRoundReview, validateConfirmationRoundFormFields } from "./confirmation-round-review-scope";

describe("Organizer Confirmation round review context", () => {
  const request = { editionId: "edition-a", epoch: 4 };

  it("only accepts an exact current Organizer edition and preview scope", () => {
    const current = { editionId: "edition-a", organizerEditionId: "edition-a", epoch: 4 };
    expect(isCurrentConfirmationRoundReview(request, current, "edition-a")).toBe(true);
    expect(isCurrentConfirmationRoundReview(request, current, "edition-b")).toBe(false);
    expect(isCurrentConfirmationRoundReview(request, {
      ...current, organizerEditionId: "edition-b",
    })).toBe(false);
    expect(isCurrentConfirmationRoundReview(request, {
      ...current, editionId: "edition-b",
    })).toBe(false);
  });

  it("rejects A → B → A stale previews despite an identical edition id", () => {
    const returnedToA = { editionId: "edition-a", organizerEditionId: "edition-a", epoch: 6 };
    expect(isCurrentConfirmationRoundReview(request, returnedToA, "edition-a")).toBe(false);
    expect(isCurrentConfirmationRoundReview(
      { editionId: "edition-a", epoch: 6 }, returnedToA, "edition-a",
    )).toBe(true);
  });

  it("rejects unscoped requests and invalid epochs", () => {
    expect(isCurrentConfirmationRoundReview(
      { editionId: "", epoch: 0 },
      { editionId: "", organizerEditionId: "", epoch: 0 },
    )).toBe(false);
    expect(isCurrentConfirmationRoundReview(
      { editionId: "edition-a", epoch: -1 },
      { editionId: "edition-a", organizerEditionId: "edition-a", epoch: -1 },
    )).toBe(false);
  });

  it("rejects wrong round, command kind, edition and invalid expected versions", () => {
    const request = { editionId: "edition-a", roundId: "round-1", changeKind: "editing" };
    const preview = { ...request, expectedVersion: 4 };
    expect(() => assertConfirmationRoundPreviewMatchesRequest(request, preview)).not.toThrow();
    expect(() => assertConfirmationRoundPreviewMatchesRequest(request, { ...preview, roundId: "round-2" })).toThrow();
    expect(() => assertConfirmationRoundPreviewMatchesRequest(request, { ...preview, editionId: "edition-b" })).toThrow();
    expect(() => assertConfirmationRoundPreviewMatchesRequest(request, { ...preview, changeKind: "status" })).toThrow();
    expect(() => assertConfirmationRoundPreviewMatchesRequest(request, { ...preview, expectedVersion: -1 })).toThrow();
    expect(() => assertConfirmationRoundPreviewMatchesRequest(request, { ...preview, expectedVersion: Number.NaN })).toThrow();
    const create = { editionId: "edition-a", roundId: null, changeKind: "create" };
    expect(() => assertConfirmationRoundPreviewMatchesRequest(create, { ...create, expectedVersion: 0 })).not.toThrow();
  });

  it("checks server impact-preview edition before presenting an actionable review", () => {
    const route = readFileSync("src/routes/confirmations/admin/rounds.tsx", "utf8");
    expect(route).toContain("isCurrentConfirmationRoundReview(request, reviewScopeRef.current, preview.editionId)");
    expect(route).toContain("assertConfirmationRoundPreviewMatchesRequest(");
    expect(route).toContain("roundId: input.roundId ?? null, changeKind: input.kind");
    expect(route).toContain("scopeEpoch: request.epoch");
    expect(route).toContain("open={Boolean(activePendingChange)}");
    expect(route).toContain("if (applyInFlightRef.current || !activePendingChange");
    expect(route).toContain("if (!isCurrentConfirmationRoundReview(request, reviewScopeRef.current))");
    expect(route).toContain("await applyConfirmationRoundChange({");
    expect(route).toContain("expectedVersion: pending.preview.expectedVersion");
    expect(route).toContain("idempotencyKey: pending.idempotencyKey");
  });

  it("does not allow an old request to unlock the new edition's in-flight preview", () => {
    const route = readFileSync("src/routes/confirmations/admin/rounds.tsx", "utf8");
    expect(route).toContain("previewInFlightRef.current === request.epoch");
    expect(route).toContain(
      "if (previewInFlightRef.current === request.epoch) previewInFlightRef.current = null;",
    );
    expect(route).toContain("reviewScopeRef.current.organizerEditionId,");
    expect(route).toContain("A round operation completed for a previous edition.");
  });

  it("accepts only a canonical receipt for the exact reviewed round command and operation", () => {
    const request = {
      roundId: "5c74f40e-3083-48a8-8fe4-eb79201e5c96",
      changeKind: "editing",
      operationId: "825b8563-5124-4bef-83fb-1a06d97555a7",
      expectedVersion: 4,
    };
    const receipt = {
      ok: true,
      changeKind: "editing",
      riskClass: "R2",
      roundId: request.roundId,
      operationId: request.operationId,
      previousVersion: 4,
      version: 5,
      affectedResponses: 3,
    };
    expect(() => assertConfirmationRoundReceiptMatchesRequest(request, receipt)).not.toThrow();
    expect(() => assertConfirmationRoundReceiptMatchesRequest(request, null)).toThrow();
    expect(() => assertConfirmationRoundReceiptMatchesRequest(request, { ...receipt, ok: false })).toThrow();
    expect(() => assertConfirmationRoundReceiptMatchesRequest(request, { ...receipt, roundId: "other-round" })).toThrow();
    expect(() => assertConfirmationRoundReceiptMatchesRequest(request, { ...receipt, changeKind: "delete" })).toThrow();
    expect(() => assertConfirmationRoundReceiptMatchesRequest(request, { ...receipt, operationId: "other-operation" })).toThrow();
    expect(() => assertConfirmationRoundReceiptMatchesRequest(request, { ...receipt, riskClass: "R3" })).toThrow();
    expect(() => assertConfirmationRoundReceiptMatchesRequest(request, { ...receipt, previousVersion: 3 })).toThrow();
    expect(() => assertConfirmationRoundReceiptMatchesRequest(request, { ...receipt, version: 3 })).toThrow();
    expect(() => assertConfirmationRoundReceiptMatchesRequest(request, { ...receipt, affectedResponses: -1 })).toThrow();
    expect(() => assertConfirmationRoundReceiptMatchesRequest(request, { ...receipt, affectedResponses: Number.NaN })).toThrow();
  });

  it("accepts the create receipt's new server-generated ID and the deletion receipt's R3 risk", () => {
    const operationId = "825b8563-5124-4bef-83fb-1a06d97555a7";
    const create = { roundId: null, changeKind: "create", operationId, expectedVersion: 0 };
    const createdReceipt = {
      ok: true,
      changeKind: "create",
      riskClass: "R2",
      roundId: "5c74f40e-3083-48a8-8fe4-eb79201e5c96",
      operationId,
      previousVersion: 0,
      version: 1,
      affectedResponses: 0,
    };
    expect(() => assertConfirmationRoundReceiptMatchesRequest(create, createdReceipt)).not.toThrow();
    expect(() => assertConfirmationRoundReceiptMatchesRequest(create, { ...createdReceipt, roundId: null })).toThrow();
    const deletion = { roundId: createdReceipt.roundId, changeKind: "delete", operationId, expectedVersion: 1 };
    const deletedReceipt = { ...createdReceipt, riskClass: "R3", changeKind: "delete", previousVersion: 1, version: 2 };
    expect(() => assertConfirmationRoundReceiptMatchesRequest(deletion, deletedReceipt)).not.toThrow();
    expect(() => assertConfirmationRoundReceiptMatchesRequest(deletion, { ...deletedReceipt, riskClass: "R2" })).toThrow();
  });

  it("does not mistake a failed post-commit refresh for a failed round mutation", () => {
    const route = readFileSync("src/routes/confirmations/admin/rounds.tsx", "utf8");
    const start = route.indexOf("  async function applyPendingChange()");
    const end = route.indexOf("  function cancelPendingChange()", start);
    const apply = route.slice(start, end);
    const rpc = apply.indexOf("await applyConfirmationRoundChange({");
    const verify = apply.indexOf("assertConfirmationRoundReceiptMatchesRequest({");
    const committed = apply.indexOf("receiptVerified = true;");
    const refresh = apply.indexOf("await refresh(request.editionId);");
    expect(rpc).toBeGreaterThanOrEqual(0);
    expect(verify).toBeGreaterThan(rpc);
    expect(committed).toBeGreaterThan(verify);
    expect(refresh).toBeGreaterThan(committed);
    expect(apply).toContain("if (receiptVerified) {");
    expect(apply).toContain("Round change was applied, but the round list could not be refreshed.");
  });

  it("parses valid local round schedules without silently altering the submitted civil time", () => {
    const local = "2026-11-05T09:30";
    const validated = validateConfirmationRoundFormFields({
      opensAtLocal: local,
      closesAtLocal: "2026-11-06T15:00",
      responseLimit: " 42 ",
    });
    expect(validated.opensAt).toBe(new Date(local).toISOString());
    expect(validated.closesAt).toBe(new Date("2026-11-06T15:00").toISOString());
    expect(validated.responseLimit).toBe(42);
    expect(validateConfirmationRoundFormFields({
      opensAtLocal: "", closesAtLocal: "", responseLimit: "",
    })).toEqual({ opensAt: null, closesAt: null, responseLimit: null });
  });

  it("rejects invalid civil dates, impossible times and backwards schedules", () => {
    const basic = { opensAtLocal: "2026-11-05T09:30", closesAtLocal: "", responseLimit: "" };
    expect(() => validateConfirmationRoundFormFields({ ...basic, opensAtLocal: "2026-02-30T09:30" })).toThrow();
    expect(() => validateConfirmationRoundFormFields({ ...basic, opensAtLocal: "2026-11-05T25:30" })).toThrow();
    expect(() => validateConfirmationRoundFormFields({ ...basic, opensAtLocal: "not a date" })).toThrow();
    expect(() => validateConfirmationRoundFormFields({
      ...basic, closesAtLocal: "2026-11-05T09:30",
    })).toThrow("Closing time must be after opening time.");
    expect(() => validateConfirmationRoundFormFields({
      ...basic, closesAtLocal: "2026-11-05T08:00",
    })).toThrow();
  });

  it("prevents PostgreSQL integer overflow and invalid round capacity before impact review", () => {
    const input = { opensAtLocal: "", closesAtLocal: "", responseLimit: "" };
    for (const responseLimit of ["0", "-1", "1.5", "foo", "01", "2147483648", "9007199254740993"]) {
      expect(() => validateConfirmationRoundFormFields({ ...input, responseLimit })).toThrow();
    }
    expect(validateConfirmationRoundFormFields({ ...input, responseLimit: "2147483647" }).responseLimit).toBe(2147483647);
    const route = readFileSync("src/routes/confirmations/admin/rounds.tsx", "utf8");
    const start = route.indexOf("  async function submit()");
    const end = route.indexOf("  async function requestStatusChange(", start);
    const submit = route.slice(start, end);
    expect(submit.indexOf("validateConfirmationRoundFormFields({")).toBeGreaterThanOrEqual(0);
    expect(submit.indexOf("validateConfirmationRoundFormFields({")).toBeLessThan(submit.indexOf("await prepareChange({"));
    expect(submit).toContain("opensAt: validated.opensAt");
    expect(submit).toContain("responseLimit: validated.responseLimit");
    expect(submit).not.toContain("new Date(form.opens_at).toISOString()");
  });
});
