import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { Field, Select, TextInput } from "@/components/studio/Controls";
import { supabase } from "@/integrations/supabase/client";
import {
  editionLabel,
  useAllShows,
  useCountries,
  useEditions,
  useIsOrganizer,
  type Edition,
} from "@/lib/data";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Organizer studio — Solaris Spectacle Suite" },
      {
        name: "description",
        content: "Create and manage Solaris Song Contest editions, shows, voting systems and broadcasts.",
      },
      { property: "og:title", content: "Organizer studio — Solaris Spectacle Suite" },
      { property: "og:description", content: "Manage SSC editions, shows, votes and broadcast production." },
    ],
  }),
  component: AdminHome,
});

function AdminHome() {
  const { data: editions, isLoading: editionsLoading } = useEditions();
  const { data: countries } = useCountries();
  const { data: shows } = useAllShows();
  const { data: isOrganizer } = useIsOrganizer();
  const qc = useQueryClient();

  // Until editions have loaded, the next number is unknown — seeding the form
  // with 1 caused duplicate numbers and duplicate slugs on first submit.
  const nextNumber = editionsLoading
    ? null
    : Math.max(0, ...(editions ?? []).map((e) => e.edition_number ?? 0)) + 1;

  const [form, setForm] = useState({
    edition_number: "" as number | "",
    name: "",
    year: "",
    host_city: "",
    host_country_id: "",
  });
  const [numberTouched, setNumberTouched] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Fill in the suggested number once editions arrive, without ever overwriting
  // a value the organizer typed themselves.
  useEffect(() => {
    if (nextNumber !== null && !numberTouched && form.edition_number === "") {
      setForm((f) => ({ ...f, edition_number: nextNumber }));
    }
  }, [nextNumber, numberTouched, form.edition_number]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["editions"] });
    qc.invalidateQueries({ queryKey: ["shows"] });
  };

  const createEdition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setMsg(null);
    setError(null);

    const num = Number(form.edition_number);
    if (!Number.isInteger(num) || num < 1) {
      setError("Enter a whole edition number of 1 or higher.");
      return;
    }
    const slug = `ssc-${num}`;
    const clash = (editions ?? []).find((ed) => ed.edition_number === num || ed.slug === slug);
    if (clash) {
      setError(`Edition ${num} already exists (“${clash.name}”). Pick a different number.`);
      return;
    }

    setSaving(true);
    try {
      const { error: insertError } = await supabase.from("editions").insert({
        edition_number: num,
        name: form.name || `Solaris Song Contest ${num}`,
        year: form.year ? Number(form.year) : null,
        slug,
        host_city: form.host_city || null,
        host_country_id: form.host_country_id || null,
        status: "draft",
        published: false,
      });
      if (insertError) {
        // Keep everything the organizer typed so they can correct and retry.
        setError(reportSupabaseError(insertError, "Could not create the edition. Nothing was saved."));
        return;
      }
      setNumberTouched(false);
      setForm({ edition_number: num + 1, name: "", year: "", host_city: "", host_country_id: "" });
      setMsg(`Edition ${num} created.`);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (ed: Edition) => {
    setError(null);
    const { error: updateError } = await supabase
      .from("editions")
      .update({ published: !ed.published })
      .eq("id", ed.id);
    if (updateError) {
      setError(reportSupabaseError(updateError, "Could not change the visibility of this edition."));
      return;
    }
    setMsg(`${ed.name} is now ${ed.published ? "private" : "public"}.`);
    refresh();
  };

  const removeEdition = async (ed: Edition) => {
    if (!window.confirm(`Delete “${ed.name}” and all of its shows, votes and results?`)) return;
    setError(null);
    const { error: deleteError } = await supabase.from("editions").delete().eq("id", ed.id);
    if (deleteError) {
      setError(reportSupabaseError(deleteError, "Could not delete this edition."));
      return;
    }
    setMsg(`Deleted ${ed.name}.`);
    refresh();
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Organizer studio"
        title="Contest control room"
        description="Create numbered editions, build their shows, and run voting, design and broadcast per show."
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
          rejected. Ask an existing organizer to grant it.
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatTile label="Editions" value={editions?.length ?? 0} />
        <StatTile label="Shows" value={shows?.length ?? 0} />
        <StatTile label="Countries" value={countries?.length ?? 0} />
        <StatTile label="Public shows" value={(shows ?? []).filter((s) => s.published).length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Editions" description="Open an edition to manage its shows, votes, design and broadcast">
          <ul className="space-y-2">
            {(editions ?? []).map((ed) => {
              const eShows = (shows ?? []).filter((s) => s.edition_id === ed.id);
              return (
                <li key={ed.id} className="rounded-xl bg-surface px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {editionLabel(ed)} <span className="text-muted-foreground">· {ed.name}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ed.year ?? "Year TBC"} · {ed.host_city ?? "Host TBC"} · {eShows.length} shows ·{" "}
                        {ed.published ? "public" : "private"}
                      </p>
                    </div>
                    <button
                      onClick={() => togglePublished(ed)}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm"
                    >
                      {ed.published ? "Make private" : "Publish"}
                    </button>
                    <Link
                      to="/admin/$slug"
                      params={{ slug: ed.slug }}
                      className="bg-aurora rounded-lg px-3 py-1.5 text-sm font-medium text-primary-foreground"
                    >
                      Manage
                    </Link>
                    <button
                      onClick={() => removeEdition(ed)}
                      className="rounded-lg border border-destructive/50 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                    >
                      Delete
                    </button>
                  </div>
                  {!!eShows.length && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {eShows.map((s) => (
                        <Link
                          key={s.id}
                          to="/broadcast/$showId"
                          params={{ showId: s.id }}
                          className="rounded-lg bg-background/60 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {s.name} {s.published ? "· public" : "· private"}
                        </Link>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
            {!(editions ?? []).length && (
              <p className="text-sm text-muted-foreground">No editions yet — create SSC 1.</p>
            )}
          </ul>
        </Panel>

        <Panel title="New edition" description="Editions are numbered; the year is optional">
          <form onSubmit={createEdition} className="space-y-3">
            <Field label="Edition number">
              <TextInput
                type="number"
                min={1}
                required
                className="numeric"
                value={form.edition_number}
                onChange={(e) => setForm({ ...form, edition_number: Number(e.target.value) })}
              />
            </Field>
            <Field label="Name" hint={`Defaults to “Solaris Song Contest ${form.edition_number}”`}>
              <TextInput
                value={form.name}
                placeholder={`Solaris Song Contest ${form.edition_number}`}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Year (optional)">
              <TextInput
                type="number"
                className="numeric"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
              />
            </Field>
            <Field label="Host country">
              <Select
                value={form.host_country_id}
                onChange={(e) => setForm({ ...form, host_country_id: e.target.value })}
              >
                <option value="" className="bg-background">
                  Undecided
                </option>
                {(countries ?? []).map((c) => (
                  <option key={c.id} value={c.id} className="bg-background">
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Host city">
              <TextInput
                value={form.host_city}
                placeholder="Solvarra"
                onChange={(e) => setForm({ ...form, host_city: e.target.value })}
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
