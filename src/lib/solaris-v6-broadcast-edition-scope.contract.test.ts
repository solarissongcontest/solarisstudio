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

function expectGuardBeforeWrite(section: string, guardCall: string, writeCall: string) {
  const guardIndex = section.indexOf(guardCall);
  const writeIndex = section.indexOf(writeCall);
  expect(guardIndex).toBeGreaterThanOrEqual(0);
  expect(writeIndex).toBeGreaterThan(guardIndex);
}

describe("Solaris V6 Broadcast edition isolation", () => {
  it("validates each reviewed production command against the selected show's canonical edition", () => {
    const route = source("src/routes/_authenticated/admin/broadcast-rundown.tsx");

    expect(route).toContain("validateEditionCommandScope");
    expect(route).toContain("routeEditionId: editionId ?? null");
    expect(route).toContain("commandEditionId: reviewedEditionId ?? null");
    expect(route).toContain("entityEditionId: show?.edition_id ?? null");
    expect(route).toContain("contextShowId !== reviewedShowId");
    expect(route).toContain("editionId !== reviewedEditionId");
    expect(route).toContain("{ status: 409 }");
  });

  it("guards reviewed structure saves, locks and segment transitions before production writes", () => {
    const route = source("src/routes/_authenticated/admin/broadcast-rundown.tsx");
    const saveSection = mutationSection(route, "const saveMutation = useMutation", "const lockMutation = useMutation");
    const lockSection = mutationSection(route, "const lockMutation = useMutation", "const transitionMutation = useMutation");
    const transitionSection = mutationSection(route, "const transitionMutation = useMutation", "const calculated = useMemo");

    expectGuardBeforeWrite(saveSection, "assertProductionEditionScope(review.editionId, review.showId)", "saveStudio2BroadcastRundown(");
    expectGuardBeforeWrite(lockSection, "assertProductionEditionScope(reviewedEditionId, reviewedShowId)", "setStudio2BroadcastRundownLock(");
    expectGuardBeforeWrite(transitionSection, "assertProductionEditionScope(reviewedEditionId, reviewedShowId)", "return transitionStudio2BroadcastSegment(\n        reviewedShowId,");

    expect(saveSection).toContain("const live = await loadStudio2BroadcastRundown(review.showId)");
    expect(saveSection).toContain("liveRevision !== review.revision");
    expect(lockSection).toContain("await loadStudio2BroadcastRundown(reviewedShowId)");
    expect(transitionSection).toContain("await loadStudio2BroadcastRundown(reviewedShowId)");
    expect(transitionSection).toContain("liveSegment?.status !== reviewedStatus");
  });

  it("keeps rehearsal transitions local, outside production authority and structure saves", () => {
    const route = source("src/routes/_authenticated/admin/broadcast-rundown.tsx");
    const transitionSection = mutationSection(route, "const transitionMutation = useMutation", "const calculated = useMemo");
    const rehearsalGuard = transitionSection.indexOf("if (mode === 'rehearsal') {");
    const productionGuard = transitionSection.indexOf("assertProductionEditionScope(reviewedEditionId, reviewedShowId)");

    expect(rehearsalGuard).toBeGreaterThanOrEqual(0);
    expect(productionGuard).toBeGreaterThan(rehearsalGuard);
    expect(transitionSection).toContain("return transitionStudio2BroadcastSegment(showId, draft, segmentId, status, reason, mode);");
    expect(route).toContain("if (mode === 'rehearsal') return;");
    expect(route).toContain("mode === 'rehearsal'");
    expect(route).toContain("Rehearsal mode never calls a production mutation.");
  });

  it("remounts production and rehearsal drafts for both edition and selected Show changes", () => {
    const route = source("src/routes/_authenticated/admin/broadcast-rundown.tsx");
    expect(route).toContain("component: BroadcastRundownRoute");
    expect(route).toContain("function BroadcastRundownRoute()");
    expect(route).toContain("const { editionId, showId } = useAdminContext()");
    expect(route).toContain("key={`${editionId || 'unscoped'}:${showId || 'no-show'}`}");
    expect(route).toContain("showId: contextShowId");
    expect(route).toContain("setShowContext");
  });
});
