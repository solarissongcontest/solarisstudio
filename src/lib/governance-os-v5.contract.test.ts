import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  GOVERNANCE_ACTION_KEYS,
  GOVERNANCE_QUICK_ANSWERS,
  governanceImpactForRuleIds,
  governanceRules,
} from "@/lib/governance-v5";
import { getRuleById } from "@/lib/ssc-rules-v4";

const source = (path: string) => readFileSync(path, "utf8");

describe("Governance OS v5 contract", () => {
  it("resolves every contextual governance binding to a real official rule", () => {
    for (const action of GOVERNANCE_ACTION_KEYS) {
      const rules = governanceRules(action);
      expect(rules.length, action).toBeGreaterThan(0);
      for (const rule of rules) expect(getRuleById(rule.id), action + ":" + rule.id).toBeTruthy();
    }

    for (const answer of GOVERNANCE_QUICK_ANSWERS) {
      for (const ruleId of answer.ruleIds) {
        expect(getRuleById(ruleId), answer.id + ":" + ruleId).toBeTruthy();
      }
    }
  });

  it("puts the exact rule text and a separate full-rule route inside official workflows", () => {
    const governanceUi = source("src/components/rules/GovernanceRules.tsx");
    const confirmation = source("src/components/ConfirmationFormWithReceipt.tsx");
    const entry = source("src/components/ConfirmationForm.tsx");
    const jury = source("src/routes/jury-voting.tsx");
    const televote = source("src/components/televoting/TelevotingBoothWithReceipt.tsx");
    const tasks = source("src/components/mysolaris/modules/MySolarisTasksModule.tsx");

    expect(governanceUi).toContain("contextualSummary");
    expect(governanceUi).toContain("Official rule summary:");
    expect(governanceUi).toContain('to="/rules/$ruleId"');
    expect(governanceUi).toContain("rememberRuleReturnContext");

    expect(confirmation).toContain('context="confirmation.submit"');
    expect(entry).toContain('context="entry.submit"');
    expect(jury).toContain('context="jury.vote"');
    expect(televote).toContain('context="televote.vote"');
    expect(tasks).toContain("TaskGovernanceLinks");
  });

  it("captures the rulebook version and rule IDs on participant receipt surfaces", () => {
    const governance = source("src/lib/governance-v5.ts");
    const receipts = source("src/lib/submission-receipts.ts");
    const confirmation = source("src/components/ConfirmationFormWithReceipt.tsx");
    const jury = source("src/routes/jury-voting.tsx");
    const televote = source("src/components/televoting/TelevotingBooth.tsx");

    expect(governance).toContain("captureGovernanceSnapshot");
    expect(governance).toContain("rulebookVersion: SSC_RULEBOOK.version");
    expect(receipts).toContain("governance?: GovernanceReceiptSnapshot");
    expect(confirmation).toContain("snapshot={receipt.governance}");
    expect(jury).toContain('captureGovernanceSnapshot("jury.vote")');
    expect(televote).toContain("governance,");
  });

  it("returns from a rule to the exact task state with scroll and focus restoration", () => {
    const returnContext = source("src/lib/rule-return-context.ts");
    const bridge = source("src/components/rules/RulesGovernanceContext.tsx");
    const jury = source("src/routes/jury-voting.tsx");
    const televote = source("src/components/televoting/TelevotingBooth.tsx");

    expect(returnContext).toContain("scrollY");
    expect(returnContext).toContain("focusId");
    expect(returnContext).toContain("sessionStorage");
    expect(bridge).toContain("window.scrollTo");
    expect(bridge).toContain("target.focus");
    expect(jury).toContain("solaris:jury-ballot-draft");
    expect(televote).toContain("solaris:televote-task-draft");
  });

  it("replaces the giant Rules experience with intent-first routes and vertical chapter/journey navigation", () => {
    const route = source("src/routes/rules/index.tsx");
    const home = source("src/components/rules/RulesHomeV5.tsx");
    const chapter = source("src/routes/rules/chapters/$chapter.tsx");
    const journey = source("src/routes/rules/participating.tsx");
    const search = source("src/routes/rules/search.tsx");

    expect(route).toContain("<RulesHomeV5");
    expect(route).not.toContain("<RulesExperience");
    expect(home).toContain("Ask about a rule");
    expect(home).toContain('to="/rules/chapters"');
    expect(chapter).not.toContain("overflow-x-auto");
    expect(journey).not.toContain("min-w-[58rem]");
    expect(search).toContain("findGovernanceQuickAnswer");
  });

  it("uses a five-step sensitive Integrity service with review-before-submit and explicit anonymous recovery", () => {
    const flow = source("src/components/integrity/IntegrityReportV5.tsx");
    const shell = source("src/components/integrity/IntegrityReportShell.tsx");
    const model = source("src/lib/integrity-report-v5.ts");
    const home = source("src/components/integrity/IntegrityHomeV5.tsx");

    expect(home).toContain("Needs your attention");
    expect(flow).toContain("Nothing has been submitted yet.");
    expect(flow).toContain("Anonymous privacy check");
    expect(flow).toContain("What happens next");
    expect(flow).toContain("recoveryKey");
    expect(flow).toContain("Save on this device");
    expect(model).toContain("sessionStorage");
    expect(model).not.toContain("localStorage");
    expect(shell).toContain("Sensitive content hidden");
    expect(shell).toContain("Exit quickly");
  });

  it("treats Integrity reporting as focused app chrome and avoids duplicate service-state overlays", () => {
    const chrome = source("src/lib/app-route-chrome.ts");
    const archetypes = source("src/lib/public-route-archetypes.ts");
    const banner = source("src/components/app/AppOfflineBanner.tsx");

    expect(chrome).toContain('/^\\/integrity\\/report');
    expect(chrome).toContain('tabBar: "hidden"');
    expect(archetypes).toContain('/^\\/integrity\\/report');
    expect(banner).toContain('pathname.startsWith("/rules") || pathname.startsWith("/integrity")');
    expect(banner).toContain("Never float a global outage pill over Rules or Integrity");
  });

  it("shows rule publication impact before an organizer makes a draft current", () => {
    const manager = source("src/routes/_authenticated/admin/rules-manager.tsx");
    const impact = governanceImpactForRuleIds(["9.2", "11.2"]);

    expect(impact.some((item) => item.action === "jury.vote")).toBe(true);
    expect(manager).toContain("Product impact");
    expect(manager).toContain("governanceImpactForRuleIds");
    expect(manager).toContain("participant-facing guidance");
  });

  it("keeps findings, sanctions and appeals distinct in the participant case cockpit", () => {
    const caseRoute = source("src/routes/integrity/cases/$caseId.tsx");
    expect(caseRoute).toContain('aria-labelledby="case-findings"');
    expect(caseRoute).toContain("Decision & your options");
    expect(caseRoute).toContain("Appeal this decision");
    expect(caseRoute).toContain("A report or investigation is not itself a finding");
  });
});
