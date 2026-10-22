import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./v3-entry-version-binding.ts', import.meta.url), 'utf8');

describe('V3 entry version architecture boundary', () => {
  it('stays a pure domain contract with no database, network or UI ownership', () => {
    for (const forbidden of [
      '@supabase',
      'supabase.',
      'fetch(',
      'localStorage',
      'sessionStorage',
      'useQuery',
      'useMutation',
      'useEffect',
      'react',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('never manufactures authoritative entry timing from the client clock', () => {
    expect(source).not.toContain('Date.now(');
    expect(source).not.toContain('new Date(');
    expect(source).toContain("submittedAt: assertTimestamp(input.submittedAt, 'submittedAt')");
    expect(source).toContain("reviewedAt: assertTimestamp(input.reviewedAt, 'reviewedAt')");
    expect(source).toContain("submittedAt: assertTimestamp(input.restoredAt, 'restoredAt')");
  });

  it('keeps legacy unversioned rows explicitly below V3 review authority', () => {
    expect(source).toContain("authority: 'legacy_unversioned'");
    expect(source).toContain('canBindV3Review: false');
    expect(source).toContain('canSatisfyImmutableVersionGate: false');
  });
});
