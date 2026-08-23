import { useRouterState } from "@tanstack/react-router";
import { Flag, History, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Panel } from "@/components/AppShell";
import { uploadCountryAsset, useMyCountryAccount } from "@/lib/country-account";
import {
  useClearOwnedCountryEditionIdentity,
  useOwnedCountryIdentityHistory,
  useSetOwnedCountryEditionIdentity,
} from "@/lib/country-history";
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

function editionLabel(edition: { edition_number: number | null; edition_name: string }) {
  return edition.edition_number != null ? `SSC ${edition.edition_number}` : edition.edition_name;
}

export function CountryHodHistoryPanel({ inline = false }: { inline?: boolean } = {}) {
  const location = useRouterState({ select: (state) => ({ pathname: state.location.pathname, search: state.location.search }) });
  const onCountryHub = location.pathname === "/country-hub" || location.pathname === "/country-hub/";
  const onMySolaris = location.pathname === "/my-solaris" || location.pathname === "/my-solaris/";
  const { data: accountData } = useMyCountryAccount();
  const targetCountry = location.search && typeof location.search === "object"
    ? (location.search as Record<string, unknown>).country
    : null;
  const ownCountry = accountData?.country ?? null;
  const eligible = Boolean((inline ? onMySolaris : onCountryHub) && ownCountry && !targetCountry);
  const history = useOwnedHodHistory(eligible);
  const identityHistory = useOwnedCountryIdentityHistory(Boolean(eligible && inline));
  const setStatus = useSetOwnedHodEditionStatus();
  const setAuto = useSetOwnedHodAutoAssign();
  const setIdentity = useSetOwnedCountryEditionIdentity();
  const clearIdentity = useClearOwnedCountryEditionIdentity();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [identityMessage, setIdentityMessage] = useState<string | null>(null);
  const [oldName, setOldName] = useState("");
  const [oldFlagFile, setOldFlagFile] = useState<File | null>(null);
  const [selectedEditionIds, setSelectedEditionIds] = useState<string[]>([]);
  const [identityBusy, setIdentityBusy] = useState(false);

  useEffect(() => {
    if (inline || !eligible) {
      setHost(null);
      return;
    }

    let node: HTMLDivElement | null = null;

    const attach = () => {
      if (node?.isConnected) return;

      const header = document.querySelector<HTMLElement>(".app-main > .page-header");
      const main = document.querySelector<HTMLElement>(".app-main");
      const parent = header?.parentElement ?? main;
      if (!parent) {
        setHost(null);
        return;
      }

      const existing = parent.querySelector<HTMLElement>(
        ":scope > [data-country-hod-history-panel='true']",
      );
      if (existing) {
        node = existing as HTMLDivElement;
      } else {
        node = document.createElement("div");
        node.dataset.countryHodHistoryPanel = "true";
        node.className = "mb-5";
        if (header?.parentElement === parent) header.insertAdjacentElement("afterend", node);
        else parent.prepend(node);
      }

      setHost(node);
    };

    attach();

    const observer = new MutationObserver(() => {
      if (!node?.isConnected) attach();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      node?.remove();
      setHost(null);
    };
  }, [eligible, inline, location.pathname]);

  const historicalEditions = useMemo(
    () => (identityHistory.data?.editions ?? []).filter((edition) => Boolean(edition.display_name?.trim())),
    [identityHistory.data?.editions],
  );

  if (!eligible || !ownCountry || (!inline && !host)) return null;

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

  const toggleHistoricalEdition = (editionId: string) => {
    setSelectedEditionIds((current) =>
      current.includes(editionId)
        ? current.filter((id) => id !== editionId)
        : [...current, editionId],
    );
  };

  const applyHistoricalIdentity = async () => {
    const name = oldName.trim();
    if (!name || !selectedEditionIds.length) return;
    setIdentityBusy(true);
    setIdentityMessage(null);
    try {
      let flagImage: string | null = null;
      if (oldFlagFile) {
        const asset = await uploadCountryAsset(ownCountry.id, oldFlagFile, "flags");
        flagImage = asset.publicUrl;
      }
      for (const editionId of selectedEditionIds) {
        await setIdentity.mutateAsync({ editionId, displayName: name, flagImage });
      }
      const count = selectedEditionIds.length;
      setOldName("");
      setOldFlagFile(null);
      setSelectedEditionIds([]);
      setIdentityMessage(`Saved ${name} for ${count} edition${count === 1 ? "" : "s"}.`);
    } catch (error) {
      setIdentityMessage(error instanceof Error ? error.message : "Historical identity could not be saved.");
    } finally {
      setIdentityBusy(false);
    }
  };

  const removeHistoricalIdentity = async (editionId: string) => {
    setIdentityMessage(null);
    try {
      await clearIdentity.mutateAsync(editionId);
      setIdentityMessage("That edition now uses the country's current name and flag again.");
    } catch (error) {
      setIdentityMessage(error instanceof Error ? error.message : "Historical identity could not be removed.");
    }
  };

  const hodPanel = (
    <Panel
      title="Your HOD history"
      description="Choose the editions you personally controlled. This keeps friendship-voting and long-term voting analysis attached to the right HOD instead of treating every person who ever ran the country as one immortal voter."
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
                Keep this on while you are the HOD. When {ownCountry.name} joins a new edition, Solaris will attach that edition to your HOD identity. Turn it off when you stop being HOD.
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
                    <p className="truncate text-sm font-semibold">{editionLabel(edition)}</p>
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
            “Another HOD” and “HOD unknown” do not count as your personal voting pattern. Country names and flags are only presentation and never change the HOD or country identity used by voting security.
          </p>
          {message ? <p className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs text-foreground">{message}</p> : null}
        </div>
      )}
    </Panel>
  );

  const historicalIdentityPanel = inline ? (
    <Panel
      title="Historical country names & flags"
      description="If your country used another name or flag in older SSC editions, select those editions here. Solaris will show that historical identity in those edition pages while keeping the same country underneath for statistics and voting security."
      actions={<span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground"><Flag className="size-3.5" /> Edition identity</span>}
    >
      {identityHistory.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading historical identities…</p>
      ) : identityHistory.isError ? (
        <p className="text-sm text-destructive">Historical identities could not be loaded.</p>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-surface/45 p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,.7fr)]">
              <label className="block">
                <span className="text-xs font-semibold">Old country name</span>
                <input
                  value={oldName}
                  onChange={(event) => setOldName(event.target.value)}
                  maxLength={80}
                  placeholder={`For example, an older name of ${ownCountry.name}`}
                  className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold">Old flag · optional</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => setOldFlagFile(event.target.files?.[0] ?? null)}
                  className="mt-2 block min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </label>
            </div>

            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold">Used in these editions</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedEditionIds((identityHistory.data?.editions ?? []).map((edition) => edition.edition_id))}
                    className="text-[10px] font-semibold text-primary"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedEditionIds([])}
                    className="text-[10px] font-semibold text-muted-foreground"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(identityHistory.data?.editions ?? []).map((edition) => {
                  const checked = selectedEditionIds.includes(edition.edition_id);
                  return (
                    <label
                      key={edition.edition_id}
                      className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${checked ? "border-primary/35 bg-primary/10" : "border-border bg-background/55"}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleHistoricalEdition(edition.edition_id)}
                        className="size-4 accent-current"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">{editionLabel(edition)}</span>
                        {edition.display_name ? (
                          <span className="block truncate text-[10px] text-muted-foreground">Currently {edition.display_name}</span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              disabled={!oldName.trim() || !selectedEditionIds.length || identityBusy || setIdentity.isPending}
              onClick={() => void applyHistoricalIdentity()}
              className="mt-4 min-h-11 rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {identityBusy ? "Saving…" : `Apply to ${selectedEditionIds.length || 0} selected edition${selectedEditionIds.length === 1 ? "" : "s"}`}
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              If you leave the old flag empty, the edition keeps using the country's current flag. You can overwrite an edition later by applying another historical identity to it.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold">Saved historical identities</p>
            <div className="mt-2 space-y-2">
              {historicalEditions.map((edition) => (
                <div key={edition.edition_id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface/35 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    {edition.flag_image ? (
                      <img src={edition.flag_image} alt="" className="h-8 w-12 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="grid h-8 w-12 shrink-0 place-items-center rounded-md border border-border bg-background text-[9px] font-bold text-muted-foreground">
                        {ownCountry.short_code}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{edition.display_name}</p>
                      <p className="text-[10px] text-muted-foreground">{editionLabel(edition)}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={clearIdentity.isPending}
                    onClick={() => void removeHistoricalIdentity(edition.edition_id)}
                    className="min-h-9 shrink-0 rounded-lg border border-border bg-background px-3 text-[11px] font-semibold"
                  >
                    Use current identity
                  </button>
                </div>
              ))}
              {!historicalEditions.length ? (
                <p className="rounded-xl border border-border/70 bg-surface/35 p-4 text-sm text-muted-foreground">
                  No historical country names have been added yet.
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.055] p-3 text-xs leading-relaxed text-muted-foreground">
            Historical names and flags never create a new voting identity. Jury and televote integrity checks continue using the permanent country ID, permanent country code and the HOD assignment for each edition.
          </div>
          {identityMessage ? <p className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs text-foreground">{identityMessage}</p> : null}
        </div>
      )}
    </Panel>
  ) : null;

  const content = (
    <div className="space-y-5">
      {hodPanel}
      {historicalIdentityPanel}
    </div>
  );

  if (inline) return content;
  return host ? createPortal(content, host) : null;
}
