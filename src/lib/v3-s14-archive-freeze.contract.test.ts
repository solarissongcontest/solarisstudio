import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261020130000_v3_s14_archive_invariant_forward_fixes.sql',
  'utf8',
);
const archiveGuard = readFileSync(
  '.github/scripts/v3-s14-archive-delete-guard-rehearsal.sh',
  'utf8',
);
const archiveSystem = readFileSync(
  '.github/scripts/v3-s14-archive-system-rehearsal.sh',
  'utf8',
);
const negativeGuard = readFileSync(
  '.github/scripts/v3-s14-archive-guard-rehearsal.sh',
  'utf8',
);

describe('System V3 S14 archived-edition freeze contract', () => {
  it('freezes canonical current-workflow storage once runtime is archived', () => {
    expect(migration).toContain('private.v3_guard_archived_edition_workflow_write()');
    expect(migration).toContain('Archived edition workflow is read-only.');
    for (const table of [
      'submission_rounds',
      'submissions',
      'studio2_confirmation_requirements',
      'internal_entries',
      'national_finals',
      'national_final_entries',
      'next_in_line_submissions',
      'entries',
      'participants',
      'studio2_media_asset_reviews',
      'shows',
      'results',
      'jury_votes',
      'jury_ballot_statuses',
      'jury_voting_windows',
      'televote_votes',
      'studio2_show_publication_controls',
      'studio2_result_operations',
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain('before insert or update or delete');

    expect(archiveGuard).toContain('archived show publication mutation');
    expect(archiveGuard).toContain('archived result operation mutation');
    expect(archiveGuard).toContain('Archived edition workflow is read-only.');
    expect(negativeGuard).toContain('Archive Freeze Fixture');
    expect(negativeGuard).toContain('studio2_result_operations');
  });

  it('resolves dependent Entry and national-final content through its canonical parent edition', () => {
    expect(migration).toContain('private.v3_archived_workflow_row_edition(p_row jsonb)');
    expect(migration).toContain("p_row ->> 'submission_id'");
    expect(migration).toContain('from public.submissions submission');
    expect(migration).toContain("p_row ->> 'national_final_id'");
    expect(migration).toContain('from public.national_finals national_final');
    expect(migration).toContain('join public.submissions submission on submission.id = national_final.submission_id');
    expect(migration).toContain("p_row ->> 'source_submission_id'");
    expect(migration).toContain("p_row ->> 'round_id'");
    expect(migration).toContain("p_row ->> 'participant_id'");
    expect(migration).toContain("p_row ->> 'entry_id'");
  });

  it('checks both OLD and NEW edition scope so rows cannot be moved out of Archive to escape the freeze', () => {
    expect(migration).toContain("if tg_op <> 'INSERT' then");
    expect(migration).toContain("if tg_op <> 'DELETE' then");
    expect(migration).toContain('v_old_edition_id');
    expect(migration).toContain('v_new_edition_id');
    expect(migration).toContain('runtime.edition_id in (v_old_edition_id, v_new_edition_id)');
  });

  it('keeps history, audit and cleanup stores outside the terminal workflow trigger set', () => {
    for (const table of [
      'submission_versions',
      'submission_review_history',
      'submission_ip_history',
      'submission_drafts',
      'edit_tokens',
      'submission_browser_sessions',
    ]) {
      expect(migration).not.toContain(`'${table}'`);
    }
  });

  it('keeps old public lifecycle readers terminal without making legacy status authoritative', () => {
    expect(migration).toContain('private.v3_sync_archived_edition_legacy_status()');
    expect(migration).toContain("set status = 'completed'");
    expect(migration).toContain('one-way compatibility projection');
    expect(migration).toContain('private.v3_guard_archived_legacy_edition_status()');
    expect(migration).toContain('Archived edition lifecycle is read-only.');
    expect(archiveGuard).toContain('archived legacy lifecycle revival');
    expect(archiveSystem).toContain("== 'completed'");
  });

  it('keeps destructive archive verification local-only', () => {
    expect(archiveGuard).toContain('bun run scripts/check-v3-production-isolation.ts');
    expect(archiveGuard).toContain('Refusing hosted Supabase rehearsal');
    expect(archiveGuard).not.toMatch(/https:\/\/[^\s"']*supabase\.co/i);
  });
});
