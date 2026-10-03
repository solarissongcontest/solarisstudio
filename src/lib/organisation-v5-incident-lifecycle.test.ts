import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 incident lifecycle", () => {
  const migration = source(
    "supabase/migrations/20261003190000_organisation_os_v5_incident_lifecycle.sql",
  );
  const client = source("src/lib/incident-command.ts");
  const persistence = source("src/lib/studio2-persistence.ts");

  it("matches the V5 five-state incident vocabulary", () => {
    for (const state of [
      "detected",
      "investigating",
      "mitigating",
      "monitoring",
      "resolved",
    ]) {
      expect(migration).toContain(`'${state}'`);
      expect(client).toContain(`'${state}'`);
    }
    expect(client).not.toContain("'open'");
  });

  it("migrates legacy open rows without keeping open as canonical state", () => {
    expect(migration).toContain("set status = 'detected'");
    expect(migration).toContain("where status = 'open'");
    expect(migration).toContain("alter column status set default 'detected'");
    expect(persistence).toContain("rawStatus === 'open' ? 'detected' : rawStatus");
  });

  it("validates transitions server-side and preserves controlled emergency fast paths", () => {
    expect(migration).toContain("private.studio2_incident_transition_allowed");
    expect(migration).toContain("'detected->investigating'");
    expect(migration).toContain("'detected->mitigating'");
    expect(migration).toContain("'investigating->monitoring'");
    expect(migration).toContain("'monitoring->resolved'");
    expect(migration).toContain("'resolved->investigating'");
    expect(migration).toContain("Illegal incident transition");
    expect(migration).toContain("using errcode = '23514'");
  });

  it("requires the stronger resolve capability for terminal resolution", () => {
    expect(migration).toContain("p_to = 'resolved'");
    expect(migration).toContain(
      "studio2_access_allowed('incident.resolve', v_incident.edition_id, false)",
    );
    expect(migration).toContain(
      "studio2_access_allowed('incident.manage', v_incident.edition_id, false)",
    );
  });

  it("keeps the TypeScript transition graph aligned with the database", () => {
    expect(client).toContain(
      "detected: ['investigating', 'mitigating', 'monitoring', 'resolved']",
    );
    expect(client).toContain(
      "investigating: ['mitigating', 'monitoring', 'resolved']",
    );
    expect(client).toContain(
      "resolved: ['investigating', 'monitoring']",
    );
  });
});
