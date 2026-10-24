import { afterEach, describe, expect, it } from "vitest";

import {
  clearIntegrityReportV5Draft,
  clearIntegrityReportV5Receipt,
  readIntegrityReportV5Draft,
  readIntegrityReportV5Receipt,
  writeIntegrityReportV5Draft,
  writeIntegrityReportV5Receipt,
} from "@/lib/integrity-report-v5";

describe("IntegrityReportV5 restricted-storage continuity", () => {
  afterEach(() => {
    clearIntegrityReportV5Draft();
    clearIntegrityReportV5Receipt();
  });

  it("keeps a sensitive draft in memory when browser session storage is unavailable", () => {
    expect(typeof window).toBe("undefined");

    writeIntegrityReportV5Draft({
      category: "privacy",
      identityMode: "anonymous",
      summary: "Private report summary",
      details: "Private report details that must survive client-side step navigation.",
    });

    expect(readIntegrityReportV5Draft()).toMatchObject({
      category: "privacy",
      identityMode: "anonymous",
      summary: "Private report summary",
      details: "Private report details that must survive client-side step navigation.",
    });
  });

  it("keeps the authoritative anonymous recovery receipt in memory when storage is unavailable", () => {
    expect(typeof window).toBe("undefined");

    const receipt = {
      kind: "anonymous" as const,
      caseCode: "INT-TEST-001",
      recoveryKey: "one-time-recovery-material",
      operationId: "00000000-0000-4000-8000-000000000001",
      createdAt: "2026-10-24T17:30:00.000Z",
    };

    writeIntegrityReportV5Receipt(receipt);
    expect(readIntegrityReportV5Receipt()).toEqual(receipt);

    clearIntegrityReportV5Receipt();
    expect(readIntegrityReportV5Receipt()).toBeNull();
  });
});
