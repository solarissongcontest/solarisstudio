import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const driver = readFileSync(".github/scripts/v3-full-contest-rehearsal.sh", "utf8");
const runtimeSchema = readFileSync(
  "supabase/migrations/20260910220000_studio2_persistence_schema.sql",
  "utf8",
);
const transitionAuthority = readFileSync(
  "supabase/migrations/20260916145441_permission_engine_v2_transition_approval_rpc_cutover.sql",
  "utf8",
);

describe("S14 canonical edition-runtime progression", () => {
  it("starts the deterministic rehearsal in canonical draft runtime state", () => {
    expect(driver).toContain("insert into public.studio2_edition_runtime");
    expect(driver).toContain("private.studio2_default_subsystems('draft')");
    expect(driver).toContain('== "draft"');
  });

  it("uses the governed edition transition authority rather than direct stage-state updates", () => {
    expect(driver).toContain("studio2_transition_edition_v2");
    expect(driver).not.toMatch(/update\s+public\.studio2_edition_runtime/i);
    expect(transitionAuthority).toContain("public.studio2_access_allowed(v_required_capability");
    expect(transitionAuthority).toContain("edition.state_changed");
  });

  it("advances implemented lifecycle work in canonical state-machine order", () => {
    const expected = [
      "planning",
      "confirmations",
      "submissions",
      "pre_show",
      "rehearsals",
      "jury_voting",
      "live_show",
      "televoting",
    ];
    let cursor = -1;
    for (const state of expected) {
      const next = driver.indexOf(`advance_s14_runtime ${state}`);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
    for (const edge of [
      "draft->planning",
      "planning->confirmations",
      "confirmations->submissions",
      "submissions->pre_show",
      "pre_show->rehearsals",
      "rehearsals->jury_voting",
      "jury_voting->live_show",
      "live_show->televoting",
    ]) expect(runtimeSchema).toContain(`when '${edge}' then 'normal'`);
  });

  it("stops honestly in Televoting while Stage 7 deadline extension is unresolved", () => {
    expect(driver).toContain("partial S14 must remain in televoting while Stage 7 is blocked");
    expect(driver).toContain('"runtimeState": "televoting"');
    expect(driver).not.toContain("advance_s14_runtime vote_verification");
    expect(driver).not.toContain("advance_s14_runtime results");
    expect(driver).not.toContain("advance_s14_runtime post_edition");
    expect(driver).not.toContain("advance_s14_runtime archived");
  });
});
