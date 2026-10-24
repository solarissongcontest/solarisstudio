import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const adapter = source("src/lib/v3-organizer-communications-operations.ts");
const lifecycle = source("src/lib/v3-official-communications-commands.ts");
const drafts = source("src/lib/v3-official-communications-draft-commands.ts");

describe("V3 Organizer Official Communications operation boundary", () => {
  it("keeps Organizer review state above the System transport helpers", () => {
    expect(adapter).toContain('from "@/lib/v3-official-communications-commands"');
    expect(adapter).toContain('from "@/lib/v3-official-communications-draft-commands"');
    expect(adapter).not.toContain("integrations/supabase");
    expect(adapter).not.toContain(".rpc(");
    expect(lifecycle).toContain('"v3_preflight_notice_lifecycle"');
    expect(lifecycle).toContain('"v3_execute_notice_lifecycle"');
    expect(drafts).toContain('"v3_create_notice_draft"');
    expect(drafts).toContain('"v3_update_notice_draft"');
  });

  it("binds every Organizer operation to one explicit edition", () => {
    expect(adapter).toContain('scopeKind: "edition"');
    expect(adapter).toContain("notice.editionId !== editionId");
    expect(adapter).toContain("settled.scopeKind !== \"edition\"");
    expect(adapter).toContain("settled.editionId ?? null) !== review.editionId");
    expect(adapter).toContain("settled.editionId ?? null) !== editionId");
  });

  it("freezes the canonical notice revision before lifecycle commit", () => {
    expect(adapter).toContain("expectedRevision = requireRevision(input.notice.revision)");
    expect(adapter).toContain("preflight.currentRevision !== expectedRevision");
    expect(adapter).toContain("preflight.expectedRevision !== expectedRevision");
    expect(adapter).toContain("review.expectedRevision !== input.currentNotice.revision");
    expect(adapter).toContain("expectedRevision: review.expectedRevision");
  });

  it("allocates one operation identity at review time and reuses it for commit", () => {
    expect(adapter).toContain("const operationId = createV3NoticeOperationId()");
    expect(adapter).toContain("operationId,");
    expect(adapter).toContain("review.operationId");
    expect(lifecycle).toContain("p_idempotency_key: operationId");
    expect(lifecycle).toContain("studio2_reconcile_operation");
  });

  it("rejects blocked preflights instead of turning the review sheet into permission", () => {
    expect(adapter).toContain("!preflight.canCommit || preflight.blockers.length > 0");
    expect(adapter).toContain("Official Communications cannot perform this action");
  });

  it("uses expected-revision draft and supersede commands rather than compatibility writes", () => {
    expect(adapter).toContain("updateV3NoticeDraft(");
    expect(adapter).toContain("requireRevision(input.existing.revision)");
    expect(adapter).toContain("createV3SupersedingNoticeDraft(");
    expect(adapter).toContain("requireRevision(input.notice.revision)");
    expect(drafts).toContain("p_expected_revision: expectedRevision");
  });

  it("validates durable command receipts before Organizer treats work as settled", () => {
    expect(adapter).toContain('result.status !== "succeeded"');
    expect(adapter).toContain("settled.noticeId !== review.noticeId");
    expect(adapter).toContain("settled.action !== review.action");
    expect(adapter).toContain("expectedNoticeId && settled.noticeId !== expectedNoticeId");
  });
});
