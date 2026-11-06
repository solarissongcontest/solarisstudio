import { Navigate, createFileRoute, redirect } from "@tanstack/react-router";

import { MySolarisTasksModule } from "@/components/mysolaris/modules/MySolarisTasksModule";
import { useMyCountryAccount } from "@/lib/country-account";
import { NAV_TARGETS } from "@/lib/navigation-targets";
import { useFanSession } from "@/lib/prediction-data";

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
  const session = useFanSession();

  // A disabled account query is pending while the session resolves; isLoading
  // alone would redirect a valid Organizer before authorization is known.
  if (session.isPending || account.isPending) {
    return (
      <p className="px-4 py-8 text-sm text-muted-foreground" role="status" aria-live="polite">
        Checking participant inspection access…
      </p>
    );
  }

  if (session.isError || account.isError) {
    return (
      <div className="px-4 py-8" role="alert">
        <p className="text-sm font-semibold">Unable to verify Organizer access.</p>
        <button type="button" className="mt-3 min-h-11 rounded-xl border px-4 text-sm"
          onClick={() => { void session.refetch(); void account.refetch(); }}>
          Retry access check
        </button>
      </div>
    );
  }

  if (session.data?.id && account.data?.access?.userId !== session.data.id) {
    return (
      <div className="px-4 py-8" role="alert">
        <p className="text-sm font-semibold">Delegation access changed.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Current account ownership could not be verified. No private inspection data was loaded.
        </p>
        <button
          type="button"
          className="mt-3 min-h-11 rounded-xl border px-4 text-sm"
          onClick={() => { void session.refetch(); void account.refetch(); }}
        >
          Retry access check
        </button>
      </div>
    );
  }

  if (account.data?.access?.isOrganizer !== true) {
    return <Navigate to={NAV_TARGETS.participate} replace />;
  }

  return <MySolarisTasksModule />;
}
