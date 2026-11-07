import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261107151000_v3_tg10_world_follow_notification_candidates.sql"),
  "utf8",
);

const rehearsal = readFileSync(
  join(process.cwd(), "scripts/rehearse-v3-world-follow-notification-candidates.sql"),
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
    expect(migration).toContain("p_version_id uuid");
    expect(migration).toContain("private.v3_domain_events source_event");
    expect(migration).toContain("public.studio2_operation_receipts receipt");
    expect(migration).toContain("receipt.status = 'succeeded'");
    expect(migration).toContain("source_event.aggregate_type = 'world_statement'");
    expect(migration).toContain("source_event.aggregate_version = current_version.version_number");
    expect(migration).toContain("source_event.payload ->> 'organizationId' = organization_row.id::text");
    expect(migration).toContain("source_event.payload ->> 'statementId' = statement_row.id::text");
    expect(migration).toContain("source_event.payload ->> 'versionId' = current_version.id::text");
    expect(migration).toContain("source_event.payload ->> 'revision' = current_version.version_number::text");
    expect(migration).toContain("source_event.payload ->> 'published' = 'true'");
    expect(migration).toContain("source_event.payload ->> 'visibility' = 'public'");
    expect(migration).toContain("receipt.command = case");
    expect(migration).toContain("p_statement_id is null or p_version_id is null");
    expect(migration).toContain("current_version.id = p_version_id");
    expect(migration).toContain("statement_row.current_version_id = p_version_id");
    expect(migration).toContain("organization_row.public_visibility = 'public'");
    expect(migration).toContain("organization_row.status in ('recognized', 'active')");
  });

  it("honors user notification consent and the explicitly disabled statement category", () => {
    expect(migration).toContain("follow_row.entity_type = 'organization'");
    expect(migration).toContain("follow_row.notification_level in ('important', 'all')");
    expect(migration).toContain("follow_row.created_at <= current_version.published_at");
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
    // A late original-publish event must not become a correction event.
    expect(rehearsal).toContain("TG10_STALE_VERSION_EVENT_ALLOWED");
    expect(rehearsal).toContain("TG10_UNRELATED_VERSION_EVENT_ALLOWED");
    expect(rehearsal).toContain("TG10_SUPERSEDED_CORRECTION_EVENT_ALLOWED");
    expect(rehearsal).toContain("TG10_FUTURE_VERSION_LEAK");
    expect(rehearsal).toContain("TG10_NO_EVENT_PROVENANCE_ACCEPTED");
    expect(rehearsal).toContain("TG10_MISMATCHED_S4_VERSION_ACCEPTED");
    expect(rehearsal).toContain("TG10_CANONICAL_S4_FACT_NOT_ACCEPTED");
    expect(rehearsal).toContain("TG10_INCOMPLETE_R2_SOURCE_ACCEPTED");
    expect(rehearsal).toContain("TG10_WRONG_S2_COMMAND_ACCEPTED");
    expect(rehearsal).toContain("TG10_WRONG_S4_EVENT_TYPE_ACCEPTED");
    expect(rehearsal).toContain("TG10_WRONG_S4_AGGREGATE_REVISION_ACCEPTED");
    expect(rehearsal).toContain("TG10_NONPUBLIC_S4_PAYLOAD_ACCEPTED");
    expect(rehearsal).toContain("TG10_AFTER_PUBLICATION_FOLLOW_ACCEPTED");
    expect(rehearsal).toContain("perform private.v3_emit_domain_event(");
    expect(rehearsal).not.toContain("insert into private.v3_domain_events(");
    expect(rehearsal).toContain("'world.statement.corrected','world_statement'");
    expect(rehearsal).toContain("v_corrected");
    expect(rehearsal).toContain("v_future");
  });

  it("exercises mismatched S4 event and S2 operation provenance before the canonical event", () => {
    const start = rehearsal.indexOf("do $publication_event$");
    const end = rehearsal.indexOf("end $publication_event$");
    const block = rehearsal.slice(start, end);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    for (const rejected of [
      "TG10_WRONG_S2_COMMAND_ACCEPTED",
      "TG10_WRONG_S4_EVENT_TYPE_ACCEPTED",
      "TG10_WRONG_S4_AGGREGATE_REVISION_ACCEPTED",
      "TG10_NONPUBLIC_S4_PAYLOAD_ACCEPTED",
    ]) {
      expect(block).toContain(rejected);
      expect(block.indexOf(rejected)).toBeLessThan(block.indexOf("v_good_operation,null,null"));
    }
    expect(block).toContain("'world.statement.corrected','world_statement'");
    expect(block).toContain("'visibility','private','published',true");
    expect(block).toContain("v_wrong_command_operation");
    expect(block).toContain("v_wrong_revision_operation");
    expect(block).toContain("receipt");
    expect(block).toContain("TG10_CANONICAL_S4_FACT_NOT_ACCEPTED");
    expect(rehearsal.trimEnd()).toMatch(/rollback;$/);
  });

  it("clears simulated JWT identity after each authenticated RPC phase", () => {
    const followReset = rehearsal.indexOf("do $clear_follow_actor$");
    const publication = rehearsal.indexOf("do $publish_after_follows$");
    const categoryRpc = rehearsal.indexOf("do $disable$");
    const categoryReset = rehearsal.indexOf("do $clear_category_actor$");
    const privacy = rehearsal.indexOf("do $privacy$");
    expect(followReset).toBeGreaterThan(rehearsal.indexOf("end $follows$"));
    expect(followReset).toBeLessThan(publication);
    expect(categoryReset).toBeGreaterThan(categoryRpc);
    expect(categoryReset).toBeLessThan(privacy);
    for (const name of ["clear_follow_actor", "clear_category_actor"]) {
      const block = rehearsal.slice(
        rehearsal.indexOf("do $" + name + "$"),
        rehearsal.indexOf("end $" + name + "$"),
      );
      expect(block).toContain("set_config('request.jwt.claim.sub','',true)");
      expect(block).toContain("set_config('request.jwt.claims','{}',true)");
      expect(block).toContain("set_config('request.jwt.claim.role','',true)");
      expect(block).toContain("auth.uid() is not null");
    }
    expect(rehearsal).toContain("TG10_FOLLOW_ACTOR_LEAKED_INTO_PRIVILEGED_REHEARSAL");
    expect(rehearsal).toContain("TG10_CATEGORY_ACTOR_LEAKED_INTO_PRIVILEGED_REHEARSAL");
  });

  it("rehearses authenticated organization follows before the first public statement", () => {
    const follow = rehearsal.indexOf("do $follows$");
    const publish = rehearsal.indexOf("do $publish_after_follows$");
    const event = rehearsal.indexOf("do $publication_event$");
    expect(follow).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(follow);
    expect(event).toBeGreaterThan(publish);
    expect(rehearsal).toContain("perform public.set_fan_follow(");
    expect(rehearsal).toContain("TG10_PUBLISH_BEFORE_CANONICAL_FOLLOW");
    expect(rehearsal).toContain("TG10_PREPUBLICATION_FOLLOW_TIMELINE_INVALID");
    // now() is transaction-stable; the older historical event below separately
    // exercises a genuinely post-publication follower without future timestamps.
    expect(rehearsal).toContain("TG10_AFTER_PUBLICATION_FOLLOW_ACCEPTED");
  });

  it("never authorizes a browser, writes a notification, or starts a dispatch", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog");
    expect(migration).toMatch(/revoke all on function private\.world_statement_follow_notification_candidates_v1\(uuid,uuid,uuid,integer\)\s+from public, anon, authenticated, service_role/i);
    expect(migration).toMatch(/grant execute on function private\.world_statement_follow_notification_candidates_v1\(uuid,uuid,uuid,integer\)\s+to service_role/i);
    expect(migration).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.notification_deliveries\b/i);
  });
});


describe("TG10 rollback-only SQL runner local destination safety", () => {
  const runner = join(process.cwd(), "scripts/rehearse-v3-world-follow-notification-candidates.sh");

  it("parses CLI status without shell evaluation and rejects nonlocal or ambiguous addresses", () => {
    expect(spawnSync("bash", ["-n", runner], { encoding: "utf8" }).status).toBe(0);

    const root = mkdtempSync(join(tmpdir(), "tg10-world-local-only-"));
    const mockBin = join(root, "bin");
    const cliOutput = join(root, "cli-output");
    const psqlCalls = join(root, "psql-calls");
    const injectedMarker = join(root, "shell-was-executed");
    mkdirSync(mockBin);
    const mockSupabase = join(mockBin, "supabase");
    const mockPsql = join(mockBin, "psql");
    writeFileSync(mockSupabase, [
      "#!/usr/bin/env bash",
      '[[ "$1" == status && "$2" == -o && "$3" == env ]] || exit 77',
      '[[ "$MOCK_FAIL" != 1 ]] || exit 78',
      'cat "$MOCK_STATUS_FILE"',
      "",
    ].join("\n"));
    writeFileSync(mockPsql, [
      "#!/usr/bin/env bash",
      'printf "%s\\n" "$*" >> "$MOCK_PSQL_LOG"',
      "",
    ].join("\n"));
    chmodSync(mockSupabase, 0o700);
    chmodSync(mockPsql, 0o700);

    const api = "API_URL=http://127.0.0.1:54321";
    const db = "DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    type Case = {
      label: string;
      status: string;
      accepted: boolean;
      cliFailure?: boolean;
      inheritedPg?: Record<string, string>;
    };
    const scenarios: Case[] = [
      { label: "plain local URL", status: api + "\n" + db, accepted: true },
      { label: "quoted local URL", status: 'API_URL="http://127.0.0.1:54321"\nDB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"', accepted: true },
      { label: "remote API", status: "API_URL=https://production.invalid\n" + db, accepted: false },
      { label: "remote database", status: api + "\nDB_URL=postgresql://postgres:postgres@production.invalid:5432/postgres", accepted: false },
      { label: "userinfo spoofing", status: api + "\nDB_URL=postgresql://postgres:postgres@127.0.0.1:54322@production.invalid/postgres", accepted: false },
      { label: "PostgreSQL query override", status: api + "\n" + db + "?host=production.invalid", accepted: false },
      { label: "duplicate database keys", status: api + "\n" + db + "\n" + db, accepted: false },
      { label: "missing database even if inherited", status: api, accepted: false },
      { label: "shell command appended to URL", status: api + "; touch " + injectedMarker + "\n" + db, accepted: false },
      { label: "extra shell text is never executed", status: api + "\n" + db + "\ntouch " + injectedMarker, accepted: true },
      { label: "subshell text is never evaluated", status: api + "\n" + db + "\n$(touch " + injectedMarker + ")", accepted: true },
      { label: "CLI failure", status: api + "\n" + db, accepted: false, cliFailure: true },
      { label: "inherited libpq hostaddr redirect", status: api + "\n" + db, accepted: false, inheritedPg: { PGHOSTADDR: "203.0.113.77" } },
      { label: "inherited libpq remote host", status: api + "\n" + db, accepted: false, inheritedPg: { PGHOST: "production.invalid" } },
      { label: "inherited libpq service selector", status: api + "\n" + db, accepted: false, inheritedPg: { PGSERVICE: "production" } },
      { label: "inherited libpq service file", status: api + "\n" + db, accepted: false, inheritedPg: { PGSERVICEFILE: "/tmp/production-service.conf" } },
      { label: "inherited libpq backend options", status: api + "\n" + db, accepted: false, inheritedPg: { PGOPTIONS: "-c search_path=public" } },
      { label: "inherited libpq port", status: api + "\n" + db, accepted: false, inheritedPg: { PGPORT: "6543" } },
      { label: "inherited libpq database", status: api + "\n" + db, accepted: false, inheritedPg: { PGDATABASE: "production" } },
      { label: "inherited libpq credential", status: api + "\n" + db, accepted: false, inheritedPg: { PGPASSWORD: "another-password" } },
    ];

    try {
      for (const scenario of scenarios) {
        writeFileSync(cliOutput, scenario.status + "\n");
        rmSync(psqlCalls, { force: true });
        rmSync(injectedMarker, { force: true });
        const result = spawnSync("bash", [runner], {
          encoding: "utf8",
          env: {
            // The host running Vitest may have legitimate PG* settings. Isolate
            // the baseline and inject each adversarial libpq setting explicitly.
            ...Object.fromEntries(
              Object.entries(process.env).filter(([key]) => !key.startsWith("PG")),
            ),
            ...scenario.inheritedPg,
            PATH: mockBin + ":" + (process.env.PATH || ""),
            MOCK_STATUS_FILE: cliOutput,
            MOCK_PSQL_LOG: psqlCalls,
            MOCK_FAIL: scenario.cliFailure ? "1" : "0",
            // Inherited remote values must never substitute for missing CLI keys.
            API_URL: "https://production.invalid",
            DB_URL: "postgresql://postgres:postgres@production.invalid:5432/postgres",
          },
        });
        expect(result.error, scenario.label).toBeUndefined();
        expect(result.status === 0, scenario.label + ": " + result.stderr)
          .toBe(scenario.accepted);
        expect(existsSync(psqlCalls), scenario.label).toBe(scenario.accepted);
        expect(existsSync(injectedMarker), scenario.label).toBe(false);
        if (scenario.inheritedPg) {
          expect(result.stderr, scenario.label).toContain("Refusing inherited libpq PG* setting");
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
