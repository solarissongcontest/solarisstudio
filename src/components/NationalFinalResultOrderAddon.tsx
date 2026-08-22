import { ArrowDown, ArrowUp, ListOrdered } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { useMyCountryAccount } from "@/lib/country-account";
import { useCountries, useEditions, editionLabel } from "@/lib/data";
import {
  useCountryHistoricalNationalFinals,
  useSaveCountryNationalFinalResultOrder,
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
  const { data: editions } = useEditions();
  const editionMap = useMemo(
    () => new Map((editions ?? []).map((edition) => [edition.id, edition])),
    [editions],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [order, setOrder] = useState<PublicNationalFinalEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const start = (nf: ManagedFinal) => {
    setEditingId(nf.id);
    setOrder(initialResultOrder(nf));
    setMessage(null);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const winnerIndex = order.findIndex((entry) => entry.winner);
    if (winnerIndex === 0 && (index === 0 || target === 0)) return;
    setOrder((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = async () => {
    if (!editingId) return;
    setMessage(null);
    try {
      await saveOrder.mutateAsync({
        nationalFinalId: editingId,
        orderedEntryIds: order.map((entry) => entry.id),
      });
      setMessage("Result order saved.");
      setEditingId(null);
      setOrder([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Result order could not be saved.");
    }
  };

  const editableFinals = (finals.data ?? []).filter((nf) => nf.entries.length > 1);
  if (!editableFinals.length) return null;

  return (
    <div className="mt-6 border-t border-border/70 pt-5">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <ListOrdered className="size-4" />
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-primary">Results editor</p>
          <h3 className="mt-1 font-display text-lg font-semibold">National-final result order</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Running order and final result are separate. You can reorder the result for both previous NFs and NFs imported from Confirmations. A stored winner stays locked in first place.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {editableFinals.map((nf) => {
          const edition = nf.edition_id ? editionMap.get(nf.edition_id) : null;
          const isEditing = editingId === nf.id;
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
                </div>
                {!isEditing && (
                  <button type="button" onClick={() => start(nf)} className="min-h-9 shrink-0 rounded-lg border border-border px-3 text-xs font-semibold">
                    Edit order
                  </button>
                )}
              </div>

              {isEditing && (
                <div className="mt-3 space-y-1.5">
                  {order.map((entry, index) => {
                    const winnerLocked = order[0]?.winner && index === 0;
                    return (
                      <div key={entry.id} className="grid grid-cols-[34px_minmax(0,1fr)_76px] items-center gap-2 rounded-lg border border-border/65 bg-surface/55 p-2">
                        <span className="numeric text-center text-sm font-bold text-primary">{index + 1}</span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold">
                            {[entry.artist, entry.song_title].filter(Boolean).join(" — ") || "Entry"}
                          </p>
                          {entry.winner && <p className="mt-0.5 text-[9px] font-bold uppercase text-primary">Winner · locked 1st</p>}
                        </div>
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            aria-label="Move result up"
                            disabled={winnerLocked || index === 0 || (order[0]?.winner && index === 1)}
                            onClick={() => move(index, -1)}
                            className="grid size-8 place-items-center rounded-lg border border-border disabled:opacity-25"
                          >
                            <ArrowUp className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Move result down"
                            disabled={winnerLocked || index === order.length - 1}
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
                      onClick={() => { setEditingId(null); setOrder([]); setMessage(null); }}
                      className="min-h-10 rounded-lg border border-border text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={saveOrder.isPending}
                      onClick={() => void save()}
                      className="min-h-10 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      {saveOrder.isPending ? "Saving…" : "Save result order"}
                    </button>
                  </div>
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
