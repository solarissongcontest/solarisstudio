import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, Mail, Megaphone, Send } from 'lucide-react';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminPage } from '@/components/admin/AdminShell';
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from '@/components/admin/AdminUI';
import { useCountries } from '@/lib/data';
import { NOTICE_AUDIENCES, NOTICE_SEVERITIES, type NoticeAudience, type NoticeSeverity } from '@/lib/official-communications';
import { loadStudio2Notices, sendStudio2Notice } from '@/lib/studio2-communications';

export const Route = createFileRoute('/_authenticated/admin/communications')({
  head: () => ({
    meta: [
      { title: 'Official Communications — Solaris Organizer' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: CommunicationsCentre,
});

function CommunicationsCentre() {
  const { editionId } = useAdminContext();
  const queryClient = useQueryClient();
  const { data: countries = [] } = useCountries();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState<NoticeSeverity>('info');
  const [audience, setAudience] = useState<NoticeAudience>('all_delegations');
  const [countryIds, setCountryIds] = useState<string[]>([]);
  const [acknowledgementRequired, setAcknowledgementRequired] = useState(false);

  const noticesQuery = useQuery({
    queryKey: ['studio2-official-notices', editionId ?? 'all'],
    queryFn: () => loadStudio2Notices(editionId),
    refetchInterval: 30_000,
  });

  const sendNotice = useMutation({
    mutationFn: () => sendStudio2Notice({
      editionId: editionId ?? null,
      title,
      body,
      severity,
      audience,
      countryIds: audience === 'specific_countries' ? countryIds : [],
      acknowledgementRequired,
    }),
    onSuccess: async () => {
      setTitle('');
      setBody('');
      setSeverity('info');
      setAudience('all_delegations');
      setCountryIds([]);
      setAcknowledgementRequired(false);
      await queryClient.invalidateQueries({ queryKey: ['studio2-official-notices'] });
    },
  });

  const notices = noticesQuery.data ?? [];
  const acknowledgementOutstanding = useMemo(
    () => notices.reduce((sum, item) => sum + item.receipts.acknowledgementOutstanding, 0),
    [notices],
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !body.trim()) return;
    if (audience === 'specific_countries' && countryIds.length === 0) return;
    sendNotice.mutate();
  };

  const toggleCountry = (countryId: string) => {
    setCountryIds((current) => current.includes(countryId)
      ? current.filter((id) => id !== countryId)
      : [...current, countryId]);
  };

  return (
    <AdminPage>
      <div className="mx-auto max-w-7xl space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2"
          title="Official Communications"
          description="Send authoritative TSBC notices to delegations and operational audiences. Notices are permission-checked, edition-aware and recorded in the Studio 2 event stream."
        />

        <section className="grid gap-4 md:grid-cols-3">
          <AdminCard strong>
            <AdminCardHeader eyebrow="Sent notices" title={`${notices.length}`} />
            <p className="mt-2 text-sm text-muted-foreground">For the currently selected edition.</p>
          </AdminCard>
          <AdminCard>
            <AdminCardHeader eyebrow="Outstanding" title={`${acknowledgementOutstanding}`} />
            <p className="mt-2 text-sm text-muted-foreground">Required acknowledgements not yet received.</p>
          </AdminCard>
          <AdminCard>
            <AdminCardHeader eyebrow="Audit" title="Event-backed" />
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4" />
              Sending writes a canonical notice.sent event.
            </div>
          </AdminCard>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <AdminCard strong>
            <AdminCardHeader eyebrow="Compose" title="Send official notice" />
            <form className="mt-4 space-y-4" onSubmit={submit}>
              <label className="block space-y-1.5 text-sm">
                <span className="font-semibold">Title</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-black/10 px-3 outline-none focus:border-sky-300/30"
                  placeholder="Submission deadline updated"
                />
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="font-semibold">Message</span>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  className="min-h-36 w-full rounded-xl border border-white/[0.09] bg-black/10 p-3 outline-none focus:border-sky-300/30"
                  placeholder="Write the official TSBC notice…"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm">
                  <span className="font-semibold">Severity</span>
                  <select
                    value={severity}
                    onChange={(event) => setSeverity(event.target.value as NoticeSeverity)}
                    className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-background px-3"
                  >
                    {NOTICE_SEVERITIES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
                  </select>
                </label>

                <label className="space-y-1.5 text-sm">
                  <span className="font-semibold">Audience</span>
                  <select
                    value={audience}
                    onChange={(event) => {
                      const next = event.target.value as NoticeAudience;
                      setAudience(next);
                      if (next !== 'specific_countries') setCountryIds([]);
                    }}
                    className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-background px-3"
                  >
                    {NOTICE_AUDIENCES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
                  </select>
                </label>
              </div>

              {audience === 'specific_countries' ? (
                <fieldset className="rounded-xl border border-white/[0.07] p-3">
                  <legend className="px-1 text-sm font-semibold">Countries</legend>
                  <div className="mt-2 grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
                    {countries.map((country) => (
                      <label key={country.id} className="flex items-center gap-2 rounded-lg border border-white/[0.06] px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={countryIds.includes(country.id)}
                          onChange={() => toggleCountry(country.id)}
                        />
                        <span className="truncate">{country.name}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              <label className="flex items-start gap-3 rounded-xl border border-white/[0.07] p-3 text-sm">
                <input
                  type="checkbox"
                  checked={acknowledgementRequired}
                  onChange={(event) => setAcknowledgementRequired(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-semibold">Require acknowledgement</span>
                  <span className="text-muted-foreground">Track recipients who must explicitly acknowledge this notice.</span>
                </span>
              </label>

              {sendNotice.error ? (
                <div className="rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-sm text-red-100">
                  {errorMessage(sendNotice.error, 'The notice could not be sent.')}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={sendNotice.isPending || !title.trim() || !body.trim() || (audience === 'specific_countries' && !countryIds.length)}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="size-4" />
                {sendNotice.isPending ? 'Sending…' : 'Send official notice'}
              </button>
            </form>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader eyebrow="History" title="Official notices" />
            <div className="mt-4">
              {noticesQuery.isLoading ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Loading notices…</p>
              ) : noticesQuery.error ? (
                <AdminEmptyState
                  icon={Mail}
                  title="Communications unavailable"
                  description={errorMessage(noticesQuery.error, 'The communications service could not be loaded.')}
                />
              ) : notices.length === 0 ? (
                <AdminEmptyState icon={Megaphone} title="No notices yet" description="Official TSBC notices for this edition will appear here." />
              ) : (
                <div className="divide-y divide-white/[0.07]">
                  {notices.map(({ notice, receipts }) => (
                    <article key={notice.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold">{notice.title}</h3>
                            <AdminStatus tone={severityTone(notice.severity)}>{humanize(notice.severity)}</AdminStatus>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {humanize(notice.audience)} · {formatTimestamp(notice.sentAt)}
                          </p>
                        </div>
                        {notice.acknowledgementRequired ? (
                          <AdminStatus tone={receipts.acknowledgementOutstanding ? 'attention' : 'ready'}>
                            {receipts.acknowledged}/{receipts.total} acknowledged
                          </AdminStatus>
                        ) : null}
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{notice.body}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </AdminCard>
        </div>
      </div>
    </AdminPage>
  );
}

function severityTone(severity: NoticeSeverity): 'neutral' | 'info' | 'attention' | 'blocked' {
  if (severity === 'critical') return 'blocked';
  if (severity === 'urgent' || severity === 'action_required') return 'attention';
  if (severity === 'info') return 'info';
  return 'neutral';
}

function humanize(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTimestamp(value: string | null) {
  if (!value) return 'Not sent';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
