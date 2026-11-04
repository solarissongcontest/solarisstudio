import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const guide = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/guide.tsx"),
  "utf8",
);

const organizer = readFileSync(
  resolve(process.cwd(), "src/lib/v3-organizer.ts"),
  "utf8",
);

describe("Organizer V3 guide information architecture", () => {
  it("teaches the same five permanent destinations as the canonical Organizer shell", () => {
    expect(organizer).toContain(
      '[\n  "overview",\n  "tasks",\n  "control",\n  "live",\n  "more",\n]',
    );
    expect(guide).toContain(
      "Its permanent destinations are Overview, Tasks, Control, Live and More.",
    );
    expect(guide).toContain(">Overview</strong>");
    expect(guide).toContain(">Tasks</strong>");
    expect(guide).toContain(">Control</strong>");
    expect(guide).toContain(">Live</strong>");
    expect(guide).toContain(">More</strong>");
  });

  it("keeps specialist domains inside Control instead of teaching them as top-level apps", () => {
    expect(guide).toContain("They are first-class domains inside");
    expect(guide).toContain('to="/admin/control"');
    expect(guide).toContain("Control → participation, confirmations, rounds and access.");
    expect(guide).toContain("Control → entries, media, shows, running order and participation.");
    expect(guide).toContain("Control → rounds, Jury, Televote, declarations and integrity.");
    expect(guide).not.toContain(
      "The main workspaces are\n            Delegations, Contest, Voting, Publish, Broadcast and Administration.",
    );
  });

  it("separates live execution from production configuration", () => {
    expect(guide).toContain(
      "Configure presentation in Control; operate the active show in Live.",
    );
    expect(guide).toContain(
      "Configuration belongs in Control; live execution belongs in Live.",
    );
    expect(guide).toContain("Live is for operating the active show");
  });

  it("keeps More low-frequency and Tasks exception-first", () => {
    expect(guide).toContain("Tasks is the exception/action queue.");
    expect(guide).toContain(
      "Governance, Platform, Integrations, Engagement,\n            Product QA, System and Historical tools",
    );
    expect(guide).toContain(
      "Anything routinely needed during ordinary contest operation\n            belongs in Control, Tasks, Live or a contextual action instead.",
    );
  });

  it("remains observational rather than inventing Organizer mutations", () => {
    expect(guide).not.toContain("useMutation(");
    expect(guide).not.toContain("supabase.from(");
  });
});
