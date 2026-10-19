import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/rules-manager.tsx", "utf8");
const manifest = readFileSync(
  "src/components/admin/RulebookPublicationManifest.tsx",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260911161300_rulebook_publication_state_hardening.sql",
  "utf8",
);

describe("V3 Organizer rulebook publication review", () => {
  it("keeps the existing deliberate publication arm step and inserts the exact manifest before apply", () => {
    expect(route).toContain("publishArmed");
    expect(route).toContain("<RulebookPublicationManifest release={release} />");
    expect(route).toContain("Confirm publication");
    expect(route.indexOf("<RulebookPublicationManifest release={release} />")).toBeLessThan(
      route.indexOf("Confirm publication"),
    );
  });

  it("shows the exact before/after rule snapshots and publication rationale", () => {
    expect(manifest).toContain("Exact release manifest");
    expect(manifest).toContain("change.before_snapshot");
    expect(manifest).toContain("change.after_snapshot");
    expect(manifest).toContain("snapshot.summary");
    expect(manifest).toContain("snapshot.body");
    expect(manifest).toContain("snapshot.important");
    expect(manifest).toContain("change.rationale");
  });

  it("does not create a second publication authority in the manifest", () => {
    expect(manifest).not.toContain("useMutation");
    expect(manifest).not.toContain("supabase");
    expect(manifest).not.toContain("admin_publish_rulebook_release");
    expect(manifest).toContain("System #953");
  });

  it("preserves the legacy server invariants until System #953 replaces the mutation boundary", () => {
    expect(route).toContain('rpc("admin_publish_rulebook_release"');
    expect(migration).toContain("Only draft releases can be published");
    expect(migration).toContain("Draft base is no longer the current rulebook release");
    expect(migration).toContain("A release needs at least one recorded rule change before publication");
    expect(migration).toContain("release.published");
  });
});
