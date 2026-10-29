import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const source = () => read("src/integrations/v3/participant-activity.server.ts");
const functions = () => read("src/lib/v3-participant-activity.functions.ts");
const parser = () => read("src/lib/v3-participant-activity.ts");
const migration = () => read("supabase/migrations/20261019213500_v3_participant_activity_projection.sql");
const screen = () => read("src/components/v3/V3ParticipantActivityScreen.tsx");
const route = () => read("src/routes/_authenticated/my-solaris/activity.tsx");

describe("V3 participant activity architecture", () => {
  it("reads only the recipient-scoped System projection", () => {
    expect(migration()).toContain("create or replace function public.v3_my_participant_activity(");
    expect(source()).toContain('rpc("v3_my_participant_activity"');
    expect(source()).not.toContain("content_events");
    expect(source()).not.toContain("notification");
    expect(source()).not.toContain("localStorage");
    expect(functions()).not.toContain("userId");
    expect(functions()).not.toContain("countryId");
    expect(functions()).not.toContain("editionId");
  });

  it("retains a fail-closed staged-deployment fallback without creating alternate activity truth", () => {
    expect(source()).toContain("missingParticipantActivityContract");
    expect(source()).toContain("emptyV3ParticipantActivityBundle");
    expect(screen()).toContain('data-v3-participant-activity-state="unavailable"');
    expect(screen()).toContain("will not reconstruct private activity");
  });

  it("preserves the server's deterministic equal-timestamp cursor end to end", () => {
    expect(migration()).toContain("p_before_operation_id uuid default null");
    expect(migration()).toContain("'next_operation_id'");
    expect(source()).toContain("p_before_operation_id: input.beforeOperationId ?? null");
    expect(parser()).toContain("nextOperationId: string | null");
    expect(parser()).toContain("root.next_operation_id ?? root.nextOperationId");
  });

  it("keeps installed-app cutover reversible behind the Me rollout", () => {
    expect(route()).toContain("rollout.data.meEnabled === true");
    expect(route()).toContain("<V3ParticipantActivityScreen />");
    expect(route()).toContain('<MySolarisPersonalPage view="activity" />');
    expect(route()).toContain('content: "noindex, nofollow"');
  });

  it("renders reconciliation state rather than hiding stale history", () => {
    expect(screen()).toContain("Superseded");
    expect(screen()).toContain("Unavailable");
    expect(screen()).toContain('data-v3-activity-state={item.reconciliationState}');
  });
});
