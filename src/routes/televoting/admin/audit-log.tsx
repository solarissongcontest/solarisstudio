import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock3, FileClock, Search } from "lucide-react";

import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { getMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import { listMergedAuditLog, type MergedAuditRow } from "@/integrations/televoting/audit.functions";
import type { AuditJson } from "@/integrations/televoting/audit.server";

export const Route = createFileRoute("/televoting/admin/audit-log")({
  head: () => ({
    meta: [
      { title: "Voting audit log — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditLogPage,
});

function AuditLogPage() {
  const navigate = useNavigate();
  const getAdmin = useServerFn(getMergedTelevotingAdmin);
  const getAudit = useServerFn(listMergedAuditLog);
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");

  const { data: admin, isLoading: adminLoading } = useQuery({
    queryKey: ["merged-televoting-admin"],
    queryFn: () => getAdmin(),
  });

  useEffect(() => {
    if (!adminLoading && !admin) {
      void navigate({ to: "/auth", search: { redirect: "/televoting/admin/audit-log" } });
    }
  }, [admin, adminLoading, navigate]);

  const { data: rows = [], isLoading, error } = useQuery<MergedAuditRow[]>({
    queryKey: ["merged-televoting-audit", action, targetType],
    queryFn: () =>
      getAudit({ data: { action: action || null, targetType: targetType || null, limit: 750 } }),
    enabled: Boolean(admin),
    staleTime: 30_000,
    // Audit history is not a live scoreboard. Refresh often enough to stay
    // useful without re-downloading hundreds of rows every 15 seconds.
    refetchInterval: 60_000,
  });

  const actions = useMemo<string[]>(
    () => [...new Set(rows.map((row) => row.action))].sort(),
    [rows],
  );
  const targetTypes = useMemo<string[]>(
    () =>
      [
        ...new Set(
          rows.map((row) => row.target_type).filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [rows],
  );

  // old_values/new_values can be large JSON objects. Build their searchable
  // text once when rows change instead of JSON.stringify-ing every row on
  // every keypress in the search box.
  const searchableRows = useMemo(
    () =>
      rows.map((row) => ({
        row,
        searchText: [
          row.action,
          row.actor_username ?? "",
          row.target_type ?? "",
          row.target_id ?? "",
          row.reason ?? "",
          JSON.stringify(row.old_values ?? ""),
          JSON.stringify(row.new_values ?? ""),
        ]
          .join(" ")
          .toLowerCase(),
      })),
    [rows],
  );

  const filtered = useMemo<MergedAuditRow[]>(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return searchableRows.filter(({ searchText }) => searchText.includes(term)).map(({ row }) => row);
  }, [query, rows, searchableRows]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <AdminPageHeader
        eyebrow="Voting service"
        title="Audit log"
        description="Trace result, round, moderation and integrity changes in one chronological organizer history. Technical payloads stay collapsed until you need them."
        actions={
          <Link to="/televoting/admin" className="admin-action-secondary">
            Back to Voting
          </Link>
        }
      />

      <AdminCard>
        <AdminCardHeader
          eyebrow="Filter"
          title={`${filtered.length} visible event${filtered.length === 1 ? "" : "s"}`}
          description="Search the actor, action, reason, target or changed values."
        />
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="relative block sm:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search audit history…"
              className="min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] pl-9 pr-3 text-sm text-foreground outline-none focus:border-sky-200/30"
            />
          </label>
          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="min-h-11 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none"
          >
            <option value="">All actions</option>
            {actions.map((item) => (
              <option key={item} value={item}>
                {humanize(item)}
              </option>
            ))}
          </select>
          <select
            value={targetType}
            onChange={(event) => setTargetType(event.target.value)}
            className="min-h-11 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none"
          >
            <option value="">All targets</option>
            {targetTypes.map((item) => (
              <option key={item} value={item}>
                {humanize(item)}
              </option>
            ))}
          </select>
        </div>
      </AdminCard>

      {adminLoading || isLoading ? (
        <AdminCard>
          <p className="py-8 text-center text-sm text-muted-foreground">Loading audit history…</p>
        </AdminCard>
      ) : error ? (
        <AdminCard className="!border-rose-200/15 !bg-rose-200/[0.045]">
          <p className="text-sm text-rose-100">
            {error instanceof Error ? error.message : "Audit log could not be loaded."}
          </p>
        </AdminCard>
      ) : filtered.length ? (
        <div className="space-y-2">
          {filtered.map((row) => (
            <AdminCard key={row.id} className="!p-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100">
                  <FileClock className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{humanize(row.action)}</p>
                    {row.target_type ? (
                      <AdminStatus tone="neutral">{humanize(row.target_type)}</AdminStatus>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{row.actor_username ?? "System"}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="size-3" /> {new Date(row.created_at).toLocaleString()}
                    </span>
                  </div>
                  {row.reason ? (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{row.reason}</p>
                  ) : null}
                  {row.target_id || row.old_values != null || row.new_values != null ? (
                    <details className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
                        Technical change details
                      </summary>
                      {row.target_id ? (
                        <p className="mt-2 break-all text-xs text-muted-foreground">Target {row.target_id}</p>
                      ) : null}
                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        {row.old_values != null ? <JsonBlock label="Before" value={row.old_values} /> : null}
                        {row.new_values != null ? <JsonBlock label="After" value={row.new_values} /> : null}
                      </div>
                    </details>
                  ) : null}
                </div>
              </div>
            </AdminCard>
          ))}
        </div>
      ) : (
        <AdminCard>
          <AdminEmptyState
            icon={FileClock}
            title="No events match"
            description="Change the filters to widen the audit history."
          />
        </AdminCard>
      )}
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: AuditJson }) {
  return (
    <div>
      <p className="admin-section-label mb-2">{label}</p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/[0.06] bg-black/15 p-3 text-xs leading-relaxed text-muted-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
