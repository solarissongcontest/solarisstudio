import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 review hardening", () => {
  const hardening = source(
    "supabase/migrations/20261003135000_organisation_os_v5_review_hardening.sql",
  );

  it("retains immutable operation receipts after actor deletion", () => {
    expect(hardening).toContain("alter column actor_id drop not null");
    expect(hardening).toContain("references auth.users(id)");
    expect(hardening).toContain("on delete set null");
  });

  it("prunes stale task recipients before delivery", () => {
    expect(hardening).toContain("private.studio2_task_recipient_eligible");
    expect(hardening).toContain("private.studio2_prune_stale_task_notifications");
    expect(hardening).toContain("public.solaris_organizer_task_recipient_eligible");
    expect(hardening).toContain("Organizer Task recipient is no longer eligible.");
    expect(hardening).toContain(
      "perform private.studio2_prune_stale_task_notifications(p_edition_id);",
    );

    const dispatcher = source("supabase/functions/solaris-push-dispatch/index.ts");
    expect(dispatcher).toContain('.select("state,resolved_at,source_key")');
    expect(dispatcher).toContain('"solaris_organizer_task_recipient_eligible"');
    expect(dispatcher).toContain('"Organizer Task eligibility revalidation failed; retry scheduled."');
    const organizerBlockStart = dispatcher.indexOf('if (delivery.category === "organizer_tasks")');
    const preferenceStart = dispatcher.indexOf("const { data: preferenceData");
    const organizerBlock = dispatcher.slice(organizerBlockStart, preferenceStart);
    expect(organizerBlock).toContain('"solaris_organizer_task_recipient_eligible"');
    expect(organizerBlock).toContain('.eq("source_key", task.source_key)');
    expect(dispatcher).toContain('"Organizer Task recipient is no longer eligible."');

    const organizerBranchIndex = dispatcher.indexOf(
      'if (delivery.category === "organizer_tasks")',
    );
    const eligibilityIndex = dispatcher.indexOf(
      '"solaris_organizer_task_recipient_eligible"',
    );
    const preferencesIndex = dispatcher.indexOf(
      "const { data: preferenceData, error: preferenceError }",
    );
    expect(organizerBranchIndex).toBeGreaterThanOrEqual(0);
    expect(eligibilityIndex).toBeGreaterThan(organizerBranchIndex);
    expect(preferencesIndex).toBeGreaterThan(eligibilityIndex);
  });

  it("treats expiry changes as real governed permission mutations", () => {
    expect(
      hardening.match(/expires_at is not distinct from p_expires_at/g)?.length,
    ).toBe(2);
  });

  it("uses the current urgency helper for actual web-push sends", () => {
    const dispatcher = source("supabase/functions/solaris-push-dispatch/index.ts");
    expect(dispatcher).toContain(
      'urgency: isUrgentDelivery(delivery) ? "high" : "normal"',
    );
    expect(dispatcher).not.toContain("isUrgentDeadline");
  });

  it("keeps exactly one active mobile destination on Tasks", () => {
    const frame = source("src/components/admin/AdminFrame.tsx");
    expect(frame).toContain('!path.startsWith("/admin/tasks")');
  });

  it("budgets the Nitro client directory that is actually deployed", () => {
    const budget = source("scripts/check-client-bundle-budget.mjs");
    expect(budget).toContain('".output/public/_build/assets"');
  });
});
