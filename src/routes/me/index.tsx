import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { useFanSession } from "@/lib/prediction-data";

export const Route = createFileRoute("/me/")({
  head: () => ({ meta: [{ title: "My Solaris — Solaris Studio" }] }),
  component: MySolarisRedirect,
});

function MySolarisRedirect() {
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
        <p className="text-sm text-muted-foreground">Opening My Solaris…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Your private workspace"
        title="My Solaris"
        description="Your country, entry, participation and personal Solaris updates live together after sign-in."
      />
      <Panel title="Sign in to open My Solaris">
        <Link
          to="/auth"
          search={{ redirect: "/my-solaris" }}
          className="inline-flex min-h-11 items-center rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground"
        >
          Sign in or create an account
        </Link>
      </Panel>
    </AppShell>
  );
}
