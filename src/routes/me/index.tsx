import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useEffect } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { useFanSession } from "@/lib/prediction-data";

export const Route = createFileRoute("/me/")({
  head: () => ({ meta: [{ title: "MySolaris — Solaris Studio" }] }),
  component: MySolarisRedirect,
});

function MySolarisRedirect() {
  const { isAppMode } = useSolarisApp();
  const navigate = useNavigate();
  const { data: user, isLoading } = useFanSession();

  useEffect(() => {
    if (!isLoading && user) {
      void navigate({ to: "/my-solaris", replace: true });
    }
  }, [isLoading, navigate, user]);

  if (isLoading || user) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Opening MySolaris…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {!isAppMode ? (
        <PageHeader
          eyebrow="Your account"
          title="MySolaris"
          description="Your country, entry, participation and personal Solaris updates live together after sign-in."
        />
      ) : null}
      {isAppMode ? (
        <section aria-labelledby="app-me-sign-in">
          <div className="solaris-app-section-heading">
            <p>Account</p>
            <h2 id="app-me-sign-in">MySolaris</h2>
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
                  Open your country, tasks, participation tools, notices and account.
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </div>
        </section>
      ) : (
        <Panel title="Sign in to open MySolaris">
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
