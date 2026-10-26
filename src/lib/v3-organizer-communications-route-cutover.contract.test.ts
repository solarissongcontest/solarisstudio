import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from './v3-organizer-capability-registry';

const route = readFileSync(
  resolve(process.cwd(), 'src/routes/_authenticated/admin/communications.tsx'),
  'utf8',
);
const lifecycle = readFileSync(
  resolve(process.cwd(), 'src/lib/v3-official-communications-commands.ts'),
  'utf8',
);
const drafts = readFileSync(
  resolve(process.cwd(), 'src/lib/v3-official-communications-draft-commands.ts'),
  'utf8',
);
const lifecycleMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261024235910_v3_official_communications_command_authority.sql'),
  'utf8',
);
const draftMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261024235920_v3_official_communications_draft_authority.sql'),
  'utf8',
);

describe('V3 Organizer Official Communications route cutover', () => {
  it('remounts route-local state when shell-owned edition context changes', () => {
    expect(route).toContain("return <CommunicationsCentre key={editionId || 'unscoped'} />");
  });

  it('uses the governed Organizer adapter for every mutating Communications operation', () => {
    expect(route).toContain('saveOrganizerNoticeDraft({');
    expect(route).toContain('supersedeOrganizerNotice({');
    expect(route).toContain('prepareOrganizerNoticeLifecycleReview({');
    expect(route).toContain('commitOrganizerNoticeLifecycleReview({');

    for (const legacyCall of [
      'createStudio2NoticeDraft(',
      'updateStudio2NoticeDraft(',
      'createSupersedingStudio2NoticeDraft(',
      'scheduleStudio2Notice(',
      'publishStudio2Notice(',
      'cancelStudio2Notice(',
      'archiveStudio2Communication(',
      'restoreStudio2Communication(',
      'deleteStudio2Communication(',
    ]) {
      expect(route).not.toContain(legacyCall);
    }
  });

  it('keeps compatibility reads while removing legacy mutation authority from the route', () => {
    expect(route).toContain('loadStudio2Notices');
    expect(route).toContain('loadStudio2NoticeRevisions');
    expect(route).not.toContain("archiveStudio2Communication,");
    expect(route).not.toContain("publishStudio2Notice,");
  });

  it('freezes the editor base revision instead of silently adopting a background query refresh', () => {
    expect(route).toContain("const [editingBase, setEditingBase] = useState<OperationalNotice | null>(null)");
    expect(route).toContain('setEditingBase(cloneNotice(notice))');
    expect(route).toContain('setEditingBase(null)');

    const existingStart = route.indexOf('function currentExistingNotice()');
    const saveStart = route.indexOf('async function saveCurrentDraft()');
    const existing = route.slice(existingStart, saveStart);

    expect(existing).toContain('editingBase.id !== editingId');
    expect(existing).toContain('editingBase.editionId !== editionId');
    expect(existing).toContain('return cloneNotice(editingBase)');
    expect(existing).not.toContain('notices.find(');
  });

  it('saves composer state canonically before schedule or publish preflight', () => {
    const publicationReviewStart = route.indexOf('const preparePublicationReview = useMutation({');
    const lifecycleReviewStart = route.indexOf('const prepareLifecycleReview = useMutation({');
    const publicationReview = route.slice(publicationReviewStart, lifecycleReviewStart);

    expect(publicationReview).toContain('const draft = await saveCurrentDraft()');
    expect(publicationReview).toContain('prepareOrganizerNoticeLifecycleReview({');
    expect(publicationReview.indexOf('saveCurrentDraft()')).toBeLessThan(
      publicationReview.indexOf('prepareOrganizerNoticeLifecycleReview({'),
    );
  });

  it('re-reads exact canonical notice state before governed commit', () => {
    const commitStart = route.indexOf('const commitLifecycleReview = useMutation({');
    const supersedeStart = route.indexOf('const supersedeNotice = useMutation({');
    const commit = route.slice(commitStart, supersedeStart);

    expect(commit).toContain('loadFreshNotice(pending.prepared.noticeId)');
    expect(commit).toContain('commitOrganizerNoticeLifecycleReview({');
    expect(commit.indexOf('loadFreshNotice(pending.prepared.noticeId)')).toBeLessThan(
      commit.indexOf('commitOrganizerNoticeLifecycleReview({'),
    );
  });

  it('shows authoritative preflight evidence before the final consequential action', () => {
    expect(route).toContain('lifecycleReview.prepared.preflight.riskClass');
    expect(route).toContain('lifecycleReview.prepared.preflight.currentRevision');
    expect(route).toContain('lifecycleReview.prepared.preflight.recipientReceiptCount');
    expect(route).toContain('Run preflight & prepare final review');
    expect(route).toContain('The same frozen edition, notice revision and operation identity will be used for commit.');
  });

  it('is backed by the landed versioned, idempotent and reconcilable System command authority', () => {
    expect(lifecycle).toContain('"v3_preflight_notice_lifecycle"');
    expect(lifecycle).toContain('"v3_execute_notice_lifecycle"');
    expect(lifecycle).toContain('"studio2_reconcile_operation"');
    expect(lifecycle).toContain('p_idempotency_key: operationId');
    expect(drafts).toContain('"v3_create_notice_draft"');
    expect(drafts).toContain('"v3_update_notice_draft"');
    expect(drafts).toContain('"v3_create_superseding_notice_draft"');
    expect(lifecycleMigration).toContain("message = 'VERSION_CONFLICT'");
    expect(lifecycleMigration).toContain('private.studio2_claim_operation(');
    expect(draftMigration).toContain("message = 'VERSION_CONFLICT'");
    expect(draftMigration).toContain('private.studio2_claim_operation(');
  });

  it('promotes the capability only after the governed consumer and System authority are both present', () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === 'operations-communications',
    );
    expect(capability?.migrationStatus).toBe('cutover');
  });
});
