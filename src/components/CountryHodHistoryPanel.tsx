import { useRouterState } from "@tanstack/react-router";
import { History, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Panel } from "@/components/AppShell";
import { useMyCountryAccount } from "@/lib/country-account";
import {
  useOwnedHodHistory,
  useSetOwnedHodAutoAssign,
  useSetOwnedHodEditionStatus,
  type OwnedHodEditionStatus,
} from "@/lib/hod-self-history";

const STATUS_OPTIONS: Array<{ value: OwnedHodEditionStatus; label: string; help: string }> = [
  { value: "mine", label: "I was the HOD", help: "Votes from this edition belong to your personal HOD history." },
  { value: "other", label: "Another HOD", help: "This edition will not be counted as part of your HOD voting patterns." },
  { value: "unknown", label: "HOD unknown", help: "Solaris will not link this edition to your HOD identity." },
];

export function CountryHodHistoryPanel() {
  const location = useRouterState({ select: (state) => ({ pathname: state.location.pathname, search: state.location.search }) });
  const onCountryHub = location.pathname === "/country-hub" || location.pathname === "/country-hub/";
  const { data: accountData } = useMyCountryAccount();
  const targetCountry = location.search && typeof location.search === "object"
    ? (location.search as Record<string, unknown>).country
    : null;
  const ownCountry = accountData?.country ?? null;
  const eligible = Boolean(onCountryHub && ownCountry && !targetCountry);
  const history = useOwnedHodHistory(eligible);
  const setStatus = useSetOwnedHodEditionStatus();
  const setAuto = useSetOwnedHodAutoAssign();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!eligible) return;
    const header = document.querySelector<HTMLElement>(".app-main > .page-header");
    if (!header?.parentElement) return;
    const node = document.createElement("div");
    node.dataset.countryHodHistoryPanel = "true";
    node.className = "mb-5";
    header.insertAdjacentElement("afterend", node);
    setHost(node);
    return () => {
      node.remove();
      setHost(null);
    };
  }, [eligible]);

  if (!eligible || !ownCountry || !host) return null;

  const updateStatus = async (editionId: string, status: OwnedHodEditionStatus) => {
    setMessage(null);
    try {
      await setStatus.mutateAsync({ editionId, status });
      setMessage(status === "mine"
        ? "Saved. That edition now belongs to your HOD history."
        : "Saved. That edition will not be treated as part of your HOD voting pattern.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "HOD history could not be saved.");
    }
  };

  const toggleAuto = async () => {
    const next = !(history.data?.auto_assign_future ?? true);
    setMessage(null);
    try {
      await setAuto.mutateAsync(next);
      setMessage(next
        ? "Future editions will automatically be added to your HOD history when your country participates."
        : "Automatic HOD carry-forward is off. New editions will stay unassigned until you choose a HOD status.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Automatic HOD setting could not be changed.");
    }
  };

  return createPortal(
    <Panel
      title="Your HOD history"
      description="Tell Solaris which editions were actually yours. This keeps friendship-voting and long-term pattern analysis from blaming one human for votes cast by a completely different human, a surprisingly important distinction."
      actions={<span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground"><History className="size-3.5" /> Voting identity</span>}
    >
      {history.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your edition history…</p>
      ) : history.isError ? (
        <p className="text-sm text-destructive">Your HOD history could not be loaded.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/55 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Automatically add new editions</p>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                Keep this on while you are the HOD. When {ownCountry.name} joins a new edition, Solaris will automatically attach that edition to your HOD identity. Turn it off when you stop being HOD.
              </p>
            </div>
            <button
              type="button"
              disabled={setAuto.isPending}
              onClick={() => void toggleAuto()}
              className={`min-h-11 shrink-0 rounded-xl border px-4 text-sm font-semibold ${history.data?.auto_assign_future !== false ? "border-primary/35 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}
            >
              {history.data?.auto_assign_future !== false ? "On · I am still HOD" : "Off · I am no longer HOD"}
            </button>
          </div>

          <div className="space-y-2">
            {(history.data?.editions ?? []).map((edition) => (
              <div key={edition.edition_id} className="grid gap-3 rounded-2xl border border-border/70 bg-surface/35 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(190px,260px)] sm:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className={`size-4 shrink-0 ${edition.status === "mine" ? "text-primary" : "text-muted-foreground"}`} />
                    <p className="truncate text-sm font-semibold">
                      {edition.edition_number != null ? `SSC ${edition.edition_number}` : edition.edition_name}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {STATUS_OPTIONS.find((option) => option.value === edition.status)?.help}
                  </p>
                </div>
                <select
                  value={edition.status}
                  disabled={setStatus.isPending}
                  onChange={(event) => void updateStatus(edition.edition_id, event.target.value as OwnedHodEditionStatus)}
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold"
                >
                  {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            ))}
            {!history.data?.editions.length ? (
              <p className="rounded-xl border border-border/70 bg-surface/35 p-4 text-sm text-muted-foreground">
                No SSC participation history is available for this country yet.
              </p>
            ) : null}
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            “Another HOD” and “HOD unknown” do not count as your personal voting pattern. If an organizer later identifies the other HOD, Solaris can analyse that edition under their identity instead.
          </p>
          {message ? <p className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs text-foreground">{message}</p> : null}
        </div>
      )}
    </Panel>,
    host,
  );
}
