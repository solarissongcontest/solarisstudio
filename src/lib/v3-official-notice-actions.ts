import { supabase } from "@/integrations/supabase/client";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";

type NoticeActionClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

const client = supabase as unknown as NoticeActionClient;

async function requireOfficialCommunications(editionId: string | null) {
  if (!(await isStudio2FeatureEnabled("official_communications", editionId))) {
    throw new Error("Official Communications is not enabled for this edition.");
  }
}

async function receiptAction(
  editionId: string | null,
  rpcName: string,
  args: Record<string, unknown>,
) {
  await requireOfficialCommunications(editionId);
  const { error } = await client.rpc(rpcName, args);
  if (error) throw error;
}

export function markV3OfficialNoticeOpened(noticeId: string, editionId: string | null) {
  return receiptAction(editionId, "studio2_mark_notice_opened", {
    p_notice_id: noticeId,
  });
}

export function acknowledgeV3OfficialNotice(noticeId: string, editionId: string | null) {
  return receiptAction(editionId, "studio2_acknowledge_notice", {
    p_notice_id: noticeId,
  });
}

export function archiveV3OfficialNotice(
  noticeId: string,
  archived: boolean,
  editionId: string | null,
) {
  return receiptAction(editionId, "studio2_archive_notice", {
    p_notice_id: noticeId,
    p_archived: archived,
  });
}
