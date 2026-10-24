import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/integrations/v3/publication-preview.server.ts"),
  "utf8",
);
const serverFn = readFileSync(
  resolve(process.cwd(), "src/lib/v3-publication-preview.functions.ts"),
  "utf8",
);
const publicResults = readFileSync(
  resolve(process.cwd(), "src/integrations/v3/results-source.server.ts"),
  "utf8",
);
const resultProjection = readFileSync(
  resolve(process.cwd(), "src/lib/v3-results.ts"),
  "utf8",
);

describe("V3 authoritative Organizer Publication preview", () => {
  it("is POST-only and keeps unpublished candidate intent out of a URL surface", () => {
    expect(serverFn).toContain('method: "POST"');
    expect(serverFn).not.toContain('method: "GET"');
    expect(serverFn).toContain("expectedPublicationVersion");
    expect(serverFn).toContain("publicationConfigSchema");
    expect(serverFn).toContain("@/integrations/v3/publication-preview.server");
  });

  it("requires Organizer identity and canonical publishing.publish preflight before privileged reads", () => {
    const organizer = source.indexOf("await requireSolarisOrganizerServer()");
    const authenticatedClient = source.indexOf("createSolarisAuthenticatedClientServer()");
    const preflight = source.indexOf('"studio2_show_publication_change_preview"');
    const adminRead = source.indexOf("supabaseAdmin as any");

    expect(organizer).toBeGreaterThan(-1);
    expect(authenticatedClient).toBeGreaterThan(organizer);
    expect(preflight).toBeGreaterThan(authenticatedClient);
    expect(adminRead).toBeGreaterThan(preflight);
    expect(source).toContain('p_target_state: "public"');
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("binds the reviewed Edition, Show and Publication version exactly", () => {
    expect(source).toContain("preflight.showId !== input.showId");
    expect(source).toContain("preflight.editionId !== input.editionId");
    expect(source).toContain(
      "preflight.expectedVersion !== input.expectedPublicationVersion",
    );
    expect(source).toContain('.eq("id", input.showId)');
    expect(source).toContain('.eq("edition_id", input.editionId)');
    expect(source).toContain(
      "Publication changed since this preview was requested",
    );
  });

  it("rejects any candidate config the canonical SQL preflight did not normalize identically", () => {
    expect(source).toContain("normalisePublicationDependencies");
    expect(source).toContain("samePublicationConfig(preflight.config, requestedConfig)");
    expect(source).toContain(
      "Canonical Publication preflight did not accept the reviewed candidate config",
    );
  });

  it("binds rendering to exact Show content and the release-ready Result version", () => {
    expect(source).toContain(
      "sameInstant(show.updated_at, preflight.sourceShowUpdatedAt)",
    );
    expect(source).toContain("exactVersion !== expectedVersion");
    expect(source).toContain(
      "Number(operation?.reviewed_version ?? -1) !== exactVersion",
    );
    expect(source).toContain(
      "Number(operation?.locked_version ?? -1) !== exactVersion",
    );
    expect(source).toContain(
      "Number(operation?.reveal_ready_version ?? -1) !== exactVersion",
    );
    expect(source).toContain(
      "Result version changed while Publication preview was loading",
    );
  });

  it("rechecks the exact Result operation after assembling rows to close the cutover race", () => {
    const calls = source.match(/await loadResultOperation\(input\.showId\)/g) ?? [];
    expect(calls.length).toBe(2);
    expect(source).toContain("A second exact-version read closes the race");
    expect(source).toContain("Result versions are monotonic");
  });

  it("uses canonical Publication normalization instead of browser-invented visibility", () => {
    expect(source).toContain("resolvePublicationConfig");
    expect(source).toContain("const publication = preflight.config");
    expect(source).toContain("visibility: publication");
    expect(source).toContain("publicationConfig: publication");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("window.");
  });

  it("uses the same Results projection primitive and split-redaction semantics as Public V3", () => {
    expect(source).toContain("buildV3ResultsProjection");
    expect(source).toContain(
      "juryPoints: input.publication.jury_results ? row.jury_points : null",
    );
    expect(source).toContain(
      "televotePoints: input.publication.televote_results ? row.televote_points : null",
    );
    expect(publicResults).toContain(
      "juryPoints: publication.jury_results === true ? row.jury_points : null",
    );
    expect(publicResults).toContain(
      "televotePoints: publication.televote_results === true ? row.televote_points : null",
    );
  });

  it("returns both canonical spoiler-protected and revealed render projections", () => {
    expect(source).toContain('disclosure: "withheld"');
    expect(source).toContain('disclosure: "revealed"');
    expect(source).toContain("spoilerProtected,");
    expect(source).toContain("revealed,");
    expect(resultProjection).toContain('status: "spoiler-protected"');
    expect(resultProjection).toContain('status: "available"');
  });

  it("does not fetch Result row datasets when the candidate keeps overall Results hidden", () => {
    const resultBranch = source.indexOf("if (publication.results) {");
    const resultRead = source.indexOf('.from("results")', resultBranch);
    const resultBranchEnd = source.indexOf(
      "const spoilerProtected = buildResultProjection",
      resultRead,
    );

    expect(resultBranch).toBeGreaterThan(-1);
    expect(resultRead).toBeGreaterThan(resultBranch);
    expect(resultBranchEnd).toBeGreaterThan(resultRead);
    expect(source.slice(0, resultBranch)).not.toContain('.from("results")');
    expect(source.slice(resultBranchEnd)).not.toContain('.from("results")');
  });

  it("still binds qualifier-only and other outcome releases to the exact Result version", () => {
    expect(source).toContain("const sourceResultVersion = preflight.hasOutcomes");
    expect(source).toContain("if (preflight.hasOutcomes) {");
    expect(source).toContain("await loadResultOperation(input.showId)");
    expect(source).toContain("config.qualifiers ||");
  });

  it("accounts for the Public Results root edition/show discovery gates", () => {
    expect(source).toContain("input.edition.published &&");
    expect(source).toContain(
      '(input.show.kind === "grand-final" || input.show.kind === "final")',
    );
    expect(source).toContain("resultsIndexEligible");
    expect(source).toContain("editionPublished: edition.published");
  });

  it("filters withdrawn/disqualified rows and preserves edition-scoped historical identity", () => {
    expect(source).toContain('participant.participation_status === "withdrawn"');
    expect(source).toContain(
      'participant.participation_status === "disqualified"',
    );
    expect(source).toContain("entityDisplayMap(input.entities, input.countries)");
    expect(source).toContain("entityKeyOf(row)");
    expect(source).toContain("historical_identity_override");
  });

  it("never mutates Publication, Show or Result truth", () => {
    expect(source).not.toMatch(/\.insert\s*\(/);
    expect(source).not.toMatch(/\.update\s*\(/);
    expect(source).not.toMatch(/\.delete\s*\(/);
    expect(source).not.toContain("studio2_apply_show_publication_change");
    expect(source).not.toContain('rpc("studio2_reconcile_operation"');
  });

  it("returns exact source-version evidence with the shadow public Show", () => {
    expect(source).toContain("publicationVersion: preflight.expectedVersion");
    expect(source).toContain("showUpdatedAt: preflight.sourceShowUpdatedAt");
    expect(source).toContain("resultVersion: sourceResultVersion");
    expect(source).toContain('targetState: "public"');
    expect(source).toContain("published: true");
    expect(source).toContain("schemaVersion: 1");
  });
});
