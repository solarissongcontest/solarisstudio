#!/usr/bin/env node
/**
 * TG0/TG19 World *source* integrity preflight.
 * Static SQL is not the effective PostgreSQL permission graph. Local DB
 * grant/RLS/definer inspection and S16 remain mandatory for certification.
 * Usage: node scripts/audit-v3-world-rpc-safety.mjs [--root PATH] [--require-zero]
 * Output: deterministic JSON; no network, database or writes.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const BROWSER_ROLES = new Set(["public", "anon", "authenticated"]);
const DML_PRIVILEGE = /^(?:all(?: privileges)?|insert|update|delete|truncate|references|trigger)(?:\s*\([^)]*\))?$/;

/** Split top-level SQL, preserving lines; dollar bodies never become statements. */
export function splitTopLevelSql(sql) {
  const statements = [];
  let text = "", mode = "normal", dollarTag = "", line = 1, statementLine = null, commentDepth = 0;
  const add = (s) => {
    if (statementLine === null && /\S/.test(s)) statementLine = line;
    text += s;
    line += (s.match(/\n/g) ?? []).length;
  };
  const emit = () => {
    if (text.trim()) statements.push({ line: statementLine ?? line, sql: text.trim() });
    text = "";
    statementLine = null;
  };
  for (let i = 0; i < sql.length;) {
    const two = sql.slice(i, i + 2), char = sql[i];
    if (mode === "line-comment") {
      if (char === "\n") { add("\n"); mode = "normal"; } else add(" ");
      i += 1; continue;
    }
    if (mode === "block-comment") {
      if (two === "/*") { commentDepth += 1; add("  "); i += 2; continue; }
      if (two === "*/") { commentDepth -= 1; add("  "); i += 2; if (commentDepth === 0) mode = "normal"; continue; }
      add(char === "\n" ? "\n" : " "); i += 1; continue;
    }
    if (mode === "dollar") {
      if (sql.startsWith(dollarTag, i)) { add(dollarTag); i += dollarTag.length; mode = "normal"; }
      else { add(char); i += 1; }
      continue;
    }
    if (mode === "single") {
      if (two === "''") { add(two); i += 2; continue; }
      if (char === "\\" && /[eE]'/.test(sql.slice(Math.max(0, i - 3), i))) { add(two); i += 2; continue; }
      add(char); i += 1; if (char === "'") mode = "normal"; continue;
    }
    if (mode === "double") {
      if (two === '""') { add(two); i += 2; continue; }
      add(char); i += 1; if (char === '"') mode = "normal"; continue;
    }
    if (two === "--") { add("  "); i += 2; mode = "line-comment"; continue; }
    if (two === "/*") { add("  "); i += 2; commentDepth = 1; mode = "block-comment"; continue; }
    if (char === "'") { add(char); i += 1; mode = "single"; continue; }
    if (char === '"') { add(char); i += 1; mode = "double"; continue; }
    if (char === "$") {
      const match = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
      if (match) { dollarTag = match[0]; add(dollarTag); i += dollarTag.length; mode = "dollar"; continue; }
    }
    if (char === ";") { emit(); i += 1; continue; }
    add(char); i += 1;
  }
  emit(); return statements;
}
function functionOptionsOutsideBody(statement) {
  const asMatch = /\bas\s+(\$[A-Za-z_0-9]*\$)/i.exec(statement);
  if (!asMatch) return statement;
  const start = asMatch.index + asMatch[0].length;
  const end = statement.indexOf(asMatch[1], start);
  if (end < 0) return statement.slice(0, asMatch.index);
  return `${statement.slice(0, asMatch.index)} ${statement.slice(end + asMatch[1].length)}`;
}
const WORLD_FUNCTION = /^create\s+(?:or\s+replace\s+)?function\s+(?:(?:public|private)\s*\.\s*)?"?(world_[a-z0-9_]+)"?\s*\(/i;
const SAFE_SEARCH_PATH = /\bset\s+search_path\s*(?:=|to)\s*"?pg_catalog"?\s*(?=$|\b(?:language|security|strict|immutable|stable|volatile|parallel|cost|rows|leakproof|not|as|set)\b)/i;
const ANY_SEARCH_PATH = /\bset\s+search_path\s*(?:=|to)\s*/i;
function worldGrantFinding(statement) {
  const match = /^grant\s+([\s\S]+?)\s+on\s+(?:table\s+)?([\s\S]+?)\s+to\s+([\s\S]+?)(?:\s+with\s+grant\s+option)?$/i.exec(statement.trim());
  if (!match) return null;
  const [, privilegeSource, targetSource, roleSource] = match;
  if (/^(?:function|procedure|sequence|schema|database|type)\b/i.test(targetSource.trim())) return null;
  const tables = [...targetSource.matchAll(/\b(?:(?:public|private)\s*\.\s*)?"?(world_[a-z0-9_]+)"?\b/gi)].map(m => m[1].toLowerCase());
  const worldSchemaWide = /^all\s+tables\s+in\s+schema\s+(?:public|"public")\s*$/i.test(targetSource.trim());
  if (tables.length === 0 && !worldSchemaWide) return null;
  const roles = roleSource.toLowerCase().replaceAll('"', "").split(/\s*,\s*/).map(x => x.trim()).filter(x => BROWSER_ROLES.has(x));
  if (roles.length === 0) return null;
  const dangerous = privilegeSource.toLowerCase().split(/\s*,\s*/).map(x => x.trim()).filter(p => DML_PRIVILEGE.test(p));
  if (dangerous.length === 0) return null;
  return {
    code: worldSchemaWide ? "WORLD_BROWSER_SCHEMA_WIDE_DML_GRANT" : "WORLD_BROWSER_DIRECT_DML_GRANT",
    detail: `World table(s): ${worldSchemaWide ? "ALL TABLES IN public SCHEMA (includes world_*)" : [...new Set(tables)].sort().join(", ")}; browser role(s): ${[...new Set(roles)].sort().join(", ")}; privilege(s): ${[...new Set(dangerous)].sort().join(", ")}`,
  };
}
export function auditWorldSqlSource(source, filename = "fixture.sql") {
  const findings = [];
  let functionsInspected = 0, grantsInspected = 0;
  for (const statement of splitTopLevelSql(source)) {
    const sql = statement.sql;
    const name = WORLD_FUNCTION.exec(sql)?.[1];
    if (name) {
      functionsInspected += 1;
      const options = functionOptionsOutsideBody(sql);
      if (/\bsecurity\s+definer\b/i.test(options) && !SAFE_SEARCH_PATH.test(options)) {
        findings.push({ file: filename, line: statement.line,
          code: ANY_SEARCH_PATH.test(options) ? "WORLD_DEFINER_UNSAFE_SEARCH_PATH" : "WORLD_DEFINER_MISSING_SEARCH_PATH",
          detail: `${name.toLowerCase()}: SECURITY DEFINER requires pinned pg_catalog search_path` });
      }
    }
    if (/^grant\s/i.test(sql)) {
      grantsInspected += 1;
      const finding = worldGrantFinding(sql);
      if (finding) findings.push({ file: filename, line: statement.line, ...finding });
    }
  }
  return { findings, functionsInspected, grantsInspected };
}
export function auditWorldMigrationDirectory(directory) {
  const names = readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".sql"))
    .map(entry => entry.name).sort();
  const findings = [];
  let functionsInspected = 0, grantsInspected = 0;
  for (const name of names) {
    const { findings: local, functionsInspected: f, grantsInspected: g } = auditWorldSqlSource(readFileSync(join(directory, name), "utf8"), name);
    findings.push(...local); functionsInspected += f; grantsInspected += g;
  }
  return { schemaVersion: 1, scope: "static-world-migration-source-only",
    assurance: "NOT A DB/RLS/S16 RELEASE CERTIFICATE",
    limitations: "Does not evaluate later REVOKEs, default privileges, dynamic SQL, database grants or effective policies; review findings and execute S16/local PostgreSQL verification",
    filesInspected: names.length, worldFunctionsInspected: functionsInspected,
    grantStatementsInspected: grantsInspected,
    findings: findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code)) };
}
function main(args) {
  let root = process.cwd(), requireZero = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--require-zero") requireZero = true;
    else if (args[i] === "--root" && args[i + 1]) root = args[++i];
    else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  const report = auditWorldMigrationDirectory(resolve(root, "supabase/migrations"));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (requireZero && report.findings.length > 0) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${String(error)}\n`); process.exitCode = 2; }
}
