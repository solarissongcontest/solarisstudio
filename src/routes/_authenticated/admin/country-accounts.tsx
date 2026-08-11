import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import {
  useAdminCountryAccounts,
  useAdminSetCountryAccountStatus,
  type AdminCountryAccount,
} from "@/lib/country-account";
import { useCountries } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/admin/country-accounts")({
  head: () => ({
    meta: [
      { title: "Country accounts — Solaris Studio" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CountryAccountsAdminPage,
});

function CountryAccountsAdminPage() {
  const { data: countries } = useCountries();
  const { data } = useAdminCountryAccounts();
  const setStatus = useAdminSetCountryAccountStatus();
  const [query, setQuery] = useState("");
  const [reasonByUser, setReasonByUser] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const accountByCountry = useMemo(
    () => new Map((data?.accounts ?? []).map((account) => [account.country_id, account])),
    [data?.accounts],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (countries ?? [])
      .map((country) => ({ country, account: accountByCountry.get(country.id) ?? null }))
      .filter(({ country, account }) => {
        if (!needle) return true;
        return [country.name, country.short_code, account?.email ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => a.country.name.localeCompare(b.country.name));
  }, [countries, accountByCountry, query]);

  const suspend = async (account: AdminCountryAccount) => {
    const reason = (reasonByUser[account.user_id] ?? "").trim();
    setMessage(null);
    try {
      await setStatus.mutateAsync({
        userId: account.user_id,
        status: "suspended",
        reason,
      });
      setMessage(`${account.country_name} account suspended.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account could not be suspended.");
    }
  };

  const restore = async (account: AdminCountryAccount) => {
    setMessage(null);
    try {
      await setStatus.mutateAsync({
        userId: account.user_id,
        status: "active",
      });
      setMessage(`${account.country_name} account restored.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account could not be restored.");
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Organizer moderation"
        title="Country accounts"
        description="Manage country ownership, suspend country-account editing and open any country's profile with organizer override. Suspension blocks country editing at the database level while leaving public Solaris access intact."
        actions={
          <>
            <Link to="/admin" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">← Studio</Link>
            <Link to="/country-hub" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">My country</Link>
          </>
        }
      />

      {message && (
        <p className="mb-5 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          {message}
        </p>
      )}

      <Panel
        title="Terra Solaris ownership"
        description={`${data?.accounts.length ?? 0} claimed · ${(countries?.length ?? 0) - (data?.accounts.length ?? 0)} unclaimed`}
      >
        {data?.schemaReady === false ? (
          <p className="text-sm text-muted-foreground">Country account moderation is temporarily unavailable.</p>
        ) : (
          <>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search country, code or account email…"
              className="mb-4 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />

            <div className="space-y-2">
              {rows.map(({ country, account }) => (
                <div key={country.id} className="min-w-0 rounded-xl border border-border/70 bg-surface p-3 sm:p-4">
                  <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="md" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{country.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {account?.email ?? "Unclaimed country"}
                        </p>
                      </div>
                    </div>

                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      {account && (
                        <span className={`rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${account.status === "suspended" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                          {account.status}
                        </span>
                      )}
                      <Link
                        to="/country-hub"
                        search={{ country: country.id }}
                        className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold"
                      >
                        Manage country
                      </Link>
                    </div>
                  </div>

                  {account && (
                    <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      {account.status === "active" ? (
                        <>
                          <input
                            value={reasonByUser[account.user_id] ?? ""}
                            onChange={(event) => setReasonByUser((current) => ({ ...current, [account.user_id]: event.target.value }))}
                            placeholder="Optional suspension reason shown to the owner"
                            className="min-h-10 min-w-0 rounded-xl border border-border bg-background px-3 text-xs"
                          />
                          <button
                            type="button"
                            disabled={setStatus.isPending}
                            onClick={() => void suspend(account)}
                            className="min-h-10 rounded-xl border border-destructive/40 px-3 text-xs font-semibold text-destructive disabled:opacity-50"
                          >
                            Suspend account
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="min-w-0 rounded-xl bg-background px-3 py-2 text-xs text-muted-foreground">
                            {account.suspension_reason || "No suspension reason provided."}
                          </div>
                          <button
                            type="button"
                            disabled={setStatus.isPending}
                            onClick={() => void restore(account)}
                            className="min-h-10 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50"
                          >
                            Restore account
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>
    </AppShell>
  );
}
