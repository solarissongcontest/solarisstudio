import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/routes/_authenticated/admin/integrity-preclearance.tsx", "utf8");

describe("Preclearance case isolation", () => {
  it("keys the stateful ruling editor to the exact case identity", () => {
    expect(source).toContain("<RulingComposer key={detail.case.id} detail={detail} onChanged={onChanged} />");
  });

  it("does not present a fabricated clean privacy metric", () => {
    expect(source).not.toContain('label="Public leakage" value={0}');
  });

  it("does not retain a removed, unauthorized, or out-of-date selected question", () => {
    expect(source).toContain("casesQuery.isSuccess ? casesQuery.data : []");
    expect(source).toContain('item.case_kind === "rule_question"');
    expect(source).toContain("questions.find((item) => item.id === selectedCase)?.id");
    expect(source).toContain('disabled={!casesQuery.isSuccess}');
    expect(source).toContain('detailQuery.data?.case.id === caseId');
    expect(source).toContain('detailQuery.data.case.case_kind === "rule_question"');
  });

  it("fails closed on unreadable case and ruling history instead of treating errors as empty", () => {
    expect(source).toContain('casesQuery.isError ? (');
    expect(source).toContain('detailQuery.isError ? (');
    expect(source).toContain('rulingsQuery.isError ? (');
    expect(source).toContain("Ruling history could not be verified");
    expect(source).toContain("The private rule-question queue could not be verified");
    expect(source).toContain('value={casesQuery.isSuccess ? questions.length : null}');
    expect(source).toContain('caseId && rulingsQuery.isSuccess ? rulingsQuery.data.length : null');
    expect(source).toContain('value === null ? "Not verified"');
  });
});
