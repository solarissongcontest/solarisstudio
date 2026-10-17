import { describe, expect, it } from 'vitest';

import { loadStudio2CountryCockpit } from './studio2-country-cockpit';

function rpcFailure(error: unknown) {
  return {
    rpc: async () => ({ data: null, error }),
  };
}

describe('Country cockpit diagnostic-safe errors', () => {
  it('turns platform/capability denials into an actionable Error', async () => {
    await expect(
      loadStudio2CountryCockpit(
        '00000000-0000-0000-0000-000000000001',
        rpcFailure({ code: '42501', message: 'Organizer or confirmation.manage capability required' }),
      ),
    ).rejects.toThrow('Check the Organizer Confirmation capability and current platform operating mode.');
  });

  it('identifies backend deployment parity failures without exposing raw PostgREST objects', async () => {
    await expect(
      loadStudio2CountryCockpit(
        '00000000-0000-0000-0000-000000000001',
        rpcFailure({ code: 'PGRST202', message: 'Could not find the function public.studio2_country_cockpit' }),
      ),
    ).rejects.toThrow('Check Supabase migration parity before retrying.');
  });

  it('keeps invalid edition context explicit before making the request', async () => {
    let calls = 0;
    const client = {
      rpc: async () => {
        calls += 1;
        return { data: [], error: null };
      },
    };

    await expect(loadStudio2CountryCockpit('   ', client)).rejects.toThrow(
      'Country cockpit requires an explicit edition scope.',
    );
    expect(calls).toBe(0);
  });

  it('preserves existing Error instances for already-normalized domain failures', async () => {
    const existing = new Error('Canonical Organizer projection unavailable.');
    await expect(
      loadStudio2CountryCockpit(
        '00000000-0000-0000-0000-000000000001',
        rpcFailure(existing),
      ),
    ).rejects.toBe(existing);
  });
});
