export type Beta3FirstClickRunCount = {
  task: string;
  started: number;
};

export type Beta3FirstClickTargetCount = {
  task: string;
  target: string;
  count: number;
};

export type Beta3FirstClickEvidence = {
  since: string;
  runs: Beta3FirstClickRunCount[];
  firstClicks: Beta3FirstClickTargetCount[];
};

export type Beta3FirstClickTaskEvaluation = {
  task: string;
  started: number;
  observed: number;
  successful: number;
  successRate: number | null;
  coveragePercent: number | null;
};

export type Beta3FirstClickEvaluation = {
  started: number;
  observed: number;
  successful: number;
  successRate: number | null;
  coveragePercent: number | null;
  tasks: Beta3FirstClickTaskEvaluation[];
};

export function evaluateBeta3FirstClickEvidence(
  evidence: Beta3FirstClickEvidence,
  expectations: Record<string, readonly string[]>,
): Beta3FirstClickEvaluation {
  const runs = new Map(
    evidence.runs
      .filter((row) => expectations[row.task])
      .map((row) => [row.task, Math.max(0, Math.round(row.started))] as const),
  );

  const taskKeys = [...new Set([...Object.keys(expectations), ...runs.keys()])];
  const tasks = taskKeys.map((task) => {
    const started = runs.get(task) ?? 0;
    const clicks = evidence.firstClicks.filter((row) => row.task === task);
    const observed = clicks.reduce((sum, row) => sum + safeCount(row.count), 0);
    const successful = clicks.reduce(
      (sum, row) =>
        sum +
        (matchesExpectedTarget(row.target, expectations[task] ?? [])
          ? safeCount(row.count)
          : 0),
      0,
    );

    return {
      task,
      started,
      observed,
      successful,
      successRate: started ? (successful / started) * 100 : null,
      coveragePercent: started ? (Math.min(observed, started) / started) * 100 : null,
    };
  });

  const started = tasks.reduce((sum, row) => sum + row.started, 0);
  const observed = tasks.reduce((sum, row) => sum + Math.min(row.observed, row.started), 0);
  const successful = tasks.reduce(
    (sum, row) => sum + Math.min(row.successful, row.started),
    0,
  );

  return {
    started,
    observed,
    successful,
    successRate: started ? (successful / started) * 100 : null,
    coveragePercent: started ? (observed / started) * 100 : null,
    tasks,
  };
}

export function matchesExpectedTarget(target: string, prefixes: readonly string[]) {
  return prefixes.some(
    (prefix) => target === prefix || target.startsWith(prefix.endsWith("/") ? prefix : prefix + "/"),
  );
}

function safeCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}
