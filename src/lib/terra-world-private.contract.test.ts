import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(),
  "supabase/migrations/20261107223000_v3_tg11_tg12_private_spaces_chat.sql"), "utf8");
const ui = readFileSync(resolve(process.cwd(), "src/components/world/WorldPrivateWorkspace.tsx"), "utf8");

describe("TG11/TG12 private workspace authority contracts", () => {
  it("has matched PostgreSQL function delimiters and transactional DDL", () => {
    expect((sql.match(/as \$\$/g) ?? []).length).toBe(13);
    expect((sql.match(/^\$\$;/gm) ?? []).length).toBe(13);
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("never grants browser table access to private chat or private room metadata", () => {
    for (const table of [
      "public.world_spaces", "private.world_space_access_grants",
      "private.world_space_messages", "private.world_space_message_revisions",
      "private.world_space_reactions", "private.world_space_attachments",
    ]) {
      expect(sql).toContain(table);
      expect(sql).toContain("enable row level security");
    }
    expect(sql).toContain("from public, anon, authenticated;");
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all)\s+on\s+table\s+[^;]*\s+to\s+(?:anon|authenticated)\b/i);
    expect(sql).toContain("to authenticated, service_role;");
  });

  it("enforces current TG2 affiliations, revocation and correct join-time history", () => {
    expect(sql).toContain("create function private.world_space_member_since_v1");
    expect(sql).toContain("public.world_organization_memberships");
    expect(sql).toContain("public.world_organization_representations");
    expect(sql).toContain("public.country_accounts");
    expect(sql).toContain("public.world_country_control_terms");
    expect(sql).toContain("ct.ended_at is null");
    expect(sql).toContain("m.ended_at is null");
    expect(sql).toContain("m.status in ('member','observer','associate')");
    expect(sql).toContain("v_member_since is null and not public.studio2_access_allowed");
    expect(sql).toContain("v_space.history_policy = 'all_member_history'");
    expect(sql).toContain("v_grant.history_from");
    expect(sql).toContain("private.world_space_read_from_v1(p_space_id)");
    expect(sql).toContain("create function public.world_space_search_v1");
    expect(sql).toContain("msg.created_at >= v_from");
    expect(sql).toContain("msg.redacted_at is null");
  });

  it("protects revisions, same-room replies, idempotent sends and message updates", () => {
    expect(sql).toContain("unique (sender_user_id, request_id)");
    expect(sql).toContain("foreign key (reply_to_id, space_id)");
    expect(sql).toContain("unique (message_id, revision)");
    expect(sql).toContain("on conflict (sender_user_id,request_id) do nothing");
    expect(sql).toContain("p_expected_revision is distinct from v_message.revision");
    expect(sql).toContain("for update");
    expect(sql).toContain("'moderator_redaction'");
  });

  it("rolls out dark and erases private client caches after auth transitions", () => {
    expect(sql).toContain("('terra_private_spaces',false,false");
    expect(sql).toContain("('terra_chat',false,false");
    expect(sql).toContain("public.studio2_feature_enabled('terra_chat',null)");
    expect(sql).toContain("public.studio2_feature_enabled('terra_private_spaces',null)");
    expect(ui).toContain("queryClient.removeQueries({ queryKey: PRIVATE_WORLD_QUERY_ROOT })");
    expect(ui).toContain("gcTime: 0");
    expect(ui).toContain("!online ? <AccessNotice");
    expect(ui).toContain("isVisiblePrivateWorldQuery");
  });
});
