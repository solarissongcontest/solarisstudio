import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppTaskCard, AppTaskCenter } from "@/components/app/AppTaskCenter";
import type { SolarisTask } from "./participation-os";

function task(overrides: Partial<SolarisTask> = {}): SolarisTask {
  return {
    id: "entry-review",
    editionId: "ssc-22",
    kind: "entry",
    title: "Entry correction required",
    description: "Organizer requested changes.",
    state: "problem",
    importance: "required",
    blocking: true,
    actionRequired: true,
    opensAt: null,
    deadline: null,
    route: "/my-solaris/entry",
    priority: 140,
    why: "Official organizer review",
    ...overrides,
  };
}

describe("Organizer inspection respects participant task boundary", () => {
  it("renders a real required task but no navigable link in read-only inspection", () => {
    const html = renderToStaticMarkup(<AppTaskCenter tasks={[task()]} readOnly />);
    expect(html).toContain("Entry correction required");
    expect(html).toContain("Organizer requested changes.");
    expect(html).toContain('data-solaris-readonly-task-card=""');
    expect(html).not.toMatch(/<a\b/i);
    expect(html).not.toContain('href="/my-solaris/entry"');
  });

  it("keeps optional live voting discoverable but noninteractive in inspection", () => {
    const html = renderToStaticMarkup(<AppTaskCenter tasks={[task({
      id: "public-vote",
      kind: "televote",
      title: "Public Grand Final vote",
      state: "available",
      importance: "optional",
      blocking: false,
      actionRequired: false,
      route: "/televoting",
    })]} readOnly />);
    expect(html).toContain("Available now");
    expect(html).toContain("Public Grand Final vote");
    expect(html).toContain("Optional");
    expect(html).not.toMatch(/<a\b/i);
  });

  it("connects the inspection flag only for Organizer's read-only country view", () => {
    const moduleSource = readFileSync("src/components/mysolaris/modules/MySolarisTasksModule.tsx", "utf8");
    const componentSource = readFileSync("src/components/app/AppTaskCenter.tsx", "utf8");
    expect(moduleSource).toContain("readOnly={organizerInspection}");
    expect(moduleSource).toContain("Participant View · read-only");
    expect(componentSource).toContain("<Link to={task.route as any}");
    expect(componentSource).toContain("if (readOnly)");
    expect(componentSource).toContain("data-solaris-readonly-task-card");
  });

  it("does not invent a navigation target on a read-only action card", () => {
    const html = renderToStaticMarkup(<AppTaskCard task={task({ route: "/confirmations" })} readOnly />);
    expect(html).not.toMatch(/<a\b/i);
    expect(html).toContain("Entry correction required");
  });
});
