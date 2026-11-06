import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  WORLD_FLAG_MIGRATION,
  auditWorldDarkLaunchMigrations,
  stripSqlComments,
} from "./check-world-dark-launch-contract.mjs";

const baseline = `
-- Initial World public activation MUST be opted into separately.
insert into public.studio2_feature_flags
  (key, enabled, admins_only, user_ids, edition_ids)
values ('terra_world_public', false, false, '{}'::uuid[], '{}'::uuid[])
on conflict (key) do nothing;
`;
const baseFile = { name: WORLD_FLAG_MIGRATION, source: baseline };
const next = name => `20261107170000_${name}.sql`;
const check = (...extra) => auditWorldDarkLaunchMigrations([baseFile, ...extra]);

test("canonical default-disabled declaration passes while public rollout reads remain permitted", () => {
  const report = check({ name: next("guarded_public_rpc"), source: `
    create function public.world_is_enabled() returns boolean language sql as $$
      select exists (select 1 from public.studio2_feature_flags
        where key='terra_world_public' and enabled=true)
    $$;
  ` });
  assert.equal(report.clean, true);
  assert.equal(report.canonicalRegistrationCount, 1);
});

test("missing canonical migration fails closed rather than accepting a later reference", () => {
  const report = auditWorldDarkLaunchMigrations([{
    name: next("flag_reader"),
    source: "select enabled from public.studio2_feature_flags where key = 'terra_world_public';",
  }]);
  assert.equal(report.clean, false);
  assert.ok(report.findings.some(f => f.code === "WORLD_FLAG_DEFAULT_OFF_NOT_PROVEN"));
});

test("default-on registration cannot pass even when SQL comments falsely say disabled", () => {
  const report = auditWorldDarkLaunchMigrations([{ ...baseFile,
    source: baseline.replace("false, false", "true, false") + " -- enabled=false",
  }]);
  assert.equal(report.clean, false);
  assert.ok(report.findings.some(f => f.code === "WORLD_FLAG_UNSAFE_INSERT"));
});

test("canonical declaration must preserve on-conflict do nothing, not overwrite existing rollout decisions", () => {
  const report = auditWorldDarkLaunchMigrations([{ ...baseFile,
    source: baseline.replace("do nothing", "do update set enabled=false"),
  }]);
  assert.equal(report.clean, false);
});

test("later migrations cannot turn World on or off, delete it, or reinsert its flag", () => {
  const expressions = [
    "update public.studio2_feature_flags set enabled=true where key='terra_world_public';",
    "update public.studio2_feature_flags set enabled=false where key='terra_world_public';",
    "delete from public.studio2_feature_flags where key='terra_world_public';",
    "insert into public.studio2_feature_flags (key,enabled) values ('terra_world_public',true) on conflict (key) do nothing;",
  ];
  for (const source of expressions) {
    const report = check({ name: next("dangerous_world_flag"), source });
    assert.equal(report.clean, false, source);
    assert.ok(report.findings.some(f => f.code.includes("FORBIDDEN_MUTATION") || f.code.includes("UNSAFE_INSERT")));
  }
});

test("unscoped feature-flag updates and truncation after the World migration are blocked", () => {
  for (const source of [
    "update public.studio2_feature_flags set enabled=true;",
    "delete from public.studio2_feature_flags;",
    "truncate table public.studio2_feature_flags;",
  ]) {
    const report = check({ name: next("broad_flags"), source });
    assert.ok(report.findings.some(f => f.code === "WORLD_FLAG_UNSCOPED_FEATURE_FLAG_WRITE"), source);
  }
});

test("unrelated feature flags can still be edited with explicit key scope", () => {
  const report = check({ name: next("unrelated_flag"), source:
    "update public.studio2_feature_flags set enabled=true where key='another_v3_feature';" });
  assert.equal(report.clean, true);
});

test("nested SQL comments and quoted comment markers do not create false-positive writes", () => {
  const source = `
-- update public.studio2_feature_flags set enabled=true where key='terra_world_public';
/* a /* nested */ misleading insert into public.studio2_feature_flags
   (key,enabled) values ('terra_world_public',true); */
select '-- not a comment'::text;
`;
  assert.doesNotMatch(stripSqlComments(source), /\bupdate public\.studio2_feature_flags\b/);
  assert.equal(check({ name: next("comment_only"), source }).clean, true);
});

test("quoted feature flag table names and comments within DO blocks cannot bypass the guard", () => {
  const dangerous = check({ name: next("quoted_names"), source:
    'UPDATE "public"."studio2_feature_flags" SET enabled=true WHERE key=\'terra_world_public\';' });
  assert.equal(dangerous.clean, false);
  const commented = check({ name: next("plpgsql_commented"), source: `
    do $body$ begin
      -- update public.studio2_feature_flags set enabled=true where key='terra_world_public';
      perform 1;
    end $body$;
  ` });
  assert.equal(commented.clean, true);
});

test("CLI reports machine-readable evidence and exits nonzero for unsafe or unavailable migrations", () => {
  const dir = mkdtempSync(join(tmpdir(), "world-dark-launch-"));
  const cli = resolve("scripts/check-world-dark-launch-contract.mjs");
  try {
    writeFileSync(join(dir, WORLD_FLAG_MIGRATION), baseline);
    const valid = spawnSync(process.execPath, [cli, "--migrations-dir", dir, "--json"], { encoding: "utf8" });
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(JSON.parse(valid.stdout).clean, true);
    writeFileSync(join(dir, next("bad_release")),
      "UPDATE public.studio2_feature_flags SET enabled=TRUE WHERE key='terra_world_public';");
    const invalid = spawnSync(process.execPath, [cli, "--migrations-dir", dir, "--json"], { encoding: "utf8" });
    assert.equal(invalid.status, 1);
    assert.equal(JSON.parse(invalid.stdout).clean, false);
    const missing = spawnSync(process.execPath, [cli, "--migrations-dir", join(dir, "absent")], { encoding: "utf8" });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /WORLD_FLAG_PREFLIGHT_UNAVAILABLE/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
