import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const adminNav = source('src/components/admin/admin-navigation.ts');
const adminRoute = source('src/routes/_authenticated/admin/communications.tsx');
const hodRoute = source('src/routes/_authenticated/country-hub/notices.tsx');
const adapter = source('src/lib/studio2-communications.ts');
const hodModel = source('src/lib/hod-workspace-model.ts');
const migration = source('supabase/migrations/20260911194000_studio2_official_communications_full.sql');

describe('Studio 2 Official Communications integration', () => {
  it('is discoverable from Organizer navigation and the HOD workspace', () => {
    expect(adminNav).toContain('"Communications",');
    expect(adminNav).toContain('"/admin/communications"');
    expect(hodModel).toContain("href: '/country-hub/notices'");
    expect(hodRoute).toContain("createFileRoute('/_authenticated/country-hub/notices')");
  });

  it('uses one secured notice lifecycle rather than a second communications store', () => {
    expect(adapter).toContain("isStudio2FeatureEnabled('official_communications')");
    expect(adapter).toContain("from('studio2_official_notices')");
    expect(adapter).toContain("from('studio2_notice_receipts')");
    expect(adapter).toContain("from('studio2_notice_versions')");
    expect(adapter).toContain("studio2_create_notice_draft");
    expect(adapter).toContain("studio2_update_notice_draft");
    expect(adapter).toContain("studio2_schedule_notice");
    expect(adapter).toContain("studio2_publish_notice");
    expect(adapter).toContain("studio2_cancel_notice");
    expect(adapter).toContain("studio2_create_superseding_notice_draft");
  });

  it('supports the Phase 5 organizer lifecycle and audience model', () => {
    expect(adminRoute).toContain('NOTICE_TYPES');
    expect(adminRoute).toContain('NOTICE_AUDIENCES');
    expect(adminRoute).toContain('NOTICE_EDITION_GROUPS');
    expect(adminRoute).toContain('Save draft');
    expect(adminRoute).toContain('Schedule');
    expect(adminRoute).toContain('Publish now');
    expect(adminRoute).toContain('Revision history');
    expect(adminRoute).toContain('createSupersedingStudio2NoticeDraft');
    expect(adminRoute).toContain("audience === 'specific_countries'");
    expect(adminRoute).toContain('acknowledgementRequired');
  });

  it('supports unread, read, acknowledgement and archive states on the HOD side', () => {
    expect(hodRoute).toContain("'unread'");
    expect(hodRoute).toContain("'read'");
    expect(hodRoute).toContain("'acknowledgement_required'");
    expect(hodRoute).toContain("'acknowledged'");
    expect(hodRoute).toContain("'archived'");
    expect(hodRoute).toContain('markStudio2NoticeOpened');
    expect(hodRoute).toContain('acknowledgeStudio2InboxNotice');
    expect(hodRoute).toContain('archiveStudio2Notice');
  });

  it('enforces server-side lifecycle, permissions, revisions and scheduled publication', () => {
    expect(migration).toContain("status in ('draft', 'scheduled', 'published', 'cancelled', 'superseded')");
    expect(migration).toContain('studio2_notice_versions');
    expect(migration).toContain('studio2_require_communications_access');
    expect(migration).toContain("'communications.send'");
    expect(migration).toContain('studio2_publish_due_notices');
    expect(migration).toContain('solaris-studio2-publish-due-notices');
    expect(migration).toContain('studio2_mark_notice_opened');
    expect(migration).toContain('studio2_archive_notice');
  });

  it('does not introduce a second Rules or Trust & Integrity implementation', () => {
    expect(adminRoute).not.toContain('/rules');
    expect(adminRoute).not.toContain('/integrity');
    expect(adapter).not.toContain('rules_engine');
    expect(migration).not.toContain('friend_voting');
  });
});
