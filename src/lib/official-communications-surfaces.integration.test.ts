import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const migration = source('supabase/migrations/20260913121300_official_communications_surfaces.sql');
const adapter = source('src/lib/studio2-communications.ts');
const feed = source('src/lib/official-announcement-feed.ts');
const feedComponent = source('src/components/OfficialAnnouncementFeed.tsx');
const publicHome = source('src/components/PulseStrip.tsx');
const mySolaris = source('src/components/MySolarisOperationsPanel.tsx');
const organizer = source('src/routes/_authenticated/admin/communications.tsx');

describe('Official Communications surface targeting', () => {
  it('keeps one canonical communication record with explicit destinations', () => {
    expect(migration).toContain("display_surfaces text[] not null default array['delegation_inbox']");
    expect(migration).toContain("'delegation_inbox', 'mysolaris_home', 'public_home'");
    expect(migration).toContain('studio2_create_notice_draft_v2');
    expect(migration).toContain('studio2_update_notice_draft_v2');
    expect(adapter).toContain("'display_surfaces'");
    expect(adapter).toContain("noticeRpc('studio2_create_notice_draft_v2'");
    expect(adapter).toContain("noticeRpc('studio2_update_notice_draft_v2'");
  });

  it('saves content and destinations atomically instead of making a second destination update', () => {
    expect(adapter).toContain('p_display_surfaces: input.displaySurfaces');
    expect(adapter).not.toContain('setStudio2NoticeSurfaces');
    expect(migration).toContain('display_surfaces = v_surfaces');
    expect(migration).toContain('Acknowledgements require the Delegation inbox destination');
  });

  it('keeps legacy notices in the delegation inbox by default', () => {
    expect(migration).toContain("default array['delegation_inbox']::text[]");
    expect(adapter).toContain("row.display_surfaces ?? ['delegation_inbox']");
  });

  it('exposes narrow safe projections instead of anonymous table reads', () => {
    expect(migration).toContain('studio2_public_home_announcements');
    expect(migration).toContain('studio2_mysolaris_home_announcements');
    expect(migration).toContain("grant execute on function public.studio2_public_home_announcements(integer) to anon, authenticated, service_role");
    expect(migration).toContain('where auth.uid() is not null');
    expect(feed).toContain("client.rpc('studio2_public_home_announcements'");
    expect(feed).toContain("client.rpc('studio2_mysolaris_home_announcements'");
    expect(feed).not.toContain("from('studio2_official_notices')");
  });

  it('renders public announcements on Solaris Today and global MySolaris announcements on its home', () => {
    expect(publicHome).toContain('<OfficialAnnouncementFeed surface="public_home" />');
    expect(mySolaris).toContain('<OfficialAnnouncementFeed surface="mysolaris_home" />');
    expect(feedComponent).toContain('Official announcements');
    expect(feedComponent).toContain('Updates for everyone in MySolaris');
  });

  it('keeps delegation targeting and acknowledgement specific to the inbox destination', () => {
    expect(adapter).toContain("includes('delegation_inbox')");
    expect(organizer).toContain('Delegation inbox targeting');
    expect(organizer).toContain('Recipients acknowledge it from MySolaris → Notices.');
    expect(organizer).toContain("acknowledgementRequired: inboxEnabled ? acknowledgementRequired : false");
  });

  it('lets Organizer select all three destinations from one composer', () => {
    expect(organizer).toContain('Where should this appear?');
    expect(organizer).toContain('Delegation inbox');
    expect(organizer).toContain('MySolaris Home');
    expect(organizer).toContain('Public Home');
    expect(organizer).toContain('displaySurfaces.map(noticeSurfaceLabel)');
  });

  it('preserves display surfaces in revisions and superseding drafts', () => {
    expect(migration).toContain('old.display_surfaces');
    expect(migration).toContain('v_source.display_surfaces');
    expect(adapter).toContain('display_surfaces,status,scheduled_at');
  });
});
