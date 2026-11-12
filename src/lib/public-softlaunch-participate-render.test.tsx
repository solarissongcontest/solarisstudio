import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Only routing transport is replaced. Render the real screen, foundation
// controls and canonical bootstrap/task presentation without network clients.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode }) =>
    createElement("a", { ...props, href: to }, children),
}));

import { V3ParticipateScreen } from "@/components/v3/V3ParticipateScreen";
import { projectV3Bootstrap, type V3BootstrapSource } from "./v3-bootstrap";
import type { SolarisTask } from "./participation-os";

function renderTask(overrides: Partial<SolarisTask>) {
  const source: V3BootstrapSource = {
    schemaVersion: 1,
    generatedAt: "2026-11-14T18:00:00Z",
    serverTime: "2026-11-14T18:00:00Z",
    identity: { userId: "local-viewer", displayName: "Viewer" },
    context: {
      editionId: "edition",
      editionLabel: "Current contest",
      delegationId: null,
      delegationName: null,
    },
    capabilities: [],
    domain: {
      edition: "active",
      confirmationWindow: "closed",
      submissionWindow: "closed",
      show: "scheduled",
      jury: "closed",
      televote: "upcoming",
      results: "hidden",
      publication: "scheduled",
    },
    tasks: [
      {
        id: "public-vote",
        editionId: "edition",
        kind: "televote",
        title: "Grand Final public vote",
        description: "The public vote opens later.",
        state: "upcoming",
        importance: "optional",
        blocking: false,
        actionRequired: false,
        opensAt: "2026-11-14T19:00:00Z",
        deadline: "2026-11-14T21:00:00Z",
        route: "/televoting",
        priority: 10,
        why: "Official round schedule",
        ...overrides,
      },
    ],
  };
  return renderToStaticMarkup(<V3ParticipateScreen bootstrap={projectV3Bootstrap(source)} />);
}

describe("soft-launch Participate screen with real bootstrap", () => {
  it("renders a future public vote as Upcoming without advertising Optional now", () => {
    const html = renderTask({});
    expect(html).toContain("Upcoming");
    expect(html).toContain('href="/televoting"');
    expect(html).not.toContain("Optional now");
    expect(html).not.toContain(">Open<");
  });
  it("keeps an open public vote optional without inventing a required responsibility", () => {
    const html = renderTask({ state: "available", opensAt: null });
    expect(html).toContain("Optional now");
    expect(html).toContain("Nothing requires action");
    expect(html).not.toContain("1 required");
  });
  it("retains submitted jury history without requesting another ballot", () => {
    const html = renderTask({
      kind: "jury",
      state: "completed",
      importance: "required",
      title: "Grand Final jury ballot",
    });
    expect(html).toContain("Submitted");
    expect(html).toContain("View completed activity");
    expect(html).toContain("Nothing requires action");
    expect(html).not.toContain("Optional now");
  });
});
