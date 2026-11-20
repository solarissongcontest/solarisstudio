import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { auditWorldRouteLinks, canonicalWorldPath } from './check-v3-world-route-links.mjs';

function fixture(entries) {
  const root = mkdtempSync(join(tmpdir(), 'v3-world-routes-'));
  for (const [path, text] of Object.entries(entries)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}
const paths = {
  'src/routes/world/index.tsx': 'createFileRoute("/world/")',
  'src/routes/world/organizations/$slug.tsx': 'createFileRoute("/world/organizations/$slug")',
  'src/routes/world/organizations/$slug_/bodies/index.tsx': 'createFileRoute("/world/organizations/$slug_/bodies/")',
  'src/components/world/WorldLinks.tsx': '<Link to="/world/organizations/$slug/bodies" /> <Link to="/world" />',
};

test('normalizes TanStack pathless dynamic layout suffix and trailing slash', () => {
  assert.equal(canonicalWorldPath('/world/organizations/$slug_/bodies/'), '/world/organizations/$slug/bodies');
  assert.equal(canonicalWorldPath('/world/'), '/world');
  assert.equal(canonicalWorldPath('/world/organizations/$slug?tab=members'), '/world/organizations/$slug');
  assert.equal(canonicalWorldPath('/results'), null);
});

test('accepts valid typed World destinations and counts them', (t) => {
  const root = fixture(paths); t.after(() => rmSync(root, { recursive: true, force: true }));
  const report = auditWorldRouteLinks(root);
  assert.equal(report.ok, true, JSON.stringify(report.findings));
  assert.equal(report.routeCount, 3);
  assert.equal(report.checkedLinks, 2);
});

test('fails closed for a missing destination with exact source evidence', (t) => {
  const root = fixture({ ...paths, 'src/components/world/Broken.tsx': '<Link to="/world/nowhere" />' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const report = auditWorldRouteLinks(root);
  assert.equal(report.ok, false);
  assert.deepEqual(report.findings.filter(x => x.kind === 'unknown_world_destination').map(x => x.target), ['/world/nowhere']);
});

test('rejects duplicate route declarations after canonical normalization', (t) => {
  const root = fixture({ ...paths, 'src/routes/world/duplicate.tsx': 'createFileRoute("/world/organizations/$slug_/bodies")' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(auditWorldRouteLinks(root).findings[0].kind, 'duplicate_world_route');
});

test('recognizes redirect target object syntax but not unrelated navigation', (t) => {
  const root = fixture({ ...paths, 'src/routes/world/redirect.tsx': 'createFileRoute("/world/redirect")\nredirect({ to: "/world/organizations/$slug", replace: true })', 'src/components/world/Other.tsx': '<Link to="/results" />' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const report = auditWorldRouteLinks(root);
  assert.equal(report.ok, true, JSON.stringify(report.findings));
  assert.equal(report.checkedLinks, 3);
});

test('rejects dynamic template World destinations that this audit cannot prove', (t) => {
  const root = fixture({ ...paths, 'src/components/world/Dynamic.tsx': '<Link to={`/world/${code}`} />' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(auditWorldRouteLinks(root).findings[0].kind, 'unverified_dynamic_world_destination');
});

test('fails closed when the required route inventory is absent', (t) => {
  const root = fixture({ 'src/components/world/Other.tsx': '<Link to="/world" />' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.throws(() => auditWorldRouteLinks(root), /Required route source directory unavailable/);
});

test('rejects an invalid route declaration and missing declaration', (t) => {
  const root = fixture({ ...paths, 'src/routes/world/empty.tsx': 'export const foo = 1;', 'src/routes/world/bad.tsx': 'createFileRoute("/unexpected")' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const findings = auditWorldRouteLinks(root).findings.map(x => x.kind);
  assert.ok(findings.includes('invalid_world_route'));
  assert.ok(findings.includes('missing_or_ambiguous_route'));
});

test('command-line returns a failing exit status and machine-readable findings', (t) => {
  const root = fixture({ ...paths, 'src/components/world/Broken.tsx': '<Link to="/world/broken" />' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cli = spawnSync(process.execPath, [join(import.meta.dirname, 'check-v3-world-route-links.mjs'), '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  const report = JSON.parse(cli.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.findings[0].kind, 'unknown_world_destination');
});

test('CLI works without network, Supabase or database credentials', (t) => {
  const root = fixture(paths); t.after(() => rmSync(root, { recursive: true, force: true }));
  const cli = spawnSync(process.execPath, [join(import.meta.dirname, 'check-v3-world-route-links.mjs'), '--root', root, '--json'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).routeCount, 3);
});
