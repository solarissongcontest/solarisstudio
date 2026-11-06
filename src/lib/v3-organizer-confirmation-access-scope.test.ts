import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertOrganizerConfirmationAccessScope,
} from "./v3-organizer-confirmation-access-scope";

const scope = {
  submissionId: "submission-1",
  editionId: "edition-A",
  roundId: "round-1",
  updatedAt: "2026-11-06T09:00:00Z",
};

describe("Organizer Confirmation legacy access mutation scope", () => {
  it("accepts an exact unchanged submission, edition, round and revision", () => {
    expect(() => assertOrganizerConfirmationAccessScope(scope, { ...scope })).not.toThrow();
  });

  it("rejects a different submission before any controls are applied", () => {
    expect(() => assertOrganizerConfirmationAccessScope(scope, {
      ...scope, submissionId: "submission-2",
    })).toThrow(/outside the reviewed/);
  });

  it("rejects edits to a response after an edition switch", () => {
    expect(() => assertOrganizerConfirmationAccessScope(scope, {
      ...scope, editionId: "edition-B",
    })).toThrow(/outside the reviewed/);
  });

  it("rejects edits to another submission round", () => {
    expect(() => assertOrganizerConfirmationAccessScope(scope, {
      ...scope, roundId: "round-2",
    })).toThrow(/outside the reviewed/);
  });

  it("rejects response changes even when settings toggles still appear identical", () => {
    expect(() => assertOrganizerConfirmationAccessScope(scope, {
      ...scope, updatedAt: "2026-11-06T09:00:01Z",
    })).toThrow(/changed after/);
  });

  it("fails closed if any exact scope field is absent", () => {
    for (const field of Object.keys(scope) as (keyof typeof scope)[]) {
      expect(() => assertOrganizerConfirmationAccessScope({
        ...scope, [field]: "",
      }, scope)).toThrow(/lacks an exact response scope/);
    }
  });

  it("guards both pre-read and pre-write boundaries in the existing settings UI", () => {
    const sheet = readFileSync(resolve(process.cwd(),
      "src/components/admin/ConfirmationAccessSettingsSheet.tsx"), "utf8");
    expect(sheet).toContain("isScopeCurrent()");
    expect(sheet).toContain("assertOrganizerConfirmationAccessScope(pendingReview.scope, {");
    expect(sheet).toContain("await confirmationsSupabase.rpc(");
    expect(sheet).toContain('"admin_update_confirmation_controls"');
    expect(sheet).toContain("updatedAt: live.updated_at ?? \"\"");
  });

  it("reads the authoritative exact-edition response before evaluating any private settings", () => {
    const sheet = readFileSync(resolve(process.cwd(),
      "src/components/admin/ConfirmationAccessSettingsSheet.tsx"), "utf8");
    expect(sheet).toContain('"admin_confirmation_response_for_edition"');
    expect(sheet).toContain("_edition_id: pendingReview.scope.editionId");
    expect(sheet).toContain("_submission_id: pendingReview.scope.submissionId");
    expect(sheet).not.toContain('"admin_confirmation_response",');
    const scopeCheck = sheet.indexOf("assertOrganizerConfirmationAccessScope(pendingReview.scope, {");
    const serverRead = sheet.indexOf('"admin_confirmation_response_for_edition"');
    const serverWrite = sheet.indexOf('"admin_update_confirmation_controls"');
    expect(scopeCheck).toBeGreaterThan(-1);
    expect(serverRead).toBeGreaterThan(scopeCheck);
    expect(serverWrite).toBeGreaterThan(serverRead);
  });

  it("serializes legacy access writes against rapid repeated confirmations", () => {
    const sheet = readFileSync(resolve(process.cwd(),
      "src/components/admin/ConfirmationAccessSettingsSheet.tsx"), "utf8");
    expect(sheet).toContain("const saveInFlightRef = useRef(false);");
    expect(sheet).toContain("if (!pendingReview || saving || saveInFlightRef.current) return;");
    expect(sheet).toContain("saveInFlightRef.current = true;");
    expect(sheet).toContain("saveInFlightRef.current = false;");
    const lock = sheet.indexOf("saveInFlightRef.current = true;");
    const mutation = sheet.indexOf('"admin_update_confirmation_controls"');
    const unlock = sheet.indexOf("saveInFlightRef.current = false;");
    expect(lock).toBeLessThan(mutation);
    expect(unlock).toBeGreaterThan(mutation);
    expect(sheet).toContain("if (saving || saveInFlightRef.current) return;");
  });

  it("prevents cancel and sheet dismissal while an access mutation is in flight", () => {
    const sheet = readFileSync(resolve(process.cwd(),
      "src/components/admin/ConfirmationAccessSettingsSheet.tsx"), "utf8");
    expect(sheet).toContain("const closeSettingsSafely = () => {");
    const close = sheet.slice(sheet.indexOf("const closeSettingsSafely = () => {"),
      sheet.indexOf("const closeReview = () => {"));
    expect(close).toContain("if (saving || saveInFlightRef.current) return;");
    expect(close).toContain("onClose();");
    expect(sheet).toContain("onClose={closeSettingsSafely}");
    expect(sheet).toContain("onClick={closeSettingsSafely}");
    expect(sheet).not.toContain("onClose={saving ? () => undefined : onClose}");
  });

  it("binds the sheet to the exact response scope from Organizer detail", () => {
    const detail = readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses/$id.tsx"), "utf8");
    expect(detail).toContain("isScopeCurrent={isDisplayedResponseCurrent}");
    expect(detail).toContain("editionId={organizerEditionId}");
    expect(detail).toContain("roundId={data.round?.id ?? \"\"}");
    expect(detail).toContain("responseUpdatedAt={data.updated_at}");
  });
});
