import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

function mutationSection(route: string, start: string, end: string) {
  const startIndex = route.indexOf(start);
  const endIndex = route.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return route.slice(startIndex, endIndex);
}

function expectGuardBeforeWrite(section: string, writeCall: string) {
  const guardIndex = section.indexOf("assertProductionEditionScope(");
  const writeIndex = section.indexOf(writeCall);
  expect(guardIndex).toBeGreaterThanOrEqual(0);
  expect(writeIndex).toBeGreaterThan(guardIndex);
}

describe("Solaris V6 Broadcast edition isolation", () => {
  it("validates production commands against the selected show's canonical edition", () => {
    const route = source(
      "src/routes/_authenticated/admin/broadcast-rundown.tsx",
    );

    expect(route).toContain("validateEditionCommandScope");
    expect(route).toContain("routeEditionId: editionId ?? null");
    expect(route).toContain("commandEditionId: reviewedEditionId ?? null");
    expect(route).toContain("entityEditionId: show?.edition_id ?? null");
    expect(route).toContain("{ status: 409 }");
  });

  it("guards save lock and production segment transition before their production writes", () => {
    const route = source(
      "src/routes/_authenticated/admin/broadcast-rundown.tsx",
    );

    const saveSection = mutationSection(route, "const saveMutation = useMutation", "const lockMutation = useMutation");
    const lockSection = mutationSection(route, "const lockMutation = useMutation", "const transitionMutation = useMutation");
    const transitionSection = mutationSection(route, "const transitionMutation = useMutation", "const calculated = useMemo");

    expectGuardBeforeWrite(saveSection, "saveStudio2BroadcastRundown(");
    expectGuardBeforeWrite(lockSection, "setStudio2BroadcastRundownLock(");
    expectGuardBeforeWrite(
      transitionSection,
      "return transitionStudio2BroadcastSegment(\n        reviewedShowId,",
    );

    expect(lockSection).toContain("await loadStudio2BroadcastRundown(reviewedShowId)");
    expect(transitionSection).toContain("await loadStudio2BroadcastRundown(reviewedShowId)");
    expect(transitionSection).toContain("if (mode === 'rehearsal') {");
    expect(transitionSection).toContain("return transitionStudio2BroadcastSegment(showId, draft, segmentId, status, reason, mode);");
  });

  it("keeps rehearsal mode local and outside production authority checks", () => {
    const route = source(
      "src/routes/_authenticated/admin/broadcast-rundown.tsx",
    );

    expect(route).toContain("if (mode === 'rehearsal') return;");
    const save = mutationSection(route, "const saveMutation = useMutation", "const lockMutation = useMutation");
    expect(save).toContain("if (mode !== 'production')");
    expect(save).toContain("throw staleBroadcastReview");
    expect(save.indexOf("if (mode !== 'production')")).toBeLessThan(save.indexOf("saveStudio2BroadcastRundown("));
    expect(route).toContain(
      "Rehearsal mode never calls a production mutation",
    );
  });

  it("remounts both production and rehearsal drafts when Organizer edition context changes", () => {
    const route = source(
      "src/routes/_authenticated/admin/broadcast-rundown.tsx",
    );

    expect(route).toContain("component: BroadcastRundownRoute");
    expect(route).toContain("function BroadcastRundownRoute()");
    expect(route).toContain("<BroadcastRundownPage key={`${editionId || 'unscoped'}:${showId || 'no-show'}`} />");
  });
});
