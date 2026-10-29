import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  actionForAppliedRulesPath,
  resolveAppliedRulesContext,
} from "./v3-rules-applied-context";

const routeSource = () =>
  readFileSync(resolve(process.cwd(), "src/routes/rules/applied.tsx"), "utf8");

describe("V3 applied Rules context", () => {
  it("maps only known coarse workflow paths to governance actions", () => {
    expect(actionForAppliedRulesPath("/confirmations")).toBe("confirmation.submit");
    expect(actionForAppliedRulesPath("/jury-voting")).toBe("jury.vote");
    expect(actionForAppliedRulesPath("/televoting")).toBe("televote.vote");
    expect(actionForAppliedRulesPath("/my-solaris/entry")).toBe("entry.submit");
    expect(actionForAppliedRulesPath("/integrity/report")).toBe("integrity.report");
    expect(actionForAppliedRulesPath("/admin/design")).toBe("hosting.accept");
    expect(actionForAppliedRulesPath("/results")).toBeNull();
  });

  it("lets explicit nominated context win even when it has no rule-aware mapping", () => {
    expect(
      resolveAppliedRulesContext({
        explicitContextPath: "",
        storedAction: "jury.vote",
        storedContextPath: "/jury-voting",
      }),
    ).toEqual({ context: null, source: "explicit" });
  });

  it("uses session action/path fallback only when the URL did not nominate context", () => {
    expect(
      resolveAppliedRulesContext({ storedAction: "jury.vote" }),
    ).toEqual({ context: "jury.vote", source: "session-action" });

    expect(
      resolveAppliedRulesContext({
        storedAction: "not-a-real-action",
        storedContextPath: "/confirmations",
      }),
    ).toEqual({ context: "confirmation.submit", source: "session-path" });
  });

  it("preserves absent, explicit-invalid and valid search context as distinct states", () => {
    const source = routeSource();

    expect(source).toContain("context?: string | null");
    expect(source).toContain('Object.prototype.hasOwnProperty.call(search, "context")');
    expect(source).toContain("(sanitizeRuleContextPath(search.context) ?? null)");
    expect(source).toContain("const contextRequested = contextPath !== undefined");
    expect(source).toContain('explicitContextPath: contextPath ?? ""');
  });

  it("renders an honest resolving state before sessionStorage authority is read", () => {
    const source = routeSource();

    expect(source).toContain('contextRequested ? `explicit:${contextPath ?? "invalid"}` : "session-context"');
    expect(source).toContain("const resolving = !contextRequested && !sessionResolution.ready");
    expect(source).toContain("Resolving the rule guidance for this session");
    expect(source).toContain("No rule-aware workflow matches this context.");
  });

  it("keeps task context session-scoped and read-only on this surface", () => {
    const source = routeSource();

    expect(source).toContain("window.sessionStorage.getItem(GOVERNANCE_ACTION_STORAGE_KEY)");
    expect(source).toContain("window.sessionStorage.getItem(RULE_CONTEXT_STORAGE_KEY)");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage.setItem");
    expect(source).not.toContain("sessionStorage.removeItem");
  });
});
