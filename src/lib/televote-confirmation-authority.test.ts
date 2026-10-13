import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

function errorHandler() {
  const source = ts.createSourceFile("booth.tsx", readFileSync("src/components/televoting/TelevotingBooth.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "submitMutation" && node.initializer && ts.isCallExpression(node.initializer)) {
      const options = node.initializer.arguments[0];
      if (ts.isObjectLiteralExpression(options)) {
        const property = options.properties.find((item) => ts.isPropertyAssignment(item) && item.name.getText(source) === "onError");
        if (property && ts.isPropertyAssignment(property)) handler = property.initializer;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!handler) throw new Error("Submission error handler missing");
  const mark = vi.fn();
  const stage = vi.fn();
  const returnToBallot = vi.fn();
  const toast = { error: vi.fn() };
  const code = ts.transpileModule(`(${handler.getText(source)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const onError = runInNewContext(code, { Error, toast, markTelevotingRoundSubmitted: mark, setStage: stage, returnToBallot, roundId: "round" });
  return { onError, mark, stage, returnToBallot, toast };
}

describe("televote confirmation authority", () => {
  for (const message of ["You already voted from this device", "Vote already recorded", "Network request failed", "Preflight token already used"]) {
    it(`does not confirm a ballot from: ${message}`, () => {
      const runtime = errorHandler();
      runtime.onError(new Error(message));
      expect(runtime.mark).not.toHaveBeenCalled();
      expect(runtime.stage).not.toHaveBeenCalled();
      expect(runtime.toast.error).toHaveBeenCalledWith(message);
    });
  }

  it("still requires a new integrity check when the ballot changed", () => {
    const runtime = errorHandler();
    runtime.onError(new Error("ballot changed"));
    expect(runtime.returnToBallot).toHaveBeenCalledTimes(1);
    expect(runtime.mark).not.toHaveBeenCalled();
  });

  it("requires a server id and never manufactures an acceptance timestamp", () => {
    const code = ts.transpileModule(readFileSync("src/integrations/televoting/anti-abuse.ts", "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
      transformers: { before: [() => (node) => ts.factory.updateSourceFile(node, node.statements.filter((statement) => !ts.isImportDeclaration(statement)))] },
    }).outputText.replace(/\bexport /g, "");
    const exports: Record<string, unknown> = {};
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
    const dispatch = vi.fn();
    runInNewContext(code + "\nexports.markTelevotingRoundSubmitted = markTelevotingRoundSubmitted;", { exports, localStorage: storage, captureGovernanceSnapshot: () => null, dispatchSubmissionReceipt: dispatch, TELEVOTE_SUBMITTED_EVENT: "submitted" });
    const mark = exports.markTelevotingRoundSubmitted as (round: string, receipt: { submissionId: string; acknowledgedAt?: string }) => void;
    expect(() => mark("round", { submissionId: " " })).toThrow("server submission id");
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    mark("round", { submissionId: "server-id" });
    expect(dispatch.mock.calls[0][2]).toMatchObject({ submissionId: "server-id", acknowledgedAt: null });
    mark("round", { submissionId: "server-id", acknowledgedAt: "2026-10-13T12:00:00Z" });
    expect(dispatch.mock.calls[1][2].acknowledgedAt).toBe("2026-10-13T12:00:00Z");
  });
});
