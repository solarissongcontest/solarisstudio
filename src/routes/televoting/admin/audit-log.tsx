import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock3, FileClock, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { getMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import { listMergedAuditLog } from "@/integrations/televoting/audit.functions";

export const Route = createFileRoute("/televoting/admin/audit-log")({
  head: () => ({ meta: [{ title: "Televoting Audit Log — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
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
    if (!adminLoading && !admin) void navigate({ to: "/televoting/admin/sign-in" });
  }, [admin, adminLoading, navigate]);

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["merged-televoting-audit", action, targetType],
    queryFn: () => getAudit({ data: { action: action || null, targetType: targetType || null, limit: 750 } }),
    enabled: Boolean(admin),
    refetchInterval: 15_000,
  });

  const actions = useMemo(() => [...new Set(rows.map((row) => row.action))].sort(), [rows]);
  const targetTypes = useMemo(() => [...new Set(rows.map((row) => row.target_type).filter((value): value is string => Boolean(value)))].sort(), [rows]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => [
      row.action,
      row.actor_username ?? "",
      row.target_type ?? "",
      row.target_id ?? "",
      row.reason ?? "",
      JSON.stringify(row.old_values ?? ""),
      JSON.stringify(row.new_values ?? ""),
    ].join(" ").toLowerCase().includes(term));
  }, [query, rows]);

  return (
    <div className="mx-auto max-w-6xl py-4 sm:py-8">
      <div className="mb-5"><Link to="/televoting/admin" className="text-xs text-muted-foreground hover:text-foreground">← Televoting control centre</Link></div>

      <header className="mb-8">
        <div className="flex items-center gap-2 text-sky-100/65"><FileClock className="size-4" /><p className="text-[10px] uppercase tracking-[0.22em]">Administrator history</p></div>
        <h1 className="font-display mt-2 text-5xl uppercase leading-none sm:text-6xl">Audit log</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Every merged result, round, moderation and account action continues writing to the existing Televoting audit table. This view makes that history inspectable inside Solaris Studio.</p>
      </header>

      <section className="glass mb-4 grid gap-3 p-4 lg:grid-cols-[1fr_220px_220px]">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search actor, action, reason or changed values…" className="pl-9" /></div>
        <select value={action} onChange={(event) => setAction(event.target.value)} className="h-10 rounded-xl border border-white/12 bg-black/20 px-3 text-sm"><option value="">All actions</option>{actions.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
        <select value={targetType} onChange={(event) => setTargetType(event.target.value)} className="h-10 rounded-xl border border-white/12 bg-black/20 px-3 text-sm"><option value="">All targets</option>{targetTypes.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
      </section>

      {adminLoading || isLoading ? (
        <section className="glass-strong p-8 text-center text-sm text-muted-foreground">Loading audit history…</section>
      ) : error ? (
        <section className="glass-strong border-destructive/30 p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Audit log could not be loaded."}</section>
      ) : (
        <section className="space-y-2">
          {filtered.map((row) => (
            <article key={row.id} className="glass p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-sky-200/15 bg-sky-200/8 px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-sky-100">{row.action.replaceAll("_", " ")}</span>{row.target_type ? <span className="rounded-full border border-white/10 px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{row.target_type.replaceAll("_", " ")}</span> : null}</div>
                  <p className="mt-3 text-sm"><span className="text-muted-foreground">Actor:</span> <span className="font-medium">{row.actor_username ?? "System"}</span>{row.target_id ? <><span className="mx-2 text-white/20">·</span><span className="font-mono text-xs text-muted-foreground">{row.target_id}</span></> : null}</p>
                  {row.reason ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{row.reason}</p> : null}
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground"><Clock3 className="size-3" /> {new Date(row.created_at).toLocaleString()}</span>
              </div>

              {(row.old_values != null || row.new_values != null) ? <details className="mt-3 rounded-xl border border-white/8 bg-black/10 p-3"><summary className="cursor-pointer text-xs text-muted-foreground">Changed values</summary><div className="mt-3 grid gap-3 lg:grid-cols-2">{row.old_values != null ? <JsonBlock label="Before" value={row.old_values} /> : null}{row.new_values != null ? <JsonBlock label="After" value={row.new_values} /> : null}</div></details> : null}
            </article>
          ))}
          {!filtered.length ? <div className="glass-strong p-8 text-center text-sm text-muted-foreground">No audit events match this filter.</div> : null}
        </section>
      )}
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return <div><p className="mb-1.5 text-[9px] uppercase tracking-[0.13em] text-muted-foreground">{label}</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/20 p-2 text-[10px] leading-relaxed text-white/55">{JSON.stringify(value, null, 2)}</pre></div>;
}
