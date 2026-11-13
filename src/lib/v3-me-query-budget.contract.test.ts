import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const context = source("src/components/mysolaris/MySolarisContext.tsx");
const meRoute = source("src/routes/_authenticated/my-solaris/index.tsx");
const operations = source("src/components/MySolarisOperationsPanel.tsx");
const meRoot = source("src/components/v3/V3MeRoot.tsx");

describe("V3 Me identity-only query budget", () => {
  it("selects identity-only context for the canonical explicit-edition Me root", () => {
    expect(meRoute).toContain("<MySolarisProvider editionId={rollout.data.editionId}>");
    expect(context).toContain("includeParticipationContext = editionId === undefined");
  });

  it("retains actor/edition/delegation scoped current membership reads", () => {
    expect(context).toContain('queryKey: ["mysolaris-current-entry", userId, currentEdition?.id ?? "none", countryId ?? "none"]');
    expect(context).toContain("enabled: Boolean(userQuery.data && countryId && currentEdition?.id)");
  });

  it("does not issue secondary task, notice, capability, confirmation or jury requests in identity-only mode", () => {
    expect(context).toContain("enabled: Boolean(includeParticipationContext && userQuery.data)");
    expect(context).toContain("includeParticipationContext && userQuery.data && capabilities.official_communications");
    expect(context).toContain("enabled: Boolean(includeParticipationContext && userQuery.data && account?.country)");
    expect(context).toContain("includeParticipationContext &&\n        userQuery.data &&\n        account?.country");
  });

  it("isolates legacy private notice summaries when delegation ownership changes", () => {
    expect(context).toContain(
      'queryKey: ["mysolaris-notice-summary", userId, countryId, currentEdition?.id, "recipient-inbox"]',
    );
  });

  it("does not display stale cached tasks as a new identity-only projection or write fake badge zeroes", () => {
    expect(context).toContain("const capabilities = includeParticipationContext");
    expect(context).toContain("const noticeSummary = includeParticipationContext && noticesQuery.data");
    expect(context).toContain("includeParticipationContext\n        ? buildParticipationTasks");
    expect(context).toContain("if (!includeParticipationContext) return;");
  });

  it("does not turn failed participant reads into empty tasks or zero notification badges", () => {
    expect(context).toContain("const hasParticipationReadError = Boolean(");
    expect(context).toContain("const hasContextError = Boolean(");
    expect(context).toContain("if (hasParticipationReadError) return;");
    expect(context).toContain("userQuery.isLoading || userQuery.isError || userQuery.isRefetchError");
    expect(context).not.toContain("Promise.allSettled");
    expect(context).toContain("const results = await Promise.all(");
    expect(context).toContain("noticesQuery.isLoading || roundsQuery.isLoading");
    expect(operations).toContain("if (hasParticipationReadError)");
    expect(operations).toContain("Current responsibilities unavailable");
    expect(operations).toContain("This is a temporary read failure");
  });

  it("distinguishes unavailable Me identity and current membership from an empty account", () => {
    expect(meRoot).toContain("if (workspace.hasContextError)");
    expect(meRoot).toContain('data-v3-me-account-unavailable=""');
    expect(meRoot).toContain("Retry account check");
  });

  it("counts archived outstanding required notices in tasks and badge attention from receipt truth", () => {
    const nav = source("src/components/mysolaris/MySolarisWorkspaceNav.tsx");
    expect(context).toContain("item.notice.acknowledgementRequired && !item.receipt?.acknowledgedAt");
    expect(context).toContain("const attentionIds = new Set([");
    expect(context).toContain("noticeAttentionCount: attentionIds.size");
    expect(context).toContain("acknowledgementTasks: outstandingAcknowledgements.length");
    expect(context).toContain("unreadNoticeCount: unread.length");
    expect(context).toContain("me: noticeAttentionCount");
    expect(context).toContain("osBadge: noticeAttentionCount");
    expect(nav).toContain("workspace.noticeAttentionCount");
  });

  it("does not poll current membership unnecessarily from the V3 Me root", () => {
    expect(context).toContain("refetchInterval: includeParticipationContext ? 30_000 : false");
    expect(context).toContain("refetchOnWindowFocus: includeParticipationContext");
  });
});
