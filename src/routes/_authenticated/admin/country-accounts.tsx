import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, ShieldCheck, UserRoundCog } from "lucide-react";

import { AdminCountryPasswordPanel } from "@/components/admin/AdminCountryPasswordPanel";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
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
      { title: "Country accounts — Solaris Organizer" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CountryAccountsAdminPage,
});

function CountryAccountsAdminPage() {
  const { data: countries = [] } = useCountries();
  const {
    data,
    isLoading: accountsLoading,
    isFetching: accountsFetching,
    isError: accountsFailed,
    error: accountsError,
    refetch: refetchAccounts,
  } = useAdminCountryAccounts();
  const setStatus = useAdminSetCountryAccountStatus();
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<AdminCountryAccount | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const accountByCountry = useMemo(
    () => new Map((data?.accounts ?? []).map((account) => [account.country_id, account])),
    [data?.accounts],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return countries
      .map((country) => ({ country, account: accountByCountry.get(country.id) ?? null }))
      .filter(({ country, account }) => {
        if (!needle) return true;
        return [country.name, country.short_code, account?.email ?? ""].join(" ").toLowerCase().includes(needle);
      })
      .sort((a, b) => a.country.name.localeCompare(b.country.name));
  }, [countries, accountByCountry, query]);

  function openAccount(account: AdminCountryAccount) {
    setTarget(account);
    setReason(account.suspension_reason ?? "");
    setMessage(null);
  }

  async function suspend() {
    if (!target) return;
    setMessage(null);
    try {
      await setStatus.mutateAsync({ userId: target.user_id, status: "suspended", reason: reason.trim() });
      setMessage(`${target.country_name} account suspended.`);
      setTarget(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account could not be suspended.");
    }
  }

  async function restore() {
    if (!target) return;
    setMessage(null);
    try {
      await setStatus.mutateAsync({ userId: target.user_id, status: "active" });
      setMessage(`${target.country_name} account restored.`);
      setTarget(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account could not be restored.");
    }
  }

  const accountsReady = Boolean(data?.schemaReady && !accountsFailed);
  const claimed = accountsReady ? data!.accounts.length : null;
  const suspended = accountsReady ? data!.accounts.filter((account) => account.status === "suspended").length : null;
  const unclaimed = claimed === null ? null : Math.max(0, countries.length - claimed);

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Moderation"
        title="Country accounts"
        description="Review country ownership, change account passwords and temporarily suspend editing when necessary. Public Solaris access remains available while an account is suspended."
        actions={<Link to="/admin/more" className="admin-action-secondary"><ArrowLeft className="size-4" /> More</Link>}
      />

      {message ? <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-3 text-sm text-foreground">{message}</div> : null}

      <div className="grid grid-cols-3 gap-2">
        <Metric label="Claimed" value={claimed ?? "—"} />
        <Metric label="Unclaimed" value={unclaimed ?? "—"} />
        <Metric label="Suspended" value={suspended ?? "—"} attention={(suspended ?? 0) > 0} />
      </div>

      <AdminCard>
        <AdminCardHeader
          eyebrow="Terra Solaris"
          title="Ownership"
          description="Search by country, code or owner email. Password and moderation controls stay inside each claimed account."
          action={accountsFetching && !accountsLoading ? <AdminStatus tone="neutral">Refreshing…</AdminStatus> : undefined}
        />

        {accountsLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading country ownership…</div>
        ) : accountsFailed ? (
          <AdminEmptyState
            icon={RefreshCw}
            title="Country accounts could not be loaded"
            description={accountsError instanceof Error ? accountsError.message : "The ownership directory request failed. No claim totals are being guessed."}
            action={<button type="button" onClick={() => void refetchAccounts()} className="admin-action-primary"><RefreshCw className="size-4" /> Retry</button>}
          />
        ) : data?.schemaReady === false ? (
          <AdminEmptyState icon={ShieldCheck} title="Moderation unavailable" description="Country account moderation is temporarily unavailable." />
        ) : (
          <>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search country, code or account email…" className="mb-4 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30" />
            <div className="divide-y divide-white/[0.07]">
              {rows.map(({ country, account }) => (
                <div key={country.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{country.name}</p>
                        <AdminStatus tone={!account ? "neutral" : account.status === "suspended" ? "blocked" : "ready"}>{!account ? "Unclaimed" : account.status === "suspended" ? "Suspended" : "Active"}</AdminStatus>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{account?.email ?? country.short_code}</p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Link to="/country-hub" search={{ country: country.id }} className="admin-action-secondary !min-h-10 !px-3">Open</Link>
                      {account ? <button type="button" onClick={() => openAccount(account)} className="admin-action-secondary !min-h-10 !px-3" aria-label={`Manage ${country.name} account`}><UserRoundCog className="size-4" /></button> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </AdminCard>

      <AdminSheet open={!!target} onClose={() => !setStatus.isPending && setTarget(null)} title={target ? `${target.country_name} account` : "Country account"} description={target?.email ?? "Account moderation"}>
        {target ? (
          <div className="space-y-4">
            <AdminCountryPasswordPanel account={target} />

            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
              <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-foreground">Editing access</p><AdminStatus tone={target.status === "suspended" ? "blocked" : "ready"}>{target.status === "suspended" ? "Suspended" : "Active"}</AdminStatus></div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Suspending an account blocks country-profile editing at the database level. It does not remove the public country or affect contest results.</p>
            </div>

            {target.status === "active" ? (
              <>
                <label className="block"><span className="admin-section-label">Reason shown to owner</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional" className="mt-2 min-h-24 w-full resize-y rounded-xl border border-white/[0.1] bg-white/[0.035] p-3 text-sm text-foreground outline-none focus:border-sky-200/30" /></label>
                <button type="button" disabled={setStatus.isPending} onClick={() => void suspend()} className="admin-action-danger w-full">{setStatus.isPending ? "Suspending…" : "Suspend editing access"}</button>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-sm text-muted-foreground">{target.suspension_reason || "No suspension reason was provided."}</div>
                <button type="button" disabled={setStatus.isPending} onClick={() => void restore()} className="admin-action-primary w-full">{setStatus.isPending ? "Restoring…" : "Restore editing access"}</button>
              </>
            )}
          </div>
        ) : null}
      </AdminSheet>
    </AdminPage>
  );
}

function Metric({ label, value, attention = false }: { label: string; value: number | string; attention?: boolean }) {
  return <div className={`admin-card px-3 py-3 text-center ${attention ? "!border-rose-200/15 !bg-rose-200/[0.045]" : ""}`}><p className={`numeric text-xl font-bold ${attention ? "text-rose-100" : ""}`}>{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}
