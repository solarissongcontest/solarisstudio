import { createFileRoute } from '@tanstack/react-router';

import { AppShell } from '@/components/AppShell';
import { V3WorldLandingScreen } from '@/components/v3/V3WorldPublicScreens';

export const Route = createFileRoute('/world/')({
  head: () => ({
    meta: [
      { title: 'Terra Solaris — Solaris Studio' },
      { name: 'description', content: 'Discover the countries and public institutions of Terra Solaris.' },
    ],
    links: [{ rel: 'canonical', href: 'https://studio.solaris-song-contest.workers.dev/world' }],
  }),
  component: () => <AppShell><V3WorldLandingScreen /></AppShell>,
});
