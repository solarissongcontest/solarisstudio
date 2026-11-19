import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const rollout = vi.hoisted(() => ({ released: false }));

vi.mock("@/lib/public-launch-context", () => ({
  usePublicLaunchAvailability: () => ({
    allowsReleased: (_to: string) => rollout.released,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode }) =>
    createElement("a", { ...props, href: to }, children),
}));

import { ParticipationServiceDirectory } from "@/components/public/ParticipationServiceDirectory";

const paths = ["/confirmations", "/my-solaris/entry", "/jury-voting", "/televoting"];

describe("Participate core service discovery", () => {
  it("keeps every official service named but non-clickable during restricted release", () => {
    rollout.released = false;
    const html = renderToStaticMarkup(<ParticipationServiceDirectory />);
    for (const label of ["Confirmations", "Entry submission", "Jury voting", "Televoting"]) {
      expect(html).toContain(label);
    }
    for (const path of paths) expect(html).not.toContain(`href="${path}"`);
    expect(html).toContain("Not available in the current public release.");
    expect(html).toContain("Existing confirmations may still be editable");
    expect(html).toContain("Edit via existing access");
    expect(html).not.toContain("Open now");
  });

  it("links to existing workflows only after the release gate permits them", () => {
    rollout.released = true;
    try {
      const html = renderToStaticMarkup(<ParticipationServiceDirectory />);
      for (const path of paths) expect(html).toContain(`href="${path}"`);
      expect(html).not.toContain("Not available in the current public release.");
      expect(html).not.toContain("Open now");
    } finally {
      rollout.released = false;
    }
  });

  it("appears on both the legacy browser/app and the V3 installed screen", () => {
    for (const path of [
      "src/routes/participate/index.tsx",
      "src/components/v3/V3ParticipateScreen.tsx",
    ]) {
      expect(readFileSync(path, "utf8")).toContain("<ParticipationServiceDirectory />");
    }
  });
});
