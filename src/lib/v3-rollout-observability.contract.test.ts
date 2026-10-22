import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./v3-rollout-observability.ts', import.meta.url), 'utf8');

describe('V3 rollout observability architecture boundary', () => {
  it('does not create another telemetry transport or database client', () => {
    for (const forbidden of [
      '@supabase',
      'supabase.',
      'fetch(',
      '.insert(',
      'localStorage',
      'sessionStorage',
      'navigator.',
      'window.',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('does not trust a client clock or create polling', () => {
    for (const forbidden of ['Date.now(', 'new Date(', 'setInterval(', 'setTimeout(']) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain('serverObservedAt');
  });

  it('keeps raw identity, contest content and error text out of the event contract', () => {
    expect(source).not.toContain('userId:');
    expect(source).not.toContain('delegationId:');
    expect(source).not.toContain('countryId:');
    expect(source).not.toContain('song:');
    expect(source).not.toContain('artist:');
    expect(source).not.toContain('errorMessage:');
    expect(source).toContain('allowsRawUserIdentifiers: false');
    expect(source).toContain('allowsRawContestContent: false');
    expect(source).toContain('allowsRawErrorMessages: false');
  });

  it('cannot declare legacy retirement safe merely because telemetry exists', () => {
    expect(source).toContain("target === 'retire_legacy'");
    expect(source).toContain("id: 'zero-observed-legacy-fallbacks'");
  });
});
