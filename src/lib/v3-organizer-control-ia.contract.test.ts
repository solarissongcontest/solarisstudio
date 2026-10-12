import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./v3-organizer-control-ia.ts', import.meta.url), 'utf8');

describe('V3 Organizer Control architecture boundary', () => {
  it('does not own capability evaluation, mutations, persistence or network traffic', () => {
    for (const forbidden of [
      '@supabase',
      'supabase.',
      'fetch(',
      'useMutation',
      'useQuery',
      'localStorage',
      'sessionStorage',
      'role ===',
      'role.includes',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('does not duplicate the Organizer safety risk/confirmation model', () => {
    for (const forbidden of ['riskTier', 'reauthenticationRequired', 'confirmationRequired', 'undoWindow']) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('keeps advanced, live and exception work outside Control', () => {
    expect(source).toContain("advancedDiagnosticsOwner: 'more'");
    expect(source).toContain("liveOperationsOwner: 'live'");
    expect(source).toContain("exceptionQueueOwner: 'tasks'");
    expect(source).toContain('directMutationFromControlTile: false');
  });
});
