import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock3, ExternalLink, Music2, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { confirmationsSupabase } from "@/integrations/confirmations/client";
import { Input } from "@/components/ui/input";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";

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

type NextInLineWindowStatus = "draft" | "scheduled" | "open" | "closed" | "cancelled";

type NextInLineWindowSnapshot = {
  editionId: string;
  enabled: boolean;
  status: NextInLineWindowStatus;
  opensAt: string | null;
  closesAt: string | null;
  version: number;
  reason: string | null;
  changedAt: string | null;
  effectiveOpen: boolean;
  eligibleCountries: number;
  submittedCount: number;
};

type NextInLineWindowPreview = {
  editionId: string;
  currentStatus: NextInLineWindowStatus;
  targetStatus: NextInLineWindowStatus;
  enabled: boolean;
  opensAt: string | null;
  closesAt: string | null;
  expectedVersion: number;
  riskClass: "R1" | "R2";
  eligibleCountries: number;
  submittedCount: number;
};

type PendingWindowChange = {
  preview: NextInLineWindowPreview;
  operationId: string;
  idempotencyKey: string;
};

type RpcResult = {
  data: unknown;
  error: { message: string } | null;
};

const nextInLineRpc = confirmationsSupabase.rpc as unknown as (
  functionName: string,
  args: Record<string, unknown>,
) => Promise<RpcResult>;

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
  const [windowState, setWindowState] = useState<NextInLineWindowSnapshot | null>(null);
  const [windowLoading, setWindowLoading] = useState(true);
  const [windowError, setWindowError] = useState<string | null>(null);
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [pendingWindowChange, setPendingWindowChange] = useState<PendingWindowChange | null>(null);
  const [windowBusy, setWindowBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setWindowLoading(true);
    setWindowError(null);

    void confirmationsSupabase
      .rpc("admin_confirmation_next_in_line", { _edition_id: editionId || null })
      .then((result: { data: unknown; error: { message: string } | null }) => {
        if (!alive) return;
        if (result.error) {
          setRows([]);
          setError(result.error.message);
        } else {
          setRows(Array.isArray(result.data) ? (result.data as unknown as NextInLineRow[]) : []);
        }
        setLoading(false);
      });

    if (!editionId) {
      setWindowState(null);
      setWindowLoading(false);
    } else {
      void nextInLineRpc("studio2_next_in_line_admin_snapshot", {
        p_edition_id: editionId,
      }).then((result) => {
        if (!alive) return;
        if (result.error) {
          setWindowState(null);
          setWindowError(result.error.message);
        } else {
          const snapshot = result.data as NextInLineWindowSnapshot;
          setWindowState(snapshot);
          setOpensAt(toLocalDateTimeInput(snapshot.opensAt));
          setClosesAt(toLocalDateTimeInput(snapshot.closesAt));
        }
        setWindowLoading(false);
      });
    }

    return () => {
      alive = false;
    };
  }, [editionId, refreshNonce]);

  async function prepareWindowChange(targetStatus: NextInLineWindowStatus) {
    if (!editionId || windowBusy) return;
    setWindowBusy(true);
    setWindowError(null);
    try {
      const enabled = targetStatus === "scheduled" || targetStatus === "open";
      const requestedOpensAt =
        targetStatus === "open" && !opensAt ? null : fromLocalDateTimeInput(opensAt);
      const requestedClosesAt = fromLocalDateTimeInput(closesAt);

      const previewResult = await nextInLineRpc("studio2_next_in_line_window_change_preview", {
        p_edition_id: editionId,
        p_target_status: targetStatus,
        p_enabled: enabled,
        p_opens_at: requestedOpensAt,
        p_closes_at: requestedClosesAt,
      });
      if (previewResult.error) throw new Error(previewResult.error.message);

      const preview = previewResult.data as NextInLineWindowPreview;
      const operation = createOrganisationCommand({
        command: `next_in_line.window.${targetStatus}`,
        payload: {
          targetStatus,
          enabled,
          opensAt: requestedOpensAt,
          closesAt: requestedClosesAt,
        },
        riskClass: preview.riskClass,
        scope: { editionId },
        expectedVersion: preview.expectedVersion,
      });

      setChangeReason("");
      setPendingWindowChange({
        preview,
        operationId: operation.operationId,
        idempotencyKey: operation.idempotencyKey,
      });
    } catch (caught) {
      setWindowError(errorText(caught));
    } finally {
      setWindowBusy(false);
    }
  }

  async function applyWindowChange() {
    if (!editionId || !pendingWindowChange || !changeReason.trim() || windowBusy) return;
    setWindowBusy(true);
    setWindowError(null);
    try {
      const preview = pendingWindowChange.preview;
      const result = await nextInLineRpc("studio2_apply_next_in_line_window_change", {
        p_edition_id: editionId,
        p_target_status: preview.targetStatus,
        p_enabled: preview.enabled,
        p_opens_at: preview.opensAt,
        p_closes_at: preview.closesAt,
        p_reason: changeReason.trim(),
        p_operation_id: pendingWindowChange.operationId,
        p_idempotency_key: pendingWindowChange.idempotencyKey,
        p_expected_version: preview.expectedVersion,
      });
      if (result.error) throw new Error(result.error.message);
      setPendingWindowChange(null);
      setChangeReason("");
      setRefreshNonce((value) => value + 1);
    } catch (caught) {
      setWindowError(errorText(caught));
    } finally {
      setWindowBusy(false);
    }
  }

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

        <AdminCard strong>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="admin-section-label">Participation window</p>
                <h2 className="mt-1 text-lg font-bold">Next in Line runtime</h2>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                  Server-authoritative window state controls the public Next in Line experience.
                  Opening, closing and cancelling use a versioned operation with an impact preview.
                </p>
              </div>
              {windowLoading ? (
                <AdminStatus tone="neutral">Loading…</AdminStatus>
              ) : windowState ? (
                <AdminStatus tone={windowState.effectiveOpen ? "ready" : "neutral"}>
                  {windowState.effectiveOpen ? "Open now" : humanize(windowState.status)}
                </AdminStatus>
              ) : (
                <AdminStatus tone="attention">Unavailable</AdminStatus>
              )}
            </div>

            {windowError ? (
              <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.05] p-3 text-sm text-rose-100">
                {windowError}
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-4">
              <Metric label="Eligible countries" value={windowState?.eligibleCountries ?? 0} />
              <Metric label="Submitted" value={windowState?.submittedCount ?? 0} />
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.022] p-3">
                <label className="text-xs font-semibold text-muted-foreground" htmlFor="nil-opens-at">
                  Opens at
                </label>
                <input
                  id="nil-opens-at"
                  type="datetime-local"
                  value={opensAt}
                  onChange={(event) => setOpensAt(event.target.value)}
                  className="admin-input mt-2"
                />
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.022] p-3">
                <label className="text-xs font-semibold text-muted-foreground" htmlFor="nil-closes-at">
                  Closes at
                </label>
                <input
                  id="nil-closes-at"
                  type="datetime-local"
                  value={closesAt}
                  onChange={(event) => setClosesAt(event.target.value)}
                  className="admin-input mt-2"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="admin-action-secondary"
                disabled={!editionId || windowBusy}
                onClick={() => void prepareWindowChange("draft")}
              >
                Draft
              </button>
              <button
                type="button"
                className="admin-action-secondary"
                disabled={!editionId || windowBusy || !opensAt}
                onClick={() => void prepareWindowChange("scheduled")}
              >
                <Clock3 className="size-4" />
                Schedule
              </button>
              <button
                type="button"
                className="admin-action-primary"
                disabled={!editionId || windowBusy}
                onClick={() => void prepareWindowChange("open")}
              >
                Open
              </button>
              <button
                type="button"
                className="admin-action-secondary"
                disabled={!editionId || windowBusy}
                onClick={() => void prepareWindowChange("closed")}
              >
                Close
              </button>
              <button
                type="button"
                className="admin-action-danger"
                disabled={!editionId || windowBusy}
                onClick={() => void prepareWindowChange("cancelled")}
              >
                Cancel window
              </button>
            </div>

            {windowState?.reason ? (
              <p className="text-[11px] text-muted-foreground">
                Last reason: {windowState.reason}
                {windowState.changedAt ? ` · ${formatDate(windowState.changedAt)}` : ""}
              </p>
            ) : null}
          </div>
        </AdminCard>

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
        <AdminConfirmSheet
          open={Boolean(pendingWindowChange)}
          onClose={() => {
            if (!windowBusy) {
              setPendingWindowChange(null);
              setChangeReason("");
            }
          }}
          onConfirm={applyWindowChange}
          title={
            pendingWindowChange
              ? `${humanize(pendingWindowChange.preview.targetStatus)} Next in Line window?`
              : "Change Next in Line window?"
          }
          description={
            pendingWindowChange ? (
              <div className="space-y-3">
                <p>
                  {humanize(pendingWindowChange.preview.currentStatus)} →{" "}
                  <strong className="text-foreground">
                    {humanize(pendingWindowChange.preview.targetStatus)}
                  </strong>
                  . {pendingWindowChange.preview.eligibleCountries} countries are currently eligible
                  and {pendingWindowChange.preview.submittedCount} have submitted.
                </p>
                <label className="block">
                  <span className="text-xs font-semibold text-foreground">
                    Operator reason
                  </span>
                  <textarea
                    value={changeReason}
                    onChange={(event) => setChangeReason(event.target.value)}
                    className="admin-input mt-2 min-h-24 resize-y"
                    placeholder="Why is this window state changing?"
                  />
                </label>
              </div>
            ) : (
              "Review the window impact before continuing."
            )
          }
          confirmLabel="Apply window change"
          confirmationText={
            pendingWindowChange?.preview.riskClass === "R2"
              ? pendingWindowChange.preview.targetStatus.toUpperCase()
              : undefined
          }
          confirmationHint={
            pendingWindowChange?.preview.riskClass === "R2"
              ? `Type ${pendingWindowChange.preview.targetStatus.toUpperCase()} to confirm`
              : undefined
          }
          busy={windowBusy}
          confirmDisabled={changeReason.trim().length < 5}
          danger={
            pendingWindowChange?.preview.targetStatus === "cancelled" ||
            pendingWindowChange?.preview.targetStatus === "closed"
          }
        />
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

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Next in Line operation failed.";
}

function toLocalDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function fromLocalDateTimeInput(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
