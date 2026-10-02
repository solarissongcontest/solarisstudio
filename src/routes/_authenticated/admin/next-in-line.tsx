import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, Music2, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { confirmationsSupabase } from "@/integrations/confirmations/client";
import { Input } from "@/components/ui/input";

type NextInLineRow = {
  id: string;
  edition_id: string;
  source_submission_id: string | null;
  country: string;
  participating: boolean;
  entry_unknown: boolean;
  selection_type: string;
  national_final_entry_id: string | null;
  artist: string | null;
  song_title: string | null;
  song_url: string | null;
  preview_start: string | null;
  preview_end: string | null;
  submitted_at: string;
  edition: { id: string; name: string; edition_number: number } | null;
};

type SearchState = { country?: string };

export const Route = createFileRoute("/_authenticated/admin/next-in-line")({
  validateSearch: (search: Record<string, unknown>): SearchState => ({
    country: typeof search.country === "string" && search.country.trim()
      ? search.country.trim()
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Next in Line — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NextInLineAdminPage,
});

function NextInLineAdminPage() {
  const { editionId } = useAdminContext();
  const search = Route.useSearch();
  const [rows, setRows] = useState<NextInLineRow[]>([]);
  const [query, setQuery] = useState(search.country ?? "");
  const [loading, setLoading] = useState(true);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    void confirmationsSupabase
      .rpc("admin_confirmation_next_in_line", { _edition_id: editionId || null })
      .then((result) => {
        if (!alive) return;
        if (result.error) {
          setRows([]);
          setError(result.error.message);
        } else {
          setRows(Array.isArray(result.data) ? (result.data as unknown as NextInLineRow[]) : []);
        }
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [editionId, refreshNonce]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [
        row.country,
        row.artist ?? "",
        row.song_title ?? "",
        row.selection_type,
        row.edition?.name ?? "",
        row.edition?.edition_number ? `SSC ${row.edition.edition_number}` : "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [query, rows]);

  const participating = rows.filter((row) => row.participating).length;
  const knownEntries = rows.filter(
    (row) => row.participating && !row.entry_unknown && Boolean(row.song_title),
  ).length;

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl space-y-4">
        <AdminPageHeader
          eyebrow="Delegations · Participation"
          title="Next in Line"
          description="Operate the side-competition submission domain separately from official SSC confirmation requirements. A Next in Line response never creates a second confirmation requirement."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link to="/confirmations/admin/responses" className="admin-action-secondary">
                Confirmation responses
              </Link>
              <a href="/next-in-line" className="admin-action-secondary">
                Public experience
                <ExternalLink className="size-4" />
              </a>
              <button
                type="button"
                className="admin-action-secondary"
                onClick={() => setRefreshNonce((value) => value + 1)}
                disabled={loading}
              >
                <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
                Refresh
              </button>
            </div>
          }
        />

        <section className="grid gap-3 sm:grid-cols-3">
          <Metric label="Responses" value={rows.length} />
          <Metric label="Participating" value={participating} />
          <Metric label="Entry known" value={knownEntries} />
        </section>

        <AdminCard>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search country, artist or song…"
              className="min-h-11 pl-9"
            />
          </div>
        </AdminCard>

        {loading ? (
          <AdminCard>
            <p className="py-12 text-center text-sm text-muted-foreground">
              Loading Next in Line responses…
            </p>
          </AdminCard>
        ) : error ? (
          <AdminCard>
            <AdminEmptyState
              icon={Music2}
              title="Next in Line could not be loaded"
              description={error}
            />
          </AdminCard>
        ) : filtered.length ? (
          <section className="grid gap-3 lg:grid-cols-2">
            {filtered.map((row) => (
              <AdminCard key={row.id} className="!p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="admin-section-label">
                      {row.edition ? `SSC ${row.edition.edition_number}` : "Next in Line"}
                    </p>
                    <h2 className="mt-1 text-lg font-bold">{row.country}</h2>
                  </div>
                  <AdminStatus tone={row.participating ? "ready" : "neutral"}>
                    {row.participating ? "Participating" : "Not participating"}
                  </AdminStatus>
                </div>

                {row.participating ? (
                  <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.022] p-3">
                    <p className="font-semibold">
                      {row.entry_unknown
                        ? "Entry not known yet"
                        : row.song_title
                          ? `${row.artist || "Unknown artist"} — ${row.song_title}`
                          : "Entry details not submitted"}
                    </p>
                    <p className="mt-1 text-xs capitalize text-muted-foreground">
                      {row.selection_type.replaceAll("_", " ")}
                      {row.preview_start
                        ? ` · preview ${row.preview_start}${row.preview_end ? `–${row.preview_end}` : ""}`
                        : ""}
                    </p>
                    {row.song_url ? (
                      <a
                        href={row.song_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex text-xs font-semibold text-sky-100 underline"
                      >
                        Open submitted song
                      </a>
                    ) : null}
                  </div>
                ) : null}

                <p className="mt-3 text-[11px] text-muted-foreground">
                  Submitted {formatDate(row.submitted_at)}
                </p>
              </AdminCard>
            ))}
          </section>
        ) : (
          <AdminCard>
            <AdminEmptyState
              icon={Music2}
              title="No Next in Line responses"
              description="No response matches the selected edition and search."
            />
          </AdminCard>
        )}
      </div>
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <AdminCard>
      <p className="admin-section-label">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
    </AdminCard>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
