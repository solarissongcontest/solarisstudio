import { describe, expect, it } from "vitest";
import { V3_CAPACITY_SCENARIOS } from "./v3-capacity-scenarios";
import { assessV3CapacityRehearsalPlan } from "./v3-capacity-rehearsal-plan";

const SHA = "0123456789abcdef0123456789abcdef01234567";

function completePlan(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    candidateSha: SHA,
    planId: "v3-s12-local-rehearsal-2026-10-24",
    preparedAt: "2026-10-24T18:00:00.000Z",
    environment: "local-isolated",
    approval: {
      status: "approved_for_isolated_rehearsal",
      reference: "review-record:s12-capacity-local-plan",
      approvedAt: "2026-10-24T18:05:00.000Z",
    },
    scenarios: V3_CAPACITY_SCENARIOS.map((scenario, index) => ({
      scenarioId: scenario.id,
      runs: [
        {
          runId: `${scenario.id}-fixture-${index + 1}`,
          targetPath: `/__v3-capacity/${scenario.id}`,
          method: scenario.trafficClass === "read" ? "GET" : "POST",
          // Unit-test fixture values only. Operational values must come from the
          // plan's cited evidence and are never supplied by this module.
          requests: 4,
          concurrency: 2,
          databaseSampleIntervalMs: 250,
          loadShapeSource: "approved-forecast",
          evidenceRef: `review-record:${scenario.id}:load-shape`,
          rationale: `Validation fixture for ${scenario.id}; not an operational capacity recommendation.`,
          fixtureProfile: `fixture-${scenario.id}`,
        },
      ],
    })),
    productionTrafficAllowed: false,
    certificationClaim: false,
    qaReviewRequired: true,
    ...overrides,
  };
}

function scenarios(plan: Record<string, unknown>) {
  return plan.scenarios as Array<Record<string, unknown>>;
}

function firstRun(plan: Record<string, unknown>) {
  return (scenarios(plan)[0].runs as Array<Record<string, unknown>>)[0];
}

describe("System V3 S12 capacity rehearsal plan", () => {
  it("accepts one exact-SHA reviewed local plan covering every canonical scenario", () => {
    const assessment = assessV3CapacityRehearsalPlan(completePlan(), SHA);

    expect(assessment).toEqual({
      schemaVersion: 1,
      status: "ready_for_execution_review",
      expectedCommitSha: SHA,
      planCommitSha: SHA,
      planId: "v3-s12-local-rehearsal-2026-10-24",
      scenarioCount: V3_CAPACITY_SCENARIOS.length,
      runCount: V3_CAPACITY_SCENARIOS.length,
      missingScenarioIds: [],
      exploratoryScenarioIds: [],
      errors: [],
      productionTrafficAllowed: false,
      certificationClaim: false,
      qaReviewRequired: true,
    });
  });

  it("reports a structurally valid but incomplete canonical scenario set", () => {
    const plan = completePlan();
    plan.scenarios = scenarios(plan).slice(0, -1);

    const assessment = assessV3CapacityRehearsalPlan(plan, SHA);

    expect(assessment.status).toBe("scenario_incomplete");
    expect(assessment.missingScenarioIds).toEqual([
      V3_CAPACITY_SCENARIOS.at(-1)?.id,
    ]);
    expect(assessment.errors).toEqual([]);
  });

  it("keeps a complete exploratory plan explicitly non-ready", () => {
    const plan = completePlan();
    firstRun(plan).loadShapeSource = "exploratory";

    const assessment = assessV3CapacityRehearsalPlan(plan, SHA);

    expect(assessment.status).toBe("exploratory_only");
    expect(assessment.exploratoryScenarioIds).toEqual([
      V3_CAPACITY_SCENARIOS[0].id,
    ]);
    expect(assessment.errors).toEqual([]);
  });

  it("rejects stale or mixed candidate identity", () => {
    const assessment = assessV3CapacityRehearsalPlan(
      completePlan({
        candidateSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
      SHA,
    );

    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "capacity rehearsal plan candidateSha does not match expected commit SHA",
    );
  });

  it("rejects unknown and duplicate canonical scenario identity", () => {
    const unknownPlan = completePlan();
    scenarios(unknownPlan)[0].scenarioId = "made-up-scenario";
    const unknown = assessV3CapacityRehearsalPlan(unknownPlan, SHA);
    expect(unknown.status).toBe("invalid");
    expect(unknown.errors).toContain("scenarios[0] has an unknown scenarioId");

    const duplicatePlan = completePlan();
    scenarios(duplicatePlan)[1].scenarioId = V3_CAPACITY_SCENARIOS[0].id;
    const duplicate = assessV3CapacityRehearsalPlan(duplicatePlan, SHA);
    expect(duplicate.status).toBe("invalid");
    expect(duplicate.errors).toContain(
      `duplicate capacity rehearsal scenario ${V3_CAPACITY_SCENARIOS[0].id}`,
    );
  });

  it("rejects duplicate run identity across scenarios", () => {
    const plan = completePlan();
    const first = firstRun(plan).runId;
    (scenarios(plan)[1].runs as Array<Record<string, unknown>>)[0].runId = first;

    const assessment = assessV3CapacityRehearsalPlan(plan, SHA);

    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      `duplicate capacity rehearsal run ${String(first)}`,
    );
  });

  it.each([
    "https://example.invalid/api",
    "//example.invalid/api",
    "/api/../admin",
    "/api/./admin",
    "/api/%2e%2e/admin",
    "/api?token=secret",
    "/api#fragment",
    "/api\\admin",
  ])("rejects unsafe target path %s", (targetPath) => {
    const plan = completePlan();
    firstRun(plan).targetPath = targetPath;

    const assessment = assessV3CapacityRehearsalPlan(plan, SHA);

    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "scenarios[0].runs[0].targetPath must be a relative local route path without query, fragment, traversal or authority",
    );
  });

  it("rejects concurrency that exceeds the cited request count", () => {
    const plan = completePlan();
    firstRun(plan).requests = 2;
    firstRun(plan).concurrency = 3;

    const assessment = assessV3CapacityRehearsalPlan(plan, SHA);

    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "scenarios[0].runs[0].concurrency cannot exceed requests",
    );
  });

  it.each(["headers", "body", "token", "baseUrl"])(
    "rejects unsupported run field %s so plans cannot smuggle runtime authority",
    (field) => {
      const plan = completePlan();
      firstRun(plan)[field] = "must-not-be-stored-here";

      const assessment = assessV3CapacityRehearsalPlan(plan, SHA);

      expect(assessment.status).toBe("invalid");
      expect(assessment.errors).toContain(
        `scenarios[0].runs[0] contains unsupported field ${field}`,
      );
    },
  );

  it("rejects a circular explicit-rehearsal-plan evidence reference", () => {
    const plan = completePlan();
    firstRun(plan).loadShapeSource = "explicit-rehearsal-plan";
    firstRun(plan).evidenceRef = plan.planId;

    const assessment = assessV3CapacityRehearsalPlan(plan, SHA);

    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "scenarios[0].runs[0].evidenceRef cannot circularly reference the plan itself",
    );
  });

  it("requires an explicit reviewed approval that cannot predate plan preparation", () => {
    const unapproved = completePlan();
    unapproved.approval = {
      status: "draft",
      reference: "review-record:pending",
      approvedAt: "2026-10-24T18:05:00.000Z",
    };
    expect(assessV3CapacityRehearsalPlan(unapproved, SHA).errors).toContain(
      "capacity rehearsal plan approval status must be approved_for_isolated_rehearsal",
    );

    const predates = completePlan();
    predates.approval = {
      status: "approved_for_isolated_rehearsal",
      reference: "review-record:s12-capacity-local-plan",
      approvedAt: "2026-10-24T17:59:59.000Z",
    };
    expect(assessV3CapacityRehearsalPlan(predates, SHA).errors).toContain(
      "capacity rehearsal plan approval cannot predate preparedAt",
    );
  });

  it("refuses production traffic, certification, or optional QA review claims", () => {
    const plan = completePlan({
      productionTrafficAllowed: true,
      certificationClaim: true,
      qaReviewRequired: false,
    });

    const assessment = assessV3CapacityRehearsalPlan(plan, SHA);

    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toEqual(
      expect.arrayContaining([
        "capacity rehearsal plan must set productionTrafficAllowed=false",
        "capacity rehearsal plan must set certificationClaim=false",
        "capacity rehearsal plan must set qaReviewRequired=true",
      ]),
    );
  });
});
