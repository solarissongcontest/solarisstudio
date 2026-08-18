import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, Search } from "lucide-react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import {
  loadConfirmationRecoveryCodes,
  requireConfirmationsAdmin,
  type ConfirmationRecoveryCode,
} from "@/integrations/confirmations/admin";

export const Route = createFileRoute("/confirmations/admin/recovery-codes")({
  head: () => ({ meta: [{ title: "Recovery Access — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: RecoveryCodesPage,
});

function RecoveryCodesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ConfirmationRecoveryCode[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const admin = await requireConfirmationsAdmin();
        if (!admin) {
          await navigate({ to: "/auth", search: { redirect: "/confirmations/admin/recovery-codes" } });
          return;
        }
        const data = await loadConfirmationRecoveryCodes();
        if (alive) setRows(data);
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "Could not load recovery access.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [navigate]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => [row.country, row.instagram_username, row.round_name, row.edition_name].join(" ").toLowerCase().includes(term));
  }, [query, rows]);

  const available = rows.filter((row) => row.recovery_code).length;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Delegations · Administration"
        title="Recovery access"
        description="Private access codes for delegations that need to recover an existing response. Keep these credentials inside the organizer workspace."
      />

      {!loading && !error ? (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <AdminCard className="!p-3"><p className="admin-section-label">Responses</p><p className="mt-2 text-2xl font-bold tracking-tight">{rows.length}</p></AdminCard>
          <AdminCard className="!p-3"><p className="admin-section-label">Codes available</p><p className="mt-2 text-2xl font-bold tracking-tight">{available}</p></AdminCard>
        </div>
      ) : null}

      <AdminCard className="mb-4">
        <label className="block">
          <span className="admin-section-label">Find delegation</span>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Country, username, edition or round…" className="min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] pl-9 pr-3 text-sm text-foreground outline-none focus:border-sky-200/30" />
          </div>
        </label>
      </AdminCard>

      {loading ? (
        <AdminCard><p className="py-6 text-center text-sm text-muted-foreground">Loading recovery access…</p></AdminCard>
      ) : error ? (
        <AdminCard><p className="text-sm text-rose-200">{error}</p></AdminCard>
      ) : !filtered.length ? (
        <AdminEmptyState icon={KeyRound} title="No matching responses" description="Try a country, Instagram username, edition or submission round." />
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => (
            <AdminCard key={row.id} className="!p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-bold text-foreground">{row.country}</h2>
                    <AdminStatus tone={row.recovery_code ? "ready" : "attention"}>{row.recovery_code ? "Available" : "No code"}</AdminStatus>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">@{row.instagram_username.replace(/^@/, "")} · SSC {row.edition_number} · {row.round_name}</p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/10 p-3">
                <p className="admin-section-label">Recovery code</p>
                <code className="mt-2 block break-all text-base font-bold tracking-[0.12em] text-foreground">{row.recovery_code ?? "Not available"}</code>
              </div>

              <button
                type="button"
                disabled={!row.recovery_code}
                className="admin-action-secondary mt-3 w-full"
                onClick={async () => {
                  if (!row.recovery_code) return;
                  await navigator.clipboard.writeText(row.recovery_code);
                  toast.success(`${row.country} recovery code copied`);
                }}
              >
                <Copy className="size-4" /> Copy recovery code
              </button>
            </AdminCard>
          ))}
        </div>
      )}

      <AdminCard className="mt-4">
        <AdminCardHeader eyebrow="Security" title="Treat these like passwords" description="Anyone with the correct country, round and recovery code can regain access to that response." />
      </AdminCard>
    </AdminPage>
  );
}
