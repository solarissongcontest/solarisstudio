import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inspectV3CronMigrations } from "./v3-s15-scheduled-job-audit";
import { describe, expect, it } from "vitest";

import {
  V3_SYSTEM_EDGE_FUNCTION_REGISTRY,
  V3_SYSTEM_INTEGRATION_REGISTRY,
  V3_SYSTEM_SCHEDULED_JOB_REGISTRY,
  validateV3SystemZeroOrphans,
} from "./v3-system-zero-orphan-registry";

const root = process.cwd();

function discover() {
  const integrationPaths = readdirSync(resolve(root, "src/integrations/v3"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => `src/integrations/v3/${entry.name}`)
    .sort();

  const edgeFunctionNames = readdirSync(resolve(root, "supabase/functions"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name)
    .sort();

  const migrationsRoot = resolve(root, "supabase/migrations");
  const cronAudit = inspectV3CronMigrations(
    readdirSync(migrationsRoot).filter((name) => name.endsWith(".sql")).map((name) => ({
      path: "supabase/migrations/" + name,
      sql: readFileSync(resolve(migrationsRoot, name), "utf8"),
    })),
    V3_SYSTEM_SCHEDULED_JOB_REGISTRY,
  );
  expect(cronAudit.findings).toEqual([]);
  return { integrationPaths, edgeFunctionNames, scheduledJobNames: cronAudit.scheduledJobNames };
}

describe("System V3 S15 zero-orphan audit", () => {
  it("finds no unknown domain, command, integration, Edge Function, scheduled-job, notification or projection ownership", () => {
    expect(validateV3SystemZeroOrphans(discover())).toEqual([]);
  });

  it("pins every registered integration and Edge Function to a real repository boundary", () => {
    for (const integration of V3_SYSTEM_INTEGRATION_REGISTRY) {
      expect(existsSync(resolve(root, integration.path)), integration.path).toBe(true);
    }
    for (const fn of V3_SYSTEM_EDGE_FUNCTION_REGISTRY) {
      expect(existsSync(resolve(root, `supabase/functions/${fn.name}/index.ts`)), fn.name).toBe(true);
    }
  });

  it("pins scheduled jobs to their latest real cron.schedule calls", () => {
    const migrationsRoot = resolve(root, "supabase/migrations");
    const report = inspectV3CronMigrations(
      readdirSync(migrationsRoot).filter((name) => name.endsWith(".sql")).map((name) => ({
        path: "supabase/migrations/" + name,
        sql: readFileSync(resolve(migrationsRoot, name), "utf8"),
      })),
      V3_SYSTEM_SCHEDULED_JOB_REGISTRY,
    );
    expect(report.findings).toEqual([]);
  });

  it("fails closed when a new integration, Edge Function or scheduled job appears without an owner", () => {
    const current = discover();
    expect(
      validateV3SystemZeroOrphans({
        ...current,
        integrationPaths: [...current.integrationPaths, "src/integrations/v3/unowned.server.ts"],
      }),
    ).toContain("unowned V3 integration discovered: src/integrations/v3/unowned.server.ts");
    expect(
      validateV3SystemZeroOrphans({
        ...current,
        edgeFunctionNames: [...current.edgeFunctionNames, "unowned-function"],
      }),
    ).toContain("unowned Edge Function discovered: unowned-function");
    expect(
      validateV3SystemZeroOrphans({
        ...current,
        scheduledJobNames: [...current.scheduledJobNames, "unowned-job"],
      }),
    ).toContain("unowned scheduled job discovered: unowned-job");
  });
});
