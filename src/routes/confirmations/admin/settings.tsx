import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, LogOut, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminActionItem,
  AdminCard,
  AdminCardHeader,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import {
  loadConfirmationEditions,
  requireConfirmationsAdmin,
  type ConfirmationEdition,
} from "@/integrations/confirmations/admin";
import { confirmationsSupabase } from "@/integrations/confirmations/client";

export const Route = createFileRoute("/confirmations/admin/settings")({
  head: () => ({ meta: [{ title: "Delegation Settings — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [editions, setEditions] = useState<ConfirmationEdition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const admin = await requireConfirmationsAdmin();
        if (!admin) {
          await navigate({ to: "/auth", search: { redirect: "/confirmations/admin/settings" } });
          return;
        }
        const rows = await loadConfirmationEditions();
        if (!alive) return;
        setEmail(admin.email ?? null);
        setEditions(rows);
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "Could not load delegation settings.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [navigate]);

  const activeEdition = useMemo(
    () => editions.find((edition) => edition.status === "active") ?? editions[0] ?? null,
    [editions],
  );

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/confirmations` : "/confirmations";

  async function signOut() {
    await confirmationsSupabase.auth.signOut();
    await navigate({ to: "/auth" });
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Delegations · Administration"
        title="Settings"
        description="Low-frequency delegation settings and public access information. Everyday review work stays in the Delegations workspace."
      />

      {loading ? (
        <AdminCard><p className="py-6 text-center text-sm text-muted-foreground">Loading settings…</p></AdminCard>
      ) : error ? (
        <AdminCard><p className="text-sm text-rose-200">{error}</p></AdminCard>
      ) : (
        <div className="space-y-4">
          <AdminCard strong>
            <AdminCardHeader eyebrow="Current context" title={activeEdition ? `SSC ${activeEdition.edition_number}` : "No active edition"} description={activeEdition?.name ?? "Choose or configure an edition before opening confirmations."} action={<AdminStatus tone={activeEdition ? "ready" : "attention"}>{activeEdition ? "Active" : "Needs setup"}</AdminStatus>} />
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                <p className="admin-section-label">Organizer account</p>
                <p className="mt-2 truncate text-sm font-semibold text-foreground">{email ?? "Solaris organizer"}</p>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                <p className="admin-section-label">Response editing</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{activeEdition?.editing_enabled ? "Open" : "Closed"}</p>
              </div>
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader eyebrow="Public access" title="Confirmation page" description="Share this link with delegations when a submission round is open." />
            <div className="rounded-xl border border-white/[0.08] bg-black/10 p-3">
              <p className="break-all text-xs leading-relaxed text-muted-foreground">{publicUrl}</p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button type="button" className="admin-action-secondary w-full" onClick={async () => { await navigator.clipboard.writeText(publicUrl); toast.success("Confirmation page link copied"); }}>
                <Copy className="size-4" /> Copy link
              </button>
              <a href="/confirmations" target="_blank" rel="noreferrer" className="admin-action-secondary w-full">
                <ExternalLink className="size-4" /> Open page
              </a>
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader eyebrow="How it works" title="Delegation workflow" description="The normal confirmation cycle in five steps." />
            <ol className="space-y-3 text-sm text-muted-foreground">
              {[
                "Select the SSC edition in the Organizer workspace.",
                "Create one or more submission rounds and set the limits you need.",
                "Open a round when delegations should be able to submit.",
                "Review responses from the Delegations queue and resolve anything that needs attention.",
                "Close new submissions separately from response editing when corrections still need to remain available.",
              ].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border border-white/[0.08] bg-white/[0.035] text-xs font-bold text-foreground">{index + 1}</span>
                  <span className="pt-1 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader eyebrow="Account" title="Session" description="Signing out also ends access to the organizer workspace on this browser." />
            <AdminActionItem icon={Settings2} title="Delegation settings are stored with the live confirmation service" description="Responses, rounds, review history and recovery access remain continuous across editions." />
            <div className="mt-3">
              <button type="button" className="admin-action-secondary w-full sm:w-auto" onClick={() => void signOut()}>
                <LogOut className="size-4" /> Sign out of Solaris
              </button>
            </div>
          </AdminCard>
        </div>
      )}
    </AdminPage>
  );
}
