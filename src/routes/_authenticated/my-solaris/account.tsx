import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { MySolarisAccountPanel } from "@/components/MySolarisAccountPanel";
import { MySolarisNotificationsPanel } from "@/components/mysolaris/MySolarisNotificationsPanel";
import { MySolarisPasswordPanel } from "@/components/MySolarisPasswordPanel";
import { useMySolaris } from "@/components/mysolaris/MySolarisContext";

export const Route = createFileRoute("/_authenticated/my-solaris/account")({
  head: () => ({
    meta: [{ title: "MySolaris account — Solaris Studio" }, { name: "robots", content: "noindex" }],
  }),
  component: AccountPage,
});

function AccountPage() {
  return (
    <AppShell>
      <AccountContent />
    </AppShell>
  );
}

function AccountContent() {
  const workspace = useMySolaris();
  const { isAppMode } = useSolarisApp();
  const country = workspace.countryAccount?.country;
  return (
    <>
      <PageHeader
        eyebrow="MySolaris"
        title="Account"
        description="Profile and sign-in security live here. Country configuration stays in the Country section."
      />
      <div className="space-y-4">
        <MySolarisAccountPanel />
        {isAppMode ? (
          <Panel
            title="App preferences"
            description="Notifications, spoiler protection, Show Mode, accessibility and offline settings now live together."
          >
            <Link
              to="/settings"
              className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Open App Settings
            </Link>
          </Panel>
        ) : (
          <MySolarisNotificationsPanel />
        )}
        <MySolarisPasswordPanel />
        <Panel title="Connected country" description="The delegation attached to this account">
          <p className="text-sm font-semibold">{country?.name ?? "No country connected"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {workspace.permissions.countryStatus === "suspended"
              ? "This country account is suspended."
              : country
                ? "Active country account"
                : "Choose a country from the Country section."}
          </p>
        </Panel>
      </div>
    </>
  );
}
