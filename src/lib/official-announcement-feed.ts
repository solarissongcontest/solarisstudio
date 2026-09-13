import { supabase } from '@/integrations/supabase/client';
import type { NoticeSeverity, NoticeType } from './official-communications';

export type HomeAnnouncement = {
  id: string;
  editionId: string | null;
  noticeType: NoticeType;
  title: string;
  body: string;
  severity: NoticeSeverity;
  sentAt: string;
};

type AnnouncementRow = {
  id: string;
  edition_id: string | null;
  notice_type: NoticeType;
  title: string;
  body: string;
  severity: NoticeSeverity;
  sent_at: string;
};

type RpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

const client = supabase as unknown as RpcClient;

function mapRows(value: unknown): HomeAnnouncement[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is AnnouncementRow => Boolean(row) && typeof row === 'object')
    .map((row) => ({
      id: row.id,
      editionId: row.edition_id,
      noticeType: row.notice_type,
      title: row.title,
      body: row.body,
      severity: row.severity,
      sentAt: row.sent_at,
    }));
}

export async function loadPublicHomeAnnouncements(limit = 3): Promise<HomeAnnouncement[]> {
  const { data, error } = await client.rpc('studio2_public_home_announcements', { p_limit: limit });
  if (error) throw error;
  return mapRows(data);
}

export async function loadMySolarisHomeAnnouncements(limit = 5): Promise<HomeAnnouncement[]> {
  const { data, error } = await client.rpc('studio2_mysolaris_home_announcements', { p_limit: limit });
  if (error) throw error;
  return mapRows(data);
}
