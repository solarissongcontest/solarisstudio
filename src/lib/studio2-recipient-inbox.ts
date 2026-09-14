import { supabase } from "@/integrations/supabase/client";
import {
  noticeInboxState,
  type NoticeAudience,
  type NoticeDisplaySurface,
  type NoticeEditionGroup,
  type NoticeReceipt,
  type NoticeSeverity,
  type NoticeState,
  type NoticeType,
  type OperationalNotice,
} from "@/lib/official-communications";
import type { Studio2NoticeInboxItem } from "@/lib/studio2-communications";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";

type RecipientInboxRow = {
  id: string;
  edition_id: string | null;
  notice_type: NoticeType;
  title: string;
  body: string;
  severity: NoticeSeverity;
  audience: NoticeAudience;
  audience_group: NoticeEditionGroup | null;
  country_ids: string[] | null;
  acknowledgement_required: boolean;
  display_surfaces: NoticeDisplaySurface[] | null;
  status: NoticeState;
  scheduled_at: string | null;
  sent_at: string | null;
  cancelled_at: string | null;
  archived_at: string | null;
  superseded_by_id: string | null;
  revision: number;
  created_at: string;
  recipient_user_id: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  acknowledged_at: string | null;
  receipt_archived_at: string | null;
};

export async function loadStudio2RecipientNoticeInbox(
  editionId?: string | null,
): Promise<Studio2NoticeInboxItem[]> {
  if (!(await isStudio2FeatureEnabled("official_communications", editionId ?? null))) {
    return [];
  }

  const { data, error } = await supabase.rpc("studio2_my_notice_inbox", {
    p_edition_id: editionId ?? null,
  } as never);
  if (error) throw error;

  return ((data ?? []) as RecipientInboxRow[]).map((row) => {
    const notice: OperationalNotice = {
      id: row.id,
      editionId: row.edition_id,
      noticeType: row.notice_type,
      title: row.title,
      body: row.body,
      severity: row.severity,
      audience: row.audience,
      audienceGroup: row.audience_group,
      countryIds: row.country_ids ?? [],
      acknowledgementRequired: row.acknowledgement_required,
      displaySurfaces: row.display_surfaces ?? ["delegation_inbox"],
      state: row.status,
      scheduledAt: row.scheduled_at,
      sentAt: row.sent_at,
      cancelledAt: row.cancelled_at,
      archivedAt: row.archived_at,
      supersededById: row.superseded_by_id,
      revision: row.revision,
    };

    const receipt: NoticeReceipt | null = row.recipient_user_id
      ? {
          noticeId: row.id,
          recipientUserId: row.recipient_user_id,
          deliveredAt: row.delivered_at,
          openedAt: row.opened_at,
          acknowledgedAt: row.acknowledged_at,
          archivedAt: row.receipt_archived_at,
        }
      : null;

    return {
      notice,
      receipt,
      inboxState: noticeInboxState(notice, receipt),
    };
  });
}
