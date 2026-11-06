import { describe, expect, it } from "vitest";
import { inspectV3CronMigrations } from "./v3-s15-scheduled-job-audit";

const register = [{ name: "solaris-publish-due-entries", evidence: "2026_01.sql" }];
const migration = (sql: string, path = "2026_01.sql") => [{ path, sql }];

describe("S15 scheduled-job ownership audit", () => {
  it("accepts the actual multiline literal cron.schedule form", () => {
    const report = inspectV3CronMigrations(
      migration("do $$ begin perform cron.schedule(\n 'solaris-publish-due-entries', '* * * * *', 'select 1'); end $$;"),
      register,
    );
    expect(report).toEqual({ scheduledJobNames: ["solaris-publish-due-entries"], findings: [] });
  });

  it("ignores misleading job mentions in comments, including nested block comments", () => {
    const report = inspectV3CronMigrations(
      migration("-- cron.schedule('solaris-publish-due-entries', '* * * * *', 'select 1');\n/* outer /* inner */ cron.schedule('phantom','*','select 1') */\nselect 'solaris-publish-due-entries';"),
      register,
    );
    expect(report.scheduledJobNames).toEqual([]);
    expect(report.findings[0]).toContain("no matching cron.schedule call");
  });

  it("discovers PostgreSQL double-quoted cron and schedule identifiers", () => {
    const report = inspectV3CronMigrations(
      migration('perform "cron"."schedule"(\'quoted-job\', \'* * * * *\', \'select 1\');'),
      [{ name: "quoted-job", evidence: "2026_01.sql" }],
    );
    expect(report).toEqual({ scheduledJobNames: ["quoted-job"], findings: [] });
  });

  it("does not accept case-sensitive quoted lookalikes as canonical cron evidence", () => {
    for (const callee of ['"CRON".schedule', 'cron."SCHEDULE"', '"CRON"."SCHEDULE"']) {
      const report = inspectV3CronMigrations(
        migration(`select ${callee}('solaris-publish-due-entries', '* * * * *', 'select 1');`),
        register,
      );
      expect(report.scheduledJobNames).toEqual([]);
      expect(report.findings[0]).toContain("no matching cron.schedule call");
    }
    // Unquoted PostgreSQL identifiers are folded to lowercase.
    expect(inspectV3CronMigrations(
      migration("select CRON.SCHEDULE('solaris-publish-due-entries', '* * * * *', 'select 1');"),
      register,
    ).findings).toEqual([]);
  });

  it("cannot hide a later scheduled writer behind an escaped SQL string", () => {
    const sql = String.raw`select E'it\'s metadata'; select cron.schedule('unowned', '* * * * *', 'select 1');`;
    expect(inspectV3CronMigrations(migration(sql), []).scheduledJobNames).toEqual(["unowned"]);
  });

  it("rejects a dynamic job name instead of silently omitting it", () => {
    const report = inspectV3CronMigrations(
      migration("perform cron.schedule(v_job_name, '* * * * *', 'select 1');"),
      [],
    );
    expect(report.scheduledJobNames).toEqual([]);
    expect(report.findings).toContain("unverifiable cron.schedule name: 2026_01.sql:1");
  });

  it("rejects an unregistered literal job without changing the existing registry", () => {
    const report = inspectV3CronMigrations(migration("perform cron.schedule('unowned', '* * * * *', 'select 1');"), []);
    expect(report.scheduledJobNames).toEqual(["unowned"]);
  });

  it("rejects an old evidence pointer when a later migration reschedules the same job", () => {
    const report = inspectV3CronMigrations(
      [
        ...migration("perform cron.schedule('solaris-publish-due-entries', '* * * * *', 'select 1');"),
        ...migration("perform cron.schedule('solaris-publish-due-entries', '* * * * *', 'select 2');", "2026_02.sql"),
      ],
      register,
    );
    expect(report.findings).toContain(
      "scheduled job evidence is not the latest schedule: solaris-publish-due-entries -> 2026_01.sql",
    );
  });

  it("does not mistake a comment or a quoted second argument for a scheduled job identity", () => {
    const report = inspectV3CronMigrations(
      migration("perform cron.schedule('real', '* * * * *', 'select ''cron.schedule(''''fake'''',''''*'''',''''select 1'''')''');"),
      [{ name: "real", evidence: "2026_01.sql" }],
    );
    expect(report).toEqual({ scheduledJobNames: ["real"], findings: [] });
  });

  it("ignores inert dollar-quoted values masquerading as cron.schedule declarations", () => {
    const report = inspectV3CronMigrations(
      migration("select $example$cron.schedule('phantom', '* * * * *', 'select 1')$example$;"),
      [{ name: "phantom", evidence: "2026_01.sql" }],
    );
    expect(report.scheduledJobNames).toEqual([]);
    expect(report.findings).toContain(
      "scheduled job evidence has no matching cron.schedule call: phantom -> 2026_01.sql",
    );
  });

  it("does not certify a cron registration merely because CREATE FUNCTION stores that SQL", () => {
    const sql = [
      "create function deferred_cron() returns void",
      "language plpgsql as $function$",
      "begin",
      "  perform cron.schedule('deferred', '* * * * *', 'select 1');",
      "end;",
      "$function$;",
    ].join("\n");
    const report = inspectV3CronMigrations(
      migration(sql),
      [{ name: "deferred", evidence: "2026_01.sql" }],
    );
    expect(report.scheduledJobNames).toEqual([]);
    expect(report.findings).toContain(
      "scheduled job evidence has no matching cron.schedule call: deferred -> 2026_01.sql",
    );
  });

  it("still detects real registrations inside immediately executed DO dollar-quoted bodies", () => {
    const sql = [
      "do $do$",
      "begin",
      "  perform cron.schedule('real', '* * * * *', 'select 1');",
      "  perform $literal$cron.schedule('phantom', '*', 'select 2')$literal$;",
      "end $do$;",
    ].join("\n");
    const report = inspectV3CronMigrations(
      migration(sql),
      [{ name: "real", evidence: "2026_01.sql" }],
    );
    expect(report.scheduledJobNames).toEqual(["real"]);
    expect(report.findings).toEqual([]);
  });

  it("can discover a live statement following an inert SQL literal", () => {
    const sql = "select $$cron.schedule('fake', '*', 'select 1')$$;\n" +
      "select cron.schedule('genuine', '* * * * *', 'select 1');";
    const report = inspectV3CronMigrations(
      migration(sql),
      [{ name: "genuine", evidence: "2026_01.sql" }],
    );
    expect(report).toEqual({ scheduledJobNames: ["genuine"], findings: [] });
  });
});
