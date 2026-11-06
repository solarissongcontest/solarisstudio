#!/usr/bin/env node
/**
 * TG19 source-only guard: private World React Query caches must be partitioned
 * by the *current* authenticated actor or auth generation.
 *
 * Not a substitute for server RLS, auth-transition cache eviction or a
 * same-route A->B->signed-out browser test. No database/network requests.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PRIVATE_WORLD_COMPONENTS = Object.freeze([
  "src/components/world/WorldPrivateWorkspace.tsx", // TG11/TG12
  "src/components/world/WorldMediationWorkspace.tsx", // TG13
  "src/components/world/WorldEthicsWorkspace.tsx", // TG13
  "src/components/world/WorldCourtWorkspace.tsx", // TG14
  "src/components/world/WorldCourtJudgments.tsx", // TG14
]);

// The identity bootstrap resolves the actor; it has no private payload itself.
const IDENTITY_BOOTSTRAP = /^\[\s*["']world-private-identity["']\s*\]$/;
const ACTOR_PARTITION = /\b(?:identity\.data|identity\.actorId|actorId|actorScope|actorEpoch|authGeneration|authEpoch|userId|viewerId|sessionUserId|sessionEpoch)\b/;
const AUTH_TRANSITION = /\b(?:onAuthStateChange|useWorldPrivateIdentity|useWorldPrivateActor)\b/;
const STALE_FALLBACK = /\b(?:placeholderData|initialData)\s*:/;

/**
 * Strip JS/TS string literals and comments while retaining character offsets.
 * A fake "actorId" inside a string/comment must not satisfy the protection.
 * Nested template substitutions are deliberately not interpreted: if a
 * query key cannot be statically understood, the check fails closed.
 */
function codeOnly(source) {
  let output = "";
  let mode = "code";
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];
    if (mode === "code") {
      if (c === "/" && next === "/") {
        output += "  "; i++; mode = "line"; continue;
      }
      if (c === "/" && next === "*") {
        output += "  "; i++; mode = "block"; continue;
      }
      if (c === "'" || c === '"' || c === "\`") {
        output += " "; mode = c; continue;
      }
      output += c;
    } else if (mode === "line") {
      output += c === "\n" ? "\n" : " ";
      if (c === "\n") mode = "code";
    } else if (mode === "block") {
      if (c === "*" && next === "/") {
        output += "  "; i++; mode = "code";
      } else output += c === "\n" ? "\n" : " ";
    } else {
      if (c === "\\") {
        output += " ";
        if (i + 1 < source.length) { output += " "; i++; }
      } else if (c === mode) {
        output += " "; mode = "code";
      } else output += c === "\n" ? "\n" : " ";
    }
  }
  return output;
}

const lineAt = (source, offset) => source.slice(0, offset).split("\n").length;

export function inspectPrivateWorldComponent(file, source) {
  const masked = codeOnly(source);
  const violations = [];
  const hasTransition = AUTH_TRANSITION.test(masked);
  const keyPattern = /\bqueryKey\s*:/g;
  let match;
  let found = 0;

  while ((match = keyPattern.exec(masked)) !== null) {
    found++;
    const position = match.index;
    const line = lineAt(source, position);
    let start = keyPattern.lastIndex;
    while (/\s/.test(masked[start] ?? "") && start < masked.length) start++;
    if (masked[start] !== "[") {
      violations.push({ file, line, code: "NON_LITERAL_QUERY_KEY",
        detail: "Private queryKey must expose a statically inspectable actor-scoped array." });
      continue;
    }
    let depth = 0;
    let end = start;
    for (; end < masked.length; end++) {
      if (masked[end] === "[") depth++;
      else if (masked[end] === "]") {
        depth--;
        if (depth === 0) { end++; break; }
      }
    }
    if (depth !== 0 || end > masked.length) {
      violations.push({ file, line, code: "MALFORMED_QUERY_KEY",
        detail: "Query key array could not be parsed safely." });
      continue;
    }
    const expression = masked.slice(start, end);
    const raw = source.slice(start, end);
    if (IDENTITY_BOOTSTRAP.test(raw.trim())) continue;
    if (!ACTOR_PARTITION.test(expression)) {
      violations.push({ file, line, code: "ACTOR_NOT_IN_QUERY_KEY",
        detail: "Private queryKey must include current actor identity or auth generation." });
    }
    if (!hasTransition) {
      violations.push({ file, line, code: "AUTH_TRANSITION_UNOBSERVED",
        detail: "Private query has no observable auth-transition subscription/hook." });
    }
  }

  if (/\buse(?:Infinite)?Query\s*\(/.test(masked) && found === 0) {
    violations.push({ file, line: 1, code: "QUERY_KEY_MISSING",
      detail: "Private World component uses React Query without visible queryKey." });
  }
  if (STALE_FALLBACK.test(masked)) {
    violations.push({ file, line: lineAt(source, masked.search(STALE_FALLBACK)),
      code: "STALE_PRIVATE_FALLBACK",
      detail: "Do not reuse a previous actor's private query data as placeholder/initial data." });
  }
  return violations;
}

export function auditPrivateWorldQueries(root = process.cwd()) {
  const inspected = [];
  const absent = [];
  const violations = [];
  for (const relative of PRIVATE_WORLD_COMPONENTS) {
    const absolute = resolve(root, relative);
    if (!existsSync(absolute)) { absent.push(relative); continue; }
    inspected.push(relative);
    violations.push(...inspectPrivateWorldComponent(relative, readFileSync(absolute, "utf8")));
  }
  return {
    status: violations.length ? "fail" : "pass",
    inspected, absent, violations,
    proof: "SOURCE_ONLY_NOT_RUNTIME_AUTHORIZATION_OR_RELEASE_CERTIFICATION",
  };
}

function cli(argv) {
  let root = process.cwd();
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") { json = true; continue; }
    if (argv[i] === "--root" && argv[i + 1]) { root = argv[++i]; continue; }
    throw new Error("Usage: node scripts/check-v3-world-private-query-scope.mjs [--root PATH] [--json]");
  }
  const report = auditPrivateWorldQueries(root);
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("TG19 private World query scope: " + report.status +
      " (" + report.inspected.length + " present / " +
      PRIVATE_WORLD_COMPONENTS.length + " tracked; " +
      report.violations.length + " violations)");
    for (const item of report.violations) {
      console.error(item.file + ":" + item.line + " " + item.code + ": " + item.detail);
    }
    if (report.absent.length) console.log("Unmerged/absent (NOT certified): " + report.absent.join(", "));
  }
  if (report.violations.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { cli(process.argv.slice(2)); }
  catch (error) { console.error(String(error)); process.exitCode = 2; }
}
