import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_PUBLIC_CAPABILITY_REGISTRY } from "./v3-public-capability-registry";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const META_PROOF = "src/lib/v3-public-main-registry-evidence-cutovers.contract.test.ts";

const EVIDENCE_ONLY_MAIN_REGISTRY_CUTOVERS = [
  { id: "participant-view", proofFiles: ["src/lib/v3-primary-route-cutover.integration.test.ts", "src/lib/v3-participant-voting-overview.contract.test.ts"] },
  { id: "entry", proofFiles: ["src/lib/v3-entry-cutover.contract.test.ts"] },
  { id: "participant-voting-overview", proofFiles: ["src/lib/v3-participant-voting-overview-cutover.contract.test.ts", "src/lib/v3-participant-voting-overview.contract.test.ts"] },
  { id: "official-notices", proofFiles: ["src/lib/v3-official-notices.contract.test.ts", "src/lib/v3-official-notices.test.ts"] },
  { id: "country-profile", proofFiles: ["src/lib/v3-delegation-cutover.contract.test.ts", "src/lib/v3-delegation-history-links.contract.test.ts"] },
  { id: "predictions", proofFiles: ["src/lib/v3-predictions-merge.contract.test.ts", "src/lib/v3-predictions.test.ts"] },
  { id: "saved-items", proofFiles: ["src/lib/v3-following-saved.contract.test.ts", "src/lib/v3-following-saved.test.ts"] },
  { id: "country-account", proofFiles: ["src/lib/v3-account-settings-cutover.contract.test.ts"] },
  { id: "confirmations", proofFiles: ["src/lib/v3-confirmation-route-cutover.contract.test.ts", "src/lib/v3-confirmation-authority.contract.test.ts", "src/lib/v3-confirmation-authority-hardening.contract.test.ts"] },
  { id: "jury", proofFiles: ["src/lib/v3-s7-jury-ballot-authorization.contract.test.ts", "src/lib/v3-s3-jury-invariants.contract.test.ts"] },
  { id: "televote", proofFiles: [] },
  { id: "next-in-line", proofFiles: ["src/lib/v3-s7-next-in-line-authorization.contract.test.ts", "src/lib/v3-s7-next-in-line-window-authorization.contract.test.ts"] },
  { id: "rules", proofFiles: ["src/lib/v3-rules-family-cutover.contract.test.ts", "src/lib/v3-rules-guidance-cutover.contract.test.ts"] },
  { id: "live-show", proofFiles: ["src/lib/v3-live-cutover.contract.test.ts", "src/lib/v3-public-live-rollout.contract.test.ts"] },
  { id: "fantasy", proofFiles: ["src/lib/v3-fantasy.contract.test.ts", "src/lib/v3-fantasy.test.ts"] },
  { id: "fan-public-identity", proofFiles: ["src/lib/v3-me-architecture.contract.test.ts", "src/lib/v3-me-summary.test.ts", "src/lib/v3-prediction-league-privacy.contract.test.ts"] },
  { id: "push-delivery", proofFiles: ["src/lib/v3-notifications-cutover.contract.test.ts"] },
  { id: "public-ux-diagnostics", proofFiles: ["src/lib/v3-public-ux-diagnostics.contract.test.ts", "src/lib/v3-beta-feedback-privacy.contract.test.ts"] },
  { id: "app-shell", proofFiles: ["src/lib/v3-app-shell.contract.test.ts", "src/lib/v3-public-navigation.test.ts", "src/lib/v3-shell-route-boundary.test.ts"] },
  { id: "explore-root", proofFiles: ["src/lib/v3-explore-cutover.contract.test.ts", "src/lib/v3-explore-archive-results.contract.test.ts"] },
  { id: "edition-hub", proofFiles: ["src/lib/v3-edition-cutover.contract.test.ts", "src/lib/v3-edition-outcome-hierarchy.contract.test.ts"] },
  { id: "delegation-detail", proofFiles: ["src/lib/v3-delegation-cutover.contract.test.ts", "src/lib/v3-delegation-history-links.contract.test.ts"] },
  { id: "authentication", proofFiles: ["src/lib/v3-auth-return-intent.test.ts"] },
] as const;

const capability = (id: string) => {
  const value = V3_PUBLIC_CAPABILITY_REGISTRY.find((item) => item.id === id);
  if (!value) throw new Error(`Missing Public capability ${id}`);
  return value;
};

const migrationEvidenceOf = (id: string) => {
  const value = capability(id);
  expect("migrationEvidence" in value, `${id}:migrationEvidence`).toBe(true);
  if (!("migrationEvidence" in value)) throw new Error(`${id} has no migrationEvidence`);
  return value.migrationEvidence;
};

describe("Public V3 main-registry evidence-only cutovers", () => {
  it("keeps every claimed capability accepted only while its executable proof remains attached", () => {
    for (const claim of EVIDENCE_ONLY_MAIN_REGISTRY_CUTOVERS) {
      const item = capability(claim.id);
      expect(item.specificationStatus, claim.id).toBe("cutover");
      const evidence = migrationEvidenceOf(claim.id);
      expect(evidence, `${claim.id}:meta-proof`).toContain(META_PROOF);

      for (const proofFile of claim.proofFiles) {
        expect(evidence, `${claim.id}:${proofFile}`).toContain(proofFile);
        const proof = read(proofFile);
        expect(proof.length, `${claim.id}:${proofFile}`).toBeGreaterThan(100);
        expect(proof, `${claim.id}:${proofFile}`).toMatch(/\b(?:describe|it|test)\s*\(/);
        expect(proof, `${claim.id}:${proofFile}`).toContain("expect(");
      }
    }
  });

  it("accepts Public Televote submit/receipt/reconciliation without absorbing frozen Results calculation authority", () => {
    const evidence = migrationEvidenceOf("televote");
    const route = read("src/routes/televoting/index.tsx");
    const receiptShell = read("src/components/televoting/TelevotingBoothWithReceipt.tsx");
    const booth = read("src/components/televoting/TelevotingBooth.tsx");
    const functions = read("src/integrations/televoting/vote.functions.ts");
    const reconciliation = read("src/lib/v3-televote-reconciliation.ts");
    const combined = `${route}\n${receiptShell}\n${booth}\n${functions}\n${reconciliation}`;

    expect(evidence).toContain(META_PROOF);
    expect(evidence).toContain("src/integrations/televoting/vote.functions.ts");
    expect(route).toContain("<TelevotingBoothWithReceipt");
    expect(receiptShell).toContain("reconcileMergedTelevotingRecoveryCookie");
    expect(booth).toContain("submitMergedTelevotingVote");
    expect(booth).toContain("reconcileMergedTelevotingVote");
    expect(booth).toContain("recoverTelevoteTransportResponse");
    expect(functions).toContain('createServerFn({ method: "POST" })');
    expect(functions).toContain("submitMergedTelevotingVoteServer");
    expect(functions).toContain("reconcileMergedTelevotingVoteServer");
    expect(reconciliation).toContain("Recover only when the entire server-function response was lost in transit");

    for (const forbidden of [
      "studio2_execute_result_operation",
      "calculate_televote_results_v3",
      "televoting_round_bindings",
      "private.v3_result_versions",
      "service_role",
    ]) {
      expect(combined, `televote:${forbidden}`).not.toContain(forbidden);
    }
  });

  it("keeps push subscription writes owned by the existing settings owner, not the V3 inbox", () => {
    const inboxRoute = read("src/routes/_authenticated/notifications.tsx");
    const settings = read("src/components/mysolaris/MySolarisNotificationsPanel.tsx");
    const pushOwner = read("src/lib/app-notifications.ts");

    expect(inboxRoute).toContain("getAppPushState");
    expect(inboxRoute).not.toContain("enableAppPush");
    expect(inboxRoute).not.toContain("disableAppPush");
    expect(settings).toContain("enableAppPush");
    expect(settings).toContain("disableAppPush");
    expect(settings).toContain("getAppPushState");
    expect(pushOwner).toContain("enableAppPush");
    expect(pushOwner).toContain("disableAppPush");
    expect(pushOwner).toContain("push_subscriptions");
  });

  it("keeps remaining implementation or ownership gaps unresolved instead of laundering them through evidence", () => {
    // delegation-history is intentionally absent here: Worker 4 supplied a
    // concrete caller-bound V3 cutover after this evidence branch was created.
    for (const id of [
      "participant-activity",
      "results",
    ]) {
      expect(capability(id).specificationStatus, id).not.toBe("cutover");
    }

    const resultsSource = read("src/integrations/v3/results-source.server.ts");
    const snapshotMigration = read("supabase/migrations/20261024170500_v3_public_published_result_snapshot.sql");
    expect(resultsSource).toContain('.from("results")');
    expect(snapshotMigration).toContain("v3_public_published_result_snapshot");
    expect(snapshotMigration).toContain("private.v3_result_versions");
  });
});
