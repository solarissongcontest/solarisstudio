import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BellRing, Megaphone } from 'lucide-react';

import {
  loadMySolarisHomeAnnouncements,
  loadPublicHomeAnnouncements,
  type HomeAnnouncement,
} from '@/lib/official-announcement-feed';

export function OfficialAnnouncementFeed({ surface }: { surface: 'public_home' | 'mysolaris_home' }) {
  const isPublic = surface === 'public_home';
  const query = useQuery({
    queryKey: ['official-announcements', surface],
    queryFn: () => isPublic ? loadPublicHomeAnnouncements(3) : loadMySolarisHomeAnnouncements(5),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const announcements = query.data ?? [];
  if (query.isLoading || query.isError || announcements.length === 0) return null;

  return (
    <section
      className="overflow-hidden rounded-3xl border border-primary/20 bg-primary/[0.045]"
      aria-labelledby={`official-announcements-${surface}`}
    >
      <div className="flex items-center gap-3 border-b border-primary/15 px-4 py-3 sm:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Megaphone className="size-4" />
        </span>
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.15em] text-primary">TSBC official</p>
          <h2 id={`official-announcements-${surface}`} className="text-sm font-bold sm:text-base">
            {isPublic ? 'Official announcements' : 'Updates for everyone in MySolaris'}
          </h2>
        </div>
      </div>

      <div className="divide-y divide-primary/10">
        {announcements.map((announcement) => (
          <AnnouncementRow key={announcement.id} announcement={announcement} />
        ))}
      </div>
    </section>
  );
}

function AnnouncementRow({ announcement }: { announcement: HomeAnnouncement }) {
  const critical = announcement.severity === 'critical' || announcement.severity === 'urgent';
  const Icon = critical ? AlertTriangle : BellRing;
  return (
    <article className="flex gap-3 px-4 py-4 sm:px-5">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-primary/15 bg-background/55 text-primary">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold leading-snug">{announcement.title}</h3>
          {critical ? (
            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-red-300">
              {announcement.severity}
            </span>
          ) : null}
        </div>
        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground sm:text-sm">
          {announcement.body}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {formatSentAt(announcement.sentAt)}
        </p>
      </div>
    </article>
  );
}

function formatSentAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
