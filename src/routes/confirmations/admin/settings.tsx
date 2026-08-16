import "@/confirmations.css";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Copy, LogOut, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmationsAdminNav } from "@/components/confirmations/ConfirmationsAdminNav";
import { Button } from "@/components/ui/button";
import {
  loadConfirmationEditions,
  requireConfirmationsAdmin,
  type ConfirmationEdition,
} from "@/integrations/confirmations/admin";
import { confirmationsSupabase } from "@/integrations/confirmations/client";

export const Route = createFileRoute("/confirmations/admin/settings")({
  head: () => ({ meta: [{ title: "Confirmation Settings — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [editions, setEditions] = useState<ConfirmationEdition[]>([]);
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
        const rows = await loadConfirmationEditions();
        if (!alive) return;
        setEmail(admin.email ?? null);
        setEditions(rows);
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "Could not load settings.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [navigate]);

  const activeEdition = useMemo(
    () => editions.find((edition) => edition.status === "active") ?? editions[0] ?? null,
    [editions],
  );

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/confirmations` : "/confirmations";

  async function signOut() {
    await confirmationsSupabase.auth.signOut();
    await navigate({ to: "/confirmations/admin/sign-in" });
  }

  return (
    <div className="confirmations-theme min-h-screen">
      <div className="confirmations-backdrop" aria-hidden="true" />
      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6"><Link to="/confirmations/admin" className="text-xs text-white/55 hover:text-white">← Organiser overview</Link></div>
        <ConfirmationsAdminNav current="/confirmations/admin/settings" />

        <header className="mb-7">
          <div className="flex items-center gap-2 text-sky-100/70"><Settings2 className="size-4" /><p className="text-[10px] uppercase tracking-[0.22em]">Organiser workspace</p></div>
          <h1 className="confirmations-display mt-2 text-5xl font-normal uppercase leading-none sm:text-6xl">Settings</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">Account, system and reuse information for the Confirmations module now living inside Solaris Studio.</p>
        </header>

        {loading ? <div className="confirmations-surface p-8 text-center text-sm text-white/55">Loading settings…</div> : error ? <div className="confirmations-surface border-red-300/20 p-6 text-sm text-red-100">{error}</div> : (
          <div className="space-y-4">
            <section className="confirmations-surface p-5">
              <h2 className="text-lg font-medium text-white">Account & system</h2>
              <div className="mt-4 divide-y divide-white/8 text-sm">
                <div className="flex flex-wrap justify-between gap-3 py-3"><span className="text-white/40">Signed in as</span><span className="font-medium text-white/75">{email ?? "—"}</span></div>
                <div className="flex flex-wrap justify-between gap-3 py-3"><span className="text-white/40">Role</span><span className="font-medium text-white/75">Administrator</span></div>
                <div className="flex flex-wrap justify-between gap-3 py-3"><span className="text-white/40">Active edition</span><span className="font-medium text-white/75">{activeEdition ? `SSC ${activeEdition.edition_number} — ${activeEdition.name}` : "None"}</span></div>
                <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="text-white/40">Public form</span>
                  <div className="flex min-w-0 items-center gap-2"><code className="max-w-[520px] truncate text-xs text-white/70">{publicUrl}</code><Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(publicUrl); toast.success("Public form link copied"); }}><Copy className="size-3.5" /> Copy</Button></div>
                </div>
              </div>
            </section>

            <section className="confirmations-surface p-5">
              <h2 className="text-lg font-medium text-white">How to reuse Confirmations each edition</h2>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-white/50">
                <li>Create the new SSC edition on the Editions page.</li>
                <li>Add one or more submission rounds and optional response limits.</li>
                <li>Set a round to Open when confirmations should begin.</li>
                <li>The public portal updates from the same database automatically.</li>
                <li>Close new submissions separately from existing-response editing when delegations still need correction access.</li>
              </ol>
            </section>

            <section className="confirmations-surface p-5">
              <h2 className="text-lg font-medium text-white">Backend status</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/48">During the merger, Confirmations intentionally continues using its existing Supabase database. The old site and the Solaris Studio module therefore read and change the exact same submissions, rounds, review history and recovery codes.</p>
            </section>

            <Button variant="outline" onClick={() => void signOut()}><LogOut className="size-4" /> Sign out</Button>
          </div>
        )}
      </main>
    </div>
  );
}
