import { createFileRoute } from "@tanstack/react-router";
import { Copy, KeyRound, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import type { ConfirmationRecoveryCode } from "@/integrations/confirmations/admin";
import {
  loadConfirmationRecoveryCodesPage,
  type ConfirmationProjectionCursor,
} from "@/integrations/confirmations/v3-projections";

export const Route = createFileRoute("/confirmations/admin/recovery-codes")({
  head: () => ({ meta: [{ title: "Recovery Access — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: RecoveryCodesPage,
});

type RecoveryState = {
  editionId: string;
  rows: ConfirmationRecoveryCode[];
  cursor: ConfirmationProjectionCursor | null;
  totalCount: number;
};

const EMPTY_STATE: RecoveryState = {
  editionId: "",
  rows: [],
  cursor: null,
  totalCount: 0,
};

function RecoveryCodesPage() {
  const { editionId, editionLabel } = useAdminContext();
  const activeEditionRef = useRef(editionId);
  const [state, setState] = useState<RecoveryState>(EMPTY_STATE);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    activeEditionRef.current = editionId;
  }, [editionId]);

  useEffect(() => {
    let alive = true;
    // Credential-like data must disappear synchronously from the rendered
    // edition scope. The state carries its source edition as a second guard, so
    // a previous edition is never rendered while the new request is in flight.
    setState(EMPTY_STATE);
    setError(null);

    if (!editionId) {
      setLoading(false);
      return () => { alive = false; };
    }

    setLoading(true);
    void (async () => {
      try {
        const page = await loadConfirmationRecoveryCodesPage(editionId);
        if (!alive) return;
        setState({
          editionId,
          rows: page.rows,
          cursor: page.page.hasMore ? page.page.nextCursor : null,
          totalCount: page.totalCount,
        });
      } catch (caught) {
        if (!alive) return;
        setError(recoveryError(caught));
        setState({ ...EMPTY_STATE, editionId });
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [editionId]);

  async function loadMore() {
    if (!editionId || state.editionId !== editionId || !state.cursor || loadingMore) return;
    const requestedEdition = editionId;
    const requestedCursor = state.cursor;
    setLoadingMore(true);
    try {
      const page = await loadConfirmationRecoveryCodesPage(requestedEdition, requestedCursor);
      if (activeEditionRef.current !== requestedEdition) return;
      setState((current) => {
        if (current.editionId !== requestedEdition) return current;
        const rows = new Map(current.rows.map((row) => [row.id, row]));
        page.rows.forEach((row) => rows.set(row.id, row));
        return {
          editionId: requestedEdition,
          rows: [...rows.values()],
          cursor: page.page.hasMore ? page.page.nextCursor : null,
          totalCount: page.totalCount,
        };
      });
    } catch (caught) {
      if (activeEditionRef.current === requestedEdition) setError(recoveryError(caught));
    } finally {
      if (activeEditionRef.current === requestedEdition) setLoadingMore(false);
    }
  }

  const visible = state.editionId === editionId ? state : EMPTY_STATE;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Delegations · Administration"
        title="Recovery access"
        description="Private recovery credentials are fetched only from the exact Organizer edition through the bounded server projection. Switching edition clears the prior credential set before another request can render."
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
        <AdminCard className="py-10 text-center text-sm text-muted-foreground">Loading exact-edition recovery access…</AdminCard>
      ) : error ? (
        <AdminCard className="border-rose-200/20 bg-rose-200/[0.04]">
          <AdminEmptyState icon={ShieldAlert} title="Recovery Access unavailable" description={error} />
        </AdminCard>
      ) : (
        <>
          <AdminCard strong>
            <AdminCardHeader
              eyebrow={editionLabel ?? "Selected edition"}
              title={`${visible.totalCount} recovery credential${visible.totalCount === 1 ? "" : "s"}`}
              description="Recovery codes are password-like credentials. This surface does not use the legacy all-editions RPC, does not place credentials in a shared query cache, and rejects any server payload that crosses the selected edition boundary."
              action={<AdminStatus tone="ready">Edition isolated</AdminStatus>}
            />
          </AdminCard>

          {visible.rows.length ? (
            <AdminCard className="mt-4">
              <div className="divide-y divide-white/[0.07]">
                {visible.rows.map((row) => (
                  <div key={row.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.8fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{row.country}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        @{row.instagram_username.replace(/^@/, "")} · {row.round_name}
                      </p>
                    </div>
                    <code className="min-w-0 break-all rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-foreground">
                      {row.recovery_code ?? "No active recovery code"}
                    </code>
                    <button
                      type="button"
                      disabled={!row.recovery_code}
                      onClick={() => void copyRecoveryCode(row)}
                      className="admin-action-secondary disabled:opacity-40"
                    >
                      <Copy className="size-4" /> Copy
                    </button>
                  </div>
                ))}
              </div>
            </AdminCard>
          ) : (
            <AdminCard className="mt-4">
              <AdminEmptyState icon={KeyRound} title="No recovery credentials" description="The selected edition has no submissions with an active recovery code." />
            </AdminCard>
          )}

          {visible.cursor ? (
            <div className="mt-4 flex justify-center">
              <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="admin-action-secondary">
                {loadingMore ? "Loading…" : `Load more · ${Math.max(0, visible.totalCount - visible.rows.length)} remaining`}
              </button>
            </div>
          ) : null}
        </>
      )}
    </AdminPage>
  );
}

async function copyRecoveryCode(row: ConfirmationRecoveryCode) {
  if (!row.recovery_code) return;
  try {
    await navigator.clipboard.writeText(row.recovery_code);
    toast.success(`${row.country} recovery code copied`);
  } catch {
    toast.error("Could not copy the recovery code.");
  }
}

function recoveryError(error: unknown) {
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown };
    if (value.message === "AUTHORIZATION" || value.code === "42501") {
      return "Your current Organizer access cannot read recovery credentials for this edition.";
    }
    if (typeof value.message === "string" && value.message.trim()) return value.message;
  }
  return "Solaris could not load Recovery Access for the selected edition.";
}
