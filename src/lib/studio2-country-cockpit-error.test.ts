import { describe, expect, it } from 'vitest';

import { countryCockpitError } from './studio2-country-cockpit';

describe('countryCockpitError', () => {
  it('preserves an ordinary Error without exposing extra infrastructure data', () => {
    const input = new Error('Edition context is unavailable.');
    expect(countryCockpitError(input)).toBe(input);
  });

  it('surfaces Supabase SQLSTATE and message instead of swallowing the failure', () => {
    const result = countryCockpitError({
      code: '42501',
      message: 'Organizer Confirmation read capability required',
      details: 'private details must not be surfaced',
      hint: 'internal hint must not be surfaced',
    });

    expect(result.message).toBe(
      'Country cockpit request failed (42501): Organizer Confirmation read capability required',
    );
    expect(result.message).not.toContain('private details');
    expect(result.message).not.toContain('internal hint');
  });

  it('falls back to a stable diagnostic-safe message for unknown error shapes', () => {
    expect(countryCockpitError({ unexpected: true }).message).toBe(
      'The country cockpit could not complete that request.',
    );
  });
});
