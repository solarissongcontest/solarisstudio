import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowLeft, ArrowUp, Plus } from "lucide-react";

import {
  appendWorldAgenda,
  canManageWorldSession,
  getWorldManageAgenda,
  publishWorldAgenda,
  reorderWorldAgenda,
  transitionWorldSession,
  type WorldOperationReceipt,
} from "@/lib/world-session-public";

type Retryable = { run: () => Promise<WorldOperationReceipt>; onSuccess?: () => void };
type PendingAction =
  | { type: "publish"; itemId: string; title: string }
  | { type: "transition"; status: "open" | "recessed" | "concluded" | "cancelled" | "archived" };
const errorMessage = (error: unknown) =>
  error && typeof error === "object" && "code" in error &&
  error.code === "40001"
    ? "The agenda changed on another device. Refresh before editing."
    : error && typeof error === "object" && "code" in error &&
      error.code === "42501"
      ? "Your institutional permission could not be verified."
      : "The operation outcome is uncertain. You can safely retry the same request or reload official state.";

export function WorldAgendaEditor({ sessionId }: { sessionId: string }) {
  const client = useQueryClient();
  const agenda = useQuery({
    queryKey: ["world", "session", "manage", sessionId],
    queryFn: () => getWorldManageAgenda(sessionId),
    retry: false,
    staleTime: 0,
  });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [published, setPublished] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);
  const retryable = useRef<Retryable | null>(null);
  const canManage = useQuery({
    queryKey: ["world", "session", "can-manage", agenda.data?.organizationId, agenda.data?.organId],
    enabled: Boolean(agenda.data),
    queryFn: () => canManageWorldSession(agenda.data!.organizationId, agenda.data!.organId),
    retry: false,
    staleTime: 20_000,
  });

  function editDraft() {
    setError(null);
    setReviewing(false);
    retryable.current = null;
  }

  async function run(operation: Retryable) {
    if (busy) return;
    retryable.current = operation;
    setBusy(true);
    setError(null);
    try {
      const receipt = await operation.run();
      setLastReceipt(receipt.operationId);
      retryable.current = null;
      setReviewing(false);
      operation.onSuccess?.();
      setPendingAction(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["world", "session", "manage", sessionId] }),
        client.invalidateQueries({ queryKey: ["world", "session", "public", sessionId] }),
        client.invalidateQueries({ queryKey: ["world", "sessions", "public"] }),
      ]);
    } catch (cause) {
      setError(errorMessage(cause));
      // Keep exactly the same operation identity for explicit retry after an
      // ambiguous network failure. Never create another official agenda item.
    } finally {
      setBusy(false);
    }
  }

  function submitItem() {
    const current = agenda.data;
    if (!current || !title.trim() || title.trim().length > 180) {
      setError("Enter a title up to 180 characters and reload official agenda state.");
      return;
    }
    const operationId = crypto.randomUUID();
    const args = {
      sessionId, title: title.trim(), description: description.trim(),
      itemType: "discussion", publish: published,
      expectedRevision: current.revision, operationId,
      idempotencyKey: "world.agenda.append:" + operationId,
    };
    void run({ run: () => appendWorldAgenda(args), onSuccess: () => {
      setTitle("");
      setDescription("");
      setPublished(false);
    } });
  }

  function move(index: number, offset: number) {
    const current = agenda.data;
    if (!current || index + offset < 0 || index + offset >= current.items.length) return;
    const ids = current.items.map((item) => item.id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    const operationId = crypto.randomUUID();
    const args = {
      sessionId, itemIds: ids, expectedRevision: current.revision,
      operationId, idempotencyKey: "world.agenda.reorder:" + operationId,
    };
    void run({ run: () => reorderWorldAgenda(args) });
  }

  function confirmPendingAction() {
    const current = agenda.data;
    if (!pendingAction || !current || retryable.current || busy) return;
    const operationId = crypto.randomUUID();
    if (pendingAction.type === "publish") {
      const args = {
        sessionId,
        itemId: pendingAction.itemId,
        expectedRevision: current.revision,
        operationId,
        idempotencyKey: "world.agenda.publish:" + operationId,
      };
      void run({ run: () => publishWorldAgenda(args) });
    } else {
      if (canManage.data !== true || canManage.isFetching) {
        setError("Session management authorization is not available.");
        return;
      }
      const args = {
        sessionId,
        targetStatus: pendingAction.status,
        expectedRevision: current.revision,
        operationId,
        idempotencyKey: "world.session.transition:" + operationId,
      };
      void run({ run: () => transitionWorldSession(args) });
    }
  }

  const transitions: Record<string, Array<PendingAction & { type: "transition" }>> = {
    scheduled: [{ type: "transition", status: "open" }, { type: "transition", status: "cancelled" }],
    open: [{ type: "transition", status: "recessed" }, { type: "transition", status: "concluded" }],
    recessed: [{ type: "transition", status: "open" }, { type: "transition", status: "concluded" }],
    concluded: [{ type: "transition", status: "archived" }],
    cancelled: [{ type: "transition", status: "archived" }],
  };

  return (
    <section className="mx-auto w-full max-w-4xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <Link to={"/world/sessions/$sessionId" as any}
        params={{ sessionId } as any}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Public session
      </Link>
      <header className="mt-4 border-b border-border/70 pb-6">
        <p className="text-[11px] font-bold uppercase tracking-[.18em] text-primary">Institutional control · TG6</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-.04em] sm:text-4xl">Manage the agenda</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Draft items stay private. Publishing makes an item visible on the public session page.
          Every change is revision-checked and recorded by the server.
        </p>
      </header>
      {agenda.isPending ? (
        <p className="py-10 text-sm text-muted-foreground" role="status">Checking session and institutional permissions…</p>
      ) : agenda.isError ? (
        <div className="py-10" role="alert">
          <h2 className="font-semibold">Agenda management unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This session may not exist, you may lack permission, or the institution may be temporarily unavailable.
            Draft agenda items have not been disclosed.
          </p>
          <button type="button" onClick={() => void agenda.refetch()}
            className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">Retry authorization</button>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Server revision <span className="font-semibold tabular-nums">{agenda.data.revision}</span>
              {" · "}<span className="capitalize">{agenda.data.status}</span>
            </p>
            <button type="button" onClick={() => void agenda.refetch()} disabled={busy}
              className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-50">
              Refresh agenda
            </button>
          </div>
          <section className="mt-5 border-b border-border/70 pb-5" aria-label="Session lifecycle">
            <h2 className="text-sm font-semibold">Official session status</h2>
            {canManage.isPending ? (
              <p className="mt-2 text-xs text-muted-foreground" role="status">Checking status-change permission…</p>
            ) : canManage.data !== true ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Status changes require a separate institutional management capability.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {(transitions[agenda.data.status] ?? []).map((action) => (
                  <button key={action.status} type="button"
                    disabled={busy || Boolean(retryable.current) || Boolean(pendingAction)}
                    onClick={() => { setError(null); setPendingAction(action); }}
                    className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold capitalize disabled:opacity-40">
                    {action.status === "open" ? "Open / resume session" : action.status + " session"}
                  </button>
                ))}
              </div>
            )}
          </section>
          {agenda.data.status === "scheduled" || agenda.data.status === "open" ||
           agenda.data.status === "recessed" ? (
            <>
              <ol className="mt-5 divide-y divide-border/60" aria-label="Full authorized agenda">
                {agenda.data.items.map((item, index) => (
                  <li key={item.id} className="flex min-h-20 items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold"><span className="mr-3 tabular-nums text-primary">
                        {item.position}.
                      </span>{item.title}</p>
                      <p className="mt-1 pl-7 text-xs capitalize text-muted-foreground">{item.state}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {item.state === "draft" ? (
                        <button type="button"
                          disabled={busy || Boolean(retryable.current) || Boolean(pendingAction)}
                          onClick={() => { setError(null); setPendingAction({ type: "publish", itemId: item.id, title: item.title }); }}
                          className="min-h-11 rounded-xl border border-primary/40 px-3 text-xs font-semibold text-primary disabled:opacity-40">
                          Publish
                        </button>
                      ) : null}
                      <button type="button" onClick={() => move(index, -1)}
                        disabled={busy || Boolean(retryable.current) || Boolean(pendingAction) || index === 0}
                        aria-label={"Move " + item.title + " up"}
                        className="inline-flex size-11 items-center justify-center rounded-xl border border-border disabled:opacity-35">
                        <ArrowUp className="size-4" aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => move(index, 1)}
                        disabled={busy || Boolean(retryable.current) || Boolean(pendingAction) || index === agenda.data.items.length - 1}
                        aria-label={"Move " + item.title + " down"}
                        className="inline-flex size-11 items-center justify-center rounded-xl border border-border disabled:opacity-35">
                        <ArrowDown className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
              {agenda.data.items.length === 0 ? (
                <p className="py-8 text-sm text-muted-foreground">This agenda has no items yet.</p>
              ) : null}
              <form className="mt-10 border-t border-border/70 pt-7"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!busy && !retryable.current && title.trim()) setReviewing(true);
                }}>
                <div className="mb-5 flex items-center gap-2">
                  <Plus className="size-5 text-primary" aria-hidden="true" />
                  <h2 className="text-xl font-semibold">Add an agenda item</h2>
                </div>
                <label className="block text-sm font-semibold">
                  Title
                  <input value={title} maxLength={180} required
                    disabled={busy || reviewing || Boolean(retryable.current)}
                    onChange={(event) => { setTitle(event.target.value); editDraft(); }}
                    className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal"
                    placeholder="New discussion item" />
                </label>
                <label className="mt-5 block text-sm font-semibold">
                  Description (optional)
                  <textarea value={description} maxLength={3000} rows={3}
                    disabled={busy || reviewing || Boolean(retryable.current)}
                    onChange={(event) => { setDescription(event.target.value); editDraft(); }}
                    className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm font-normal"
                    placeholder="What the assembly will discuss" />
                </label>
                <label className="mt-5 flex min-h-11 items-center gap-3 text-sm font-medium">
                  <input type="checkbox" checked={published}
                    disabled={busy || reviewing || Boolean(retryable.current)}
                    onChange={(event) => { setPublished(event.target.checked); editDraft(); }}
                    className="size-5 accent-primary" />
                  Publish this item on the public agenda
                </label>
                {reviewing ? (
                  <div className="mt-4 rounded-2xl border border-primary/40 bg-surface p-5">
                    <h3 className="font-semibold">Review the agenda change</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{title}</p>
                    <p className="mt-2 text-sm font-semibold">
                      {published ? "Public as soon as the command succeeds" : "Private draft"}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button type="button" onClick={() => setReviewing(false)} disabled={busy}
                        className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">
                        Edit
                      </button>
                      <button type="button" onClick={submitItem} disabled={busy}
                        className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                        {busy ? "Saving…" : "Confirm agenda item"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="submit" disabled={busy || Boolean(retryable.current) || !title.trim()}
                    className="mt-4 min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                    Review item
                  </button>
                )}
              </form>
            </>
          ) : (
            <p className="mt-8 text-sm text-muted-foreground">
              This session is no longer editable. Its official agenda remains preserved.
            </p>
          )}
          {pendingAction && !retryable.current ? (
            <section className="mt-6 rounded-2xl border border-primary/40 bg-surface p-5"
              role="dialog" aria-modal="true" aria-labelledby="world-action-review-title">
              <h2 id="world-action-review-title" className="text-lg font-semibold">
                Review institutional action
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {pendingAction.type === "publish"
                  ? "Publish “" + pendingAction.title + "” to the official public session agenda?"
                  : "Change this institutional session from " + agenda.data.status +
                    " to " + pendingAction.status + "?"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                This operation checks the current server revision and produces a durable receipt.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => setPendingAction(null)}
                  className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">Cancel</button>
                <button type="button" disabled={busy} onClick={confirmPendingAction}
                  className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40">
                  {busy ? "Committing…" : "Confirm official action"}
                </button>
              </div>
            </section>
          ) : null}
          {error ? (
            <div className="mt-6" role="alert">
              <p className="text-sm text-destructive">{error}</p>
              {retryable.current ? (
                <button type="button" disabled={busy}
                  onClick={() => { const sameAttempt = retryable.current; if (sameAttempt) void run(sameAttempt); }}
                  className="mt-3 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-50">
                  Retry same operation
                </button>
              ) : null}
            </div>
          ) : null}
          {lastReceipt ? (
            <p className="mt-5 break-all text-xs text-muted-foreground" role="status">
              Recorded operation receipt: {lastReceipt}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
