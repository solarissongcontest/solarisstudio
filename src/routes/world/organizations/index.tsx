import { createFileRoute } from '@tanstack/react-router';

import { AppShell } from '@/components/AppShell';
import { V3WorldOrganizationsDirectoryScreen } from '@/components/v3/V3WorldPublicScreens';

export const Route = createFileRoute('/world/organizations/')({
  head: () => ({
    meta: [
      { title: 'World Organizations — Solaris Studio' },
      { name: 'description', content: 'Browse publicly visible Terra Solaris organizations and institutions.' },
    ],
    links: [{ rel: 'canonical', href: 'https://studio.solaris-song-contest.workers.dev/world/organizations' }],
  }),
  component: () => <AppShell><V3WorldOrganizationsDirectoryScreen /></AppShell>,
});
