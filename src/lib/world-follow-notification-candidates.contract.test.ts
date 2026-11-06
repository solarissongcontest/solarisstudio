import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261107151000_v3_tg10_world_follow_notification_candidates.sql"),
  "utf8",
);

describe("TG10 private institutional statement notification candidates", () => {
  it("reuses the World publication, version, existing fan-follow and preference authorities", () => {
    for (const source of [
      "public.world_statements",
      "public.world_statement_versions",
      "public.world_organizations",
      "public.fan_follows",
      "public.fan_follow_categories",
      "public.notification_preferences",
    ]) {
      expect(migration).toContain(source);
    }
    expect(migration).not.toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(?:world_notifications|world_follows)/i);
  });

  it("cannot project statements before canonical publication or outside the public World rollout", () => {
    expect(migration).toContain("public.studio2_feature_enabled('terra_world_public', null) is true");
    expect(migration).toContain("statement_row.status = 'published'");
    expect(migration).toContain("statement_row.visibility = 'public'");
    expect(migration).toContain("statement_row.published_at <= now()");
    expect(migration).toContain("current_version.published_at <= now()");
    expect(migration).toContain("current_version.statement_id = statement_row.id");
    expect(migration).toContain("organization_row.public_visibility = 'public'");
    expect(migration).toContain("organization_row.status in ('recognized', 'active')");
  });

  it("honors user notification consent and the explicitly disabled statement category", () => {
    expect(migration).toContain("follow_row.entity_type = 'organization'");
    expect(migration).toContain("follow_row.notification_level in ('important', 'all')");
    expect(migration).toContain("preference.external_enabled is true");
    expect(migration).toContain("'following' = any(preference.categories)");
    expect(migration).toContain("category_preference.category = 'statements'");
    expect(migration).toContain("coalesce(category_preference.enabled, true) is true");
  });

  it("is bounded, paginated, correction-aware and safe to place on a lock screen", () => {
    expect(migration).toContain("p_after_user_id uuid default null");
    expect(migration).toContain("p_limit integer default 100");
    expect(migration).toContain("p_limit > 200");
    expect(migration).toContain("follow_row.profile_id > p_after_user_id");
    expect(migration).toContain("order by follow_row.profile_id");
    expect(migration).toContain("limit p_limit");
    expect(migration).toContain("'world.statement.corrected'");
    expect(migration).toContain("'world.statement.published'");
    expect(migration).toContain("'Terra Solaris'::text");
    expect(migration).not.toContain("current_version.body");
    expect(migration).toContain("interval '30 minutes'");
  });

  it("never authorizes a browser, writes a notification, or starts a dispatch", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog");
    expect(migration).toMatch(/revoke all on function private\.world_statement_follow_notification_candidates_v1\(uuid,uuid,integer\)\s+from public, anon, authenticated, service_role/i);
    expect(migration).toMatch(/grant execute on function private\.world_statement_follow_notification_candidates_v1\(uuid,uuid,integer\)\s+to service_role/i);
    expect(migration).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.notification_deliveries\b/i);
  });
});
