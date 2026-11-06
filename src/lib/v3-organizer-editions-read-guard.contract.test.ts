import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = readFileSync('src/routes/_authenticated/admin/editions.tsx', 'utf8');

describe('Organizer Editions read and permission safety', () => {
  it('fails closed rather than interpreting partial or failed reads as an empty contest', () => {
    expect(route).toContain('const readsUnavailable = editionReads.some((query) => query.isError);');
    expect(route).toContain('const snapshotReady = editionReads.every((query) => query.isSuccess);');
    expect(route).toContain('!snapshotReady ? (');
    expect(route).toContain('title={readsUnavailable ? "Edition data unavailable" : "Verifying edition administration"}');
    expect(route).toContain('Retry failed reads');
    expect(route).not.toContain('editionsLoading');
  });

  it('permits management only with complete source reads and confirmed Organizer access', () => {
    expect(route).toContain('const canManageEditions = snapshotReady && isOrganizer === true;');
    expect(route).toContain('disabled={!canManageEditions}');
    expect(route).toContain('Organizer access required');
    expect(route).toContain('Edition administration requires verified Organizer access and complete edition data.');
  });

  it('invalidates an open destructive review on lost authority and preserves fresh server revalidation', () => {
    expect(route).toContain('setLifecycleReview(null);\n      setCreateOpen(false);');
    expect(route).toContain('Cannot review an edition while Organizer access or required edition data is unverified.');
    expect(route).toContain('No change was applied; reload the workspace and start a new review.');
    expect(route).toContain('const fresh = await revalidateEditionLifecycleReview(review);');
  });

  it('retries only failed queries through explicit user action', () => {
    for (const query of ['editionsQuery', 'countriesQuery', 'showsQuery', 'participantsQuery', 'organizerQuery']) {
      expect(route).toContain(`if (${query}.isError) void ${query}.refetch();`);
    }
    expect(route).not.toContain('refetchInterval');
  });
});
