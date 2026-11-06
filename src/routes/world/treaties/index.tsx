import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { parsePublishedTreaties } from "@/lib/world-treaties";

const db = supabase as any;

function TreatyDirectory() {
  const [filter, setFilter] = useState("");
  const treaties = useQuery({
    queryKey: ["tg4-published-treaties"],
    staleTime: 120_000,
    retry: 1,
    queryFn: async ({ signal }) => {
      if (signal.aborted) throw new Error("Treaty request cancelled");
      const { data, error } = await db.rpc("world_get_published_treaties_v1", {
        p_organization_slug: null, p_limit: 100,
      }).abortSignal(signal);
      if (error) throw error;
      return parsePublishedTreaties(data);
    },
  });
  const visible = treaties.data?.filter((row) => (
    [row.title,row.organizationName,row.treatyType,
      ...row.parties.map((party) => party.countryName)]
      .join(" ").toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())
  )) ?? [];

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 pb-24 sm:px-6">
      <header className="space-y-3">
        <a href="/world" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
          Terra Solaris World
        </a>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Treaties and protocols</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Published legal treaties connected to canonical institutional documents.
          Listed or invited countries are not automatically signatories or ratifiers.
        </p>
      </header>
      <label className="block max-w-xl space-y-2 text-sm font-medium">
        Find published treaties
        <input className="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2"
          type="search" value={filter} maxLength={120}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Search by treaty, institution or country" />
      </label>

      {treaties.isPending ? <p role="status">Loading verified published treaties…</p>
        : treaties.isError ? (
          <div role="alert" className="space-y-3 rounded-xl border border-destructive/40 p-4">
            <p>Official treaty records could not be verified. No unpublished or cached fallback is shown.</p>
            <button type="button" className="min-h-11 rounded-lg border px-4 py-2"
              onClick={() => void treaties.refetch()}>Retry official treaty index</button>
          </div>
        ) : visible.length === 0 ? (
          <p role="status">{treaties.data?.length
            ? "No published treaties match that search."
            : "No registered treaty documents are currently published."}</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {visible.map((treaty) => (
              <li key={treaty.treatyId} className="space-y-3 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {treaty.organizationName} · {treaty.treatyType.replaceAll("_"," ")}
                    </p>
                    <h2 className="text-xl font-bold">
                      <a className="underline-offset-4 hover:underline"
                        href={`/world/documents/${encodeURIComponent(treaty.organizationSlug)}/${encodeURIComponent(treaty.documentSlug)}`}>
                        {treaty.title}
                      </a>
                    </h2>
                  </div>
                  <span className="rounded-lg border border-border px-3 py-1 text-xs font-medium">
                    {treaty.status.replaceAll("_"," ")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Published legal version {treaty.versionNumber}
                  {treaty.documentEffectiveFrom
                    ? ` · Document effective ${new Date(treaty.documentEffectiveFrom).toLocaleDateString()}`
                    : ""}
                </p>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Listed countries and confirmed legal status</h3>
                  <ul className="flex flex-wrap gap-2">
                    {treaty.parties.map((party) => (
                      <li key={party.countryId}
                        className="rounded-lg border border-border/70 px-3 py-2 text-sm">
                        {party.countryName}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {party.status === "invited" ? "Listed · no signature" :
                            party.status.replaceAll("_"," ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        )}
    </main>
  );
}

export const Route = createFileRoute("/world/treaties/")({
  head: () => ({
    meta: [
      { title: "Terra Solaris Treaties — Solaris Studio" },
      { name: "description", content: "Published institutional legal treaties and documented party status." },
    ],
  }),
  component: TreatyDirectory,
});
