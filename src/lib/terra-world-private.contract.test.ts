import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(),
  "supabase/migrations/20261107223000_v3_tg11_tg12_private_spaces_chat.sql"), "utf8");
const ui = readFileSync(resolve(process.cwd(), "src/components/world/WorldPrivateWorkspace.tsx"), "utf8");

describe("TG11/TG12 private workspace authority contracts", () => {
  it("has matched PostgreSQL function delimiters and transactional DDL", () => {
    expect((sql.match(/as \$\$/g) ?? []).length).toBe(11);
    expect((sql.match(/^\$\$;/gm) ?? []).length).toBe(11);
    expect((sql.match(/as \$[a-z]+\$/g) ?? []).length).toBe(6);
    expect((sql.match(/^\$[a-z]+\$;/gm) ?? []).length).toBe(6);
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

  it("serializes all chat commands against live TG2 affiliation rows", () => {
    expect(sql).toContain("create function private.world_space_lock_actor_membership_v1");
    expect(sql).toContain("create function private.world_space_lock_member_for_space_v1");
    expect(sql).toContain("limit 1 for share of m,a");
    expect(sql).toContain("limit 1 for share of r,m");
    expect((sql.match(/perform private\.world_space_lock_member_for_space_v1/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("rejects changed room-creation replays rather than returning the original room", () => {
    expect(sql).toContain("v_existing.visibility_policy is distinct from p_visibility");
    expect(sql).toContain("v_existing.history_policy is distinct from p_history");
    expect(sql).toContain("v_existing.name is distinct from btrim(p_name)");
    expect(sql).toContain("message='IDEMPOTENCY_SCOPE'");
  });

  it("limits manager invitations to current canonical TG2 members and protects grant retries", () => {
    expect(sql).toContain("create function private.world_space_member_since_for_v1");
    expect(sql).toContain("p_user_id uuid");
    expect(sql).toContain("create function public.world_space_candidates_v1");
    expect(sql).toContain("private.world_space_member_since_for_v1(v_space.organization_id,actor_list.user_id)");
    expect(sql).toContain("private.world_space_member_since_for_v1(v_space.organization_id,p_user_id)");
    expect(sql).toContain("message='TARGET_NOT_CURRENT_MEMBER'");
    expect(sql).toContain("create table private.world_space_grant_audit");
    expect(sql).toContain("unique (actor_user_id, request_id)");
    expect(sql).toContain("p_expected_revision<>case when v_old_found then v_old.revision else 0 end");
    expect(sql).toContain("message='VERSION_CONFLICT'");
    expect(sql).toContain("message='IDEMPOTENCY_SCOPE'");
    expect(sql).toContain("v_receipt.payload_fingerprint<>v_fingerprint");
    expect(sql).toContain("insert into private.world_space_grant_audit(");
  });

  it("does not grant raw service-role mutation authority or reveal sensitive leadership history", () => {
    expect(sql).toContain("private.world_space_grant_audit enable row level security");
    expect(sql).toMatch(/revoke all on table public\.world_spaces[^;]*from service_role;/s);
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+table\s+[^;]*\s+to\s+service_role\b/i);
    expect(sql).toContain("message='SENSITIVE_HISTORY_POLICY'");
    expect(sql).toContain("return greatest(v_grant.history_from,coalesce(v_member_since,now()))");
    expect(sql).toContain("public.world_space_set_grant_v1(uuid,uuid,text,timestamptz,boolean,bigint,uuid)");
  });

  it("makes member access management client-only and never exposes candidates in general search", () => {
    const manager = readFileSync(resolve(process.cwd(),
      "src/components/world/WorldRoomAccessManager.tsx"), "utf8");
    expect(manager).toContain('getWorldRoomCandidates(roomId, signal)');
    expect(manager).toContain("changeWorldRoomGrant({");
    expect(manager).toContain("requests.current.set(key, requestId)");
    expect(manager).toContain("isVisiblePrivateWorldQuery(candidates, online)");
    expect(manager).not.toContain('supabase.from("world_space_access_grants")');
    expect(ui).toContain("<WorldRoomAccessManager");
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
