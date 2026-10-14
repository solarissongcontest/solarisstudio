import { describe, expect, it } from "vitest";
import { canReuseTelevoteAttempt, type TelevoteAttemptSnapshot } from "./v3-televote-reconciliation";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const original: TelevoteAttemptSnapshot = { roundId: "round", preflightToken: "original-token", username: "Voter", countryCode: "HOME", entries: [{ target_country_code: "A", points: 5 }, { target_country_code: "B", points: 3 }] };
describe("mounted Televote retry continuity", () => {
  it("retains an unchanged attempt across entry ordering and identity normalization", () => {
    expect(canReuseTelevoteAttempt(original, { ...original, username: " voter ", countryCode: "home", entries: [...original.entries].reverse() })).toBe(true);
  });
  it("does not reuse a token for a different ballot or identity", () => {
    for (const next of [{ ...original, roundId: "other" }, { ...original, username: "Other" }, { ...original, countryCode: "OTHER" }, { ...original, preflightToken: "new" }, { ...original, entries: [{ target_country_code: "A", points: 3 }, { target_country_code: "B", points: 5 }] }]) {
      expect(canReuseTelevoteAttempt(original, next)).toBe(false);
    }
    expect(canReuseTelevoteAttempt(null, original)).toBe(false);
  });
  it("executes the production button handler without starting a new preflight on retry", () => {
    const text = readFileSync("src/components/televoting/TelevotingBooth.tsx", "utf8");
    const source = ts.createSourceFile("booth.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let handler: ts.FunctionDeclaration | undefined;
    function visit(node: ts.Node) { if (ts.isFunctionDeclaration(node) && node.name?.text === "reviewOrRetryBallot") handler = node; ts.forEachChild(node, visit); }
    visit(source);
    if (!handler) throw new Error("Production retry handler missing");
    const code = ts.transpileModule(handler.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    for (const attemptedBallot of [original, null]) {
      let writes = 0, preflights = 0;
      runInNewContext(code + "\nreviewOrRetryBallot();", { attemptedBallot, integrityReport: { token: "original-token" }, pendingIdentity: {}, roundId: "round", username: "Voter", home: "HOME", currentBallot: () => original.entries, canReuseTelevoteAttempt, submitPendingReviewedBallot: () => { writes++; }, preflightMutation: { mutate: () => { preflights++; } } });
      expect(writes).toBe(attemptedBallot ? 1 : 0);
      expect(preflights).toBe(attemptedBallot ? 0 : 1);
    }
  });
});
