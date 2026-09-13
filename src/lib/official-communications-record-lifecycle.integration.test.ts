import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const migration = source('supabase/migrations/20260913123000_official_communications_archive_delete.sql');
const adapter = source('src/lib/studio2-communications.ts');
const organizer = source('src/routes/_authenticated/admin/communications.tsx');

describe('Official Communications record lifecycle', () => {
  it('archives and restores whole communications separately from recipient inbox archive', () => {
    expect(migration).toContain('studio2_archive_communication');
    expect(migration).toContain('studio2_restore_communication');
    expect(adapter).toContain('archiveStudio2Communication');
    expect(adapter).toContain('restoreStudio2Communication');
    expect(adapter).toContain("rpc('studio2_archive_notice'");
    expect(adapter).toContain("noticeRpc('studio2_archive_communication'");
    expect(adapter).toContain("noticeRpc('studio2_restore_communication'");
  });

  it('removes archived communications from all audience-facing reads', () => {
    expect(migration).toContain('n.archived_at is null');
    expect(migration).toContain('archived_at is null\n      and scheduled_at');
    expect(migration).toContain("archived_at is null\n    or public.studio2_can_manage_communications");
    expect(adapter).toContain('.filter((row) => !row.archived_at)');
  });

  it('prevents archived scheduled or manual publication', () => {
    expect(migration).toContain('Restore this communication before publishing it');
    expect(migration).toContain('Restore this communication before scheduling it');
    expect(migration).toContain("status = case when status = 'scheduled' then 'draft'");
  });

  it('requires published communications to be archived before permanent deletion', () => {
    expect(migration).toContain('studio2_delete_communication');
    expect(migration).toContain('Archive a published communication before deleting it permanently');
    expect(migration).toContain('studio2_notice_deletion_audit');
    expect(migration).toContain('A deletion reason is required');
    expect(adapter).toContain('deleteStudio2Communication');
  });

  it('exposes clear Organizer archive, restore and permanent delete controls', () => {
    expect(organizer).toContain('Archive / remove everywhere');
    expect(organizer).toContain('Restore to its destinations');
    expect(organizer).toContain('Delete permanently');
    expect(organizer).toContain("state?: CommunicationsStateFilter");
    expect(organizer).toContain("<option value=\"archived\">Archived</option>");
  });

  it('keeps deletion tombstones private and organizer lifecycle functions authenticated', () => {
    expect(migration).toContain('create table if not exists private.studio2_notice_deletion_audit');
    expect(migration).toContain('revoke all on table private.studio2_notice_deletion_audit from public, anon, authenticated');
    expect(migration).toContain('revoke all on function public.studio2_delete_communication');
    expect(migration).toContain('grant execute on function public.studio2_delete_communication(uuid, text) to authenticated, service_role');
  });
});
