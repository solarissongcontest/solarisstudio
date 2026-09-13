import { createFileRoute } from "@tanstack/react-router";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { MySolarisAccountPanel } from "@/components/MySolarisAccountPanel";
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
