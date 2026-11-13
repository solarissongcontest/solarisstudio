#!/usr/bin/env node
/**
 * Offline adapter for an operator-supplied Supabase SQL Editor version/name CSV.
 * This tool only converts evidence; it never connects to Supabase or marks
 * migrations applied. Keep both raw CSV and derived JSON outside GitHub/CI.
 *
 * node scripts/convert-v3-migration-csv-offline.mjs \
 *   --input /private/production-history.csv \
 *   --output /private/production-history.json \
 *   --expected-rows 497 --expected-tip 20261101181812
 *
 * Then use the existing exact-SHA frontier auditor with --remote-history.
 */
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function parseMigrationHistoryCsv(csv) {
  if (csv.charCodeAt(0) === 0xfeff) csv = csv.slice(1);
  // Small RFC4180-compatible reader: commas, CRLF, quoted fields and doubled
  // quotation marks are accepted; no version or name is trimmed/rewritten.
  const records = [];
  let row = [], field = "", quoted = false, closedQuote = false, fieldStarted = false;
  const emitField = () => {
    row.push(field);
    field = ""; closedQuote = false; fieldStarted = false;
  };
  const emitRow = () => {
    emitField();
    records.push(row);
    row = [];
  };
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (quoted) {
      if (ch === '"') {
        if (csv[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closedQuote = true; }
      } else { field += ch; }
      continue;
    }
    if (ch === '"') {
      if (fieldStarted || closedQuote) throw new Error("Malformed CSV quotation");
      quoted = true; fieldStarted = true;
    } else if (ch === ',') {
      emitField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && csv[i + 1] === '\n') i++;
      emitRow();
    } else {
      if (closedQuote) throw new Error("Unexpected characters after CSV closing quote");
      field += ch; fieldStarted = true;
    }
  }
  if (quoted) throw new Error("Unterminated quoted CSV field");
  if (fieldStarted || closedQuote || field.length || row.length) emitRow();
  if (!records.length) throw new Error("CSV contains no header");
  const header = records.shift();
  const hasIndex = header.length === 3 && header.join(",") === "index,version,name";
  if (!hasIndex && !(header.length === 2 && header.join(",") === "version,name")) {
    throw new Error("Expected exact version,name or index,version,name CSV columns");
  }
  if (!records.length) throw new Error("CSV contains no migration rows");
  const seen = new Set();
  let previous = null;
  const migrations = records.map((record, index) => {
    if (record.length !== header.length) throw new Error("Malformed CSV row " + (index + 2));
    const version = record[hasIndex ? 1 : 0], name = record[hasIndex ? 2 : 1];
    if (hasIndex && record[0] !== String(index)) {
      throw new Error("Invalid export index at CSV row " + (index + 2));
    }
    if (!/^\d{14}$/.test(version)) throw new Error("Invalid migration version at CSV row " + (index + 2));
    if (!name || !name.trim()) throw new Error("Missing migration name at CSV row " + (index + 2));
    if (seen.has(version)) throw new Error("Duplicate migration version " + version);
    if (previous !== null && version <= previous) {
      throw new Error("Migration CSV versions are not strictly ascending at row " + (index + 2));
    }
    seen.add(version);
    previous = version;
    return { version, name };
  });
  return migrations;
}

const runningAsScript = process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (runningAsScript) {
  try {
    const args = process.argv.slice(2);
    const value = flag => {
      const i = args.indexOf(flag);
      return i === -1 ? null : args[i + 1] ?? null;
    };
    const input = value("--input"), output = value("--output");
    if (!input || !output || input.startsWith("--") || output.startsWith("--")) {
      throw new Error("Usage: --input <CSV> --output <JSON> [--expected-rows N] [--expected-tip 14digit]");
    }
    const source = resolve(input), target = resolve(output);
    const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
    const realOutputDirectory = realpathSync(dirname(target));
    const rel = relative(repositoryRoot, realOutputDirectory);
    if (rel === "" || (rel !== ".." && !rel.startsWith(".." + "/") && !isAbsolute(rel))) {
      throw new Error("Refusing to write migration evidence inside repository");
    }
    if (source === target) throw new Error("Input and output must be different files");
    if (!statSync(source).isFile()) throw new Error("Input must be a regular file");
    const rawBytes = readFileSync(source);
    // Reject decoding substitutions and preserve exact source bytes for hash.
    const csvText = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
    const migrations = parseMigrationHistoryCsv(csvText);
    const expectedRows = value("--expected-rows");
    if (expectedRows !== null &&
        (!/^[1-9]\d*$/.test(expectedRows) || migrations.length !== Number(expectedRows))) {
      throw new Error("Migration row count does not match --expected-rows");
    }
    const expectedTip = value("--expected-tip");
    if (expectedTip !== null &&
        (!/^\d{14}$/.test(expectedTip) || migrations.at(-1).version !== expectedTip)) {
      throw new Error("Latest migration version does not match --expected-tip");
    }
    // No projectRef is added. SQL Editor CSV has no independently authenticated
    // project identity; attaching a ref is a separate operator attestation.
    writeFileSync(target, JSON.stringify({ migrations }, null, 2) + "\n",
      { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({
      rows: migrations.length,
      latestVersion: migrations.at(-1).version,
      csvSha256: createHash("sha256").update(rawBytes).digest("hex"),
      projectIdentityVerified: false,
      hostedSqlEffectsVerified: false,
      productionDeploymentAuthorized: false,
    }));
  } catch (error) {
    console.error("FAIL CLOSED: " + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
