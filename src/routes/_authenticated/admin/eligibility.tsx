import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { AlertTriangle, ExternalLink, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminPage } from '@/components/admin/AdminShell';
import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from '@/components/admin/AdminUI';
import { useEditions } from '@/lib/data';
import { loadStudio2CountryCockpit } from '@/lib/studio2-country-cockpit';
import {
  buildStudio2EligibilityMatrix,
  createStudio2EligibilityOverride,
  listStudio2EligibilityOverrides,
  revokeStudio2EligibilityOverride,
  type Studio2EligibilityCountry,
  type Studio2EligibilityOverride,
  type Studio2EligibilityRule,
  type Studio2EligibilityStatus,
} from '@/lib/studio2-eligibility';

type EligibilitySearch = {
  q?: string;
  status?: 'all' | Studio2EligibilityStatus;
  country?: string;
};

const STATUSES: Studio2EligibilityStatus[] = ['eligible', 'incomplete', 'warning', 'blocked', 'overridden'];

export const Route = createFileRoute('/_authenticated/admin/eligibility')({
  validateSearch: (search: Record<string, unknown>): EligibilitySearch => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    status: search.status === 'all' || STATUSES.includes(search.status as Studio2EligibilityStatus)
      ? search.status as EligibilitySearch['status']
      : undefined,
    country: typeof search.country === 'string' ? search.country : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Eligibility — Solaris Organizer' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: EligibilityPage,
});

function EligibilityPage() {
  const { editionId } = useAdminContext();
  const editionsQuery = useEditions();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const editions = editionsQuery.data ?? [];
  const selectedEdition = editions.find((edition) => edition.id === editionId)
    ?? [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0]
    ?? null;
  const resolvedEditionId = selectedEdition?.id ?? '';

  const cockpitQuery = useQuery({
    queryKey: ['studio2-country-cockpit', resolvedEditionId || 'none'],
    enabled: Boolean(resolvedEditionId),
    queryFn: () => loadStudio2CountryCockpit(resolvedEditionId),
    staleTime: 20_000,
  });
  const overridesQuery = useQuery({
    queryKey: ['studio2-eligibility-overrides', resolvedEditionId || 'none', 'history'],
    enabled: Boolean(resolvedEditionId),
    queryFn: () => listStudio2EligibilityOverrides(resolvedEditionId, { includeHistory: true }),
    staleTime: 10_000,
  });

  const matrix = useMemo(
    () => buildStudio2EligibilityMatrix(cockpitQuery.data ?? [], overridesQuery.data ?? []),
    [cockpitQuery.data, overridesQuery.data],
  );
  const normalizedQuery = (search.q ?? '').trim().toLocaleLowerCase();
  const statusFilter = search.status ?? 'all';
  const filtered = matrix.filter((row) => {
    if (statusFilter !== 'all' && row.overall !== statusFilter) return false;
    return !normalizedQuery || row.countryName.toLocaleLowerCase().includes(normalizedQuery);
  });
  const selected = matrix.find((row) => row.countryId === search.country) ?? null;
  const error = editionsQuery.error ?? cockpitQuery.error ?? overridesQuery.error;

  const counts = Object.fromEntries(
    STATUSES.map((status) => [status, matrix.filter((row) => row.overall === status).length]),
  ) as Record<Studio2EligibilityStatus, number>;

  function updateSearch(patch: Partial<EligibilitySearch>) {
    void navigate({
      search: (previous) => ({ ...previous, ...patch }),
      replace: true,
    });
  }

  return (
    <AdminPage>
      <div className="mx-auto max-w-[1500px] space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2 · Eligibility"
          title="Eligibility"
          description="Country-by-country operational eligibility using the same readiness and entry engines as the HOD workspace. Overrides accept a named exception; they never erase the underlying failed check."
          actions={
            <div className="flex flex-wrap gap-2">
              <a href="/televoting/admin/result-integrity" className="admin-action-secondary">
                Result integrity <ExternalLink className="size-4" />
              </a>
              <a href="/admin/countries" className="admin-action-secondary">
                Country cockpit <ExternalLink className="size-4" />
              </a>
            </div>
          }
        />

        {!selectedEdition && !editionsQuery.isLoading ? (
          <AdminCard>
            <AdminEmptyState icon={ShieldCheck} title="No edition selected" description="Select an edition before reviewing eligibility." />
          </AdminCard>
        ) : cockpitQuery.isLoading || overridesQuery.isLoading || editionsQuery.isLoading ? (
          <AdminCard><p className="py-12 text-center text-sm text-muted-foreground">Building eligibility matrix…</p></AdminCard>
        ) : error ? (
          <AdminCard>
            <AdminEmptyState icon={AlertTriangle} title="Eligibility could not load" description={errorText(error)} />
          </AdminCard>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <Metric label="Countries" value={matrix.length} tone="neutral" />
              <Metric label="Eligible" value={counts.eligible} tone="ready" />
              <Metric label="Incomplete" value={counts.incomplete} tone="attention" />
              <Metric label="Warnings" value={counts.warning} tone="attention" />
              <Metric label="Blocked" value={counts.blocked} tone="blocked" />
              <Metric label="Overridden" value={counts.overridden} tone="info" />
            </section>

            <AdminCard>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-sm font-semibold">Integrity diagnostics stay in the specialist voting systems</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Detection is evidence for review, not adjudication. Statistical flags, friend-voting patterns and jury integrity evidence remain visible even when an operational eligibility exception is active.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href="/televoting/admin/result-integrity" className="admin-action-secondary">
                    Result integrity <ExternalLink className="size-4" />
                  </a>
                  <a href="/admin/friend-voting" className="admin-action-secondary">
                    Friend-voting intelligence <ExternalLink className="size-4" />
                  </a>
                  <a href="/admin/jury-integrity" className="admin-action-secondary">
                    Jury integrity <ExternalLink className="size-4" />
                  </a>
                </div>
              </div>
            </AdminCard>

            <AdminCard>
              <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                <label className="relative block">
                  <span className="sr-only">Search countries</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search.q ?? ''}
                    onChange={(event) => updateSearch({ q: event.target.value || undefined })}
                    className="admin-input w-full pl-9"
                    placeholder="Search countries"
                  />
                </label>
                <select
                  value={statusFilter}
                  onChange={(event) => updateSearch({ status: event.target.value as EligibilitySearch['status'] })}
                  className="admin-input w-full"
                  aria-label="Filter eligibility status"
                >
                  <option value="all">All statuses</option>
                  {STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                </select>
              </div>
            </AdminCard>

            <AdminCard className="!p-0 overflow-hidden">
              {filtered.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-[980px] w-full text-left text-sm">
                    <thead className="border-b border-white/[0.07] bg-white/[0.018] text-[11px] uppercase tracking-[0.11em] text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Country</th>
                        <th className="px-3 py-3">Participation</th>
                        <th className="px-3 py-3">Entry</th>
                        <th className="px-3 py-3">Jury</th>
                        <th className="px-3 py-3">Media</th>
                        <th className="px-3 py-3">Deadlines</th>
                        <th className="px-3 py-3">Overall</th>
                        <th className="px-4 py-3 text-right">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {filtered.map((row) => (
                        <tr key={row.countryId} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-4 font-semibold">{row.countryName}</td>
                          <StatusCell status={row.participation} />
                          <StatusCell status={row.entry} />
                          <StatusCell status={row.jury} />
                          <StatusCell status={row.media} />
                          <StatusCell status={row.deadlines} />
                          <StatusCell status={row.overall} strong />
                          <td className="px-4 py-4 text-right">
                            <button type="button" className="admin-action-secondary" onClick={() => updateSearch({ country: row.countryId })}>
                              Inspect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <AdminEmptyState icon={ShieldCheck} title="No countries match" description="Adjust the search or eligibility filter." />
              )}
            </AdminCard>
          </>
        )}

        <EligibilityDetailSheet
          country={selected}
          overrideHistory={(overridesQuery.data ?? []).filter((item) => item.countryId === selected?.countryId)}
          onClose={() => updateSearch({ country: undefined })}
        />
      </div>
    </AdminPage>
  );
}

function EligibilityDetailSheet({
  country,
  overrideHistory,
  onClose,
}: {
  country: Studio2EligibilityCountry | null;
  overrideHistory: Studio2EligibilityOverride[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [overrideTarget, setOverrideTarget] = useState<Studio2EligibilityRule | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Studio2EligibilityOverride | null>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['studio2-eligibility-overrides'] });
  }

  const createMutation = useMutation({
    mutationFn: (input: { rule: Studio2EligibilityRule; reason: string; expiresAt: string | null }) => {
      if (!country) throw new Error('Country is no longer selected.');
      return createStudio2EligibilityOverride({
        editionId: country.editionId,
        countryId: country.countryId,
        affectedRule: input.rule.id,
        reason: input.reason,
        expiresAt: input.expiresAt,
      });
    },
    onSuccess: async () => {
      toast.success('Eligibility override recorded');
      setOverrideTarget(null);
      await refresh();
    },
    onError: (caught) => toast.error(errorText(caught)),
  });

  const revokeMutation = useMutation({
    mutationFn: (input: { override: Studio2EligibilityOverride; reason: string }) =>
      revokeStudio2EligibilityOverride(input.override.id, input.reason),
    onSuccess: async () => {
      toast.success('Eligibility override revoked');
      setRevokeTarget(null);
      await refresh();
    },
    onError: (caught) => toast.error(errorText(caught)),
  });

  return (
    <>
      <AdminSheet
        open={Boolean(country)}
        onClose={onClose}
        title={country ? `${country.countryName} eligibility` : 'Eligibility detail'}
        description="Factual rule results remain visible even when an organizer exception is active."
      >
        {country ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Effective" value={statusLabel(country.overall)} tone={tone(country.overall)} />
              <Metric label="Factual" value={statusLabel(country.factualOverall)} tone={tone(country.factualOverall)} />
            </div>

            <div className="space-y-2">
              {country.rules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onOverride={() => setOverrideTarget(rule)}
                  onRevoke={() => rule.override && setRevokeTarget(rule.override)}
                />
              ))}
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Specialist record</p>
                  <p className="mt-1 text-sm font-semibold">Country cockpit</p>
                </div>
                <a href={`/admin/countries/${country.countryId}?tab=eligibility`} className="admin-action-secondary">
                  Open country <ExternalLink className="size-4" />
                </a>
              </div>
            </div>

            {overrideHistory.length ? (
              <div>
                <p className="admin-section-label">Override history</p>
                <div className="mt-2 space-y-2">
                  {overrideHistory.map((item) => (
                    <div key={item.id} className="rounded-xl border border-white/[0.07] bg-black/10 p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">{item.affectedRule}</span>
                        <AdminStatus tone={item.revokedAt ? 'neutral' : item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now() ? 'neutral' : 'info'}>
                          {item.revokedAt ? 'revoked' : item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now() ? 'expired' : 'active'}
                        </AdminStatus>
                      </div>
                      <p className="mt-2 leading-5 text-muted-foreground">{item.reason}</p>
                      <p className="mt-2 text-muted-foreground">Created {formatDate(item.createdAt)} · actor {item.createdBy ? shortId(item.createdBy) : 'service'}</p>
                      {item.expiresAt ? <p className="mt-1 text-muted-foreground">Expires {formatDate(item.expiresAt)}</p> : null}
                      {item.revokedAt ? <p className="mt-1 text-muted-foreground">Revoked {formatDate(item.revokedAt)} · {item.revocationReason}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </AdminSheet>

      <OverrideSheet
        rule={overrideTarget}
        busy={createMutation.isPending}
        onClose={() => setOverrideTarget(null)}
        onConfirm={(reason, expiresAt) => overrideTarget && createMutation.mutate({ rule: overrideTarget, reason, expiresAt })}
      />
      <RevokeSheet
        override={revokeTarget}
        busy={revokeMutation.isPending}
        onClose={() => setRevokeTarget(null)}
        onConfirm={(reason) => revokeTarget && revokeMutation.mutate({ override: revokeTarget, reason })}
      />
    </>
  );
}

function RuleCard({
  rule,
  onOverride,
  onRevoke,
}: {
  rule: Studio2EligibilityRule;
  onOverride: () => void;
  onRevoke: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{rule.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">Rule: {rule.id}</p>
        </div>
        <div className="flex gap-1.5">
          {rule.override ? <AdminStatus tone="info">overridden</AdminStatus> : null}
          <AdminStatus tone={tone(rule.factualStatus)}>{statusLabel(rule.factualStatus)}</AdminStatus>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{rule.message}</p>
      {rule.evidence.length ? (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {rule.evidence.map((evidence, index) => <li key={`${rule.id}-${index}`}>• {evidence}</li>)}
        </ul>
      ) : null}
      {rule.override ? (
        <div className="mt-3 rounded-lg border border-sky-200/10 bg-sky-200/[0.035] p-2.5 text-xs">
          <p className="font-semibold text-sky-50">Organizer exception remains active</p>
          <p className="mt-1 leading-5 text-muted-foreground">{rule.override.reason}</p>
          <button type="button" className="mt-2 text-xs font-semibold text-rose-100" onClick={onRevoke}>Revoke override</button>
        </div>
      ) : rule.factualStatus !== 'eligible' ? (
        <button type="button" className="admin-action-secondary mt-3" onClick={onOverride}>Override this rule</button>
      ) : null}
    </div>
  );
}

function OverrideSheet({
  rule,
  busy,
  onClose,
  onConfirm,
}: {
  rule: Studio2EligibilityRule | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string, expiresAt: string | null) => void;
}) {
  const [reason, setReason] = useState('');
  const [expiry, setExpiry] = useState('');

  function close() {
    if (busy) return;
    setReason('');
    setExpiry('');
    onClose();
  }

  const expiryIso = expiry ? safeIso(expiry) : null;
  return (
    <AdminSheet open={Boolean(rule)} onClose={close} title="Create eligibility override" description="This accepts one named exception. The failed factual check remains recorded and visible.">
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200/12 bg-amber-200/[0.04] p-3 text-xs leading-5 text-muted-foreground">
          <strong className="text-foreground">Affected rule:</strong> {rule?.label} ({rule?.id}). Do not use an override to hide an unrelated blocker.
        </div>
        <Field label="Reason · required">
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={5} className="admin-input w-full resize-y" placeholder="Explain the exceptional circumstance and why proceeding is justified." />
        </Field>
        <Field label="Expiry · optional">
          <input type="datetime-local" value={expiry} onChange={(event) => setExpiry(event.target.value)} className="admin-input w-full" />
        </Field>
        <button
          type="button"
          disabled={busy || reason.trim().length < 8 || Boolean(expiry && !expiryIso)}
          onClick={() => onConfirm(reason.trim(), expiryIso)}
          className="admin-action-danger min-h-12 w-full"
        >
          {busy ? 'Recording override…' : 'Confirm eligibility override'}
        </button>
      </div>
    </AdminSheet>
  );
}

function RevokeSheet({
  override,
  busy,
  onClose,
  onConfirm,
}: {
  override: Studio2EligibilityOverride | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  function close() {
    if (busy) return;
    setReason('');
    onClose();
  }
  return (
    <AdminSheet open={Boolean(override)} onClose={close} title="Revoke eligibility override" description="The original factual eligibility state will immediately become effective again.">
      <div className="space-y-4">
        <Field label="Revocation reason · required">
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} className="admin-input w-full resize-y" placeholder="Why is this exception no longer valid?" />
        </Field>
        <button type="button" disabled={busy || reason.trim().length < 5} onClick={() => onConfirm(reason.trim())} className="admin-action-danger min-h-12 w-full">
          {busy ? 'Revoking…' : 'Revoke override'}
        </button>
      </div>
    </AdminSheet>
  );
}

function StatusCell({ status, strong = false }: { status: Studio2EligibilityStatus; strong?: boolean }) {
  return (
    <td className={`px-3 py-4 ${strong ? 'font-semibold' : ''}`}>
      <AdminStatus tone={tone(status)}>{statusLabel(status)}</AdminStatus>
    </td>
  );
}

function Metric({ label, value, tone: metricTone }: { label: string; value: string | number; tone: 'neutral' | 'ready' | 'attention' | 'blocked' | 'info' }) {
  return (
    <AdminCard>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-xl font-bold">{value}</p>
        <AdminStatus tone={metricTone}>{label}</AdminStatus>
      </div>
    </AdminCard>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2"><span className="text-xs font-semibold text-muted-foreground">{label}</span>{children}</label>;
}

function tone(status: Studio2EligibilityStatus): 'neutral' | 'ready' | 'attention' | 'blocked' | 'info' {
  if (status === 'eligible') return 'ready';
  if (status === 'blocked') return 'blocked';
  if (status === 'overridden') return 'info';
  return 'attention';
}

function statusLabel(status: Studio2EligibilityStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function safeIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? 'Unknown error');
}