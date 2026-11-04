import { createFileRoute } from '@tanstack/react-router';

import { AppShell } from '@/components/AppShell';
import { V3PublicShowCalendarScreen } from '@/components/v3/V3PublicShowCalendarScreen';
import { isCalendarSlug } from '@/lib/public-show-calendar';

export const Route = createFileRoute('/calendar/')({
  validateSearch: (search: Record<string, unknown>): { edition?: string } => ({
    edition: isCalendarSlug(search.edition) ? search.edition : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Solaris Calendar — Solaris Studio' },
      {
        name: 'description',
        content: 'Browse public Solaris Song Contest show times and export an edition schedule to your calendar.',
      },
    ],
    links: [
      { rel: 'canonical', href: 'https://studio.solaris-song-contest.workers.dev/calendar' },
    ],
  }),
  component: () => <AppShell><V3PublicShowCalendarScreen /></AppShell>,
});
