import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const model = readFileSync("src/lib/v3-organizer-operation-feedback.ts", "utf8");
const component = readFileSync("src/components/admin/OrganizerOperationFeedback.tsx", "utf8");

describe("Organizer operation feedback UI contract", () => {
  it("surfaces authoritative operation and receipt evidence", () => {
    expect(component).toContain("Operation receipt");
    expect(component).toContain("Operation ID");
    expect(component).toContain("Correlation ID");
    expect(component).toContain("Receipt ID");
    expect(component).toContain("State version");
    expect(component).toContain("Server time");
  });

  it("keeps uncertain outcomes in reconciliation instead of blind retry", () => {
    expect(model).toContain('return ["reconcile"]');
    expect(component).toContain("Do not start a second mutation");
    expect(component).toContain("Reconcile operation");
    expect(component).toContain("Retry confirmed failure");
  });

  it("fails closed for ambiguous transport failures", () => {
    expect(model).toContain('"TIMEOUT"');
    expect(model).toContain('"CONNECTION_LOST"');
    expect(model).toContain('"FETCH_FAILED"');
    expect(model).toContain('"NETWORK_ERROR"');
    expect(model).toContain("const UNCERTAIN_CODES");
    expect(model).toContain("const CONFIRMED_NOT_SENT_CODES");
    expect(model).toContain('"REQUEST_NOT_SENT"');
    expect(model).toContain("the request was not sent to the authoritative command boundary");
  });

  it("shows stale-version review without offering overwrite", () => {
    expect(component).toContain("Your reviewed version");
    expect(component).toContain("Current authoritative version");
    expect(component).toContain("Compare changes");
    expect(component).toContain("Reload current state");
    expect(component).not.toContain("Overwrite");
    expect(component).not.toContain("Force save");
  });

  it("discards arbitrary diagnostics instead of rendering raw error objects", () => {
    expect(model).toContain("stack traces, payloads, tokens and arbitrary");
    expect(model).toContain("selectOrganizerOperationDiagnostics");
    expect(component).not.toContain("JSON.stringify");
    expect(component).not.toContain("dangerouslySetInnerHTML");
    expect(component).not.toContain("accessToken");
    expect(component).not.toContain("stack");
  });

  it("does not create a browser-side mutation or Supabase authority", () => {
    expect(component).not.toContain("supabase");
    expect(component).not.toContain(".rpc(");
    expect(component).not.toContain(".from(");
    expect(model).not.toContain("supabase");
    expect(model).not.toContain(".rpc(");
  });

  it("uses accessible live feedback semantics", () => {
    expect(component).toContain('role={isAlert ? "alert" : "status"}');
    expect(component).toContain('aria-live={feedback.phase === "reconciling" || feedback.phase === "pending" ? "polite" : undefined}');
    expect(component).toContain('aria-atomic="true"');
  });
});
