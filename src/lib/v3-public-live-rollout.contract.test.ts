import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SOLARIS_FEATURE_FLAGS } from "./feature-flags";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261019013000_v3_public_live_rollout_flag.sql"),
  "utf8",
);
const probe = readFileSync(
  resolve(process.cwd(), "src/integrations/v3/rollout-probe.server.ts"),
  "utf8",
);

describe("System V3 Public Live rollout contract", () => {
  it("registers Public Live without dropping existing canonical feature keys", () => {
    expect(SOLARIS_FEATURE_FLAGS).toContain("solaris_app_v3_live");
    for (const key of SOLARIS_FEATURE_FLAGS) {
      expect(migration, key).toContain(`'${key}'`);
    }
    expect(migration).toContain("'public_ia_v3'");
  });

  it("persists Public Live disabled by default", () => {
    expect(migration).toContain("'solaris_app_v3_live', false, false");
    expect(migration).toContain("on conflict (key) do nothing");
    expect(migration).toContain("studio2_feature_flags_key_check");
  });

  it("exposes one fail-closed server-owned liveEnabled probe field", () => {
    expect(probe).toContain("liveEnabled: boolean");
    expect(probe).toContain("liveEnabled: false");
    expect(probe).toContain('client.rpc("studio2_feature_flags_snapshot"');
    expect(probe).toContain('"solaris_app_v3_live"');
    expect(probe).toContain("liveEnabled:");
    expect(probe).toContain('enabled && flag("solaris_app_v3_live")');
    expect(probe).not.toContain('client.rpc("studio2_feature_enabled"');
  });

  it("requires global V3 and fails closed when rollout reads fail", () => {
    expect(probe).toContain("if (snapshot.error) return disabledProbe({ editionId, userId })");
    expect(probe).toContain("if (!flags) return disabledProbe({ editionId, userId })");
    expect(probe).toContain('const enabled = flag("solaris_app_v3")');
    expect(probe).toContain("return disabledProbe();");
    expect(probe).not.toContain("VITE_SOLARIS_APP_V3_LIVE");
    expect(probe).not.toContain("localStorage");
  });
});
