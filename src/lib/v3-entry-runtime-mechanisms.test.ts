import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { proveInternalMechanisms } from "./v3-s16-internal-mechanisms";
import type { V3S16CatalogEvidence } from "./v3-s16-mutation-authority";

// A disposable catalog snapshot for structural regression tests, never release
// certification. Live clean/upgrade SQL independently checks these same objects.
const observed = JSON.parse(readFileSync(".github/fixtures/v3-entry-runtime-mechanisms.json", "utf8")) as V3S16CatalogEvidence;
const proof = (catalog: V3S16CatalogEvidence) => proveInternalMechanisms(catalog).classifications
  .filter(c => c.proof === ".github/tests/v3-entry-runtime-boundary.sql");

describe("Entry runtime mechanisms behind canonical authority", () => {
  it("proves all six mechanisms from observed code, grants, inputs and topology", () => {
    expect(proof(observed)).toHaveLength(6);
    expect(new Set(proof(observed).map(p => p.category))).toEqual(new Set(["primitive", "projection", "housekeeping", "guard"]));
  });
  it("rejects a restored transport grant on the legacy participation primitive", () => {
    const c = structuredClone(observed);
    const fn = c.functions.find(f => f.name === "public.admin_set_participation_status")!;
    fn.executeRoles = [...fn.executeRoles, "service_role"];
    expect(proof(c).some(p => p.signature.startsWith("public.admin_set_participation_status("))).toBe(false);
  });
  it("rejects authority or code drift in the live-session canonical ancestor", () => {
    const c = structuredClone(observed);
    const fn = c.functions.find(f => f.name === "public.studio2_apply_participation_status")!;
    fn.definitionHash = "0".repeat(32);
    expect(proof(c).some(p => p.category === "primitive")).toBe(false);
  });
  it("rejects an unreviewed caller of the old primitive", () => {
    const c = structuredClone(observed);
    const fn = c.functions.find(f => f.name === "public.admin_set_participation_status")!;
    fn.callers = [...fn.callers!, "unknown-peer"];
    expect(proof(c).some(p => p.category === "primitive")).toBe(false);
  });
  it("rejects changed trigger columns as well as changed function attachment", () => {
    const c = structuredClone(observed);
    const table = c.tables.find(t => t.table === "public.entries")!;
    const changed = table.triggerDefinitions!.map(t => t.name === "entries_sync_confirmation_youtube" ? { ...t, definitionHash: "f".repeat(32) } : t);
    table.triggerDefinitions = changed;
    expect(proof(c).some(p => p.signature === "public.sync_confirmation_entry_youtube_link()")).toBe(false);
    expect(proof(c).some(p => p.signature === "private.v3_supersede_stale_media_reviews()")).toBe(true);
  });
  it("rejects raw column mutation of immutable source history", () => {
    const c = structuredClone(observed);
    const table = c.tables.find(t => t.table === "private.v3_entry_versions")!;
    table.columnDmlGrants = [...table.columnDmlGrants!, { role: "authenticated", column: "content", privilege: "UPDATE" }];
    expect(proof(c).some(p => p.signature === "private.v3_bind_confirmation_entry_version()")).toBe(false);
    expect(proof(c).some(p => p.signature === "private.v3_record_inserted_entry_version()")).toBe(false);
  });
});
