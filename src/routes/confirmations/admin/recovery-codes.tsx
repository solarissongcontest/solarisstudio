import "@/confirmations.css";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, Search } from "lucide-react";
import { toast } from "sonner";

import { ConfirmationsAdminNav } from "@/components/confirmations/ConfirmationsAdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  loadConfirmationRecoveryCodes,
  requireConfirmationsAdmin,
  type ConfirmationRecoveryCode,
} from "@/integrations/confirmations/admin";

export const Route = createFileRoute("/confirmations/admin/recovery-codes")({
  head: () => ({ meta: [{ title: "Recovery Codes — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: RecoveryCodesPage,
});

function RecoveryCodesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ConfirmationRecoveryCode[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const admin = await requireConfirmationsAdmin();
        if (!admin) {
          await navigate({ to: "/confirmations/admin/sign-in" });
          return;
        }
        const data = await loadConfirmationRecoveryCodes();
        if (alive) setRows(data);
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "Could not load recovery codes.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [navigate]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => [row.country, row.instagram_username, row.round_name, row.edition_name].join(" ").toLowerCase().includes(term));
  }, [query, rows]);

  return (
    <div className="confirmations-theme min-h-screen">
      <div className="confirmations-backdrop" aria-hidden="true" />
      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6"><Link to="/confirmations/admin" className="text-xs text-white/55 hover:text-white">← Organiser overview</Link></div>
        <ConfirmationsAdminNav current="/confirmations/admin/recovery-codes" />

        <header className="mb-7">
          <div className="flex items-center gap-2 text-sky-100/70"><KeyRound className="size-4" /><p className="text-[10px] uppercase tracking-[0.22em]">Edit access</p></div>
          <h1 className="confirmations-display mt-2 text-5xl font-normal uppercase leading-none sm:text-6xl">Recovery codes</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">Every submitted response receives a recovery code. These codes grant access to delegation responses, so they are intentionally only exposed inside this admin-only view.</p>
        </header>

        <div className="confirmations-surface mb-5 p-4">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search country, username, edition or round…" className="pl-9" /></div>
        </div>

        {loading ? <div className="confirmations-surface p-8 text-center text-sm text-white/55">Loading recovery codes…</div> : error ? <div className="confirmations-surface border-red-300/20 p-6 text-sm text-red-100">{error}</div> : (
          <section className="confirmations-surface overflow-hidden">
            {!filtered.length ? <div className="p-8 text-center text-sm text-white/50">No matching submissions.</div> : (
              <div className="divide-y divide-white/8">
                {filtered.map((row) => (
                  <div key={row.id} className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><h2 className="font-medium text-white">{row.country}</h2><span className="text-xs text-white/38">@{row.instagram_username.replace(/^@/, "")}</span></div>
                      <p className="mt-1 text-xs text-white/35">SSC {row.edition_number} · {row.round_name}</p>
                      <code className="mt-3 inline-block rounded-lg border border-sky-200/20 bg-sky-200/8 px-3 py-2 text-sm font-semibold tracking-[0.14em] text-sky-50">{row.recovery_code ?? "No code"}</code>
                    </div>
                    <Button size="sm" variant="outline" disabled={!row.recovery_code} onClick={async () => {
                      if (!row.recovery_code) return;
                      await navigator.clipboard.writeText(row.recovery_code);
                      toast.success(`${row.country} recovery code copied`);
                    }}><Copy className="size-4" /> Copy</Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <p className="mt-5 text-xs leading-relaxed text-white/32">Treat recovery codes like private credentials. Anyone with the correct country, round and code can recover access to that response.</p>
      </main>
    </div>
  );
}
