#!/usr/bin/env node
/**
 * TG19 read-only contract: legislative ballot-cast outbox events contain only
 * the vote ID. This is source validation, NOT proof of database RLS or release.
 * No network, Supabase client, database connection or credentials.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BALLOT_EVENT = "world.vote.ballot_cast";

/** Remove SQL comments without changing quoted literals or offsets. */
export function stripSqlComments(sql) {
  let result = "";
  for (let i = 0; i < sql.length;) {
    if (sql[i] === "'") {
      let end = i + 1;
      while (end < sql.length) {
        if (sql[end] === "'" && sql[end + 1] === "'") { end += 2; continue; }
        if (sql[end++] === "'") break;
      }
      if (sql[end - 1] !== "'") throw new Error("Unterminated SQL string");
      result += sql.slice(i, end);
      i = end;
      continue;
    }
    if (sql.slice(i, i + 2) === "--") {
      const end = sql.indexOf("\n", i + 2);
      if (end < 0) { result += " ".repeat(sql.length - i); break; }
      result += " ".repeat(end - i) + "\n";
      i = end + 1;
      continue;
    }
    if (sql.slice(i, i + 2) === "/*") {
      const start = i;
      let depth = 1;
      i += 2;
      while (i < sql.length && depth > 0) {
        if (sql.slice(i, i + 2) === "/*") { depth++; i += 2; }
        else if (sql.slice(i, i + 2) === "*/") { depth--; i += 2; }
        else i++;
      }
      if (depth > 0) throw new Error("Unterminated SQL comment");
      result += sql.slice(start, i).replace(/[^\n]/g, " ");
      continue;
    }
    result += sql[i++];
  }
  return result;
}

/** Split a SQL call at top-level commas while respecting nested expressions. */
export function sqlCallArguments(sql, openingParen) {
  if (sql[openingParen] !== "(") throw new Error("Expected SQL call");
  const args = [];
  let start = openingParen + 1;
  let depth = 0;
  for (let i = start; i < sql.length; i++) {
    const char = sql[i];
    if (char === "'") {
      let closed = false;
      for (++i; i < sql.length; i++) {
        if (sql[i] !== "'") continue;
        if (sql[i + 1] === "'") { i++; continue; }
        closed = true;
        break;
      }
      if (!closed) throw new Error("Unterminated SQL call literal");
      continue;
    }
    if (char === "(") { depth++; continue; }
    if (char === ")") {
      if (depth === 0) {
        args.push(sql.slice(start, i).trim());
        return { args, end: i + 1 };
      }
      depth--;
      continue;
    }
    if (char === "," && depth === 0) {
      args.push(sql.slice(start, i).trim());
      start = i + 1;
    }
  }
  throw new Error("Unterminated SQL event call");
}

/**
 * Locate the canonical ballot command body. Ordinary SQL strings and random
 * dollar-quoted prose outside the command are not evidence that the event
 * exists in the transaction that records a ballot.
 */
export function worldBallotCommandBody(sql) {
  const source = stripSqlComments(sql);
  const declarations = [...source.matchAll(/\bcreate\s+or\s+replace\s+function\s+public\s*\.\s*world_cast_ballot_v1\s*\(/gi)];
  if (declarations.length !== 1) {
    throw new Error("Expected exactly one canonical world_cast_ballot_v1 function");
  }
  const declaration = declarations[0];
  const params = sqlCallArguments(source, declaration.index + declaration[0].lastIndexOf("("));
  const header = source.slice(params.end, params.end + 1500);
  const quoted = /\bas\s+(\$[a-z_0-9]*\$)/i.exec(header);
  if (!quoted) throw new Error("Ballot command body delimiter not found");
  const delimiter = quoted[1];
  const start = params.end + quoted.index + quoted[0].length;
  const end = source.indexOf(delimiter, start);
  if (end < 0) throw new Error("Unterminated ballot command body");
  return source.slice(start, end);
}

/** Skip strings and nested literals while finding executable event invocations. */
export function executableWorldEventCalls(body) {
  const calls = [];
  const pattern = /^private\s*\.\s*v3_emit_domain_event\s*\(/i;
  for (let i = 0; i < body.length;) {
    const ch = body[i];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let closed = false;
      for (++i; i < body.length; i++) {
        if (body[i] !== quote) continue;
        if (body[i + 1] === quote) { i++; continue; }
        closed = true;
        i++;
        break;
      }
      if (!closed) throw new Error("Unterminated ballot command string");
      continue;
    }
    if (ch === "$" ) {
      const tag = /^\$[a-z_0-9]*\$/i.exec(body.slice(i));
      if (tag) {
        const end = body.indexOf(tag[0], i + tag[0].length);
        if (end < 0) throw new Error("Unterminated nested SQL literal");
        i = end + tag[0].length;
        continue;
      }
    }
    if (ch === "/" && body[i + 1] === "*") {
      // stripSqlComments already masks nested comments, but reject any
      // unstripped ones rather than treating their contents as code.
      throw new Error("Unparsed nested SQL comment");
    }
    const match = pattern.exec(body.slice(i));
    if (match && (i === 0 || !/[\p{L}\p{N}_]/u.test(body[i - 1]))) {
      const openingParen = i + match[0].lastIndexOf("(");
      const call = sqlCallArguments(body, openingParen);
      calls.push(call.args);
      i = call.end;
      continue;
    }
    i++;
  }
  return calls;
}

/**
 * Explicit source is mandatory. Exactly one executable invocation in the
 * canonical ballot command is accepted. No DB/network or runtime authority.
 */
export function auditWorldBallotEventSql(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error("Explicit SQL sources required");
  }
  const found = [];
  for (const source of sources) {
    if (!source || typeof source.name !== "string" ||
        typeof source.content !== "string" || source.content.length > 2_000_000) {
      throw new Error("Invalid or oversized SQL source");
    }
    if (!/\bworld_cast_ballot_v1\b/i.test(source.content)) continue;
    for (const args of executableWorldEventCalls(worldBallotCommandBody(source.content))) {
      found.push({ source: source.name, args });
    }
  }
  if (found.length !== 1) {
    throw new Error("Expected exactly one executable ballot event; found " + found.length);
  }
  const { args, source } = found[0];
  if (args.length !== 10) throw new Error("Unexpected ballot event envelope");
  if (!/^jsonb_build_object\s*\(\s*'voteId'\s*,\s*p_vote_id\s*\)$/i.test(args[7])) {
    throw new Error("Ballot outbox payload must contain only voteId");
  }
  // Every other slot must also match the reviewed TG8 event signature.
  // A denylist of choice/user names is insufficient: future private fields
  // could be passed as p_email, p_claims, tags, or arbitrary expressions.
  const normalized = args.map((arg) => arg.replace(/\s+/g, "").toLowerCase());
  const expected = [
    "'world.vote.ballot_cast'", "'world_vote'", "p_vote_id::text", "1",
    "v_operation_id", "null", "null", null, "1", "array[]::text[]",
  ];
  for (let i = 0; i < normalized.length; i++) {
    if (expected[i] !== null && normalized[i] !== expected[i]) {
      throw new Error("Unexpected ballot event envelope field " + (i + 1));
    }
  }
  return { ok: true, event: BALLOT_EVENT, source, payloadKeys: ["voteId"], occurrences: 1 };
}

function main(args) {
  if (args.length === 0 || args.some((s) => s.startsWith("--"))) {
    throw new Error("Usage: node scripts/check-v3-world-ballot-event-privacy.mjs <SQL-file> [SQL-file...]");
  }
  const sources = args.map((path) => ({
    name: path,
    content: readFileSync(resolve(path), "utf8"),
  }));
  process.stdout.write(JSON.stringify(auditWorldBallotEventSql(sources), null, 2) + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write("[world-event-privacy] " + (error?.message ?? String(error)) + "\n");
    process.exitCode = 1;
  }
}
