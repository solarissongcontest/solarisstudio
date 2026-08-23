import { ArrowDown, ArrowUp, Crown, ListOrdered, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { useMyCountryAccount } from "@/lib/country-account";
import { useCountries, useEditions, editionLabel } from "@/lib/data";
import {
  useCountryHistoricalNationalFinals,
  useSaveCountryNationalFinalResultOrder,
  useSetCountryNationalFinalWinner,
} from "@/lib/historical-national-finals";
import type { PublicNationalFinal, PublicNationalFinalEntry } from "@/lib/national-finals";

export function NationalFinalResultOrderAddon() {
  const [target, setTarget] = useState<Element | null>(null);
  const { data: accountData } = useMyCountryAccount();
  const { data: countries } = useCountries();
  const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const overrideId = params?.get("country") ?? null;
  const country =
    accountData?.access?.isOrganizer && overrideId
      ? (countries ?? []).find((item) => item.id === overrideId) ?? accountData?.country
      : accountData?.country;

  useEffect(() => {
    const locate = () => {
      const root = document.querySelector(".app-main");
      if (!root) return setTarget(null);
      const headings = Array.from(root.querySelectorAll("h1,h2,h3"));
      const heading = headings.find((node) => node.textContent?.trim() === "SSC entries");
      const panel = heading?.closest("section") ?? null;
      if (!panel) return setTarget(null);

      let host = panel.querySelector(":scope > [data-nf-result-order-host]");
      if (!host) {
        host = document.createElement("div");
        host.setAttribute("data-nf-result-order-host", "true");
        panel.appendChild(host);
      }
      setTarget(host);
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!target || !country) return null;
  return createPortal(<ResultOrderEditor countryId={country.id} />, target);
}

type ManagedFinal = PublicNationalFinal & { source?: string };

function initialResultOrder(nf: ManagedFinal) {
  return [...nf.entries].sort((a, b) => {
    if (a.winner !== b.winner) return a.winner ? -1 : 1;
    const aResult = a.result_position;
    const bResult = b.result_position;
    if (aResult != null || bResult != null) {
      if (aResult == null) return 1;
      if (bResult == null) return -1;
      if (aResult !== bResult) return aResult - bResult;
    }
    return (a.position ?? 999) - (b.position ?? 999);
  });
}

function ResultOrderEditor({ countryId }: { countryId: string }) {
  const finals = useCountryHistoricalNationalFinals(countryId);
  const saveOrder = useSaveCountryNationalFinalResultOrder(countryId);
  const setWinner = useSetCountryNationalFinalWinner(countryId);
  const { data: editions } = useEditions();
  const editionMap = useMemo(
    () => new Map((editions ?? []).map((edition) => [edition.id, edition])),
    [editions],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [order, setOrder] = useState<PublicNationalFinalEntry[]>([]);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [previousWinnerId, setPreviousWinnerId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const stopEditing = () => {
    setEditingId(null);
    setOrder([]);
    setWinnerId(null);
    setPreviousWinnerId(null);
  };

  const start = (nf: ManagedFinal) => {
    const storedWinnerId = nf.winning_entry_id ?? nf.entries.find((entry) => entry.winner)?.id ?? null;
    const initial = initialResultOrder(nf);
    const winner = storedWinnerId
      ? initial.find((entry) => entry.id === storedWinnerId)
      : null;

    setEditingId(nf.id);
    setOrder(
      winner
        ? [winner, ...initial.filter((entry) => entry.id !== winner.id)]
        : initial,
    );
    setWinnerId(storedWinnerId);
    setPreviousWinnerId(storedWinnerId);
    setMessage(null);
  };

  const chooseWinner = (entryId: string) => {
    setWinnerId(entryId);
    setOrder((current) => {
      const winner = current.find((entry) => entry.id === entryId);
      if (!winner) return current;
      return [winner, ...current.filter((entry) => entry.id !== entryId)];
    });
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    if (winnerId && (order[index]?.id === winnerId || order[target]?.id === winnerId)) return;

    setOrder((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = async () => {
    if (!editingId) return;
    const nf = (finals.data ?? []).find((item) => item.id === editingId);
    if (!nf) {
      setMessage("That national final could not be found anymore. Refresh and try again.");
      return;
    }

    setMessage(null);
    try {
      const ordered = winnerId
        ? [
            ...order.filter((entry) => entry.id === winnerId),
            ...order.filter((entry) => entry.id !== winnerId),
          ]
        : order;

      await setWinner.mutateAsync({
        nationalFinalId: editingId,
        winnerEntryId: winnerId,
        previousWinnerEntryId: previousWinnerId,
        source: nf.source,
      });

      await saveOrder.mutateAsync({
        nationalFinalId: editingId,
        orderedEntryIds: ordered.map((entry) => entry.id),
      });

      setMessage(
        nf.source === "confirmation"
          ? "Result saved. The winner was also updated in the original Confirmations response."
          : "Result and winner saved.",
      );
      stopEditing();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Result and winner could not be saved.");
    }
  };

  const editableFinals = (finals.data ?? []).filter((nf) => nf.entries.length > 1);
  if (!editableFinals.length) return null;

  const busy = saveOrder.isPending || setWinner.isPending;

  return (
    <div className="mt-6 border-t border-border/70 pt-5">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <ListOrdered className="size-4" />
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-primary">Results editor</p>
          <h3 className="mt-1 font-display text-lg font-semibold">National-final result & winner</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Set the winner and arrange the final result here. For National Finals imported from Confirmations, changing or clearing the winner here also updates the original confirmation automatically.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {editableFinals.map((nf) => {
          const edition = nf.edition_id ? editionMap.get(nf.edition_id) : null;
          const isEditing = editingId === nf.id;
          const storedWinner = nf.entries.find((entry) => entry.id === nf.winning_entry_id || entry.winner);

          return (
            <div key={nf.id} className={`rounded-xl border p-3 ${isEditing ? "border-primary/35 bg-primary/[0.05] sm:col-span-2" : "border-border bg-background/35"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-primary">
                    {edition ? editionLabel(edition) : nf.edition_number ? `SSC ${nf.edition_number}` : "National final"}
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold">{nf.name}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {nf.entries.length} entries · {nf.source === "manual" ? "Added here" : "From Confirmations"}
                  </p>
                  {storedWinner && !isEditing ? (
                    <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-primary">
                      <Crown className="size-3" />
                      {[storedWinner.artist, storedWinner.song_title].filter(Boolean).join(" — ") || "Winner selected"}
                    </p>
                  ) : null}
                </div>
                {!isEditing && (
                  <button type="button" onClick={() => start(nf)} className="min-h-9 shrink-0 rounded-lg border border-border px-3 text-xs font-semibold">
                    Edit result & winner
                  </button>
                )}
              </div>

              {isEditing && (
                <div className="mt-3 space-y-1.5">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/65 bg-background/35 p-2.5">
                    <div>
                      <p className="text-xs font-semibold">Winner</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {winnerId
                          ? "The winner stays first in the result order."
                          : "No winner selected yet. This is allowed."}
                      </p>
                    </div>
                    {winnerId ? (
                      <button
                        type="button"
                        onClick={() => setWinnerId(null)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold"
                      >
                        <X className="size-3.5" /> Clear winner
                      </button>
                    ) : null}
                  </div>

                  {order.map((entry, index) => {
                    const isWinner = entry.id === winnerId;
                    return (
                      <div
                        key={entry.id}
                        className={`grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border p-2 ${
                          isWinner
                            ? "border-primary/35 bg-primary/[0.08]"
                            : "border-border/65 bg-surface/55"
                        }`}
                      >
                        <span className="numeric text-center text-sm font-bold text-primary">{index + 1}</span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold">
                            {[entry.artist, entry.song_title].filter(Boolean).join(" — ") || "Entry"}
                          </p>
                          {isWinner ? (
                            <p className="mt-0.5 flex items-center gap-1 text-[9px] font-bold uppercase text-primary">
                              <Crown className="size-3" /> Winner · locked 1st
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          {!isWinner ? (
                            <button
                              type="button"
                              onClick={() => chooseWinner(entry.id)}
                              className="min-h-8 rounded-lg border border-primary/20 bg-primary/[0.06] px-2 text-[10px] font-semibold text-primary"
                            >
                              Set winner
                            </button>
                          ) : null}
                          <button
                            type="button"
                            aria-label="Move result up"
                            disabled={isWinner || index === 0 || Boolean(winnerId && index === 1)}
                            onClick={() => move(index, -1)}
                            className="grid size-8 place-items-center rounded-lg border border-border disabled:opacity-25"
                          >
                            <ArrowUp className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Move result down"
                            disabled={isWinner || index === order.length - 1}
                            onClick={() => move(index, 1)}
                            className="grid size-8 place-items-center rounded-lg border border-border disabled:opacity-25"
                          >
                            <ArrowDown className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        stopEditing();
                        setMessage(null);
                      }}
                      className="min-h-10 rounded-lg border border-border text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void save()}
                      className="min-h-10 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      {busy ? "Saving…" : "Save result & winner"}
                    </button>
                  </div>
                  {nf.source === "confirmation" ? (
                    <p className="pt-1 text-[10px] leading-4 text-muted-foreground">
                      Winner changes here are synced to this delegation&apos;s original Confirmations form automatically.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
