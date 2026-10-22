import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261021163000_v3_s14_failed_task_delivery_evidence.sql',
  'utf8',
);

describe('System V3 S14 failed Organizer-task delivery evidence', () => {
  it('suppresses only non-terminal pending/in-flight delivery work', () => {
    expect(migration).toContain(
      "delivery.status in ('pending', 'processing')",
    );
    expect(migration).not.toContain(
      "delivery.status in ('pending', 'processing', 'failed')",
    );
  });

  it('documents failed delivery attempts as retained operational evidence', () => {
    expect(migration).toContain(
      'A failed delivery is different: it is',
    );
    expect(migration).toContain(
      'failed` remains immutable delivery evidence and keeps its original error',
    );
  });
});
