import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { organizerTaskDomain } from "./v3-organizer-projection";

function task(href: string, sourceKind: string, taskType: string) {
  return { href, sourceKind, taskType };
}

describe("V3 Organizer projection task ownership", () => {
  it("keeps voting-specific integrity work inside Governance only when the shared taxonomy says Integrity", () => {
    expect(
      organizerTaskDomain(task("/admin/jury-integrity", "jury_integrity", "jury.integrity.review")),
    ).toBe("governance");
    expect(
      organizerTaskDomain(
        task("/televoting/admin/integrity", "televote_integrity", "televote.integrity.review"),
      ),
    ).toBe("governance");
  });

  it("routes generic integrity and investigations to Governance", () => {
    expect(
      organizerTaskDomain(task("/admin/integrity-cases/024", "integrity_case", "integrity.review")),
    ).toBe("governance");
    expect(
      organizerTaskDomain(task("/admin/investigations/024", "investigation", "investigation.review")),
    ).toBe("governance");
    expect(
      organizerTaskDomain(task("/admin/appeals/3", "appeal", "appeal.review")),
    ).toBe("governance");
  });

  it("maps shared Entry and Media task domains into the coarser Contest control domain", () => {
    expect(
      organizerTaskDomain(task("/admin/entries/ssc22", "entry_review", "entry.review")),
    ).toBe("contest");
    expect(
      organizerTaskDomain(task("/admin/media-assets", "media_asset", "media.replacement")),
    ).toBe("contest");
  });

  it("maps shared Publication and Production domains to the matching Control domains", () => {
    expect(
      organizerTaskDomain(task("/admin/results", "result_operation", "result.review")),
    ).toBe("results");
    expect(
      organizerTaskDomain(task("/admin/broadcast-rundown", "broadcast_rundown", "rundown.attention")),
    ).toBe("production");
  });

  it("keeps communication rule clarifications in Communications", () => {
    expect(
      organizerTaskDomain(
        task(
          "/admin/communications",
          "announcement_delivery",
          "communication.rule_clarification.delivery_failed",
        ),
      ),
    ).toBe("communications");
  });

  it("does not classify ordinary delegation tasks as Governance", () => {
    expect(
      organizerTaskDomain(task("/confirmations/admin", "confirmation", "confirmation.review")),
    ).toBe("delegations");
  });

  it("derives projection ownership from the shared task taxonomy instead of a second regex implementation", () => {
    const projection = readFileSync("src/lib/v3-organizer-projection.ts", "utf8");
    expect(projection).toContain("organizerTaskDomain as classifyOrganizerTaskDomain");
    expect(projection).toContain("projectionTaskDomain[classifyOrganizerTaskDomain(task)]");
    expect(projection).not.toContain("const semantic = `${task.sourceKind} ${task.taskType}`");
  });
});
