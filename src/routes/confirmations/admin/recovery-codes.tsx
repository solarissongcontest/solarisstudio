import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, EyeOff, KeyRound, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminEmptyState, AdminPageHeader } from "@/components/admin/AdminUI";
import { confirmationsSupabase } from "@/integrations/confirmations/client";
import type { ConfirmationRecoveryCode } from "@/integrations/confirmations/admin";
import { loadConfirmationRecoveryCodesForEdition } from "@/integrations/confirmations/scoped-admin-reads";

export const Route = createFileRoute("/confirmations/admin/recovery-codes")({
  head: () => ({
    meta: [
      { title: "Recovery Access — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RecoveryCodesPage,
});

const PAGE_SIZE = 100;

function RecoveryCodesPage() {
  const { editionId, editionLabel } = useAdminContext();
  const [rows, setRows] = useState<ConfirmationRecoveryCode[]>([]);
  const [loadedEditionId, setLoadedEditionId] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState("");
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authEpoch, setAuthEpoch] = useState(0);

  useEffect(() => {
    const { data: { subscription } } = confirmationsSupabase.auth.onAuthStateChange((event: string) => {
      if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED", "TOKEN_REFRESHED"].includes(event)) return;
      setRows([]);
      setLoadedEditionId(null);
      setRevealedId(null);
      setPageIndex(0);
      setTotal(0);
      setHasMore(false);
      setAuthEpoch((current) => current + 1);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setPageIndex(0);
    setRevealedId(null);
    setRows([]);
    setLoadedEditionId(null);
  }, [editionId]);

  useEffect(() => {
    const conceal = () => {
      if (document.visibilityState === "hidden") setRevealedId(null);
    };
    document.addEventListener("visibilitychange", conceal);
    return () => document.removeEventListener("visibilitychange", conceal);
  }, []);

  useEffect(() => {
    let alive = true;
    setRevealedId(null);
    setRows([]);
    setLoadedEditionId(null);
    setTotal(0);
    setHasMore(false);
    setError(null);
    if (!editionId) {
      setLoading(false);
      return () => { alive = false; };
    }
    setLoading(true);
    void loadConfirmationRecoveryCodesForEdition(editionId, {
      limit: PAGE_SIZE,
      offset: pageIndex * PAGE_SIZE,
    }).then((page) => {
      if (!alive) return;
      if (pageIndex > 0 && page.offset >= page.total) {
        setPageIndex(Math.max(0, Math.ceil(page.total / PAGE_SIZE) - 1));
        return;
      }
      setRows(page.items);
      setLoadedEditionId(page.edition_id);
      setTotal(page.total);
      setHasMore(page.has_more);
    }).catch((caught: unknown) => {
      if (!alive) return;
      setRows([]);
      setLoadedEditionId(null);
      setError(caught instanceof Error ? caught.message : "Recovery credentials are unavailable.");
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [editionId, pageIndex, authEpoch]);

  const visibleRows = useMemo(() => {
    if (!editionId || loadedEditionId !== editionId || error) return [];
    const search = query.trim().toLocaleLowerCase();
    return rows.filter((row) =>
      row.edition_id === editionId &&
      (!search || [row.country, row.instagram_username, row.round_name].join(" ").toLocaleLowerCase().includes(search))
    );
  }, [editionId, loadedEditionId, rows, query, error]);

  const copyRecoveryCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Recovery code copied");
    } catch {
      toast.error("Clipboard access was denied. Nothing was copied.");
    }
  };

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Delegations · Administration"
        title="Recovery access"
        description="Sensitive recovery credentials are restricted to confirmation.manage for the exact Organizer edition."
      />

      {!editionId ? (
        <AdminCard>
          <AdminEmptyState
            icon={KeyRound}
            title="Select an edition"
            description="Choose the exact Organizer edition before viewing recovery credentials. Solaris never substitutes a different edition."
          />
        </AdminCard>
      ) : (
        <>
          <AdminCard className="mb-4">
            <p className="text-sm font-semibold">{editionLabel ?? "Selected Organizer edition"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Credentials are concealed by default and are not stored in your browser's persistent storage.
              Search applies only to the current page.
            </p>
            <label className="mt-3 block text-xs">
              <span className="block pb-1 text-muted-foreground">Search country, username or round</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-background px-3 text-sm text-foreground"
                placeholder="Search this page"
              />
            </label>
          </AdminCard>

          {loading ? (
            <AdminCard>Loading exact-edition recovery access…</AdminCard>
          ) : error ? (
            <AdminCard className="border-rose-200/20 bg-rose-200/[0.045]">
              <div className="flex items-start gap-2">
                <ShieldAlert className="size-4 shrink-0 text-rose-200" />
                <p className="text-sm text-rose-100">{error}</p>
              </div>
            </AdminCard>
          ) : loadedEditionId !== editionId ? (
            <AdminCard>Recovery credentials are not available for this edition.</AdminCard>
          ) : (
            <>
              <AdminCard className="mb-4 !p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Page {pageIndex + 1} · {rows.length ? pageIndex * PAGE_SIZE + 1 : 0}–
                    {pageIndex * PAGE_SIZE + rows.length} of {total}
                  </p>
                  <div className="flex gap-2">
                    <button type="button" disabled={pageIndex === 0}
                      onClick={() => { setRevealedId(null); setPageIndex((n) => Math.max(0, n - 1)); }}
                      className="admin-action-secondary !min-h-9">Previous</button>
                    <button type="button" disabled={!hasMore || (pageIndex + 1) * PAGE_SIZE > 10000}
                      onClick={() => { setRevealedId(null); setPageIndex((n) => n + 1); }}
                      className="admin-action-secondary !min-h-9">Next</button>
                  </div>
                </div>
              </AdminCard>
              {visibleRows.length ? (
                <section className="grid gap-3">
                  {visibleRows.map((row) => (
                    <AdminCard key={row.id} className="!p-4">
                      <p className="font-semibold">{row.country}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        @{row.instagram_username.replace(/^@/, "")} · {row.round_name}
                      </p>
                      <div className="mt-3 rounded-xl border border-white/[0.07] p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recovery code</p>
                        <p className="mt-2 break-all font-mono text-sm">
                          {revealedId === row.id ? (row.recovery_code ?? "No recovery code saved") : "••••••••••••"}
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button type="button" className="admin-action-secondary !min-h-9"
                            onClick={() => setRevealedId((id) => id === row.id ? null : row.id)}>
                            {revealedId === row.id ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            {revealedId === row.id ? "Conceal" : "Reveal"}
                          </button>
                          {revealedId === row.id && row.recovery_code ? (
                            <button type="button" className="admin-action-secondary !min-h-9"
                              onClick={() => void copyRecoveryCode(row.recovery_code!)}>
                              <Copy className="size-4" /> Copy
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </AdminCard>
                  ))}
                </section>
              ) : (
                <AdminCard>
                  <AdminEmptyState title="No recovery records" description="There are no records on this page matching the search." />
                </AdminCard>
              )}
            </>
          )}
        </>
      )}
    </AdminPage>
  );
}
