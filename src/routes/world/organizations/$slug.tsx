import { createFileRoute } from '@tanstack/react-router';

import { AppShell } from '@/components/AppShell';
import { V3WorldOrganizationProfileScreen } from '@/components/v3/V3WorldPublicScreens';

export const Route = createFileRoute('/world/organizations/$slug')({
  head: () => ({
    meta: [
      { title: 'Terra Solaris Organization — Solaris Studio' },
      { name: 'description', content: 'Read authoritative public membership, leadership and institutional structure.' },
    ],
  }),
  component: WorldOrganizationPage,
});

function WorldOrganizationPage() {
  const { slug } = Route.useParams();
  return <AppShell><V3WorldOrganizationProfileScreen key={slug} slug={slug} /></AppShell>;
}
