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
      const end = sql.indexOf("*/", i + 2);
      if (end < 0) throw new Error("Unterminated SQL comment");
      result += sql.slice(i, end + 2).replace(/[^\n]/g, " ");
      i = end + 2;
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
 * Explicit SQL source is mandatory. Exactly one literal ballot-cast producer
 * is accepted so missing/duplicated events cannot quietly pass an audit.
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
    const sql = stripSqlComments(source.content);
    const pattern = /\bprivate\s*\.\s*v3_emit_domain_event\s*\(/gi;
    for (const match of sql.matchAll(pattern)) {
      const openingParen = match.index + match[0].lastIndexOf("(");
      const call = sqlCallArguments(sql, openingParen);
      if (call.args[0]?.toLowerCase() !== "'world.vote.ballot_cast'") continue;
      found.push({ source: source.name, args: call.args });
    }
  }
  if (found.length !== 1) {
    throw new Error("Expected exactly one literal world.vote.ballot_cast event; found " + found.length);
  }
  const { args, source } = found[0];
  if (args.length !== 10) throw new Error("Unexpected ballot event envelope");
  if (!/^jsonb_build_object\s*\(\s*'voteId'\s*,\s*p_vote_id\s*\)$/i.test(args[7])) {
    throw new Error("Ballot outbox payload must contain only voteId");
  }
  // Don't permit voter identities/choices to escape into other envelope slots.
  const envelope = args.slice(1).join(" ");
  if (/\b(?:p_choice|v_actor|cast_by_user_id|cast_by_proxy_id|proxy_user_id|auth\s*\.\s*uid)\b/i.test(envelope)) {
    throw new Error("Ballot event envelope contains private vote identity or choice");
  }
  if (args[1].toLowerCase() !== "'world_vote'" ||
      args[2].replace(/\s/g, "").toLowerCase() !== "p_vote_id::text") {
    throw new Error("Ballot event has unexpected entity authority");
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
