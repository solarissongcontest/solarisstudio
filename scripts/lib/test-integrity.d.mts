export type TestIntegrityException =
  | {
      valid: true;
      category: string;
      reason: string;
    }
  | {
      valid: false;
      reason: string;
    }
  | null;

export type TestIntegrityFinding = {
  filePath: string;
  flagged: boolean;
  allowed: boolean;
  exception: TestIntegrityException;
  productionReads: string[];
  rawAssertionCount: number;
  signals: {
    uiProse: number;
    cssImplementation: number;
    assetFilename: number;
    historicalDate: number;
    shellOutput: number;
  };
  reasons: string[];
};

export function extractProductionReadTargets(source: string): string[];
export function analyzeTestIntegrity(
  filePath: string,
  source: string,
): TestIntegrityFinding;
export const TEST_INTEGRITY_EXCEPTION_HELP: string;
