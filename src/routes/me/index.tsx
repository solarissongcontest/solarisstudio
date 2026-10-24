import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { useFanSession } from "@/lib/prediction-data";

export const Route = createFileRoute("/me/")({
  head: () => ({
    meta: [
      { title: "Me — Solaris Studio" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MeEntryRoute,
});

function MeEntryRoute() {
  const { isAppMode } = useSolarisApp();
  const navigate = useNavigate();
  const session = useFanSession();
  const user = session.data ?? null;

  useEffect(() => {
    if (!session.isLoading && !session.isError && user) {
      // /my-solaris remains the compatibility route during incremental V3
      // migration. In app mode it owns the canonical V3 Me projection.
      void navigate({ to: "/my-solaris", replace: true });
    }
  }, [navigate, session.isError, session.isLoading, user]);

  if (session.isLoading || (user && !session.isError)) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Opening Me…
        </p>
      </AppShell>
    );
  }

  if (session.isError) {
    return (
      <AppShell>
        <section aria-labelledby="me-session-unavailable" className="mx-auto max-w-xl py-8">
          <Panel title="We couldn't verify your Solaris session">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
              <div className="min-w-0">
                <h1 id="me-session-unavailable" className="sr-only">
                  Me session unavailable
                </h1>
                <p className="text-sm leading-6 text-muted-foreground" role="alert">
                  Me stays locked until Solaris can confirm whether this browser is signed in. Your session is not treated as signed out just because that check failed.
                </p>
                <button
                  type="button"
                  onClick={() => void session.refetch()}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold"
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  Retry session check
                </button>
              </div>
            </div>
          </Panel>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {!isAppMode ? (
        <PageHeader
          eyebrow="Your Solaris identity"
          title="Me"
          description="Your identity, history, saved content, preferences and account live here after sign-in. Current responsibilities live in Participate."
        />
      ) : null}
      {isAppMode ? (
        <section aria-labelledby="app-me-sign-in">
          <div className="solaris-app-section-heading">
            <p>Account</p>
            <h2 id="app-me-sign-in">Me</h2>
          </div>
          <div className="solaris-app-grouped-list">
            <Link
              to="/auth"
              search={{ redirect: "/my-solaris" }}
              className="solaris-app-list-row"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Sign in or create an account</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  Open your identity, history, saved content, preferences and account.
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </div>
        </section>
      ) : (
        <Panel title="Sign in to open Me">
          <Link
            to="/auth"
            search={{ redirect: "/my-solaris" }}
            className="inline-flex min-h-11 items-center rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground"
          >
            Sign in or create an account
          </Link>
        </Panel>
      )}
    </AppShell>
  );
}
