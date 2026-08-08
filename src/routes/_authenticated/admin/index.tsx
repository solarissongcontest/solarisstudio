import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { Field, Select, TextInput } from "@/components/studio/Controls";
import { supabase } from "@/integrations/supabase/client";
import { reportSupabaseError } from "@/lib/errors";
import {
  editionLabel,
  useAllShows,
  useCountries,
  useEditions,
  useIsOrganizer,
  type Edition,
} from "@/lib/data";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Organizer studio — Solaris Spectacle Suite" },
      {
        name: "description",
        content:
          "Create and manage Solaris Song Contest editions, shows, voting systems and broadcasts.",
      },
      {
        property: "og:title",
        content: "Organizer studio — Solaris Spectacle Suite",
      },
      {
        property: "og:description",
        content: "Manage SSC editions, shows, votes and broadcast production.",
      },
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

  useEffect(() => {
    if (
      nextNumber !== null &&
      !numberTouched &&
      form.edition_number === ""
    ) {
      setForm((current) => ({
        ...current,
        edition_number: nextNumber,
      }));
    }
  }, [nextNumber, numberTouched, form.edition_number]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["editions"] });
    qc.invalidateQueries({ queryKey: ["shows"] });
  };

  const createEdition = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    setMsg(null);
    setError(null);

    const num = Number(form.edition_number);

    if (!Number.isInteger(num) || num < 1) {
      setError("Enter a whole edition number of 1 or higher.");
      return;
    }

    const slug = `ssc-${num}`;
    const clash = (editions ?? []).find(
      (edition) =>
        edition.edition_number === num || edition.slug === slug,
    );

    if (clash) {
      setError(
        `Edition ${num} already exists (“${clash.name}”). Pick a different number.`,
      );
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
        setError(
          reportSupabaseError(
            insertError,
            "Could not create the edition. Nothing was saved.",
          ),
        );
        return;
      }

      setNumberTouched(false);
      setForm({
        edition_number: num + 1,
        name: "",
        year: "",
        host_city: "",
        host_country_id: "",
      });
      setMsg(`Edition ${num} created.`);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (edition: Edition) => {
    setError(null);

    const { error: updateError } = await supabase
      .from("editions")
      .update({ published: !edition.published })
      .eq("id", edition.id);

    if (updateError) {
      setError(
        reportSupabaseError(
          updateError,
          "Could not change the visibility of this edition.",
        ),
      );
      return;
    }

    setMsg(
      `${edition.name} is now ${edition.published ? "private" : "public"}.`,
    );
    refresh();
  };

  const removeEdition = async (edition: Edition) => {
    if (
      !window.confirm(
        `Delete “${edition.name}” and all of its shows, votes and results?`,
      )
    ) {
      return;
    }

    setError(null);

    const { error: deleteError } = await supabase
      .from("editions")
      .delete()
      .eq("id", edition.id);

    if (deleteError) {
      setError(
        reportSupabaseError(
          deleteError,
          "Could not delete this edition.",
        ),
      );
      return;
    }

    setMsg(`Deleted ${edition.name}.`);
    refresh();
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Organizer studio"
        title="Contest control room"
        description="Create numbered editions, build their shows, and run voting, design and broadcast per show."
      />

      {isOrganizer === false && (
        <div className="glass mb-4 border border-destructive/40 p-3 text-xs leading-relaxed sm:mb-6 sm:p-4 sm:text-sm">
          Your account does not have the <strong>organizer</strong> role yet, so
          saving changes will be rejected. Ask an existing organizer to grant it.
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:mb-6 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Editions" value={editions?.length ?? 0} />
        <StatTile label="Shows" value={shows?.length ?? 0} />
        <StatTile label="Countries" value={countries?.length ?? 0} />
        <StatTile
          label="Public shows"
          value={(shows ?? []).filter((show) => show.published).length}
        />
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!error && msg && (
        <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
          {msg}
        </div>
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[1.4fr_1fr] lg:gap-6">
        <Panel
          title="Editions"
          description="Open an edition to manage its shows, votes, design and broadcast."
        >
          <ul className="space-y-2">
            {(editions ?? []).map((edition) => {
              const editionShows = (shows ?? []).filter(
                (show) => show.edition_id === edition.id,
              );

              return (
                <li
                  key={edition.id}
                  className="rounded-xl border border-border/60 bg-surface p-3 sm:px-4"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold sm:text-base">
                          {editionLabel(edition)}
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            · {edition.name}
                          </span>
                        </p>

                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
                          {edition.year ?? "Year TBC"} ·{" "}
                          {edition.host_city ?? "Host TBC"} ·{" "}
                          {editionShows.length} shows ·{" "}
                          {edition.published ? "public" : "private"}
                        </p>
                      </div>

                      <span
                        className={
                          edition.published
                            ? "shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[9px] font-semibold uppercase text-primary"
                            : "shrink-0 rounded-full bg-background/60 px-2 py-1 text-[9px] font-semibold uppercase text-muted-foreground"
                        }
                      >
                        {edition.published ? "Public" : "Private"}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      <Link
                        to="/admin/$slug"
                        params={{ slug: edition.slug }}
                        className="bg-aurora flex min-h-10 items-center justify-center rounded-lg px-3 text-sm font-medium text-primary-foreground"
                      >
                        Manage
                      </Link>

                      <button
                        type="button"
                        onClick={() => togglePublished(edition)}
                        className="min-h-10 rounded-lg border border-border px-3 text-sm"
                      >
                        {edition.published ? "Make private" : "Publish"}
                      </button>

                      <button
                        type="button"
                        onClick={() => removeEdition(edition)}
                        className="col-span-2 min-h-10 rounded-lg border border-destructive/50 px-3 text-sm text-destructive hover:bg-destructive/10 sm:col-span-1"
                      >
                        Delete
                      </button>
                    </div>

                    {!!editionShows.length && (
                      <div className="scroll-slim mt-3 flex gap-1.5 overflow-x-auto pb-1">
                        {editionShows.map((show) => (
                          <Link
                            key={show.id}
                            to="/broadcast/$showId"
                            params={{ showId: show.id }}
                            className="shrink-0 rounded-lg bg-background/60 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            {show.name}
                            {show.published ? " · public" : " · private"}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}

            {!(editions ?? []).length && (
              <p className="text-sm text-muted-foreground">
                No editions yet — create SSC 1.
              </p>
            )}
          </ul>
        </Panel>

        <Panel
          title="New edition"
          description="Editions are numbered; the year is optional."
        >
          <form onSubmit={createEdition} className="space-y-3">
            <Field
              label="Edition number"
              hint={
                editionsLoading
                  ? "Loading existing editions…"
                  : "Suggested from the highest existing edition"
              }
            >
              <TextInput
                type="number"
                min={1}
                required
                disabled={editionsLoading}
                className="numeric"
                value={form.edition_number}
                onChange={(event) => {
                  setNumberTouched(true);
                  setForm({
                    ...form,
                    edition_number:
                      event.target.value === ""
                        ? ""
                        : Number(event.target.value),
                  });
                }}
              />
            </Field>

            <Field
              label="Name"
              hint={`Defaults to “Solaris Song Contest ${
                form.edition_number || "…"
              }”`}
            >
              <TextInput
                value={form.name}
                placeholder={`Solaris Song Contest ${
                  form.edition_number || ""
                }`}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </Field>

            <Field label="Year (optional)">
              <TextInput
                type="number"
                className="numeric"
                value={form.year}
                onChange={(event) =>
                  setForm({ ...form, year: event.target.value })
                }
              />
            </Field>

            <Field label="Host country">
              <Select
                value={form.host_country_id}
                onChange={(event) =>
                  setForm({
                    ...form,
                    host_country_id: event.target.value,
                  })
                }
              >
                <option value="" className="bg-background">
                  Undecided
                </option>
                {(countries ?? []).map((country) => (
                  <option
                    key={country.id}
                    value={country.id}
                    className="bg-background"
                  >
                    {country.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Host city">
              <TextInput
                value={form.host_city}
                placeholder="Solvarra"
                onChange={(event) =>
                  setForm({ ...form, host_city: event.target.value })
                }
              />
            </Field>

            <button
              type="submit"
              disabled={saving || editionsLoading}
              className="bg-aurora min-h-11 w-full rounded-xl px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Creating edition…" : "Create edition"}
            </button>
          </form>
        </Panel>
      </div>
    </AppShell>
  );
}
