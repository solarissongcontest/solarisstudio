import { createFileRoute, Link } from "@tanstack/react-router";

import { Panel } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { MySolarisAccountPanel } from "@/components/MySolarisAccountPanel";
import { MySolarisNotificationsPanel } from "@/components/mysolaris/MySolarisNotificationsPanel";
import { MySolarisPasswordPanel } from "@/components/MySolarisPasswordPanel";
import { useMySolaris } from "@/components/mysolaris/MySolarisContext";
import { V3AccountSections } from "@/components/v3/V3AccountSections";
import { V3AccountSettingsRouteShell } from "@/components/v3/V3AccountSettingsRouteShell";

export const Route = createFileRoute("/_authenticated/my-solaris/account")({
  head: () => ({
    meta: [
      { title: "MySolaris account — Solaris Studio" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  return (
    <V3AccountSettingsRouteShell
      section="account"
      title="Account"
      description="Security, sessions, privacy, access and account actions for your Solaris identity."
      v3Children={<V3AccountSections />}
    >
      <LegacyAccountContent />
    </V3AccountSettingsRouteShell>
  );
}

function LegacyAccountContent() {
  const workspace = useMySolaris();
  const { isAppMode } = useSolarisApp();
  const country = workspace.countryAccount?.country;
  return (
    <div className="space-y-5">
      <MySolarisAccountPanel />

      {isAppMode ? (
        <section aria-labelledby="app-account-preferences">
          <div className="solaris-app-section-heading">
            <p>App</p>
            <h2 id="app-account-preferences">Preferences</h2>
          </div>
          <div className="solaris-app-grouped-list">
            <Link to="/settings" className="solaris-app-list-row">
              <span className="min-w-0">
                <span className="block text-sm font-semibold">App settings</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  Notifications, spoiler protection, Show Mode, accessibility and offline settings.
                </span>
              </span>
              <span className="text-muted-foreground" aria-hidden="true">›</span>
            </Link>
          </div>
        </section>
      ) : (
        <MySolarisNotificationsPanel />
      )}

      <MySolarisPasswordPanel />

      {isAppMode ? (
        <section aria-labelledby="app-account-country">
          <div className="solaris-app-section-heading">
            <p>Delegation</p>
            <h2 id="app-account-country">Connected country</h2>
          </div>
          <div className="solaris-app-grouped-list">
            <div className="solaris-app-setting-row">
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{country?.name ?? "No country connected"}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {workspace.permissions.countryStatus === "suspended"
                    ? "This country account is suspended."
                    : country
                      ? "Active country account"
                      : "Choose a country from the Country section."}
                </span>
              </span>
            </div>
          </div>
        </section>
      ) : (
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
      )}
    </div>
  );
}
