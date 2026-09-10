import { Link, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { Panel } from '@/components/AppShell';

export function HodWorkspaceLauncher() {
  const [target, setTarget] = useState<Element | null>(null);
  const search = useRouterState({ select: (state) => state.location.search });
  const country =
    search && typeof search === 'object' && 'country' in search && typeof search.country === 'string'
      ? search.country
      : undefined;

  useEffect(() => {
    setTarget(document.querySelector('.app-main'));
  }, []);

  if (!target) return null;

  return createPortal(
    <section className="mt-6 border-t border-border/60 pt-6" data-hod-workspace-launcher>
      <Panel
        title="Delegation operations"
        description="Open the Studio 2 HOD workspace for confirmation readiness, entry workflow, jury roster and official TSBC notices."
      >
        <Link
          to="/country-hub/hod"
          search={country ? { country } : {}}
          className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Open delegation workspace →
        </Link>
      </Panel>
    </section>,
    target,
  );
}
