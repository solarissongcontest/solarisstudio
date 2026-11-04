import { createFileRoute } from '@tanstack/react-router';

import { AppShell } from '@/components/AppShell';
import { V3PublicShowCalendarScreen } from '@/components/v3/V3PublicShowCalendarScreen';

export const Route = createFileRoute('/calendar/')({
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
