import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SOLARIS_FEATURE_RULES,
  SOLARIS_FEATURE_FLAGS,
} from "./feature-flags";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = () =>
  read("supabase/migrations/20261012014000_v3_confirmation_rollout_flag.sql");
const previousMigration = () =>
  read("supabase/migrations/20261011195500_v3_rollout_feature_flag.sql");
const probe = () => read("src/integrations/v3/rollout-probe.server.ts");
const wrapper = () => read("src/components/ConfirmationFormWithReceipt.tsx");

function constrainedFlagKeys(source: string) {
  const constraint = source.match(
    /add constraint studio2_feature_flags_key_check check\s*\(\s*key in \(([\s\S]*?)\)\s*\)/,
  );
  if (!constraint) return [];
  return [...constraint[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe("V3 Confirmation workflow rollout", () => {
  it("registers an independent Confirmation flag in both TypeScript and persisted vocabulary", () => {
    const sql = migration();

    expect(SOLARIS_FEATURE_FLAGS).toContain("solaris_app_v3_confirmation");
    expect(DEFAULT_SOLARIS_FEATURE_RULES.solaris_app_v3_confirmation).toEqual({
      enabled: false,
    });
    expect(sql).toContain("'solaris_app_v3_confirmation'");
  });

  it("extends the previous database constraint without deleting any existing flag", () => {
    const before = constrainedFlagKeys(previousMigration());
    const after = constrainedFlagKeys(migration());

    expect(before.length).toBeGreaterThan(0);
    expect(before.filter((key) => !after.includes(key))).toEqual([]);
    expect(after).toContain("solaris_app_v3");
    expect(after).toContain("solaris_app_v3_confirmation");
    expect(new Set(after).size).toBe(after.length);
  });

  it("seeds the critical workflow switch disabled", () => {
    const sql = migration();
    const seed = sql.slice(sql.indexOf("insert into public.studio2_feature_flags"));

    expect(seed).toContain("'solaris_app_v3_confirmation'");
    expect(seed).toContain("false,");
    expect(seed).toContain("on conflict (key) do nothing");
  });

  it("evaluates global and Confirmation rollout independently and fails Confirmation closed", () => {
    const source = probe();

    expect(source).toContain('p_key: "solaris_app_v3"');
    expect(source).toContain('p_key: "solaris_app_v3_confirmation"');
    expect(source).toContain(
      "enabled && !confirmationFlag.error && confirmationFlag.data === true",
    );
    expect(source).toContain("confirmationEnabled: false");
  });

  it("keeps the proven legacy flow when the Confirmation slice is disabled or the probe fails", () => {
    const source = wrapper();

    expect(source).toContain("function LegacyConfirmationFlow");
    expect(source).toContain("function V3ConfirmationFlow");
    expect(source).toContain("rollout.data?.confirmationEnabled !== true");
    expect(source).toContain("return <LegacyConfirmationFlow {...props} />;");
  });

  it("does not expose a browser-controlled rollout escape hatch", () => {
    const combined = [migration(), probe(), wrapper()].join("\n");

    expect(combined).not.toContain("VITE_SOLARIS_APP_V3_CONFIRMATION");
    expect(migration()).not.toContain("localStorage");
    expect(probe()).not.toContain("localStorage");
  });
});
