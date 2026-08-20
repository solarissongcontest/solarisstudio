import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { useCountries } from "@/lib/data";

export const Route = createFileRoute("/wiki/")({
  head: () => ({
    meta: [
      { title: "Terra Solaris Wiki — Solaris Studio" },
      {
        name: "description",
        content: "Browse Terra Solaris country profiles and national information.",
      },
    ],
  }),
  component: WikiIndexPage,
});

function WikiIndexPage() {
  const { data: countries } = useCountries();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...(countries ?? [])]
      .filter((country) =>
        !query ||
        country.name.toLowerCase().includes(query) ||
        country.short_code.toLowerCase().includes(query) ||
        (country.native_name ?? "").toLowerCase().includes(query),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [countries, search]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Terra Solaris"
        title="Wiki"
        description="Browse national profiles, country information and Solaris Song Contest history."
        className="directory-page-hero wiki-library-hero"
        actions={
          <Link
            to="/countries"
            className="directory-page-action w-full rounded-xl border px-3 py-2 text-center text-sm font-semibold sm:w-auto"
          >
            SSC country directory →
          </Link>
        }
      />

      <section className="directory-page-filter mb-5 rounded-2xl border p-3 sm:p-4">
        <label className="relative block">
          <span className="sr-only">Search the Wiki</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search country or code…"
            className="min-h-11 w-full rounded-xl border border-border bg-background/45 pl-10 pr-3 text-sm outline-none transition focus:border-primary/55"
          />
        </label>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Country articles</p>
            <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl">Browse the Wiki</h2>
          </div>
          <span className="numeric text-xs text-muted-foreground">{filtered.length}</span>
        </div>

        <div className="wiki-library-grid grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((country) => (
            <Link
              key={country.id}
              to="/wiki/$code"
              params={{ code: country.short_code }}
              className="directory-country-card group flex min-w-0 items-center gap-3 rounded-2xl border p-4 transition"
              style={{ "--country-card-accent": country.accent_color } as React.CSSProperties}
            >
              <FlagChip
                code={country.short_code}
                color={country.accent_color}
                image={country.flag_image}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{country.name}</p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {country.region || "Terra Solaris"} · {country.short_code}
                </p>
              </div>
              <span className="shrink-0 text-primary transition-transform group-hover:translate-x-1">→</span>
            </Link>
          ))}

          {!filtered.length && (
            <div className="rounded-2xl border border-border/70 bg-surface p-7 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
              No Wiki country matches that search.
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
