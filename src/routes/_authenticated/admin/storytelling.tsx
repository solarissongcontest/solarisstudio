import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock3,
  Eye,
  EyeOff,
  FilePlus2,
  History,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminPage } from '@/components/admin/AdminShell';
import {
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from '@/components/admin/AdminUI';
import { editionLabel, useEditions } from '@/lib/data';
import {
  executeStudio2StoryOperation,
  loadAnniversaryEngine,
  loadStudio2Storytelling,
  storylineReadiness,
  storyOperationLabel,
  storyStatusTone,
  type StorylineItem,
} from '@/lib/studio2-storytelling';

export const Route = createFileRoute('/_authenticated/admin/storytelling')({
  head: () => ({ meta: [
    { title: 'Storytelling — Solaris Organizer' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: StorytellingPage,
});

type StoryView = 'storyline' | 'anniversary';
type ConfirmAction = 'publish_storyline' | 'unpublish_storyline' | null;

function dateInParis() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function StorytellingPage() {
  const { editionId } = useAdminContext();
  const queryClient = useQueryClient();
  const editionsQuery = useEditions();
  const [view, setView] = useState<StoryView>('storyline');
  const [auditReason, setAuditReason] = useState('');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [introduction, setIntroduction] = useState('');
  const [itemTarget, setItemTarget] = useState<StorylineItem | null>(null);
  const [itemHeadline, setItemHeadline] = useState('');
  const [itemSummary, setItemSummary] = useState('');
  const [itemImportance, setItemImportance] = useState('70');
  const [itemIncluded, setItemIncluded] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualHeadline, setManualHeadline] = useState('');
  const [manualSummary, setManualSummary] = useState('');
  const [manualImportance, setManualImportance] = useState('70');
  const [manualOccurredAt, setManualOccurredAt] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [anniversaryDate, setAnniversaryDate] = useState(dateInParis);

  const editions = editionsQuery.data ?? [];
  const edition = editions.find((item) => item.id === editionId)
    ?? [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0]
    ?? null;
  const resolvedEditionId = edition?.id ?? '';

  const storyQuery = useQuery({
    queryKey: ['studio2-storytelling', resolvedEditionId || 'none'],
    enabled: Boolean(resolvedEditionId),
    queryFn: () => loadStudio2Storytelling(resolvedEditionId),
    staleTime: 8_000,
  });
  const snapshot = storyQuery.data ?? null;
  const story = snapshot?.storyline ?? null;
  const readiness = useMemo(() => snapshot ? storylineReadiness(snapshot) : null, [snapshot]);

  const anniversaryQuery = useQuery({
    queryKey: ['studio2-anniversary-engine', anniversaryDate],
    enabled: view === 'anniversary' && /^\d{4}-\d{2}-\d{2}$/.test(anniversaryDate),
    queryFn: () => loadAnniversaryEngine(anniversaryDate),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!story) {
      setTitle('');
      setSubtitle('');
      setIntroduction('');
      return;
    }
    setTitle(story.title);
    setSubtitle(story.subtitle ?? '');
    setIntroduction(story.introduction ?? '');
  }, [story?.revision]);

  const mutation = useMutation({
    mutationFn: (input: {
      action: Parameters<typeof executeStudio2StoryOperation>[0]['action'];
      itemId?: string | null;
      payload?: Record<string, unknown>;
      expectedRevision?: number | null;
      reason?: string;
    }) => executeStudio2StoryOperation({
      editionId: resolvedEditionId,
      action: input.action,
      reason: (input.reason ?? auditReason).trim(),
      executionId: crypto.randomUUID(),
      expectedRevision: input.expectedRevision ?? story?.revision ?? null,
      itemId: input.itemId ?? null,
      payload: input.payload ?? {},
    }),
    onSuccess: async (execution) => {
      await queryClient.invalidateQueries({ queryKey: ['studio2-storytelling', resolvedEditionId] });
      await queryClient.invalidateQueries({ queryKey: ['studio2-anniversary-engine'] });
      toast.success(`${storyOperationLabel(execution.action)} completed.`);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  function requireReason() {
    if (auditReason.trim().length >= 5) return true;
    toast.error('Add an audit reason of at least 5 characters.');
    return false;
  }

  async function generate() {
    if (!requireReason()) return;
    await mutation.mutateAsync({
      action: 'generate_storyline',
      expectedRevision: story?.revision ?? null,
      payload: story ? {} : {
        title: `${edition ? editionLabel(edition) : 'Edition'}: The Story`,
        introduction: `A verified timeline of the moments that shaped ${edition ? editionLabel(edition) : 'this edition'}, assembled from the canonical Solaris Studio event stream.`,
      },
    });
  }

  async function saveMeta() {
    if (!story || !requireReason()) return;
    if (title.trim().length < 3) {
      toast.error('Storyline title must be at least 3 characters.');
      return;
    }
    await mutation.mutateAsync({
      action: 'update_storyline',
      payload: {
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        introduction: introduction.trim() || null,
      },
    });
  }

  function editItem(item: StorylineItem) {
    setItemTarget(item);
    setItemHeadline(item.headline);
    setItemSummary(item.summary);
    setItemImportance(String(item.importance));
    setItemIncluded(item.included);
  }

  async function saveItem() {
    if (!itemTarget || !story || !requireReason()) return;
    const importance = Number(itemImportance);
    if (!Number.isFinite(importance) || importance < 0 || importance > 100) {
      toast.error('Importance must be between 0 and 100.');
      return;
    }
    if (itemHeadline.trim().length < 3 || itemSummary.trim().length < 3) {
      toast.error('Headline and summary are required.');
      return;
    }
    await mutation.mutateAsync({
      action: 'update_item',
      itemId: itemTarget.id,
      payload: {
        headline: itemHeadline.trim(),
        summary: itemSummary.trim(),
        importance,
        included: itemIncluded,
      },
    });
    setItemTarget(null);
  }

  async function createManualMoment() {
    if (!story || !requireReason()) return;
    const importance = Number(manualImportance);
    if (!Number.isFinite(importance) || importance < 0 || importance > 100) {
      toast.error('Importance must be between 0 and 100.');
      return;
    }
    if (manualHeadline.trim().length < 3 || manualSummary.trim().length < 3) {
      toast.error('Headline and summary are required.');
      return;
    }
    const payload: Record<string, unknown> = {
      headline: manualHeadline.trim(),
      summary: manualSummary.trim(),
      importance,
      included: true,
    };
    if (manualOccurredAt) payload.occurredAt = new Date(manualOccurredAt).toISOString();
    await mutation.mutateAsync({ action: 'create_manual_item', payload });
    setManualOpen(false);
    setManualHeadline('');
    setManualSummary('');
    setManualImportance('70');
    setManualOccurredAt('');
  }

  async function moveItem(item: StorylineItem, direction: -1 | 1, index: number) {
    if (!story || !requireReason()) return;
    const ordered = [...story.items].sort((a, b) => a.sortOrder - b.sortOrder || a.occurredAt.localeCompare(b.occurredAt));
    const target = ordered[index + direction];
    if (!target) return;
    const sortOrder = direction < 0 ? target.sortOrder - 1 : target.sortOrder + 1;
    await mutation.mutateAsync({ action: 'reorder_item', itemId: item.id, payload: { sortOrder } });
  }

  async function confirmPublication() {
    if (!confirmAction || !story || !requireReason()) return;
    await mutation.mutateAsync({ action: confirmAction });
    setConfirmAction(null);
  }

  const loading = editionsQuery.isLoading || storyQuery.isLoading;
  const error = editionsQuery.error ?? storyQuery.error;

  return (
    <AdminPage>
      <div className="mx-auto max-w-[1450px] space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2 · Storytelling"
          title="Storytelling & Anniversary"
          description="Turn the canonical contest event stream into an editable edition narrative, publish it deliberately, and preview date-aware anniversary history without allowing generated prose to become canonical by itself."
          actions={edition ? (
            <a href={`/stories/${edition.slug}`} target="_blank" rel="noreferrer" className="admin-action-secondary">
              Public story <Eye className="size-4" />
            </a>
          ) : undefined}
        />

        <div className="flex flex-wrap gap-2">
          <TabButton active={view === 'storyline'} onClick={() => setView('storyline')} icon={BookOpen}>Edition storyline</TabButton>
          <TabButton active={view === 'anniversary'} onClick={() => setView('anniversary')} icon={CalendarDays}>Anniversary engine</TabButton>
        </div>

        {!edition && !editionsQuery.isLoading ? (
          <AdminCard><AdminEmptyState icon={BookOpen} title="No edition selected" description="Select an edition before managing its storyline." /></AdminCard>
        ) : loading ? (
          <AdminCard><p className="py-12 text-center text-sm text-muted-foreground">Building the storytelling snapshot…</p></AdminCard>
        ) : error ? (
          <AdminCard><AdminEmptyState icon={History} title="Storytelling unavailable" description={errorText(error)} /></AdminCard>
        ) : view === 'storyline' && snapshot ? (
          <>
            <AdminCard strong>
              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                <div>
                  <AdminCardHeader
                    eyebrow={edition ? editionLabel(edition) : 'Current edition'}
                    title={story ? story.title : 'No storyline generated yet'}
                    description={story
                      ? `${snapshot.sourceEventCount} canonical events are available; ${snapshot.eligibleSourceEventCount} currently clear the deterministic significance threshold.`
                      : 'Generate a draft from significant canonical contest events. Existing editor changes are preserved on later refreshes.'}
                  />
                  <div className="flex flex-wrap gap-2">
                    {story ? <AdminStatus tone={storyStatusTone(story.status)}>{story.status === 'published' ? 'Published' : 'Draft'}</AdminStatus> : <AdminStatus>Not generated</AdminStatus>}
                    <AdminStatus tone="info">{snapshot.eligibleSourceEventCount} eligible source events</AdminStatus>
                    {story ? <AdminStatus tone="neutral">revision {story.revision}</AdminStatus> : null}
                  </div>
                </div>
                <button type="button" onClick={() => void generate()} disabled={mutation.isPending} className="admin-action-primary">
                  <RefreshCw className="size-4" /> {story ? 'Refresh from events' : 'Generate storyline'}
                </button>
              </div>
            </AdminCard>

            <AdminCard>
              <AdminCardHeader
                eyebrow="Audit trail"
                title="Reason for editorial changes"
                description="Every generation, edit, reorder and publication action produces an immutable execution receipt and a canonical Studio 2 event."
              />
              <input
                value={auditReason}
                onChange={(event) => setAuditReason(event.target.value)}
                placeholder="e.g. Prepare official SSC 20 post-edition story"
                className="min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30"
              />
            </AdminCard>

            {!story ? (
              <AdminCard>
                <AdminEmptyState
                  icon={Sparkles}
                  title="The event stream is ready"
                  description="Generation uses a fixed significance model and deterministic copy. Nothing is public until an organizer reviews and publishes it."
                  action={<button type="button" onClick={() => void generate()} className="admin-action-primary"><Sparkles className="size-4" /> Generate draft</button>}
                />
              </AdminCard>
            ) : (
              <>
                <AdminCard>
                  <AdminCardHeader
                    eyebrow="Editorial copy"
                    title="Story framing"
                    description="Generated event summaries are starting material. Organizer edits are authoritative and regeneration will not overwrite them."
                    action={<button type="button" onClick={() => void saveMeta()} disabled={mutation.isPending} className="admin-action-secondary"><Save className="size-4" /> Save copy</button>}
                  />
                  <div className="grid gap-3">
                    <Field label="Title"><input value={title} onChange={(event) => setTitle(event.target.value)} className="story-input" /></Field>
                    <Field label="Subtitle"><input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} className="story-input" /></Field>
                    <Field label="Introduction"><textarea value={introduction} onChange={(event) => setIntroduction(event.target.value)} rows={4} className="story-input resize-y" /></Field>
                  </div>
                </AdminCard>

                <AdminCard>
                  <AdminCardHeader
                    eyebrow="Canonical event stream"
                    title="Story moments"
                    description={`${readiness?.included ?? 0} included · ${readiness?.edited ?? 0} organizer-edited. Low-value operational events never enter the draft automatically.`}
                    action={<button type="button" onClick={() => setManualOpen(true)} className="admin-action-secondary"><Plus className="size-4" /> Manual moment</button>}
                  />
                  <div className="space-y-2">
                    {[...story.items]
                      .sort((a, b) => a.sortOrder - b.sortOrder || a.occurredAt.localeCompare(b.occurredAt))
                      .map((item, index, ordered) => (
                        <article key={item.id} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 sm:p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <AdminStatus tone={item.included ? 'ready' : 'neutral'}>{item.included ? 'Included' : 'Excluded'}</AdminStatus>
                                <AdminStatus tone="info">importance {item.importance}</AdminStatus>
                                {item.manualOverride ? <AdminStatus tone="attention">Editor override</AdminStatus> : null}
                                <span className="text-[11px] text-muted-foreground">{formatDateTime(item.occurredAt)}</span>
                              </div>
                              <h3 className="mt-2 text-sm font-semibold text-foreground">{item.headline}</h3>
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.summary}</p>
                              <p className="mt-2 text-[10px] uppercase tracking-[0.13em] text-muted-foreground">{item.sourceEventType ?? 'manual editorial moment'}</p>
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <button type="button" disabled={index === 0 || mutation.isPending} onClick={() => void moveItem(item, -1, index)} className="admin-action-quiet !size-9 !p-0" aria-label="Move moment up"><ChevronUp className="size-4" /></button>
                              <button type="button" disabled={index === ordered.length - 1 || mutation.isPending} onClick={() => void moveItem(item, 1, index)} className="admin-action-quiet !size-9 !p-0" aria-label="Move moment down"><ChevronDown className="size-4" /></button>
                              <button type="button" onClick={() => editItem(item)} className="admin-action-secondary !min-h-9 !px-2.5"><Pencil className="size-4" /> Edit</button>
                            </div>
                          </div>
                        </article>
                      ))}
                  </div>
                </AdminCard>

                <AdminCard strong>
                  <AdminCardHeader
                    eyebrow="Publication gate"
                    title="Publish the edition story"
                    description={story.status === 'published'
                      ? 'This storyline is visible through the public story API and public edition-story route.'
                      : 'Publication is explicit. Editing a published storyline automatically returns it to draft so changed history cannot leak out without a second review.'}
                  />
                  {readiness?.blockers.length ? (
                    <div className="mb-4 rounded-xl border border-amber-200/15 bg-amber-200/[0.04] p-3 text-xs text-muted-foreground">
                      {readiness.blockers.map((blocker) => <p key={blocker}>• {blocker}</p>)}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {story.status === 'published' ? (
                      <button type="button" onClick={() => setConfirmAction('unpublish_storyline')} className="admin-action-danger"><EyeOff className="size-4" /> Unpublish story</button>
                    ) : (
                      <button type="button" disabled={!readiness?.publishable} onClick={() => setConfirmAction('publish_storyline')} className="admin-action-primary"><Eye className="size-4" /> Publish story</button>
                    )}
                    <a href={`/stories/${edition?.slug ?? ''}`} target="_blank" rel="noreferrer" className="admin-action-secondary">Open public route</a>
                  </div>
                </AdminCard>
              </>
            )}
          </>
        ) : view === 'anniversary' ? (
          <AnniversaryPreview
            date={anniversaryDate}
            onDateChange={setAnniversaryDate}
            loading={anniversaryQuery.isLoading}
            error={anniversaryQuery.error}
            engine={anniversaryQuery.data ?? null}
          />
        ) : null}
      </div>

      <AdminSheet open={Boolean(itemTarget)} onClose={() => setItemTarget(null)} title="Edit story moment" description="Organizer copy is preserved on future event-stream refreshes.">
        <div className="space-y-4">
          <Field label="Headline"><input value={itemHeadline} onChange={(event) => setItemHeadline(event.target.value)} className="story-input" /></Field>
          <Field label="Summary"><textarea value={itemSummary} onChange={(event) => setItemSummary(event.target.value)} rows={5} className="story-input resize-y" /></Field>
          <Field label="Importance 0–100"><input type="number" min="0" max="100" value={itemImportance} onChange={(event) => setItemImportance(event.target.value)} className="story-input" /></Field>
          <label className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-sm">
            <input type="checkbox" checked={itemIncluded} onChange={(event) => setItemIncluded(event.target.checked)} />
            Include this moment in the public story
          </label>
          <button type="button" onClick={() => void saveItem()} disabled={mutation.isPending} className="admin-action-primary w-full"><Save className="size-4" /> Save moment</button>
        </div>
      </AdminSheet>

      <AdminSheet open={manualOpen} onClose={() => setManualOpen(false)} title="Add manual story moment" description="Use this only for editorial context that does not have its own canonical Studio event. It is marked as manual in the audit model.">
        <div className="space-y-4">
          <Field label="Headline"><input value={manualHeadline} onChange={(event) => setManualHeadline(event.target.value)} className="story-input" /></Field>
          <Field label="Summary"><textarea value={manualSummary} onChange={(event) => setManualSummary(event.target.value)} rows={5} className="story-input resize-y" /></Field>
          <Field label="Importance 0–100"><input type="number" min="0" max="100" value={manualImportance} onChange={(event) => setManualImportance(event.target.value)} className="story-input" /></Field>
          <Field label="Occurred at (optional)"><input type="datetime-local" value={manualOccurredAt} onChange={(event) => setManualOccurredAt(event.target.value)} className="story-input" /></Field>
          <button type="button" onClick={() => void createManualMoment()} disabled={mutation.isPending} className="admin-action-primary w-full"><FilePlus2 className="size-4" /> Add moment</button>
        </div>
      </AdminSheet>

      <AdminConfirmSheet
        open={confirmAction === 'publish_storyline'}
        onClose={() => setConfirmAction(null)}
        onConfirm={confirmPublication}
        title="Publish edition storyline"
        description="This makes the reviewed storyline public and exposes it to the Anniversary Engine. Generated copy is never published by generation alone."
        confirmLabel="Publish storyline"
        confirmationText="PUBLISH"
        busy={mutation.isPending}
      />
      <AdminConfirmSheet
        open={confirmAction === 'unpublish_storyline'}
        onClose={() => setConfirmAction(null)}
        onConfirm={confirmPublication}
        title="Unpublish edition storyline"
        description="The public story disappears immediately, but the draft, source links and audit history remain intact."
        confirmLabel="Unpublish storyline"
        confirmationText="UNPUBLISH"
        busy={mutation.isPending}
        danger
      />
    </AdminPage>
  );
}

function AnniversaryPreview({ date, onDateChange, loading, error, engine }: {
  date: string;
  onDateChange: (value: string) => void;
  loading: boolean;
  error: unknown;
  engine: Awaited<ReturnType<typeof loadAnniversaryEngine>> | null;
}) {
  return (
    <>
      <AdminCard strong>
        <AdminCardHeader
          eyebrow="Date-aware archive"
          title="Anniversary Engine preview"
          description="Preview exactly what the public history engine sees for any calendar date. It reads only published storylines plus published edition participation history."
        />
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Reference date"><input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} className="story-input min-w-52" /></Field>
          {engine?.sscAnniversary ? <AdminStatus tone="ready">{engine.sscAnniversary.label}</AdminStatus> : <AdminStatus tone="neutral">Regular archive day</AdminStatus>}
        </div>
      </AdminCard>

      {loading ? <AdminCard><p className="py-10 text-center text-sm text-muted-foreground">Reading the published archive…</p></AdminCard> : null}
      {error ? <AdminCard><AdminEmptyState icon={CalendarDays} title="Anniversary preview unavailable" description={errorText(error)} /></AdminCard> : null}
      {engine ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <MomentList title="On this day" eyebrow={engine.referenceDate} moments={engine.onThisDay} />
          <MomentList title="One year ago" eyebrow="Exact date match" moments={engine.oneYearAgo} />
          <MomentList title="Five years ago" eyebrow="Long memory" moments={engine.fiveYearsAgo} />
          <AdminCard>
            <AdminCardHeader eyebrow="Delegation history" title="Country anniversaries" description="First published participation anniversaries that fall on the reference date." />
            {engine.countryAnniversaries.length ? (
              <div className="space-y-2">
                {engine.countryAnniversaries.map((item) => (
                  <div key={item.countryId} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                    <p className="text-sm font-semibold">{item.countryName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.years} years since first published participation · {item.firstParticipationDate}</p>
                  </div>
                ))}
              </div>
            ) : <AdminEmptyState icon={Clock3} title="No country anniversaries" description="No country's first published participation falls on this date." />}
          </AdminCard>
          <AdminCard className="xl:col-span-2">
            <AdminCardHeader eyebrow="Published narratives" title="Recent edition stories" description="Only explicitly published storylines enter this public feed." />
            {engine.recentStories.length ? (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {engine.recentStories.map((story) => (
                  <a key={story.editionSlug} href={`/stories/${story.editionSlug}`} target="_blank" rel="noreferrer" className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 hover:bg-white/[0.04]">
                    <p className="text-sm font-semibold">{story.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{story.itemCount} moments · {story.editionName}</p>
                  </a>
                ))}
              </div>
            ) : <AdminEmptyState icon={BookOpen} title="No published storylines yet" description="Publish an edition storyline to populate the public storytelling archive." />}
          </AdminCard>
        </div>
      ) : null}
    </>
  );
}

function MomentList({ title, eyebrow, moments }: {
  title: string;
  eyebrow: string;
  moments: Awaited<ReturnType<typeof loadAnniversaryEngine>>['onThisDay'];
}) {
  return (
    <AdminCard>
      <AdminCardHeader eyebrow={eyebrow} title={title} />
      {moments.length ? (
        <div className="space-y-2">
          {moments.map((moment, index) => (
            <div key={`${moment.editionSlug ?? 'story'}-${moment.occurredAt}-${index}`} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{moment.headline}</p>
                <AdminStatus tone="info">{moment.importance}</AdminStatus>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{moment.summary}</p>
              <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{moment.editionName ?? 'Solaris'} · {formatDateTime(moment.occurredAt)}</p>
            </div>
          ))}
        </div>
      ) : <AdminEmptyState icon={Clock3} title="No published moments" description="The public archive has no published storyline moments for this date bucket." />}
    </AdminCard>
  );
}

function TabButton({ active, onClick, icon: Icon, children }: {
  active: boolean;
  onClick: () => void;
  icon: typeof BookOpen;
  children: string;
}) {
  return (
    <button type="button" onClick={onClick} className={active ? 'admin-action-primary' : 'admin-action-secondary'}>
      <Icon className="size-4" /> {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-xs font-semibold text-foreground">{label}</span>{children}</label>;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return 'Unexpected storytelling error.';
}
