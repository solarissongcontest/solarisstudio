import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const archiveInvariantFixes = readFileSync(
  'supabase/migrations/20261020130000_v3_s14_archive_invariant_forward_fixes.sql',
  'utf8',
);
const archiveRuntimeUpdateGuard = readFileSync(
  'supabase/migrations/20261020140000_v3_s14_archive_runtime_update_guard.sql',
  'utf8',
);
const controlRoom = readFileSync('src/lib/studio2-control-room.ts', 'utf8');
const workflow = readFileSync('.github/workflows/v3-s14-archive-system-rehearsal.yml', 'utf8');
const deleteGuard = readFileSync(
  '.github/scripts/v3-s14-archive-delete-guard-rehearsal.sh',
  'utf8',
);
const eventVocabulary = readFileSync(
  '.github/scripts/v3-s14-edition-event-vocabulary-rehearsal.sh',
  'utf8',
);
const taskResurrection = readFileSync(
  '.github/scripts/v3-s14-archive-task-resurrection-rehearsal.sh',
  'utf8',
);

describe('System V3 S14 Archive review-fix contract', () => {
  it('makes archived runtime deletion fail closed at the database trigger boundary', () => {
    expect(archiveInvariantFixes).toContain("if tg_op = 'DELETE' then");
    expect(archiveInvariantFixes).toContain("old.state = 'archived'");
    expect(archiveInvariantFixes).toContain('Archived edition runtime is irreversible.');
    expect(archiveInvariantFixes).toContain('create trigger v3_guard_archive_runtime_delete');
    expect(archiveInvariantFixes).toContain(
      'before delete on public.studio2_edition_runtime',
    );
    expect(deleteGuard).toContain('delete from public.studio2_edition_runtime');
    expect(deleteGuard).toContain('service-role archived runtime deletion unexpectedly succeeded');
    expect(deleteGuard).toContain('Archived edition runtime is irreversible.');
    expect(deleteGuard).toContain('Refusing hosted Supabase rehearsal');
    expect(deleteGuard).not.toMatch(/supabase\.co/i);
  });

  it('rejects privileged direct insertion of an archived runtime row', () => {
    expect(archiveInvariantFixes).toContain("if tg_op = 'INSERT' then");
    expect(archiveInvariantFixes).toContain("new.state = 'archived'");
    expect(archiveInvariantFixes).toContain('create trigger v3_guard_archive_runtime_insert');
    expect(archiveInvariantFixes).toContain(
      'before insert on public.studio2_edition_runtime',
    );
    expect(deleteGuard).toContain("insert into public.studio2_edition_runtime(edition_id,state,subsystems,version,updated_by)");
    expect(deleteGuard).toContain("'archived',private.studio2_default_subsystems('archived')");
    expect(deleteGuard).toContain('service-role direct archived runtime insertion unexpectedly succeeded');
    expect(deleteGuard).toContain('Archive transition must use the canonical V3 lifecycle command.');
    expect(deleteGuard).toContain('failed archived insert did not roll back the fixture runtime atomically');
  });

  it('installs the archive runtime guard for UPDATE transitions as well as INSERT and DELETE', () => {
    expect(archiveInvariantFixes).toContain("if new.state = 'archived'");
    expect(archiveInvariantFixes).toContain("old.state = 'archived'");
    expect(archiveRuntimeUpdateGuard).toContain(
      'drop trigger if exists v3_guard_archive_runtime_update',
    );
    expect(archiveRuntimeUpdateGuard).toContain(
      'create trigger v3_guard_archive_runtime_update',
    );
    expect(archiveRuntimeUpdateGuard).toContain(
      'before update of state on public.studio2_edition_runtime',
    );
    expect(archiveRuntimeUpdateGuard).toContain(
      'private.v3_guard_archive_runtime_transition()',
    );
  });

  it('freezes the reviewed runtime version before any awaited feature-gate work', () => {
    const transitionStart = controlRoom.indexOf('async transitionEdition(');
    const capture = controlRoom.indexOf('const reviewedExpectedVersion =', transitionStart);
    const rememberedVersion = controlRoom.indexOf(
      'reviewedRuntimeVersions.get(request.editionId)',
      capture,
    );
    const featureGate = controlRoom.indexOf('await requireEnabled(request.editionId);', transitionStart);
    const apply = controlRoom.indexOf('return transitionEditionV3({', featureGate);

    expect(transitionStart).toBeGreaterThanOrEqual(0);
    expect(capture).toBeGreaterThan(transitionStart);
    expect(rememberedVersion).toBeGreaterThan(capture);
    expect(featureGate).toBeGreaterThan(rememberedVersion);
    expect(apply).toBeGreaterThan(featureGate);
    expect(controlRoom).toContain('const expectedVersion = reviewedExpectedVersion;');
  });

  it('runs Archive rehearsal against the exact pull-request head, not a synthetic merge ref', () => {
    expect(workflow).toContain(
      'ref: ${{ github.event.pull_request.head.sha || github.sha }}',
    );
    expect(workflow.match(/Checkout exact feature head/g)?.length).toBe(2);
    expect(workflow.match(/Verify exact feature head/g)?.length).toBe(2);
    expect(workflow).toContain('actual="$(git rev-parse HEAD)"');
    expect(workflow).toContain('Expected Archive feature head');
    expect(workflow).toContain('.github/scripts/v3-s14-archive-delete-guard-rehearsal.sh');
  });

  it('normalizes the full local project identity before every follow-up isolation guard', () => {
    for (const verifier of [eventVocabulary, taskResurrection]) {
      expect(verifier).toContain('SUPABASE_PROJECT_ID=local SUPABASE_PROJECT_REF=local');
      expect(verifier).toContain(
        'E2E_SUPABASE_PROJECT_ID=local E2E_SUPABASE_PROJECT_REF=local',
      );
      expect(verifier).toContain(
        'VITE_SUPABASE_PROJECT_ID=local VITE_SUPABASE_PROJECT_REF=local',
      );
      expect(verifier).toContain('CONFIRMATIONS_SUPABASE_URL="$API_URL"');
      expect(verifier).toContain('E2E_TARGET=local');
      const identityExport = verifier.indexOf('SUPABASE_PROJECT_ID=local');
      const isolationGuard = verifier.indexOf('bun run scripts/check-v3-production-isolation.ts');
      expect(identityExport).toBeGreaterThanOrEqual(0);
      expect(isolationGuard).toBeGreaterThan(identityExport);
    }
  });
});
