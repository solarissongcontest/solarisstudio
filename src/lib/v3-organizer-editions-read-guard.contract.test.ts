import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = readFileSync('src/routes/_authenticated/admin/editions.tsx', 'utf8');

describe('Organizer Editions read and permission safety', () => {
  it('fails closed rather than interpreting partial or failed reads as an empty contest', () => {
    expect(route).toContain('const readsUnavailable = editionReads.some((query) => query.isError || query.error != null);');
    expect(route).toContain('const snapshotReady = editionReads.every((query) => query.isSuccess && query.error == null);');
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

  it('never reopens a review after permission verification is lost during an asynchronous preflight', () => {
    expect(route).toContain('const verifiedAccessRef = useRef(canManageEditions);');
    expect(route).toContain('verifiedAccessRef.current = canManageEditions;');
    expect(route).toContain('Organizer verification was lost while preparing the edition review.');
    expect(route).toContain('Organizer verification was lost before the edition lifecycle action.');
    expect(route).toContain('Organizer verification was lost while hiding show publication.');
    expect(route).toContain('Organizer verification was lost during edition publication changes.');
    expect(route).toContain('Organizer verification was lost before deletion.');
    expect(route).toContain('Reconcile any completed changes before retrying.');
  });

  it('retries only failed queries through explicit user action', () => {
    for (const query of ['editionsQuery', 'countriesQuery', 'showsQuery', 'participantsQuery', 'organizerQuery']) {
      expect(route).toContain(`if (${query}.isError || ${query}.error != null) void ${query}.refetch();`);
    }
    expect(route).not.toContain('refetchInterval');
  });
});
