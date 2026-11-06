import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  rollout: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc },
}));
vi.mock("@/lib/terra-world-public", () => ({
  fetchWorldPublicEnabled: mocks.rollout,
}));

import {
  getWorldOfficialStatementHistory,
  issueWorldOfficialStatement,
  listWorldOfficialStatements,
  parseWorldOfficialStatement,
  parseWorldOfficialStatementHistory,
} from "./world-official-statements";

const statement = {
  id: "statement-1",
  organizationSlug: "guard",
  organizationName: "GUARD",
  issuingOfficeId: null,
  publishedAt: "2026-11-07T01:00:00Z",
  revision: 2,
  title: "Official announcement",
  body: "Corrected official text.",
  correctionReason: "Clarification of the date",
};
const history = {
  id: "statement-1",
  organizationSlug: "guard",
  organizationName: "GUARD",
  issuingOfficeId: null,
  issuedByPersonId: null,
  publishedAt: "2026-11-07T01:00:00Z",
  revision: 2,
  versions: [
    { id: "v2", revision: 2, title: "Official announcement", body: "Corrected text.",
      correctionReason: "Clarification of the date", publishedAt: "2026-11-07T03:00:00Z" },
    { id: "v1", revision: 1, title: "Original announcement", body: "Original text.",
      correctionReason: null, publishedAt: "2026-11-07T01:00:00Z" },
  ],
};

describe("TG9 public statements: privacy and historical fidelity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rollout.mockResolvedValue(true);
  });

  it("only accepts structurally complete, publishable projections", () => {
    expect(parseWorldOfficialStatement(statement)).toEqual(statement);
    expect(parseWorldOfficialStatement({ ...statement, organizationSlug: "GUARD" })).toBeNull();
    expect(parseWorldOfficialStatement({ ...statement, revision: 0 })).toBeNull();
    expect(parseWorldOfficialStatement({ ...statement, body: "" })).toBeNull();
  });

  it("rejects history with missing earlier versions rather than silently hiding corrections", () => {
    expect(parseWorldOfficialStatementHistory(history)?.versions.map((v) => v.revision))
      .toEqual([2, 1]);
    expect(parseWorldOfficialStatementHistory({
      ...history, versions: [history.versions[0]],
    })).toBeNull();
    expect(parseWorldOfficialStatementHistory({
      ...history, versions: [history.versions[1], history.versions[0]],
    })).toBeNull();
  });

  it("does not query when the canonical World rollout is off", async () => {
    mocks.rollout.mockResolvedValue(false);
    await expect(listWorldOfficialStatements("guard")).rejects.toThrow("not available");
    await expect(getWorldOfficialStatementHistory("statement-1")).rejects.toThrow("not available");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns bounded public statements without making extra client fanout reads", async () => {
    mocks.rpc.mockResolvedValue({ data: [statement], error: null });
    await expect(listWorldOfficialStatements("guard", 5000)).resolves.toEqual([statement]);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("world_public_statements_v1", {
      p_organization_slug: "guard", p_limit: 30,
    });
  });

  it("returns no history for not-found and fails closed on malformed history", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { ...history, versions: [] }, error: null });
    await expect(getWorldOfficialStatementHistory("statement-1")).resolves.toBeNull();
    await expect(getWorldOfficialStatementHistory("statement-1")).rejects.toThrow("invalid");
  });

  it("preserves operation and idempotency identity, requiring an acknowledged receipt", async () => {
    const args = {
      organizationId: "org-1",
      statementId: null,
      issuingOfficeId: null,
      title: "Official announcement",
      body: "The formal statement.",
      correctionReason: null,
      expectedRevision: 0,
      operationId: "operation-1",
      idempotencyKey: "key-1",
    };
    mocks.rpc.mockResolvedValueOnce({
      data: { status: "succeeded", replayed: false, result: {
        ok: true, statementId: "statement-1", versionId: "version-1",
        revision: 1, operationId: "operation-1",
      } }, error: null,
    }).mockResolvedValueOnce({ data: { status: "failed", result: { ok: false } }, error: null });
    await expect(issueWorldOfficialStatement(args)).resolves.toMatchObject({
      ok: true, revision: 1, operationId: "operation-1",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("world_issue_statement_v1",
      expect.objectContaining({
        p_operation_id: "operation-1", p_idempotency_key: "key-1",
        p_expected_revision: 0, p_statement_id: null,
      }));
    await expect(issueWorldOfficialStatement(args)).rejects.toThrow("receipt");
  });

  it("requires an explicit published correction reason", async () => {
    await expect(issueWorldOfficialStatement({
      organizationId: "org-1", statementId: "statement-1",
      issuingOfficeId: null, title: "Edited", body: "Changed body",
      correctionReason: "", expectedRevision: 1,
      operationId: "operation-2", idempotencyKey: "key-2",
    })).rejects.toThrow("required");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("has one governed writer, immutable versions, RLS and bounded publication-safe projections", () => {
    const sql = readFileSync("supabase/migrations/20261107110000_v3_tg9_official_statements.sql", "utf8");
    expect(sql).toContain("create table public.world_statements");
    expect(sql).toContain("create table public.world_statement_versions");
    expect(sql).toContain("before update or delete on public.world_statement_versions");
    expect(sql).toContain("world_statement_current_version_same_statement_fk");
    expect(sql).toContain("private.studio2_claim_operation(");
    expect(sql).toContain("private.studio2_complete_operation(");
    expect(sql).toContain("private.v3_emit_domain_event(");
    expect(sql).toContain("public.world_access_allowed(");
    expect(sql).toContain("for update;");
    expect(sql).toContain("world_statements_published_public_read");
    expect(sql).toContain("world_statement_versions_published_public_read");
    // Both RLS policies and both public RPC projections must fail closed when rollout is dark.
    expect(sql.split("public.studio2_feature_enabled('terra_world_public', null)")).toHaveLength(5);
    expect(sql).toContain("limit least(greatest(coalesce(p_limit,20),1),30)");
    expect(sql).not.toMatch(/create table (?:public\.)?(?:world_follows|world_tasks|world_notifications)\b/i);
  });
});
