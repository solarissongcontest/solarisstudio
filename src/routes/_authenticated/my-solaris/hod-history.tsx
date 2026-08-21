import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronLeft, History, RefreshCw, UserRoundCog } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

const supabase = typedSupabase as any;

type HodStatus = "mine" | "other" | "unknown";
type HodEdition = {
  edition_id: string;
  edition_number: number | null;
  edition_name: string;
  status: HodStatus;
};
type HodHistory = {
  country_id: string;
  auto_assign_future: boolean;
  editions: HodEdition[];
};

export const Route = createFileRoute("/_authenticated/my-solaris/hod-history")({
  head: () => ({ meta: [{ title: "My HOD history — Solaris Studio" }] }),
  component: HodHistoryPage,
});

const statusText: Record<HodStatus, { label: string; detail: string }> = {
  mine: { label: "I was HOD", detail: "This edition counts toward your personal HOD voting patterns." },
  other: { label: "Another HOD", detail: "This edition is excluded from your personal HOD pattern history." },
  unknown: { label: "Unknown", detail: "No HOD identity is assumed, so it is excluded from personal HOD analysis." },
};

function HodHistoryPage() {
  const [history, setHistory] = useState<HodHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyEdition, setBusyEdition] = useState<string | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("owned_hod_edition_history");
    if (rpcError) {
      setError(rpcError.message);
      setHistory(null);
    } else {
      setHistory(data as HodHistory);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function setStatus(editionId: string, status: HodStatus) {
    setBusyEdition(editionId);
    try {
      const { error: rpcError } = await supabase.rpc("set_owned_hod_edition_status", {
        _edition_id: editionId,
        _status: status,
      });
      if (rpcError) throw rpcError;
      await load();
      toast.success(status === "mine" ? "Edition added to your HOD history" : status === "other" ? "Marked as another HOD" : "Marked as unknown HOD");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "HOD history could not be saved.");
    } finally {
      setBusyEdition(null);
    }
  }

  async function setAuto(enabled: boolean) {
    setAutoBusy(true);
    try {
      const { error: rpcError } = await supabase.rpc("set_owned_hod_auto_assign", { _enabled: enabled });
      if (rpcError) throw rpcError;
      await load();
      toast.success(enabled ? "New editions will be assigned to you automatically" : "Automatic HOD carry-forward stopped");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Setting could not be saved.");
    } finally {
      setAutoBusy(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="My Solaris"
        title="My HOD history"
        description="Tell Solaris which editions were actually controlled by you. Friendship-voting analysis follows the person, not merely the country name."
        actions={<Link to="/my-solaris" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-semibold"><ChevronLeft className="size-4" /> My Solaris</Link>}
      />

      {loading ? <Panel><p className="py-6 text-center text-sm text-muted-foreground">Loading HOD history…</p></Panel>
      : error ? <Panel><p className="text-sm text-rose-200">{error}</p></Panel>
      : history ? (
        <div className="space-y-5">
          <Panel title="Future editions" description="Keep this on while you are still the country's HOD.">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Automatically count new editions as mine</p>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                  When your country enters a new edition, Solaris will attach that edition to your HOD identity automatically. Turn this off when you stop being HOD. Existing history is not erased.
                </p>
              </div>
              <button
                type="button"
                disabled={autoBusy}
                onClick={() => void setAuto(!history.auto_assign_future)}
                className={`min-h-11 shrink-0 rounded-xl border px-4 text-xs font-semibold ${history.auto_assign_future ? "border-primary/30 bg-primary/12 text-primary" : "border-border bg-surface text-muted-foreground"}`}
              >
                {autoBusy ? "Saving…" : history.auto_assign_future ? "Automatic: on" : "Automatic: off"}
              </button>
            </div>
          </Panel>

          <Panel
            title="Edition-by-edition history"
            description="Only editions marked ‘I was HOD’ contribute to your personal long-term friendship-voting patterns."
          >
            {history.editions.length ? (
              <div className="divide-y divide-border/60">
                {history.editions.map((edition) => {
                  const meta = statusText[edition.status];
                  const busy = busyEdition === edition.edition_id;
                  return (
                    <div key={edition.edition_id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {edition.status === "mine" ? <CheckCircle2 className="size-4 shrink-0 text-primary" /> : <History className="size-4 shrink-0 text-muted-foreground" />}
                            <p className="truncate text-sm font-semibold">
                              {edition.edition_number != null ? `SSC ${edition.edition_number}` : edition.edition_name}
                            </p>
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{meta.detail}</p>
                        </div>
                        <div className="grid min-w-0 grid-cols-3 gap-1.5 sm:min-w-[28rem]">
                          {(["mine", "other", "unknown"] as HodStatus[]).map((status) => (
                            <button
                              key={status}
                              type="button"
                              disabled={busy}
                              onClick={() => status !== edition.status && void setStatus(edition.edition_id, status)}
                              aria-pressed={edition.status === status}
                              className={`min-h-11 rounded-xl border px-2 text-[11px] font-semibold transition ${edition.status === status ? "border-primary/30 bg-primary/12 text-primary" : "border-border bg-surface text-muted-foreground hover:bg-surface-strong"}`}
                            >
                              {statusText[status].label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-5 text-center">
                <UserRoundCog className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-2 text-sm font-semibold">No participation history found</p>
                <p className="mt-1 text-xs text-muted-foreground">Editions appear here once your country has a stored participation.</p>
              </div>
            )}
          </Panel>

          <div className="rounded-2xl border border-primary/15 bg-primary/[0.045] p-4 text-xs leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Why this matters:</strong> changing HODs should break the behavioural timeline. Solaris can still analyse country-level history separately, but personal HOD friendship-voting analysis will not blame a new HOD for patterns created by someone else.
          </div>
        </div>
      ) : null}

      <button type="button" onClick={() => void load()} className="mt-5 inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-muted-foreground"><RefreshCw className="size-3.5" /> Refresh history</button>
    </AppShell>
  );
}
