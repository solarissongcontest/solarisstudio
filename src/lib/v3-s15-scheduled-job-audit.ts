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
  let escapeString = false;
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
      if (escapeString && char === "\\" && next !== undefined) {
        result += next;
        i += 1;
        continue;
      }
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
      escapeString = char === "'" && /(?:^|[^\w$])[eE]$/.test(source.slice(0, i));
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

/**
 * A dollar-quoted value is SQL *data* unless it is the body of an anonymous
 * DO statement. Function definitions are also not executed by their creation.
 *
 * Keep source offsets/newlines stable for diagnostic line numbers. Ordinary
 * single/double SQL quoted values have already been blanked by
 * outsideSqlStrings(), so only actual dollar delimiters remain here.
 */
function withoutInertDollarQuotes(code: string): string {
  const result = code.split("");
  const tokens = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/g;
  let doEnd: string | null = null;
  let maskedUntil = 0;

  for (const token of code.matchAll(tokens)) {
    const start = token.index ?? 0;
    if (start < maskedUntil) continue;
    const delimiter = token[0];

    if (doEnd === delimiter) {
      doEnd = null;
      continue;
    }

    // Only an anonymous DO body executes its statements immediately when a
    // migration is applied. A CREATE FUNCTION ... AS $tag$ body does not.
    if (
      doEnd === null &&
      /(?:^|;)\s*do(?:\s+language\s+[A-Za-z_][A-Za-z0-9_]*)?\s*$/i.test(code.slice(0, start))
    ) {
      doEnd = delimiter;
      continue;
    }

    const closingAt = code.indexOf(delimiter, start + delimiter.length);
    const end = closingAt < 0 ? code.length : closingAt + delimiter.length;
    for (let i = start; i < end; i += 1) {
      if (result[i] !== "\n") result[i] = " ";
    }
    maskedUntil = end;
  }

  return result.join("");
}

/**
 * Locate calls only in SQL code, not in a SQL string containing an example.
 * Anonymous DO bodies remain executable code, but quoted SQL data and
 * CREATE FUNCTION bodies do not register jobs at migration time.
 */
function outsideSqlStrings(source: string): string {
  let result = "";
  let quote: "'" | '"' | null = null;
  let escapeString = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      result += char === "\n" ? "\n" : " ";
      if (escapeString && char === "\\" && source[i + 1] !== undefined) {
        result += source[i + 1] === "\n" ? "\n" : " ";
        i += 1;
        continue;
      }
      if (char === quote) {
        if (source[i + 1] === quote) {
          result += " ";
          i += 1;
        } else {
          quote = null;
        }
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      escapeString = char === "'" && /(?:^|[^\w$])[eE]$/.test(source.slice(0, i));
      result += " ";
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
    // Preserve offsets while normalizing PostgreSQL's quoted function identifiers.
    const code = withoutInertDollarQuotes(outsideSqlStrings(source.replace(/"cron"/g, " cron ").replace(/"schedule"/g, " schedule ")));
    for (const call of code.matchAll(/\bcron\s*\.\s*schedule\s*\(/gi)) {
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
