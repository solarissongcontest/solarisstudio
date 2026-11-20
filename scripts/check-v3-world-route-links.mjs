#!/usr/bin/env node
/** Offline TG18/TG19 World link-to-route integrity audit. No network or database I/O. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const routeDeclaration = /\bcreateFileRoute\(\s*(['"`])([^'"`]+)\1\s*\)/g;
const literalDestination = /\bto\s*(?:=|:)\s*(['"`])([^'"`]+)\1/g;
const dynamicDestination = /\bto\s*=\s*\{\s*`(\/world[^`]+)`\s*\}/g;

export function canonicalWorldPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/world')) return null;
  const withoutSearch = path.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
  // TanStack file routes use `$slug_` to end the parent's layout nesting.
  // Their typed navigation destination is still `$slug`.
  return withoutSearch.replace(/\$([A-Za-z][\w]*)_(?=\/|$)/g, '$$$1');
}

function sourcePaths(root, dir) {
  const base = resolve(root, dir);
  if (!existsSync(base) || !statSync(base).isDirectory()) {
    throw new Error(`Required route source directory unavailable: ${dir}`);
  }
  const result = [];
  function walk(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name) &&
               !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)) result.push(file);
    }
  }
  walk(base);
  return result.sort();
}

export function auditWorldRouteLinks(root = process.cwd()) {
  const routesDir = 'src/routes/world';
  const routes = sourcePaths(root, routesDir);
  const componentDir = 'src/components/world';
  const components = existsSync(resolve(root, componentDir)) ? sourcePaths(root, componentDir) : [];
  const declarations = new Map();
  const findings = [];
  const names = (file) => relative(resolve(root), file).replaceAll('\\', '/');
  for (const file of routes) {
    const source = readFileSync(file, 'utf8');
    const matches = [...source.matchAll(routeDeclaration)];
    if (matches.length !== 1) {
      findings.push({ kind: 'missing_or_ambiguous_route', file: names(file), count: matches.length });
      continue;
    }
    const path = canonicalWorldPath(matches[0][2]);
    if (!path || !/^\/world(?:\/|$)/.test(path)) {
      findings.push({ kind: 'invalid_world_route', file: names(file), path: matches[0][2] });
      continue;
    }
    if (declarations.has(path)) {
      findings.push({ kind: 'duplicate_world_route', file: names(file), path, first: declarations.get(path) });
    } else declarations.set(path, names(file));
  }
  if (declarations.size === 0) {
    findings.push({ kind: 'no_world_routes', directory: routesDir });
  }
  const verifiedLinks = [];
  for (const file of [...routes, ...components]) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(literalDestination)) {
      const target = match[2];
      if (!/^\/world(?:[/?#]|$)/.test(target)) continue;
      const path = canonicalWorldPath(target);
      const record = { file: names(file), target, path };
      verifiedLinks.push(record);
      if (target.includes('..') || !declarations.has(path)) {
        findings.push({ kind: 'unknown_world_destination', ...record });
      }
    }
    // A dynamic World path may be valid, but cannot be proved by this static
    // pass. Fail closed rather than treating its absence from regex as a pass.
    for (const match of source.matchAll(dynamicDestination)) {
      findings.push({ kind: 'unverified_dynamic_world_destination', file: names(file), expression: match[1] });
    }
  }
  return {
    ok: findings.length === 0,
    scannedFiles: routes.length + components.length,
    routeCount: declarations.size,
    checkedLinks: verifiedLinks.length,
    routes: [...declarations].map(([path, file]) => ({ path, file })).sort((a, b) => a.path.localeCompare(b.path)),
    links: verifiedLinks,
    findings,
    authority: 'source-only; NOT runtime route verification, publication authorization, RLS proof or certification',
  };
}

function main() {
  let root = process.cwd();
  let json = false;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--root' && process.argv[i + 1]) root = resolve(process.argv[++i]);
    else if (arg === '--json') json = true;
    else if (arg === '--help') {
      process.stdout.write('Usage: node scripts/check-v3-world-route-links.mjs [--root REPO] [--json]\n');
      return;
    } else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  const report = auditWorldRouteLinks(root);
  if (json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else {
    process.stdout.write(`World route links: ${report.routeCount} routes, ${report.checkedLinks} literal links, ${report.findings.length} findings\n`);
    for (const issue of report.findings) process.stderr.write(JSON.stringify(issue) + '\n');
  }
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); }
  catch (error) { process.stderr.write(`World route audit failed closed: ${error.message}\n`); process.exitCode = 1; }
}
