import { Link } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { useCountryGovernment } from "@/lib/world-country-government-data";
import { hasStructuredGovernment, validGovernmentCountryCode } from "@/lib/world-country-government";

function GovernmentState({ title, detail, retry, loading = false }: {
  title: string; detail: string; retry?: () => void; loading?: boolean;
}) {
  return (
    <section role={loading ? "status" : "alert"} className="max-w-3xl rounded-2xl border border-border/70 bg-surface/70 p-5 sm:p-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">{detail}</p>
      {retry ? <button type="button" onClick={retry} className="mt-5 min-h-11 rounded-xl border border-border bg-background px-4 text-sm font-semibold hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Try again</button> : null}
    </section>
  );
}

function GovernmentFact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="border-b border-border/60 py-4 last:border-b-0">
      <dt className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-base font-semibold text-foreground">{value}</dd>
    </div>
  );
}

export function WorldCountryGovernmentScreen({ code }: { code: string }) {
  const query = useCountryGovernment(code);
  const invalid = !validGovernmentCountryCode(code);
  // A cached successful read is not current publication evidence. Suppress
  // all Government content during a recheck or after its failure, even when
  // React Query still retains the previous response.
  const verified = !invalid && query.isSuccess && query.isFetchedAfterMount &&
    !query.isFetching && !query.isError && !query.isRefetchError;
  const data = verified ? query.data : undefined;
  const profile = data?.profile;
  const leader = profile?.leaderName ? [profile.leaderTitle, profile.leaderName].filter(Boolean).join(" ") : null;
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 sm:pt-8 lg:px-8">
        <nav aria-label="Country government breadcrumb" className="mb-7 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Link to="/countries" className="inline-flex min-h-10 items-center gap-2 hover:text-foreground">Countries</Link>
          {data ? <><span aria-hidden="true">/</span><Link to="/countries/$code" params={{ code: data.country.code }} className="hover:text-foreground">{data.country.name}</Link></> : null}
          <span aria-hidden="true">/</span><span className="font-semibold text-foreground">Government</span>
        </nav>
        {invalid || data === null ? <GovernmentState title="Country not found" detail="No public country is registered at this address. Check the country code or browse the country directory." /> : null}
        {!invalid && !query.isError && !query.isRefetchError && (query.isPending || query.isFetching || !query.isFetchedAfterMount) ? <GovernmentState loading title="Verifying government profile" detail="Checking this country's currently published Terra Solaris record…" /> : null}
        {(query.isError || query.isRefetchError) ? <GovernmentState title="Government profile unavailable" detail="The public country profile could not be verified. Previous cached sections are hidden until a fresh check succeeds." retry={() => void query.refetch()} /> : null}
        {data ? (
          <>
            <header className="max-w-4xl border-b border-border/70 pb-8">
              <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Terra Solaris / Government</p>
              <div className="mt-4 flex items-start gap-4 sm:gap-6">
                {data.country.flagImage ? (
                  <img src={data.country.flagImage} alt={`Flag of ${data.country.name}`} loading="lazy" className="mt-1 aspect-[3/2] w-20 shrink-0 rounded-md border border-border/70 object-cover sm:w-28" />
                ) : <span aria-hidden="true" className="mt-1 flex aspect-[3/2] w-20 shrink-0 items-center justify-center rounded-md border border-border bg-surface sm:w-28"><span className="text-xs font-semibold text-muted-foreground">Flag not available</span></span>}
                <div className="min-w-0">
                  <h1 className="break-words text-3xl font-bold tracking-[-.045em] text-foreground sm:text-5xl">{data.country.name}</h1>
                  <p className="mt-1 text-lg font-medium text-muted-foreground">Government</p>
                  {data.country.nativeName && data.country.nativeName !== data.country.name ? <p className="mt-2 text-sm text-muted-foreground">{data.country.nativeName}</p> : null}
                </div>
              </div>
              {data.country.region ? <p className="mt-5 text-xs text-muted-foreground">Region: {data.country.region}</p> : null}
            </header>
            <div className="mt-9 grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(15rem,.6fr)] lg:gap-14">
              <div className="min-w-0 space-y-10">
                <section aria-labelledby="government-facts-heading">
                  <div className="flex items-center gap-3 border-b border-border/70 pb-3">
                                        <h2 id="government-facts-heading" className="text-2xl font-bold tracking-tight">Government at a glance</h2>
                  </div>
                  {hasStructuredGovernment(profile ?? null) ? (
                    <dl className="divide-y divide-border/60">
                      <GovernmentFact label="Government system" value={profile?.governmentType} />
                      <GovernmentFact label="Recorded leader" value={leader} />
                      <GovernmentFact label="Capital" value={profile?.capital} />
                    </dl>
                  ) : <p className="py-5 text-sm leading-7 text-muted-foreground">No structured government facts have been published for {data.country.name} yet. Unrecorded leaders or institutions are not inferred.</p>}
                </section>
                {data.articles.length ? (
                  <section aria-labelledby="government-articles-heading">
                    <div className="flex items-center gap-3 border-b border-border/70 pb-3">
                                            <h2 id="government-articles-heading" className="text-2xl font-bold tracking-tight">Country-published political articles</h2>
                    </div>
                    <p className="mt-3 text-xs leading-6 text-muted-foreground">These are country-authored public reference sections, not verified legal records or additional structured offices.</p>
                    <div className="mt-4 divide-y divide-border/65">
                      {data.articles.map((article) => (
                        <article key={article.id} className="py-6">
                          <h3 className="text-lg font-semibold">{article.title}</h3>
                          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{article.body}</p>
                        </article>
                      ))}
                    </div>
                    {data.sectionsTruncated ? <p className="mt-3 text-xs text-muted-foreground">The article scan was capped to protect read performance; additional sections may exist in the country Wiki.</p> : null}
                  </section>
                ) : null}
              </div>
              <aside aria-label="Government profile context" className="space-y-7 border-t border-border/70 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                <section>
                  <div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Publication context</h2></div>
                  <p className="mt-3 text-xs leading-6 text-muted-foreground">This view reads the existing public country profile. It does not confer political authority, create new government records or invent absent elections, courts, cabinets or constitutions.</p>
                  {profile?.updatedAt ? <p className="mt-3 text-xs text-muted-foreground">Profile updated {new Date(profile.updatedAt).toISOString().slice(0, 10)}</p> : null}
                </section>
                <section className="border-t border-border/65 pt-6">
                  <h2 className="text-sm font-semibold">More about {data.country.name}</h2>
                  <div className="mt-3 flex flex-col gap-2 text-sm">
                    <Link to="/countries/$code" params={{ code: data.country.code }} className="inline-flex min-h-10 items-center text-primary hover:underline">Country overview</Link>
                    <Link to="/wiki/$code" params={{ code: data.country.code }} className="inline-flex min-h-10 items-center text-primary hover:underline">Country Wiki</Link>
                  </div>
                </section>
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}