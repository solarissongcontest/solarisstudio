import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, ShieldAlert } from "lucide-react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminEmptyState, AdminPageHeader } from "@/components/admin/AdminUI";

export const Route = createFileRoute("/confirmations/admin/recovery-codes")({
  head: () => ({ meta: [{ title: "Recovery Access — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: RecoveryCodesPage,
});

function RecoveryCodesPage() {
  const { editionId, editionLabel } = useAdminContext();

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Delegations · Administration"
        title="Recovery access"
        description="Private recovery credentials are only shown when Solaris can bind the read to the exact Organizer edition on the server."
      />

      {!editionId ? (
        <AdminCard>
          <AdminEmptyState
            icon={KeyRound}
            title="Select an edition"
            description="Choose the exact Organizer edition before opening Recovery Access. Solaris will not substitute another edition or load recovery credentials across editions."
          />
        </AdminCard>
      ) : (
        <AdminCard strong>
          <AdminEmptyState
            icon={ShieldAlert}
            title="Edition-scoped Recovery Access requires a server update"
            description={`Recovery codes for ${editionLabel ?? "the selected edition"} are not loaded because the current legacy RPC does not accept an edition scope. Loading every edition's recovery credentials into the browser and filtering them here would expose unrelated secrets. Recovery Access remains fail-closed until the server provides an exact edition-scoped read contract.`}
          />
          <div className="mt-4 rounded-xl border border-amber-200/15 bg-amber-200/[0.045] p-3 text-xs leading-5 text-muted-foreground">
            <p className="font-semibold text-amber-100">Security boundary</p>
            <p className="mt-1">
              Solaris does not fetch or cache recovery codes on this page while the server contract is unscoped. This preserves edition isolation instead of relying on browser-side filtering of password-like credentials.
            </p>
          </div>
        </AdminCard>
      )}
    </AdminPage>
  );
}
