import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3DomainConsequence } from "./v3-domain-consequence-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const consequence = source(
  "supabase/migrations/20261026202000_v3_s15_community_profile_moderation_consequence.sql",
);
const operationAuthority = source(
  "supabase/migrations/20261002203000_organisation_os_v5_operation_contract.sql",
);
const publicProjection = source(
  "supabase/migrations/20261002200000_organisation_os_v5_community_moderation.sql",
);

function functionBody(sql: string, marker: string) {
  const start = sql.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = sql.indexOf("create or replace function", start + marker.length);
  return sql.slice(start, next === -1 ? sql.length : next);
}

describe("System V3 S15 community profile moderation consequence", () => {
  it("keeps the existing R2 operation receipt as the canonical producer boundary", () => {
    const moderation = functionBody(
      operationAuthority,
      "create or replace function public.admin_set_fan_profile_moderation(",
    );
    expect(moderation).toContain("studio2_access_allowed('community.moderate'");
    expect(moderation).toContain("private.studio2_claim_operation(");
    expect(moderation).toContain("'community.fan_identity.moderate'");
    expect(moderation).toContain("'R2'");
    expect(moderation).toContain("for update;");
    expect(moderation).toContain("private.studio2_complete_operation");
    expect(consequence).not.toContain("create or replace function public.admin_set_fan_profile_moderation");
  });

  it("adds one server-owned monotonic moderation revision without creating another profile store", () => {
    expect(consequence).toContain("moderation_revision bigint not null default 0");
    expect(consequence).toContain("private.v3_bump_fan_profile_moderation_revision");
    expect(consequence).toContain("new.moderation_revision := old.moderation_revision + 1");
    expect(consequence).toContain("new.moderation_revision := old.moderation_revision");
    expect(consequence).not.toContain("create table public.community_profile");
    expect(consequence).not.toContain("create table public.community_profiles");
  });

  it("emits exactly the completed community moderation fact from the successful receipt", () => {
    const producer = functionBody(
      consequence,
      "create or replace function private.v3_emit_community_profile_moderation_event()",
    );
    expect(producer).toContain("new.status <> 'succeeded'");
    expect(producer).toContain("old.status = 'succeeded'");
    expect(producer).toContain("new.command <> 'community.fan_identity.moderate'");
    expect(producer).toContain("v_result_operation_id is distinct from new.operation_id");
    expect(producer).toContain("'community_profile.moderated'");
    expect(producer).toContain("'community_profile'");
    expect(producer).toContain("v_revision");
    expect(producer).toContain("array[]::text[]");
  });

  it("keeps DomainEvent payloads privacy-bounded", () => {
    const producer = functionBody(
      consequence,
      "create or replace function private.v3_emit_community_profile_moderation_event()",
    );
    const payloadStart = producer.indexOf("jsonb_strip_nulls(jsonb_build_object(");
    const payload = producer.slice(payloadStart, producer.indexOf(")),", payloadStart) + 2);
    expect(payload).toContain("'profileId'");
    expect(payload).toContain("'hidden'");
    expect(payload).toContain("'hiddenAt'");
    expect(payload).toContain("'revision'");
    expect(payload).not.toContain("moderation_reason");
    expect(payload).not.toContain("moderated_by");
    expect(payload).not.toContain("display_name");
  });

  it("uses direct canonical profile reads for public visibility instead of an async shadow projection", () => {
    expect(publicProjection).toContain("profile.moderation_hidden_at is null");
    expect(publicProjection).toContain("when profile.moderation_hidden_at is null");
    expect(publicProjection).toContain("else 'Solaris fan'");
    expect(consequence).not.toContain("studio2_process_community");
    expect(consequence).not.toContain("v3_domain_event_outbox");
  });

  it("does not mutate prediction entries, scores or historical competitive data", () => {
    const moderation = functionBody(
      operationAuthority,
      "create or replace function public.admin_set_fan_profile_moderation(",
    );
    expect(moderation).not.toMatch(/update\s+public\.prediction_/i);
    expect(moderation).not.toMatch(/delete\s+from\s+public\.prediction_/i);
    expect(moderation).not.toMatch(/insert\s+into\s+public\.prediction_/i);
  });

  it("does not fabricate a moderation task from a completed moderation decision", () => {
    const registered = v3DomainConsequence("community_profile.moderated");
    expect(registered?.implementationState).toBe("event-backed");
    expect(registered?.taskEffects).toEqual([]);
    expect(registered?.consumers).not.toContain("task:community_profile.moderation");
  });

  it("preserves all four Worker 9 Round 1 consequence registrations", () => {
    for (const eventType of [
      "edition.transitioned",
      "selection.reviewed",
      "selection.winner_changed",
      "participation.changed",
    ]) {
      expect(v3DomainConsequence(eventType)?.implementationState).toBe("event-backed");
    }
  });
});
