import { V3_S14_FAILURE_INJECTIONS, V3_S14_INVARIANTS, V3_S14_STAGES } from "../v3-s14-full-contest-spec";

export function assertS14Certification(value: unknown, candidateSha: string) {
  const e = value as {
    candidateSha?: string; passed?: boolean; partial?: boolean; runtimeFailure?: boolean;
    completedStages?: string[]; pendingStages?: string[]; completedContestExtensions?: string[];
    pendingContestExtensions?: string[]; blockedContestExtensions?: string[];
    implementedInvariants?: string[]; implementedFailureInjections?: string[];
    lifecycle?: { finalState?: string }; runIdentity?: { candidateSha?: string; editionId?: string; databaseFingerprint?: string };
    seed?: { editionCount?: number; delegationCount?: number; showCount?: number };
  };
  if (!e || e.candidateSha !== candidateSha || e.runIdentity?.candidateSha !== candidateSha
    || e.passed !== true || e.partial !== false || e.runtimeFailure !== false
    || e.lifecycle?.finalState !== "archived" || !e.runIdentity.editionId || !e.runIdentity.databaseFingerprint
    || e.seed?.editionCount !== 1 || e.seed.delegationCount !== 66 || (e.seed.showCount ?? 0) < 3) {
    throw new Error("S15 release evidence requires successful complete exact-SHA S14 certification");
  }
  const same = (actual: unknown, expected: string[]) => JSON.stringify(actual) === JSON.stringify(expected);
  const extensions = ["grand-final-qualifier-bridge", "grand-final-voting", "grand-final-results", "grand-final-publication"];
  if (!same(e.completedStages, V3_S14_STAGES.map((stage) => stage.id))
    || !same(e.completedContestExtensions, extensions)
    || !same(e.pendingStages, []) || !same(e.pendingContestExtensions, []) || !same(e.blockedContestExtensions, [])
    || V3_S14_INVARIANTS.some((check) => !e.implementedInvariants?.includes(check.id))
    || V3_S14_FAILURE_INJECTIONS.some((check) => !e.implementedFailureInjections?.includes(check.id))) {
    throw new Error("S15 release evidence requires all S14 stages, extensions, invariants and failure injections");
  }
}
