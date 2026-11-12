import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditWorldPrivateOfflineBoundary } from './check-world-private-offline-boundary.mjs';

const baseline = {
  offlineHtml: readFileSync(resolve('public/offline.html'), 'utf8'),
  serviceWorker: readFileSync(resolve('public/sw.js'), 'utf8'),
};
const audit = updates => auditWorldPrivateOfflineBoundary({ ...baseline, ...updates });
const failed = (result, id) => result.issues.some(issue => issue.id === id);

test('current PWA sources reject private World paths and retain public assets', () => {
  const result = audit({});
  assert.equal(result.clean, true, JSON.stringify(result.issues));
  assert.equal(result.checks.length, 8);
});

test('accidental public offline workspace exception is a release blocker', () => {
  const modified = baseline.offlineHtml.replace(
    'const OFFLINE_PUBLIC_DETAILS = [',
    'const OFFLINE_PUBLIC_DETAILS = [/^\\/world\\/workspaces(?:\\/.*)?$/,',
  );
  assert.notEqual(modified, baseline.offlineHtml);
  assert.equal(failed(audit({ offlineHtml: modified }), 'offline_world_private_denied'), true);
});

test('removing display-time validation cannot reveal private cached labels', () => {
  const modified = baseline.offlineHtml.replace('!isSafeOfflinePublicPath(item.path)', 'false');
  assert.notEqual(modified, baseline.offlineHtml);
  assert.equal(failed(audit({ offlineHtml: modified }), 'offline_display_time_validation'), true);
});

test('World asset-shaped and credential-bearing paths cannot gain CacheStorage access', () => {
  const modified = baseline.serviceWorker.replace(
    'const path = url.pathname;',
    'const path = url.pathname; if (path.startsWith("/world/")) return true;',
  );
  assert.notEqual(modified, baseline.serviceWorker);
  assert.equal(failed(audit({ serviceWorker: modified }), 'worker_private_world_uncacheable'), true);
});

test('navigation caching regression is blocked independently from static assets', () => {
  const modified = baseline.serviceWorker.replace(
    'return await fetch(request);',
    'await caches.open("html").then(cache => cache.put(request, new Response("private"))); return await fetch(request);',
  );
  assert.notEqual(modified, baseline.serviceWorker);
  assert.equal(failed(audit({ serviceWorker: modified }), 'worker_navigation_not_persisted'), true);
});

test('missing or unrecognized source contracts fail closed', () => {
  const result = audit({ offlineHtml: '<html></html>', serviceWorker: '' });
  assert.equal(result.clean, false);
  assert.equal(failed(result, 'offline_predicate_available'), true);
  assert.equal(failed(result, 'worker_predicate_available'), true);
});
