import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const overview = readFileSync(
  new URL("../components/v3/V3OrganizerOverviewScreen.tsx", import.meta.url),
  "utf8",
);
const control = readFileSync(
  new URL("../components/v3/V3OrganizerControlScreen.tsx", import.meta.url),
  "utf8",
);
const combined = `${overview}\n${control}`;

describe("V3 Organizer mobile screen architecture boundaries", () => {
  it("renders canonical projections without acquiring data or browser-state ownership", () => {
    expect(overview).toContain("V3OrganizerOverviewProjection");
    expect(control).toContain("V3OrganizerControlProjection");

    for (const forbidden of [
      "@supabase",
      "supabase.",
      "fetch(",
      "useQuery",
      "useMutation",
      "useEffect",
      "localStorage",
      "sessionStorage",
      "indexedDB",
    ]) {
      expect(combined).not.toContain(forbidden);
    }
  });

  it("keeps task truth separate from Inbox communication", () => {
    expect(overview).toContain("projection.doNow.map");
    expect(overview).toContain("projection.inbox.map");
    expect(overview).toContain("projection.unresolvedInboxCount");
    expect(overview).not.toMatch(/inbox.*doNow|doNow.*inbox/i);
  });

  it("consumes resolved readiness and Live state without device-clock inference", () => {
    expect(overview).toContain("projection.readiness");
    expect(overview).toContain("projection.live ?");
    expect(overview).not.toMatch(/Date\.now|new Date|Date\.parse|setInterval|WebSocket|EventSource/);
  });

  it("keeps Control navigation-only and does not recreate authorization or risk policy", () => {
    expect(control).toContain("projection.modules.map");
    expect(control).toContain('workspace.availability === "blocked"');
    expect(control).not.toContain("onClick=");
    expect(control).not.toMatch(
      /displayRole\s*===|role\s*===|hasCapability|canAccess|capabilities\s*\.|riskTier|reauthenticate|confirmMutation/,
    );
  });

  it("does not absorb Tasks, Live operations or advanced diagnostics into Control", () => {
    expect(control).not.toMatch(/exceptionQueue|liveOperations|advancedDiagnostics|diagnosticLab/i);
    expect(control).not.toMatch(/task\.state|projection\.doNow|projection\.inbox/);
  });

  it("reuses the shared V3 presentation foundation", () => {
    expect(overview).toContain('from "./V3Foundation"');
    expect(control).toContain('from "./V3Foundation"');
    expect(overview).toContain("<V3Screen>");
    expect(control).toContain("<V3Screen>");
    expect(combined).not.toContain("V3FoundationShell");
  });
});
