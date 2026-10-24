import {
  getMergedTelevoteConversionServer,
  loadMergedConversionRound,
  runMergedOfficialCalculationServer,
} from "@/integrations/televoting/conversion.server";

export type MergedTelevoteConversionState = Awaited<
  ReturnType<typeof getMergedTelevoteConversionServer>
>;

export type OfficialCalculationReadbackResult = {
  version: number;
  distributedTotal: number;
  totalPoints: number;
  state: MergedTelevoteConversionState;
  reconciledAfterUncertainOutcome: boolean;
};

function assertCommittedCalculationState(
  state: MergedTelevoteConversionState,
  expectedVersion: number,
) {
  if (state.round.calculation_version !== expectedVersion) {
    throw new Error(
      `Calculation readback returned version ${state.round.calculation_version}; expected ${expectedVersion}`,
    );
  }
  if (state.round.results_status !== "calculated") {
    throw new Error(
      `Calculation readback returned status ${state.round.results_status}; expected calculated`,
    );
  }
  if (state.round.results_outdated) {
    throw new Error("Calculation readback is still marked outdated");
  }
  if (state.stored.length !== state.participants.length) {
    throw new Error(
      `Calculation readback returned ${state.stored.length} result rows for ${state.participants.length} participants`,
    );
  }

  const participants = new Set(state.participants);
  const resultCodes = new Set(
    state.stored.map((row) => String(row.country_code)),
  );
  if (
    resultCodes.size !== participants.size ||
    state.participants.some((participant) => !resultCodes.has(participant))
  ) {
    throw new Error("Calculation readback result rows do not match the round lineup");
  }
  if (
    state.stored.some(
      (row) => Number(row.calculation_version) !== expectedVersion,
    )
  ) {
    throw new Error("Calculation readback contains rows from another version");
  }
}

function resultSummaryFromState(
  state: MergedTelevoteConversionState,
  version: number,
) {
  return {
    version,
    distributedTotal: state.stored.reduce(
      (total, row) => total + Number(row.final_points ?? 0),
      0,
    ),
    totalPoints: Number(state.round.total_points_to_distribute),
  };
}

/**
 * A successful official calculation is not complete from the app's point of view
 * until the same authenticated Organizer boundary can read the committed round
 * lifecycle and its stored result rows back. Returning that canonical snapshot
 * prevents the browser from being stranded on the pre-calculation query state.
 *
 * The one known post-commit exception in the legacy calculation helper is its
 * scalar RPC return-shape assertion. If that assertion fires, reconcile the
 * authoritative state before declaring the operation failed. Other errors are
 * left fail-closed because they can represent a transaction that never committed.
 */
export async function runMergedOfficialCalculationWithReadbackServer(
  roundId: string,
): Promise<OfficialCalculationReadbackResult> {
  const before = await loadMergedConversionRound(roundId);
  const expectedVersion = before.calculation_version + 1;

  try {
    const calculation = await runMergedOfficialCalculationServer(roundId);
    const state = await getMergedTelevoteConversionServer(roundId);
    assertCommittedCalculationState(state, expectedVersion);
    return {
      version: calculation.version,
      distributedTotal: calculation.distributedTotal,
      totalPoints: calculation.totalPoints,
      state,
      reconciledAfterUncertainOutcome: false,
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (!message.startsWith("Calculation commit returned unexpected version")) {
      throw caught;
    }

    const state = await getMergedTelevoteConversionServer(roundId);
    assertCommittedCalculationState(state, expectedVersion);
    return {
      ...resultSummaryFromState(state, expectedVersion),
      state,
      reconciledAfterUncertainOutcome: true,
    };
  }
}
