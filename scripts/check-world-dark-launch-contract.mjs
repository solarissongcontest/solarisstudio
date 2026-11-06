#!/usr/bin/env node
/**
 * TG19 source-only dark-launch guard for Terra Solaris World.
 *
 * This intentionally has no HTTP, database client, Supabase credentials or
 * subprocesses. It is NOT proof of deployed feature-flag state or database RLS.
 * The checker fails closed when the canonical default-off migration is absent.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const WORLD_FLAG = "terra_world_public";
export const WORLD_FLAG_MIGRATION = "20261104121000_v3_tg3_world_public_rollout_flag.sql";
const WORLD_FLAG_VERSION = WORLD_FLAG_MIGRATION.slice(0, 14);
const FLAG_TABLE = String.raw`(?:(?:"?public"?)\s*\.\s*)?"?studio2_feature_flags"?`;
const TABLE_WRITE = new RegExp(
  String.raw`\b(insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+${FLAG_TABLE}(?![\w])`,
  "gi",
);
const SQL_FILE = /^\d{14}_.+\.sql$/;

/** Strip SQL comments while preserving string and dollar-quoted contents. */
export function stripSqlComments(source) {
  let out = "";
  let mode = "normal";
  let depth = 0;
  for (let i = 0; i < source.length;) {
    const char = source[i];
    const next = source[i + 1];
    if (mode === "line") {
      if (char === "\n") { out += "\n"; mode = "normal"; }
      else out += " ";
      i++;
    } else if (mode === "block") {
      if (char === "/" && next === "*") { depth++; out += "  "; i += 2; }
      else if (char === "*" && next === "/") { depth--; out += "  "; i += 2; if (!depth) mode = "normal"; }
      else { out += char === "\n" ? "\n" : " "; i++; }
    } else if (mode === "single" || mode === "double") {
      const quote = mode === "single" ? "'" : '"';
      out += char;
      i++;
      if (char === quote) {
        if (source[i] === quote) { out += source[i]; i++; }
        else mode = "normal";
      }
    } else if (char === "-" && next === "-") {
      out += "  "; i += 2; mode = "line";
    } else if (char === "/" && next === "*") {
      out += "  "; i += 2; depth = 1; mode = "block";
    } else if (char === "'") { out += char; i++; mode = "single"; }
    else if (char === '"') { out += char; i++; mode = "double"; }
    else { out += char; i++; }
  }
  return out;
}

/** Locate the SQL semicolon after a DML action, ignoring quoted semicolons. */
function statementFrom(source, start) {
  let quote = null;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === quote) {
        if (source[i + 1] === quote) i++;
        else quote = null;
      }
    } else if (c === "'" || c === '"') quote = c;
    else if (c === ";") return source.slice(start, i + 1);
  }
  return source.slice(start);
}

/** Split a SQL VALUES list without splitting quoted commas or nested calls. */
function valuesList(value) {
  const fields = [];
  let quote = null;
  let level = 0;
  let last = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) {
      if (c === quote) {
        if (value[i + 1] === quote) i++;
        else quote = null;
      }
    } else if (c === "'" || c === '"') quote = c;
    else if (c === "(") level++;
    else if (c === ")") level--;
    else if (c === "," && level === 0) { fields.push(value.slice(last, i).trim()); last = i + 1; }
  }
  fields.push(value.slice(last).trim());
  return fields;
}

/** Only a literal default-off, do-nothing-on-conflict INSERT is permitted. */
function safeDeclaration(statement) {
  const match = /^insert\s+into\s+(?:"?public"?\s*\.\s*)?"?studio2_feature_flags"?\s*\(([^)]+)\)\s*values\s*\(([^;]+)\)\s*on\s+conflict\s*\(\s*key\s*\)\s*do\s+nothing\s*;?\s*$/i.exec(statement.trim());
  if (!match) return false;
  const columns = valuesList(match[1]).map(s => s.replaceAll('"', "").trim().toLowerCase());
  const values = valuesList(match[2]);
  if (columns.length !== values.length) return false;
  const key = values[columns.indexOf("key")];
  const enabled = values[columns.indexOf("enabled")];
  return /^'terra_world_public'$/i.test(key ?? "") && /^false(?:\s*::\s*boolean)?$/i.test(enabled ?? "");
}

/**
 * Returns deterministic source-evidence findings, never queries an environment.
 * The exact initial migration is required even when a separate later file
 * references the World flag. Broad activation after that migration is denied.
 */
export function auditWorldDarkLaunchMigrations(files) {
  const findings = [];
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const canonical = sorted.filter(file => file.name === WORLD_FLAG_MIGRATION);
  if (canonical.length !== 1) findings.push({
    code: "WORLD_FLAG_CANONICAL_MIGRATION_MISSING_OR_DUPLICATED",
    file: WORLD_FLAG_MIGRATION,
    detail: `Expected exactly one canonical registration, found ${canonical.length}`,
  });
  let registrationCount = 0;
  let scannedWrites = 0;
  for (const file of sorted) {
    if (!SQL_FILE.test(file.name)) continue;
    const source = stripSqlComments(file.source);
    const writes = [...source.matchAll(new RegExp(TABLE_WRITE.source, TABLE_WRITE.flags))];
    for (const write of writes) {
      scannedWrites++;
      const action = write[1].toLowerCase();
      const statement = statementFrom(source, write.index).trim();
      const containsWorldFlag = /\bterra_world_public\b/i.test(statement);
      const isCanonical = file.name === WORLD_FLAG_MIGRATION && safeDeclaration(statement);
      if (isCanonical) { registrationCount++; continue; }
      if (containsWorldFlag) {
        findings.push({
          code: action.startsWith("insert") ? "WORLD_FLAG_UNSAFE_INSERT" : "WORLD_FLAG_FORBIDDEN_MUTATION",
          file: file.name,
          detail: `${action.replace(/\s+/g, " ")} can modify the World release flag without a new certified rollout decision`,
        });
      } else if (file.name.slice(0, 14) >= WORLD_FLAG_VERSION && (
        action.startsWith("truncate") ||
        (/^(?:update|delete\s+from)/.test(action) &&
          !/\bwhere\s+key\s*=\s*'(?!terra_world_public')[a-z0-9_.-]+'\s*;?\s*$/i.test(statement))
      )) {
        // A WHERE clause alone is not a World exclusion: !=, OR, dynamic
        // concatenation, or an unbound key could still mutate World. New DML
        // must prove one other literal key, or be reviewed explicitly.
        findings.push({
          code: "WORLD_FLAG_UNPROVEN_FEATURE_FLAG_WRITE_SCOPE",
          file: file.name,
          detail: `${action.replace(/\s+/g, " ")} cannot prove it excludes terra_world_public`,
        });
      }
    }
  }
  if (registrationCount !== 1) findings.push({
    code: "WORLD_FLAG_DEFAULT_OFF_NOT_PROVEN",
    file: WORLD_FLAG_MIGRATION,
    detail: `Expected one literal enabled=false / ON CONFLICT DO NOTHING registration, found ${registrationCount}`,
  });
  return {
    schemaVersion: 1,
    scope: "source-only; not production feature-flag, RLS, or deployment certification",
    flag: WORLD_FLAG,
    filesChecked: sorted.filter(x => SQL_FILE.test(x.name)).length,
    featureFlagWriteStatementsChecked: scannedWrites,
    canonicalRegistrationCount: registrationCount,
    clean: findings.length === 0,
    findings,
  };
}

export function readMigrations(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".sql"))
    .map(entry => ({ name: entry.name, source: readFileSync(resolve(directory, entry.name), "utf8") }));
}

function parseCli(args) {
  const allowed = new Set(["--migrations-dir", "--json"]);
  if (args.some(arg => arg.startsWith("--") && !allowed.has(arg))) throw new Error("Unknown option");
  const index = args.indexOf("--migrations-dir");
  if (index !== -1 && (!args[index + 1] || args[index + 1].startsWith("--"))) throw new Error("Missing --migrations-dir path");
  return {
    dir: resolve(index === -1 ? "supabase/migrations" : args[index + 1]),
    json: args.includes("--json"),
  };
}

export function main(args = process.argv.slice(2)) {
  try {
    const options = parseCli(args);
    const result = auditWorldDarkLaunchMigrations(readMigrations(options.dir));
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`World dark-launch source preflight: ${result.clean ? "PASS" : "FAIL"} (${result.filesChecked} migration files checked)`);
      for (const finding of result.findings) console.error(`${finding.code} | ${finding.file} | ${finding.detail}`);
      console.log(`Evidence boundary: ${result.scope}`);
    }
    return result.clean ? 0 : 1;
  } catch (error) {
    console.error(`WORLD_FLAG_PREFLIGHT_UNAVAILABLE: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main();
}
