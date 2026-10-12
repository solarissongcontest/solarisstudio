import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./v3-organizer-ia.ts', import.meta.url), 'utf8');

describe('V3 Organizer IA architecture boundary', () => {
  it('does not own authorization, persistence or network traffic', () => {
    for (const forbidden of [
      '@supabase',
      'supabase.',
      'fetch(',
      'localStorage',
      'sessionStorage',
      'useQuery',
      'useMutation',
      'useEffect',
      'role ===',
      'role.includes',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('does not create a second organizer risk model or live-state machine', () => {
    expect(source).not.toContain('reauth');
    expect(source).not.toContain('riskTier');
    expect(source).not.toContain('delayed_show');
    expect(source).not.toContain('voting_extended');
  });

  it('does not trust the device clock for upcoming operations', () => {
    expect(source).not.toContain('Date.now(');
    expect(source).not.toContain('new Date(');
    expect(source).toContain("timestamp(input.serverTime, 'serverTime')");
  });

  it('keeps notifications separate from canonical task truth', () => {
    expect(source).toContain('const activeTasks = input.tasks');
    expect(source).toContain('const unresolvedInbox = input.inbox');
  });
});
