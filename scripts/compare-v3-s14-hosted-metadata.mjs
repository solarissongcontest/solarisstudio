#!/usr/bin/env node
// Compare a bounded, manual hosted-schema metadata snapshot with a local one.
// Never connects to a DB. All inputs are files containing catalog metadata,
// NOT application records. A mismatch is a release NO-GO, not an auto-fix.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

function normalized(input) {
  if (typeof input === "string") {
    const data = JSON.parse(input.trim());
    if (typeof data === "string") return normalized(data);
    return normalized(data);
  }
  if (input && typeof input.schema_metadata === "string") {
    return normalized(input.schema_metadata);
  }
  if (!input || input.format_version !== 1 ||
      input.scope !== "eight-table-v3-s14-hosted-metadata-only" ||
      !input.tables || typeof input.tables !== "object") {
    throw new Error("Invalid or incompatible eight-table metadata manifest");
  }
  return input;
}

function leafMap(node, prefix = "", out = new Map()) {
  if (Array.isArray(node)) {
    // Compare JSON arrays by their actual elements, NOT object identity.
    out.set(prefix + ".length", node.length);
    for (let i = 0; i < node.length; i++) leafMap(node[i], prefix + "[" + i + "]", out);
  } else if (node !== null && typeof node === "object") {
    for (const k of Object.keys(node).sort()) leafMap(node[k],
      prefix ? prefix + "." + k : k, out);
  } else {
    out.set(prefix, node);
  }
  return out;
}

export function compareSchemas(hostedInput, localInput) {
  const hosted = normalized(hostedInput), local = normalized(localInput);
  const wanted = Object.keys(hosted.tables).sort();
  if (wanted.length !== 8) throw new Error("Snapshot must cover exactly eight tables");
  const left = leafMap(hosted), right = leafMap(local);
  const keys = [...new Set([...left.keys(), ...right.keys()])].sort();
  const diffs = keys.flatMap(path => {
    const inHosted = left.has(path), inLocal = right.has(path);
    if (inHosted && inLocal && Object.is(left.get(path), right.get(path))) return [];
    return [{
      path,
      category: !inLocal ? "hosted-only" : !inHosted ? "local-only" : "different",
      hosted: inHosted ? left.get(path) : null,
      local: inLocal ? right.get(path) : null,
    }];
  });
  return {hostedCount: wanted.length, localCount: Object.keys(local.tables).length, diffs};
}

function printResult(result) {
  if (result.diffs.length === 0) {
    console.log("PASS: eight-table production-observed schema metadata matches disposable local PostgreSQL.");
    console.log("LIMITATION: eight metadata tables are NOT hosted-head-equivalent, data/row-level, migration-history or security certification.");
    return;
  }
  const totals = { "hosted-only": 0, "local-only": 0, different: 0 };
  for (const diff of result.diffs) totals[diff.category]++;
  console.error("NO_GO: hosted eight-table catalog and source-clean local schema are NOT equivalent.");
  console.error("Differences: " + result.diffs.length +
    " (hosted-only " + totals["hosted-only"] +
    ", local-only " + totals["local-only"] +
    ", changed " + totals.different + ").");
  console.error("Both sides are schema metadata only. Definition hashes can change with PostgreSQL versions or normalized SQL formatting and require review.");
  for (const d of result.diffs.slice(0,160)) {
    console.error(d.category + ": " + d.path +
      " | hosted=" + JSON.stringify(d.hosted) + " local=" + JSON.stringify(d.local));
  }
  if (result.diffs.length > 160) console.error("... " + (result.diffs.length - 160) + " additional metadata differences");
  console.error("RELEASE NO-GO: investigate mismatches before claiming a hosted-equivalent S13/S14 upgrade.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) {
    console.error("Usage: node scripts/compare-v3-s14-hosted-metadata.mjs HOSTED.json LOCAL.json");
    process.exitCode = 2;
  } else {
    try {
      const result = compareSchemas(
        readFileSync(process.argv[2], "utf8"),
        readFileSync(process.argv[3], "utf8")
      );
      printResult(result);
      if (result.diffs.length) process.exitCode = 1;
    } catch (error) {
      console.error("NO_GO: invalid metadata comparison input: " + error.message);
      process.exitCode = 2;
    }
  }
}
