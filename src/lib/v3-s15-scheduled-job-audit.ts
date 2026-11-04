/**
 * S15 scheduled-job ownership must be grounded in actual cron.schedule calls,
 * not unrelated SQL strings or comments mentioning a registered job.
 *
 * This audits source history, not the live pg_cron catalog: hosted state and
 * migration adoption are independently checked during production readiness.
 */
export type V3CronMigration = { path: string; sql: string };
export type V3CronRegistration = { name: string; evidence: string };
export type V3CronOwnershipAudit = {
  scheduledJobNames: string[];
  findings: string[];
};

function withoutSqlComments(source: string): string {
  let result = "";
  let quote: "'" | '"' | null = null;
  let lineComment = false;
  let blockDepth = 0;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
        result += char;
      } else {
        result += " ";
      }
      continue;
    }
    if (blockDepth > 0) {
      if (char === "/" && next === "*") {
        blockDepth += 1;
        result += "  ";
        i += 1;
      } else if (char === "*" && next === "/") {
        blockDepth -= 1;
        result += "  ";
        i += 1;
      } else {
        result += char === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (quote) {
      result += char;
      if (char === quote) {
        if (next === quote) {
          result += next;
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      result += char;
    } else if (char === "-" && next === "-") {
      lineComment = true;
      result += "  ";
      i += 1;
    } else if (char === "/" && next === "*") {
      blockDepth = 1;
      result += "  ";
      i += 1;
    } else {
      result += char;
    }
  }
  return result;
}

export function inspectV3CronMigrations(
  migrations: readonly V3CronMigration[],
  registrations: readonly V3CronRegistration[],
): V3CronOwnershipAudit {
  const findings: string[] = [];
  const declarationHistory = new Map<string, string[]>();

  for (const migration of [...migrations].sort((a, b) => a.path.localeCompare(b.path))) {
    const source = withoutSqlComments(migration.sql);
    for (const call of source.matchAll(/\bcron\s*\.\s*schedule\s*\(/gi)) {
      const afterCall = source.slice((call.index ?? 0) + call[0].length);
      // Only an explicit literal first argument gives a verifiable job identity.
      // A dynamic name cannot be silently omitted from the S15 inventory.
      const literal = /^\s*'((?:''|[^'])*)'\s*,/.exec(afterCall);
      if (!literal || !literal[1].trim()) {
        const line = source.slice(0, call.index).split("\n").length;
        findings.push("unverifiable cron.schedule name: " + migration.path + ":" + line);
        continue;
      }
      const name = literal[1].replace(/''/g, "'");
      const history = declarationHistory.get(name) ?? [];
      history.push(migration.path);
      declarationHistory.set(name, history);
    }
  }

  for (const job of registrations) {
    const history = declarationHistory.get(job.name) ?? [];
    if (!history.includes(job.evidence)) {
      findings.push("scheduled job evidence has no matching cron.schedule call: " + job.name + " -> " + job.evidence);
    } else if (history[history.length - 1] !== job.evidence) {
      findings.push("scheduled job evidence is not the latest schedule: " + job.name + " -> " + job.evidence);
    }
  }

  return {
    scheduledJobNames: [...declarationHistory.keys()].sort(),
    findings,
  };
}
