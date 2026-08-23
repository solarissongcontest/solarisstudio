import { CheckCircle2, CircleAlert, CircleDashed, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { confirmationsSupabase } from "@/integrations/confirmations/client";

type Entry = {
  id: string;
  song_title: string | null;
  review_status: string | null;
  removed?: boolean | null;
};

type ResponseRow = {
  id: string;
  country: string;
  participating: boolean;
  selection_method: string | null;
  entry_unknown: boolean;
  nf_entries_unknown: boolean;
  submitted_at: string;
  internal_entries: Entry | null;
  national_finals: {
    winning_entry_id: string | null;
    national_final_entries: Entry[];
  } | null;
  editions: { id: string } | null;
};

type CardState = "review" | "issue" | "ready" | "neutral";

function activeNfEntries(row: ResponseRow) {
  return (row.national_finals?.national_final_entries ?? []).filter(
    (entry) => !entry.removed && entry.review_status !== "removed",
  );
}

function responseCardState(row: ResponseRow): CardState {
  if (!row.participating) return "neutral";

  if (row.selection_method === "internal") {
    const entry = row.internal_entries;
    if (!entry?.song_title || row.entry_unknown) return "neutral";
    if (entry.review_status === "declined" || entry.review_status === "removed") return "issue";
    if (!entry.review_status || entry.review_status === "pending") return "review";
    if (entry.review_status === "accepted") return "ready";
    return "neutral";
  }

  if (row.selection_method === "national_final") {
    const entries = activeNfEntries(row);
    if (!entries.length || row.nf_entries_unknown) return "neutral";
    if (entries.some((entry) => entry.review_status === "declined")) return "issue";
    if (entries.some((entry) => !entry.review_status || entry.review_status === "pending")) return "review";
    if (!row.national_finals?.winning_entry_id) return "neutral";
    return "ready";
  }

  return "neutral";
}

const GUIDE = [
  {
    state: "review" as const,
    name: "Red",
    label: "Needs review",
    description: "Admin still needs to review at least one submitted song.",
    icon: CircleAlert,
    cardClass: "border-rose-400/55 bg-rose-400/[0.055] shadow-[0_0_20px_rgba(251,113,133,0.24),0_0_48px_rgba(244,63,94,0.12)]",
    iconClass: "text-rose-200",
  },
  {
    state: "issue" as const,
    name: "Yellow",
    label: "Needs fixing",
    description: "At least one song was declined or not accepted and needs fixing or replacing.",
    icon: XCircle,
    cardClass: "border-amber-300/55 bg-amber-300/[0.05] shadow-[0_0_20px_rgba(252,211,77,0.21),0_0_48px_rgba(245,158,11,0.11)]",
    iconClass: "text-amber-200",
  },
  {
    state: "ready" as const,
    name: "Green",
    label: "Ready",
    description: "The entry is accepted, or the NF songs are accepted and a winner has been selected.",
    icon: CheckCircle2,
    cardClass: "border-emerald-300/50 bg-emerald-300/[0.045] shadow-[0_0_20px_rgba(110,231,183,0.19),0_0_48px_rgba(16,185,129,0.10)]",
    iconClass: "text-emerald-200",
  },
  {
    state: "neutral" as const,
    name: "No glow",
    label: "Waiting",
    description: "Nothing is wrong. The delegation is still deciding its entry/NF winner, or is not participating.",
    icon: CircleDashed,
    cardClass: "border-white/[0.09] bg-white/[0.02]",
    iconClass: "text-muted-foreground",
  },
];

export function DelegationColourOverview() {
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [editionId, setEditionId] = useState("");
  const [target, setTarget] = useState<Element | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_responses");
      if (!alive) return;
      if (error) {
        setLoadError(error.message);
        return;
      }
      setRows(Array.isArray(data) ? (data as unknown as ResponseRow[]) : []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let cleanupSelect: (() => void) | null = null;

    const locate = () => {
      const page = document.querySelector("main.admin-main > .admin-page");
      if (!page) return;

      const editionSelect = page.querySelector("select");
      const editionCard = editionSelect?.closest(".admin-card") ?? null;
      if (!editionSelect || !editionCard) return;

      const select = editionSelect as HTMLSelectElement;
      setEditionId(select.value);

      let host = page.querySelector(":scope > [data-delegation-colour-overview-host]");
      if (!host) {
        host = document.createElement("div");
        host.setAttribute("data-delegation-colour-overview-host", "true");
        editionCard.insertAdjacentElement("afterend", host);
      }
      setTarget(host);

      cleanupSelect?.();
      const onChange = () => setEditionId(select.value);
      select.addEventListener("change", onChange);
      cleanupSelect = () => select.removeEventListener("change", onChange);
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cleanupSelect?.();
    };
  }, []);

  const scopedRows = useMemo(
    () => rows.filter((row) => !editionId || row.editions?.id === editionId),
    [editionId, rows],
  );

  const counts = useMemo(() => {
    const next: Record<CardState, number> = { review: 0, issue: 0, ready: 0, neutral: 0 };
    scopedRows.forEach((row) => {
      next[responseCardState(row)] += 1;
    });
    return next;
  }, [scopedRows]);

  const countryStates = useMemo(() => {
    const grouped = new Map<string, ResponseRow[]>();
    scopedRows.forEach((row) => {
      const key = row.country.trim().toLocaleLowerCase();
      const list = grouped.get(key) ?? [];
      list.push(row);
      grouped.set(key, list);
    });

    const result = new Map<string, CardState>();
    grouped.forEach((list, country) => {
      list.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
      const current = list.find((row) => row.participating) ?? list[0];
      if (current) result.set(country, responseCardState(current));
    });
    return result;
  }, [scopedRows]);

  useEffect(() => {
    const decorate = () => {
      const page = document.querySelector("main.admin-main > .admin-page");
      if (!page) return;

      page.querySelectorAll<HTMLElement>(".admin-card[data-delegation-state]").forEach((card) => {
        card.removeAttribute("data-delegation-state");
      });

      page.querySelectorAll<HTMLHeadingElement>(".admin-card h2").forEach((heading) => {
        const state = countryStates.get((heading.textContent ?? "").trim().toLocaleLowerCase());
        const card = heading.closest<HTMLElement>(".admin-card");
        if (state && card) card.dataset.delegationState = state;
      });
    };

    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [countryStates]);

  if (!target) return null;

  return createPortal(
    <>
      <style>{`
        .admin-card[data-delegation-state="review"] {
          border-color: rgba(244, 63, 94, .78) !important;
          background: radial-gradient(circle at 16% 0%, rgba(244, 63, 94, .22), transparent 48%), linear-gradient(145deg, rgba(244, 63, 94, .12), rgba(12, 28, 50, .94) 62%) !important;
          box-shadow: inset 0 0 58px rgba(244, 63, 94, .09), 0 0 0 1px rgba(244, 63, 94, .22), 0 0 30px rgba(244, 63, 94, .40), 0 0 72px rgba(244, 63, 94, .22) !important;
        }
        .admin-card[data-delegation-state="issue"] {
          border-color: rgba(245, 158, 11, .78) !important;
          background: radial-gradient(circle at 16% 0%, rgba(245, 158, 11, .21), transparent 48%), linear-gradient(145deg, rgba(245, 158, 11, .11), rgba(12, 28, 50, .94) 62%) !important;
          box-shadow: inset 0 0 58px rgba(245, 158, 11, .085), 0 0 0 1px rgba(245, 158, 11, .21), 0 0 30px rgba(245, 158, 11, .36), 0 0 72px rgba(245, 158, 11, .20) !important;
        }
        .admin-card[data-delegation-state="ready"] {
          border-color: rgba(16, 185, 129, .72) !important;
          background: radial-gradient(circle at 16% 0%, rgba(16, 185, 129, .20), transparent 48%), linear-gradient(145deg, rgba(16, 185, 129, .10), rgba(12, 28, 50, .94) 62%) !important;
          box-shadow: inset 0 0 58px rgba(16, 185, 129, .08), 0 0 0 1px rgba(16, 185, 129, .19), 0 0 30px rgba(16, 185, 129, .32), 0 0 72px rgba(16, 185, 129, .18) !important;
        }
      `}</style>

      <section className="mb-4 rounded-2xl border border-white/[0.08] bg-white/[0.018] p-3 sm:p-4" aria-label="Delegation colour guide">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="admin-section-label">Colour guide</p>
            <h2 className="mt-1 text-base font-bold tracking-[-.02em]">Current submission status</h2>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {scopedRows.length} submission{scopedRows.length === 1 ? "" : "s"} in this edition
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {GUIDE.map((item) => {
            const Icon = item.icon;
            const count = counts[item.state];
            return (
              <div key={item.state} className={`rounded-xl border p-3 ${item.cardClass}`}>
                <div className="flex items-start gap-2.5">
                  <Icon className={`mt-0.5 size-4 shrink-0 ${item.iconClass}`} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p className="text-xs font-black uppercase tracking-[.11em]">{item.name}</p>
                      <p className="numeric text-lg font-black leading-none">{count}</p>
                    </div>
                    <p className="mt-1 text-xs font-semibold">{item.label}</p>
                    <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
          Counts are individual confirmation responses in the selected edition, so one country can appear more than once if it submitted in multiple rounds. Country cards use the newest current response.
        </p>
        {loadError ? <p className="mt-2 text-[10px] text-rose-200">Colour counts could not be loaded: {loadError}</p> : null}
      </section>
    </>,
    target,
  );
}
