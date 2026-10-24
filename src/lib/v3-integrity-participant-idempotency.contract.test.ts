import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const flow = () => read("src/components/integrity/IntegrityReportV5.tsx");
const draft = () => read("src/lib/integrity-report-v5.ts");
const anonymous = () => read("src/lib/integrity-case-create.functions.ts");
const protectedCase = () => read("src/lib/integrity-case-create.ts");

describe("V3 participant Integrity retry identity", () => {
  it("creates one secure submission identity and reuses it for an unchanged draft", () => {
    const text = draft();
    expect(text).toContain("SUBMISSION_IDENTITY_KEY");
    expect(text).toContain("getOrCreateIntegrityReportV5SubmissionIdentity");
    expect(text).toContain("const existing = readIntegrityReportV5SubmissionIdentity()");
    expect(text).toContain("if (existing) return existing");
    expect(text).toContain("operationId: randomUuidV4()");
    expect(text).toContain("idempotencyKey: randomHex(32)");
    expect(text).toContain("cryptoApi.getRandomValues");
    expect(text).not.toContain("localStorage");
  });

  it("invalidates retry identity when semantic draft content changes", () => {
    const text = draft();
    expect(text).toContain("SEMANTIC_DRAFT_KEYS");
    expect(text).toContain("const semanticChange = SEMANTIC_DRAFT_KEYS.some");
    expect(text).toContain("if (semanticChange) clearIntegrityReportV5SubmissionIdentity()");
    expect(text).toContain("clearIntegrityReportV5SubmissionIdentity();\n  try {\n    session()?.removeItem(DRAFT_KEY)");
  });

  it("keeps anonymous creation sessionless and sends the stable operation identity", () => {
    const text = anonymous();
    expect(text).toContain("persistSession: false");
    expect(text).toContain("autoRefreshToken: false");
    expect(text).toContain("detectSessionInUrl: false");
    expect(text).toContain('"v3_public_create_anonymous_integrity_case"');
    expect(text).toContain("p_operation_id: data.operationId");
    expect(text).toContain("p_idempotency_key: data.idempotencyKey");
    expect(text).not.toContain("auth.uid");
  });

  it("keeps protected creation on the authenticated caller path with the same identity", () => {
    const text = protectedCase();
    expect(text).toContain('"v3_create_protected_integrity_case"');
    expect(text).toContain("p_operation_id: identity.operationId");
    expect(text).toContain("p_idempotency_key: identity.idempotencyKey");
    expect(text).toContain("receipt_id: string");
    expect(text).toContain("replayed: boolean");
  });

  it("binds both privacy modes to one reviewed submission identity and records authoritative response identity", () => {
    const text = flow();
    expect(text).toContain("const submissionIdentity = getOrCreateIntegrityReportV5SubmissionIdentity()");
    expect(text).toContain("operationId: submissionIdentity.operationId");
    expect(text).toContain("idempotencyKey: submissionIdentity.idempotencyKey");
    expect(text).toContain("createIdempotentProtectedIntegrityCase(submissionIdentity");
    expect(text).toContain("operationId: result.operation_id");
    expect(text).toContain("receiptId: result.receipt_id");
  });

  it("does not invent client-side success when the request fails", () => {
    const text = flow();
    expect(text).toContain("onSuccess: () =>");
    expect(text).toContain("clearIntegrityReportV5Draft()");
    expect(text).toContain('navigate({ to: "/integrity/report/receipt" })');
    expect(text).toContain("onError: (error) => toast.error");
    expect(text).toContain("Nothing has been submitted yet.");
  });
});
