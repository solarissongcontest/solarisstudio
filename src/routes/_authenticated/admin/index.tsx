import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useCountries, useEditions, type Edition } from "@/lib/data";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Organizer studio — Solaris Scoreboard Studio" },
      {
        name: "description",
        content: "Create and manage Solaris Song Contest editions, participants and voting data.",
      },
      { property: "og:title", content: "Organizer studio — Solaris Scoreboard Studio" },
      { property: "og:description", content: "Manage SSC editions, participants and results." },
    ],
  }),
  component: AdminHome,
});

function AdminHome() {
  const { data: editions } = useEditions();
  const { data: countries } = useCountries();
  const qc = useQueryClient();
  const [isOrganizer, setIsOrganizer] = useState<boolean | null>(null);
  const [form, setForm] = useState({ name: "", year: new Date().getFullYear(), slug: "", host_city: "" });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return setIsOrganizer(false);
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "organizer")
        .maybeSingle();
      setIsOrganizer(!!data);
    })();
  }, []);

  const createEdition = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const { error } = await supabase.from("editions").insert({
      name: form.name,
      year: form.year,
      slug: form.slug || form.name.toLowerCase().replace(/\s+/g, "-"),
      host_city: form.host_city || null,
      status: "draft",
    });
    if (error) setMsg(error.message);
    else {
      setForm({ name: "", year: new Date().getFullYear(), slug: "", host_city: "" });
      qc.invalidateQueries({ queryKey: ["editions"] });
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Organizer studio"
        title="Contest control room"
        description="Create editions, assign participants and enter jury and televote results."
        actions={
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/";
            }}
            className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface"
          >
            Sign out
          </button>
        }
      />

      {isOrganizer === false && (
        <div className="glass mb-6 border border-destructive/40 p-4 text-sm">
          Your account does not have the <strong>organizer</strong> role yet, so saving changes will be
          rejected by the database. Ask an existing organizer to grant it.
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Editions" value={editions?.length ?? 0} />
        <StatTile label="Countries" value={countries?.length ?? 0} />
        <StatTile
          label="Completed editions"
          value={(editions ?? []).filter((e) => e.status === "completed").length}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Editions" description="Open an edition to manage its participants and votes">
          <ul className="space-y-2">
            {(editions ?? []).map((ed: Edition) => (
              <li key={ed.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{ed.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ed.year} · {ed.host_city ?? "Host TBC"} · {ed.status}
                  </p>
                </div>
                <Link
                  to="/admin/$slug"
                  params={{ slug: ed.slug }}
                  className="rounded-lg bg-surface-strong px-3 py-1.5 text-sm"
                >
                  Manage
                </Link>
                <Link
                  to="/broadcast/$slug"
                  params={{ slug: ed.slug }}
                  className="bg-aurora rounded-lg px-3 py-1.5 text-sm font-medium text-primary-foreground"
                >
                  Broadcast
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="New edition" description="Draft a new Solaris Song Contest">
          <form onSubmit={createEdition} className="space-y-3">
            <Field label="Name">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Solaris Song Contest II"
                className="w-full rounded-xl bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Year">
              <input
                type="number"
                required
                value={form.year}
                onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
                className="numeric w-full rounded-xl bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Slug">
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="ssc-2"
                className="w-full rounded-xl bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Host city">
              <input
                value={form.host_city}
                onChange={(e) => setForm({ ...form, host_city: e.target.value })}
                placeholder="Solvarra"
                className="w-full rounded-xl bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <button className="bg-aurora w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-primary-foreground">
              Create edition
            </button>
            {msg && <p className="text-sm text-destructive">{msg}</p>}
          </form>
        </Panel>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
