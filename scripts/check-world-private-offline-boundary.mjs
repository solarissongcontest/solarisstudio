#!/usr/bin/env node
/**
 * Terra Solaris TG12/TG18/TG19 local-only PWA privacy preflight.
 * Reads only two checked-out source files; never contacts GitHub, Supabase,
 * the service worker runtime, a browser, or any hosted endpoint.
 * Source predicates are defense in depth, not replacements for PostgreSQL RLS.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORLD_PRIVATE_PATHS = Object.freeze([
  '/world/workspaces',
  '/world/workspaces/guard',
  '/world/workspaces/unity',
  '/world/workspaces/guard/rooms/6e76798e-7a83-4a74-a8cd-cd9ae28851d2',
  '/world/court/private-evidence.png',
  '/world/ethics/private-case.jpg',
  '/world/private/minutes.pdf',
  '/world%2fworkspaces/guard',
  '/world%252fworkspaces/guard',
  '/world/workspaces%2fguard',
  '/world/workspaces/%2e%2e/private',
  '/world/workspaces/guard?token=secret',
]);
const PRIVATE_ASSET_PATHS = Object.freeze([
  ...WORLD_PRIVATE_PATHS,
  '/assets/world%2fworkspaces%2fprivate.jpg',
  '/_build/world%5cworkspaces%5csecret.js',
  '/assets/world/private.jpg?token=secret',
  '/assets/world/private.jpg?signature=secret',
  '/assets/world/private.jpg?v=ok&access_token=secret',
]);
const ORIGIN = 'https://solaris.test';

function extract(source, from, through) {
  const start = source.indexOf(from);
  const end = source.indexOf(through, start + from.length);
  if (start < 0 || end <= start) {
    throw new Error('Missing source contract: ' + from + ' → ' + through);
  }
  return source.slice(start, end);
}

/** Machine-readable findings, with unknown or changed source shape failing closed. */
export function auditWorldPrivateOfflineBoundary({ offlineHtml, serviceWorker }) {
  const issues = [];
  const checks = [];
  const check = (id, passed, detail) => {
    checks.push({ id, passed, detail });
    if (!passed) issues.push({ id, detail });
  };
  if (typeof offlineHtml !== 'string' || typeof serviceWorker !== 'string') {
    return { clean: false, checks, issues: [{ id: 'source_missing', detail: 'Both sources are required.' }] };
  }

  try {
    const snippet = extract(offlineHtml, 'const OFFLINE_PUBLIC_DETAILS = [', 'const makeRow =');
    const allowed = new Function(snippet + '\nreturn isSafeOfflinePublicPath;')();
    check('offline_public_still_available',
      allowed('/countries/oland') === true && allowed('/editions/ssc22') === true,
      'Public country and edition recents must still be supported.');
    check('offline_world_private_denied',
      WORLD_PRIVATE_PATHS.every(path => allowed(path) === false),
      'Private World workspaces, cases and encoded routes must not appear in offline public recents.');
    const rowSnippet = extract(offlineHtml, 'const makeRow =', 'const index = safeParse(');
    check('offline_display_time_validation',
      /!isSafeOfflinePublicPath\(item\.path\)/.test(rowSnippet),
      'Stored public-recents paths must be revalidated at display time.');
    check('offline_invalid_labels_hidden',
      /!item\.label\.trim\(\)/.test(rowSnippet) && /label\.textContent\s*=\s*item\.label/.test(rowSnippet),
      'Invalid links must disappear with their labels, without private-name fallback.');
  } catch (error) {
    check('offline_predicate_available', false, String(error));
  }

  try {
    const snippet = extract(serviceWorker, 'const PUBLIC_SHELL_ASSETS =', 'async function networkNavigation');
    const isCacheable = new Function('self', snippet + '\nreturn isCacheableStaticAsset;')(
      { location: { origin: ORIGIN } },
    );
    const allowed = (path, init) => {
      const url = new URL(path, ORIGIN);
      return isCacheable(url, new Request(url, init));
    };
    check('worker_private_world_uncacheable',
      PRIVATE_ASSET_PATHS.every(path => allowed(path) === false),
      'Service worker must not persist World private routes or signed assets.');
    check('worker_authorized_requests_uncacheable',
      allowed('/assets/app.js', { headers: { Authorization: 'Bearer secret' } }) === false &&
      allowed('/assets/app.js', { cache: 'no-store' }) === false,
      'Authenticated and no-store requests must never enter static cache.');
    check('worker_public_static_still_available', allowed('/assets/app.abc123.js') === true,
      'Normal immutable build output must remain cacheable.');
    const navigation = extract(serviceWorker, 'async function networkNavigation', 'async function trimRuntimeCache');
    check('worker_navigation_not_persisted',
      /return await fetch\(request\)/.test(navigation) &&
      !/\b(?:cache|caches)\.(?:put|add|addAll)\s*\(/.test(navigation),
      'Navigation HTML must be network-or-offline fallback, not stored private HTML.');
  } catch (error) {
    check('worker_predicate_available', false, String(error));
  }

  return { clean: issues.length === 0, checks, issues };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = auditWorldPrivateOfflineBoundary({
      offlineHtml: readFileSync(resolve(process.cwd(), 'public/offline.html'), 'utf8'),
      serviceWorker: readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8'),
    });
    console.log(JSON.stringify({
      ...result, scope: 'TG12/TG18/TG19 local-only PWA privacy',
      certification: 'source contract only; not production or RLS certification',
    }, null, 2));
    if (!result.clean) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ clean: false, error: String(error), certification: 'not verified' }));
    process.exitCode = 1;
  }
}
