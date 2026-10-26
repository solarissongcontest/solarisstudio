import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const anniversaryRoute = source("src/routes/_authenticated/admin/anniversary-dates.tsx");
const anniversaryClient = source("src/lib/v3-anniversary-dates.ts");
const anniversaryMigration = source(
  "supabase/migrations/20261026190000_v3_anniversary_date_operation.sql",
);
const revealRoute = source("src/routes/_authenticated/admin/results-reveal.tsx");
const revealClient = source("src/lib/results-reveal-lifecycle.ts");
const revealMigration = source(
  "supabase/migrations/20261026190500_v3_reveal_director_lifecycle.sql",
);

function status(id: string) {
  return V3_ORGANIZER_CAPABILITY_REGISTRY.find((item) => item.legacyId === id);
}

describe("Worker 5 round 2 governed Organizer cutovers", () => {
  it("cuts over historical Anniversary date editing only through the canonical command", () => {
    const capability = status("workspace-anniversary-dates");
    expect(capability).toBeDefined();
    expect(capability?.migrationStatus).toBe("cutover");
    expect(capability?.targetRoute).toBe("/admin/anniversary-dates");

    expect(anniversaryRoute).toContain("previewAnniversaryDate");
    expect(anniversaryRoute).toContain("applyAnniversaryDate");
    expect(anniversaryRoute).toContain("pendingReview.preview.expectedVersion");
    expect(anniversaryRoute).toContain("pendingReview.operationId");
    expect(anniversaryRoute).not.toContain('.from("editions")');
    expect(anniversaryRoute).not.toContain(".update({");

    expect(anniversaryClient).toContain('rpc("studio2_anniversary_date_preview"');
    expect(anniversaryClient).toContain('rpc("studio2_apply_anniversary_date"');
    expect(anniversaryClient).toContain('rpc("studio2_reconcile_operation"');
    expect(anniversaryClient).toContain('command: "story.anniversary_date.set"');
    expect(anniversaryMigration).toContain("private.studio2_can_manage_storytelling");
    expect(anniversaryMigration).toContain("VERSION_CONFLICT");
    expect(anniversaryMigration).toContain("private.studio2_claim_operation");
    expect(anniversaryMigration).toContain("private.studio2_complete_operation");
  });

  it("cuts over Reveal Director without importing Results calculation authority", () => {
    const capability = status("live-review-reveal-director");
    expect(capability).toBeDefined();
    expect(capability?.migrationStatus).toBe("cutover");
    expect(capability?.targetRoute).toBe("/admin/results-reveal");

    expect(revealRoute).toContain("loadRevealDirectorSnapshot");
    expect(revealRoute).toContain("configureRevealPlan");
    expect(revealRoute).toContain("transitionReveal");
    expect(revealRoute).toContain("advanceReveal");
    expect(revealRoute).toContain("runtime.version");
    expect(revealRoute).toContain("invalidateQueries({ queryKey: ['reveal-director'");

    expect(revealClient).toContain("studio2_reveal_director_snapshot");
    expect(revealClient).toContain("studio2_configure_reveal_v3");
    expect(revealClient).toContain("studio2_transition_reveal_v3");
    expect(revealClient).toContain("studio2_advance_reveal_v3");
    expect(revealClient).toContain("studio2_reconcile_operation");
    expect(revealClient).toContain("result.previousVersion !== request.expectedVersion");
    expect(revealClient).toContain("result.operationId !== request.operationId");

    expect(revealMigration).toContain("broadcast.manage");
    expect(revealMigration).toContain("broadcast.control");
    expect(revealMigration).toContain("VERSION_CONFLICT");
    expect(revealMigration).toContain("private.studio2_claim_operation");
    expect(revealMigration).toContain("private.studio2_complete_operation");
    expect(revealMigration).not.toContain("recalculate_show_results");
    expect(revealMigration).not.toContain("calculate_televote");
  });
});
