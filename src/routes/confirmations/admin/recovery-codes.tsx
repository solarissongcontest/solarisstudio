import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, ShieldAlert } from "lucide-react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminEmptyState, AdminPageHeader } from "@/components/admin/AdminUI";
import type { ConfirmationRecoveryCode } from "@/integrations/confirmations/admin";
import { loadConfirmationRecoveryCodesForEdition } from "@/integrations/confirmations/scoped-admin-reads";

export const Route = createFileRoute("/confirmations/admin/recovery-codes")({
  head: () => ({ meta: [{ title: "Recovery Access — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: RecoveryCodesPage,
});

function RecoveryCodesPage() {
  const { editionId, editionLabel } = useAdminContext();
  const [rows, setRows] = useState<ConfirmationRecoveryCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let alive = true;
    setRows([]);
    setRevealed(new Set());
    setError(null);

    if (!editionId) {
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    setLoading(true);
    void loadConfirmationRecoveryCodesForEdition(editionId)
      .then((page) => {
        if (!alive) return;
        setRows(page.items);
      })
      .catch((caught) => {
        if (!alive) return;
        setRows([]);
        setError(caught instanceof Error ? caught.message : "Recovery access could not be loaded.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [editionId]);

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Delegations · Administration"
        title="Recovery access"
        description="Private recovery credentials are loaded only for the exact Organizer edition selected above."
      />

      {!editionId ? (
        <AdminCard>
          <AdminEmptyState
            icon={KeyRound}
            title="Select an edition"
            description="Choose the exact Organizer edition before opening Recovery Access. Solaris will not substitute another edition or load recovery credentials across editions."
          />
        </AdminCard>
      ) : loading ? (
        <AdminCard>
          <AdminEmptyState
            icon={KeyRound}
            title="Loading recovery access"
            description={`Loading only recovery credentials for ${editionLabel ?? "the selected edition"}.`}
          />
        </AdminCard>
      ) : error ? (
        <AdminCard strong>
          <AdminEmptyState
            icon={ShieldAlert}
            title="Recovery Access unavailable"
            description={error}
          />
          <div className="mt-4 rounded-xl border border-amber-200/15 bg-amber-200/[0.045] p-3 text-xs leading-5 text-muted-foreground">
            Solaris failed closed. No fallback request for all editions was attempted.
          </div>
        </AdminCard>
      ) : rows.length === 0 ? (
        <AdminCard>
          <AdminEmptyState
            icon={KeyRound}
            title="No recovery credentials"
            description={`No Confirmation recovery credentials exist for ${editionLabel ?? "the selected edition"}.`}
          />
        </AdminCard>
      ) : (
        <div className="space-y-3">
          <div className="px-1 text-xs text-muted-foreground">
            {rows.length} credential{rows.length === 1 ? "" : "s"} · {editionLabel ?? "Selected edition"}
          </div>
          {rows.map((row) => {
            const isRevealed = revealed.has(row.id);
            return (
              <AdminCard key={row.id} strong>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{row.country}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.round_name || "Confirmation"}
                      {row.instagram_username ? ` · @${row.instagram_username}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="min-w-28 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-center text-sm tracking-[0.16em] text-foreground">
                      {isRevealed ? row.recovery_code || "Unavailable" : "••••••••"}
                    </code>
                    <button
                      type="button"
                      className="min-h-10 rounded-lg border border-white/10 px-3 text-sm font-medium text-foreground transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                      aria-pressed={isRevealed}
                      aria-label={`${isRevealed ? "Hide" : "Reveal"} recovery code for ${row.country}`}
                      onClick={() => {
                        setRevealed((current) => {
                          const next = new Set(current);
                          if (next.has(row.id)) next.delete(row.id);
                          else next.add(row.id);
                          return next;
                        });
                      }}
                    >
                      {isRevealed ? "Hide" : "Reveal"}
                    </button>
                  </div>
                </div>
              </AdminCard>
            );
          })}
        </div>
      )}
    </AdminPage>
  );
}
