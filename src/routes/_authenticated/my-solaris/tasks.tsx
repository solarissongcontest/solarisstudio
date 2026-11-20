import { Navigate, createFileRoute, redirect } from "@tanstack/react-router";

import { MySolarisTasksModule } from "@/components/mysolaris/modules/MySolarisTasksModule";
import { useMyCountryAccount } from "@/lib/country-account";
import { NAV_TARGETS } from "@/lib/navigation-targets";

export const Route = createFileRoute("/_authenticated/my-solaris/tasks")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (!search.country) {
      throw redirect({ to: NAV_TARGETS.participate, replace: true });
    }
  },
  head: () => ({
    meta: [{ title: "Participant view — Solaris Studio" }, { name: "robots", content: "noindex" }],
  }),
  component: MySolarisTasksCompatibilityRoute,
});

function MySolarisTasksCompatibilityRoute() {
  const account = useMyCountryAccount();

  if (account.isLoading) {
    return (
      <p className="px-4 py-8 text-sm text-muted-foreground" role="status" aria-live="polite">
        Checking participant inspection access…
      </p>
    );
  }

  if (account.isError || account.data?.access?.isOrganizer !== true) {
    return <Navigate to={NAV_TARGETS.participate} replace />;
  }

  return <MySolarisTasksModule />;
}
