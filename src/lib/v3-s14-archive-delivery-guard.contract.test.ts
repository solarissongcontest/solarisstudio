import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const guardRehearsal = readFileSync(
  '.github/scripts/v3-s14-archive-guard-rehearsal.sh',
  'utf8',
);

describe('System V3 S14 Archive delivery guard evidence', () => {
  it('treats only pending or processing task deliveries as claimable work', () => {
    expect(guardRehearsal.match(/status in \('pending','processing'\)/g)?.length).toBe(2);
    expect(guardRehearsal).not.toContain("status in ('pending','processing','failed')");
    expect(guardRehearsal).toContain(
      'canonical edition.blocker delivery projection was not pending before archive',
    );
    expect(guardRehearsal).toContain(
      'archive left edition.blocker push delivery claimable',
    );
  });

  it('keeps the destructive guard rehearsal isolated from hosted Supabase', () => {
    expect(guardRehearsal).toContain('Refusing hosted Supabase rehearsal');
    expect(guardRehearsal).toContain('bun run scripts/check-v3-production-isolation.ts');
    expect(guardRehearsal).not.toMatch(/supabase\.co/i);
  });
});
