import { describe, expect, it } from "vitest";

import type { AdminBetaCoverageItem } from "@/features/admin-beta-test/sections";
import type { BetaSection } from "@/features/beta-test/types";
import {
  buildAdminQaCoverageMatrix,
  latestQaCoverageSubmissions,
  summarizeAdminQaCoverage,
  type QaCoverageSubmission,
} from "./admin-qa-coverage";

const capabilities: AdminBetaCoverageItem[] = [
  {
    id: "overview",
    label: "Overview & next actions",
    group: "Organizer",
    answerId: "overviewTested",
    href: "/admin/operations",
    critical: true,
  },
  {
    id: "concurrency",
    label: "Two-admin concurrent editing",
    group: "Cross-cutting",
    answerId: "concurrencyTested",
    href: "/admin/operations",
    critical: true,
  },
];

const sections = [
  {
    id: "organizer-navigation",
    title: "Organizer navigation & Overview",
    task: {
      body: "Start at Overview and complete the normal organizer workflow.",
      href: "/admin/operations",
      linkLabel: "Open Overview",
    },
    questions: [{ id: "overviewTested", label: "Overview", type: "single" }],
  },
  {
    id: "cross-cutting",
    title: "Cross-device and concurrency",
    task: {
      body: "Exercise two-admin conflict handling on safe test data.",
      href: "/admin/operations",
      linkLabel: "Open Organizer",
    },
    questions: [{ id: "concurrencyTested", label: "Concurrency", type: "single" }],
  },
] as unknown as BetaSection[];

const submission = (
  overrides: Partial<QaCoverageSubmission> = {},
): QaCoverageSubmission => ({
  tester_name: "Admin A",
  device: "Phone",
  answers: {
    overviewTested: "Tested properly",
    concurrencyTested: "Only tried briefly",
  },
  form_version: 2,
  created_at: "2026-10-18T00:00:00.000Z",
  ...overrides,
});

describe("admin QA coverage matrix", () => {
  it("keeps only the latest submission per tester", () => {
    const rows = latestQaCoverageSubmissions([
      submission({ created_at: "2026-10-17T10:00:00.000Z" }),
      submission({
        created_at: "2026-10-18T10:00:00.000Z",
        answers: { overviewTested: "Didn't test" },
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.answers.overviewTested).toBe("Didn't test");
  });

  it("separates phone and desktop evidence without treating tablets as either", () => {
    const matrix = buildAdminQaCoverageMatrix({
      capabilities,
      sections,
      currentFormVersion: 2,
      submissions: [
        submission(),
        submission({
          tester_name: "Admin B",
          device: "Desktop",
          answers: { overviewTested: "Only tried briefly", concurrencyTested: "Tested properly" },
        }),
        submission({
          tester_name: "Admin C",
          device: "Tablet",
          answers: { overviewTested: "Tested properly", concurrencyTested: "Tested properly" },
        }),
      ],
    });

    expect(matrix[0]?.phone.state).toBe("evidenced");
    expect(matrix[0]?.desktop.state).toBe("partial");
    expect(matrix[0]?.phone.detail).toContain("1 proper");
    expect(matrix[0]?.desktop.detail).toContain("1 brief");
  });

  it("does not invent keyboard, offline/reconnect or exact-SHA evidence", () => {
    const [row] = buildAdminQaCoverageMatrix({
      capabilities: [capabilities[0]!],
      sections,
      currentFormVersion: 2,
      submissions: [submission()],
    });

    expect(row?.keyboard.state).toBe("unknown");
    expect(row?.offlineReconnect.state).toBe("unknown");
    expect(row?.passedSha.state).toBe("unknown");
    expect(row?.passedSha.detail).toContain("not bound to an exact tested commit SHA");
  });

  it("only maps the explicit concurrency scenario into the two-admin column", () => {
    const matrix = buildAdminQaCoverageMatrix({
      capabilities,
      sections,
      currentFormVersion: 2,
      submissions: [submission()],
    });

    expect(matrix.find((row) => row.id === "overview")?.twoAdmin.state).toBe("unknown");
    expect(matrix.find((row) => row.id === "concurrency")?.twoAdmin.state).toBe("partial");
  });

  it("ignores outdated form evidence and reports critical device gaps", () => {
    const matrix = buildAdminQaCoverageMatrix({
      capabilities,
      sections,
      currentFormVersion: 2,
      submissions: [submission({ form_version: 1 })],
    });
    const summary = summarizeAdminQaCoverage(matrix);

    expect(matrix[0]?.phone.state).toBe("unknown");
    expect(summary.criticalRowsWithNoDeviceEvidence).toBe(2);
    expect(summary.unknownCells).toBeGreaterThan(0);
  });

  it("uses the acceptance-test section as scenario evidence", () => {
    const [row] = buildAdminQaCoverageMatrix({
      capabilities: [capabilities[0]!],
      sections,
      currentFormVersion: 2,
      submissions: [submission()],
    });

    expect(row?.scenario).toBe("Organizer navigation & Overview");
    expect(row?.scenarioDetail).toContain("normal organizer workflow");
  });
});
