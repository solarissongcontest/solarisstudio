import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { useFanSession } from "@/lib/prediction-data";
import { useTasteBallots } from "@/lib/taste-data";
import { resolveV3TasteDnaPrivateState } from "@/lib/v3-taste-dna-private-state";

export const Route = createFileRoute("/taste-dna")({
  component: TasteDnaPrivateStateBoundary,
});

function TasteDnaPrivateStateBoundary() {
  const session = useFanSession();
  const viewerId = session.data?.id ?? null;
  const privateHistory = useTasteBallots(viewerId ?? undefined);

  const state = resolveV3TasteDnaPrivateState({
    sessionLoading: session.isLoading,
    sessionError: session.isError,
    viewerId,
    historyLoading: privateHistory.isLoading,
    historyError: privateHistory.isError,
  });

  if (state === "anonymous" || state === "ready") {
    return <Outlet />;
  }

  const failed = state === "error";

  return (
    <AppShell>
      <PageHeader
        eyebrow="Taste DNA"
        title="Explore your voting taste"
        description="Solaris keeps saved Taste DNA rankings private to your account."
      />
      <Panel title={failed ? "Private history unavailable" : "Loading your Taste DNA"}>
        {failed ? (
          <div data-v3-taste-dna-private-state="error">
            <p role="alert" className="text-sm leading-relaxed text-muted-foreground">
              Your saved Taste DNA history could not be verified. Editing stays unavailable so Solaris cannot overwrite a ranking that has not been loaded.
            </p>
            <button
              type="button"
              onClick={() => {
                if (session.isError) {
                  void session.refetch();
                  return;
                }
                void privateHistory.refetch();
              }}
              className="mt-4 min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-semibold"
            >
              Try again
            </button>
          </div>
        ) : (
          <p
            data-v3-taste-dna-private-state="loading"
            role="status"
            aria-live="polite"
            className="text-sm leading-relaxed text-muted-foreground"
          >
            {state === "resolving_session"
              ? "Checking your Solaris session…"
              : "Loading your saved Taste DNA rankings…"}
          </p>
        )}
      </Panel>
    </AppShell>
  );
}
