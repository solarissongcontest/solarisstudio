import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, LockKeyhole, MessageSquare, Pencil, Pin, Plus, RefreshCcw, Reply, Send, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  PRIVATE_WORLD_QUERY_ROOT, WORLD_ROOM_PAGE_SIZE,
  createWorldRoom, editWorldRoomMessage, getMyWorldWorkspaces,
  getWorldRoomMessages, getWorldRooms, isVisiblePrivateWorldQuery,
  moderateWorldRoomMessage, reactToWorldRoomMessage, sendWorldRoomMessage,
  type WorldChatMessage, type WorldPrivateRoom,
} from "@/lib/terra-world-private";

function useWorldPrivateIdentity() {
  const queryClient = useQueryClient();
  const identity = useQuery({
    queryKey: ["world-private-identity"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      return data.user.id;
    },
    gcTime: 0, staleTime: 0, refetchOnMount: "always", retry: false,
  });
  useEffect(() => {
    const { data: auth } = supabase.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION") return;
      // Sensitive data must not survive account switches, sign-out, or token
      // changes, even in an otherwise still-mounted member workspace.
      queryClient.removeQueries({ queryKey: PRIVATE_WORLD_QUERY_ROOT });
      void identity.refetch();
    });
    return () => auth.subscription.unsubscribe();
  }, [queryClient, identity.refetch]);
  return identity;
}

function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  useEffect(() => {
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, []);
  return online;
}
function AccessNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <div role="alert" className="my-8 border-y border-border py-7">
    <LockKeyhole className="mb-3 size-6 text-muted-foreground" aria-hidden="true" />
    <p className="max-w-xl text-sm leading-6 text-muted-foreground">{message}</p>
    {retry ? <button type="button" onClick={retry}
      className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <RefreshCcw className="size-4" /> Retry securely
    </button> : null}
  </div>;
}
function PrivateLayout({ children }: { children: React.ReactNode }) {
  return <AppShell><main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-5 sm:px-7 sm:pt-8">
    {children}
  </main></AppShell>;
}
function PrivateHeader({ title, context }: { title: string; context: string }) {
  return <header className="mb-6">
    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.17em] text-muted-foreground">
      <ShieldCheck className="size-4" aria-hidden="true" /> Private Terra Solaris · {context}
    </p>
    <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
      Access is checked against your current institutional membership. Chat is confidential, not a public Archive record.
    </p>
  </header>;
}
function SignInNotice() {
  return <AccessNotice message="Sign in with your Solaris account to open an institutional workspace. Existing invitations never override a revoked membership." />;
}

export function WorldWorkspacesDirectory() {
  const identity = useWorldPrivateIdentity();
  const online = useOnline();
  const organizations = useQuery({
    queryKey: [...PRIVATE_WORLD_QUERY_ROOT, identity.data, "organizations"],
    queryFn: ({ signal }) => getMyWorldWorkspaces(signal),
    enabled: Boolean(identity.data) && online,
    staleTime: 0, gcTime: 0, retry: false, refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
  const visible = isVisiblePrivateWorldQuery(organizations, online);
  return <PrivateLayout>
    <PrivateHeader title="Institutional workspaces" context="Member area" />
    <nav aria-label="World navigation" className="mb-5">
      <Link to="/world" className="inline-flex min-h-11 items-center gap-2 text-sm text-primary">
        <ArrowLeft className="size-4" /> Terra Solaris
      </Link>
    </nav>
    {!online ? <AccessNotice message="Private rooms are unavailable offline. Reconnect to recheck your membership; no confidential messages are stored for offline access." /> :
      identity.isPending ? <p role="status">Verifying your account…</p> :
      identity.isError ? <AccessNotice message="Your session could not be verified." retry={() => void identity.refetch()} /> :
      !identity.data ? <SignInNotice /> :
      organizations.isPending || !organizations.isFetchedAfterMount ? <p role="status">Checking current institutional access…</p> :
      !visible ? <AccessNotice message="Institutional access could not be verified. Previously cached private rooms are hidden." retry={() => void organizations.refetch()} /> :
      organizations.data.length === 0 ? <AccessNotice message="No private institutional rooms are currently accessible to this account. A membership, office or room invitation may be required." /> :
      <section aria-label="Your organizations" className="divide-y divide-border">
        {organizations.data.map((organization) => <Link key={organization.slug} to="/world/workspaces/$slug" params={{ slug: organization.slug }}
          className="group flex min-h-24 items-center gap-4 py-4 focus-visible:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted"><MessageSquare className="size-5" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <strong className="block text-base group-hover:underline">{organization.name}</strong>
            <span className="mt-1 block text-sm text-muted-foreground">{organization.rooms} accessible {organization.rooms === 1 ? "room" : "rooms"}</span>
          </span>
          <span aria-hidden="true" className="text-muted-foreground">→</span>
        </Link>)}
      </section>}
  </PrivateLayout>;
}

type WorkspaceProps = {
  slug: string;
  roomId: string | undefined;
  onRoomChange: (roomId: string | undefined) => void;
};

export function WorldPrivateWorkspace({ slug, roomId, onRoomChange }: WorkspaceProps) {
  const identity = useWorldPrivateIdentity();
  const online = useOnline();
  const queryClient = useQueryClient();
  const rooms = useQuery({
    queryKey: [...PRIVATE_WORLD_QUERY_ROOT, identity.data, slug, "rooms"],
    queryFn: ({ signal }) => getWorldRooms(slug, signal),
    enabled: Boolean(identity.data) && online,
    staleTime: 0, gcTime: 0, retry: false, refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
  const verifiedRooms = isVisiblePrivateWorldQuery(rooms, online) ? rooms.data : null;
  const requestedRoom = verifiedRooms?.find((room) => room.id === roomId);
  const selectedRoom = requestedRoom ?? (!roomId ? verifiedRooms?.[0] : undefined);
  const selectedId = selectedRoom?.id;
  const [draft, setDraft] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const pendingRequest = useRef<{ id: string; body: string; reply: string | null } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomVisibility, setRoomVisibility] = useState<WorldPrivateRoom["visibility"]>("members");
  const [historyPolicy, setHistoryPolicy] = useState<WorldPrivateRoom["history"]>("from_join");

  useEffect(() => {
    setDraft(""); setReplyToId(null); setEditingId(null); setActionError(null);
    pendingRequest.current = null;
  }, [selectedId, identity.data]);

  const messages = useInfiniteQuery({
    queryKey: [...PRIVATE_WORLD_QUERY_ROOT, identity.data, slug, selectedId, "messages"],
    queryFn: ({ pageParam, signal }) => getWorldRoomMessages(selectedId!, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.length === WORLD_ROOM_PAGE_SIZE ? last[0].id : undefined,
    enabled: Boolean(identity.data && selectedId && verifiedRooms && online),
    retry: false, staleTime: 0, gcTime: 0, refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    // Bounded, single-active-room refresh. No cross-room subscription fanout.
    refetchInterval: () => typeof document !== "undefined" && document.visibilityState === "visible" ? 20_000 : false,
    refetchIntervalInBackground: false,
  });
  const verifiedMessages = isVisiblePrivateWorldQuery(messages, online)
    ? messages.data?.pages.slice().reverse().flat() ?? null : null;
  const canShowMessages = Boolean(selectedRoom && verifiedRooms && verifiedMessages);

  const send = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Select a room.");
      const body = draft.trim();
      if (!body || body.length > 4000) throw new Error("Enter a message of up to 4,000 characters.");
      const candidate = pendingRequest.current;
      const request = candidate && candidate.body === body && candidate.reply === replyToId
        ? candidate : { id: crypto.randomUUID(), body, reply: replyToId };
      pendingRequest.current = request;
      return sendWorldRoomMessage(selectedId, body, request.id, replyToId);
    },
    onSuccess: async () => {
      setDraft(""); setReplyToId(null); setActionError(null);
      pendingRequest.current = null;
      await messages.refetch();
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Message was not confirmed. Retry to reuse its receipt key."),
  });
  const createRoom = useMutation({
    mutationFn: async () => {
      const target = verifiedRooms?.find((room) => room.canManage);
      if (!target) throw new Error("No current room-management authority.");
      return createWorldRoom({
        organizationId: target.organizationId, name: roomName,
        description: "", visibility: roomVisibility, history: historyPolicy,
        requestId: crypto.randomUUID(),
      });
    },
    onSuccess: async () => {
      setRoomName(""); setShowCreate(false);
      await queryClient.invalidateQueries({ queryKey: [...PRIVATE_WORLD_QUERY_ROOT, identity.data, slug, "rooms"] });
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Room creation failed."),
  });
  async function act(task: () => Promise<unknown>) {
    setActionError(null);
    try { await task(); await messages.refetch(); }
    catch (error) { setActionError(error instanceof Error ? error.message : "Action could not be verified."); }
  }

  const allMessages = useMemo(() => verifiedMessages ?? [], [verifiedMessages]);
  const replyTo = allMessages.find((m) => m.id === replyToId);
  const canManage = Boolean(verifiedRooms?.some((room) => room.canManage));

  return <PrivateLayout>
    <nav aria-label="Workspace breadcrumbs" className="mb-5">
      <Link to="/world/workspaces" className="inline-flex min-h-11 items-center gap-2 text-sm text-primary">
        <ArrowLeft className="size-4" aria-hidden="true" /> My workspaces
      </Link>
    </nav>
    <PrivateHeader title={slug.toUpperCase()} context="Institutional workspace" />
    {!online ? <AccessNotice message="Private workspaces are unavailable offline. No confidential chat history is saved for offline reading." /> :
      identity.isPending ? <p role="status">Verifying your account…</p> :
      identity.isError ? <AccessNotice message="Session verification failed." retry={() => void identity.refetch()} /> :
      !identity.data ? <SignInNotice /> :
      rooms.isPending || !rooms.isFetchedAfterMount ? <p role="status">Checking your room access…</p> :
      !verifiedRooms ? <AccessNotice message="Your room permissions could not be verified. Cached private content is hidden." retry={() => void rooms.refetch()} /> :
      verifiedRooms.length === 0 ? <AccessNotice message="No private rooms are currently accessible in this institution. Your membership or invitation may have changed." retry={() => void rooms.refetch()} /> :
      roomId && !requestedRoom ? <AccessNotice message="This room is unavailable to your current account. Membership may have ended or your room role may have changed." retry={() => onRoomChange(undefined)} /> :
      <div className="min-h-[460px] overflow-hidden rounded-2xl border border-border md:grid md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[310px_minmax(0,1fr)]">
        <aside className={roomId ? "hidden border-r border-border md:block" : "border-r border-border"} aria-label="Private rooms">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-semibold">Member rooms</h2>
            {canManage ? <button type="button" onClick={() => setShowCreate((value) => !value)}
              aria-label="Create private room" aria-expanded={showCreate}
              className="grid size-11 place-items-center rounded-lg hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <Plus className="size-5" />
            </button> : null}
          </div>
          {showCreate && canManage ? <form onSubmit={(event) => { event.preventDefault(); void createRoom.mutateAsync(); }}
            className="space-y-3 border-b border-border p-4">
            <label className="block text-sm font-semibold">Room name
              <input value={roomName} maxLength={100} required onChange={(event) => setRoomName(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3" />
            </label>
            <label className="block text-sm">Access policy
              <select value={roomVisibility} onChange={(event) => setRoomVisibility(event.target.value as WorldPrivateRoom["visibility"])}
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3">
                <option value="members">All current members</option>
                <option value="leadership">Leadership and invited members</option>
                <option value="custom">Explicit grants only</option>
              </select>
            </label>
            <label className="block text-sm">Message history
              <select value={historyPolicy} onChange={(event) => setHistoryPolicy(event.target.value as WorldPrivateRoom["history"])}
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3">
                <option value="from_join">Only after joining</option>
                <option value="all_member_history">All member history</option>
                <option value="custom">Custom grant history</option>
              </select>
            </label>
            <button type="submit" disabled={createRoom.isPending}
              className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">Create room</button>
          </form> : null}
          <div className="divide-y divide-border">
            {verifiedRooms.map((room) => <button key={room.id} type="button" onClick={() => onRoomChange(room.id)}
              aria-current={room.id === selectedId ? "page" : undefined}
              className={"block min-h-20 w-full px-4 py-4 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " +
                (room.id === selectedId ? "bg-muted/70" : "")}>
              <strong className="block truncate text-sm">{room.name}</strong>
              <span className="mt-1 block text-xs text-muted-foreground">
                {room.visibility === "leadership" ? "Leadership" : room.visibility === "custom" ? "Private invitation" : room.visibility === "organ" ? "Committee" : "Members"}
                {" · "}{room.history === "all_member_history" ? "Member history" : "Limited history"}
              </span>
            </button>)}
          </div>
        </aside>

        <section aria-label="Room conversation" className={roomId ? "min-w-0" : "hidden min-w-0 md:block"}>
          {selectedRoom ? <>
            <div className="flex min-h-16 items-center gap-3 border-b border-border px-4 py-3">
              <button type="button" onClick={() => onRoomChange(undefined)} aria-label="Back to rooms"
                className="grid size-11 place-items-center rounded-lg md:hidden"><ArrowLeft className="size-5" /></button>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-semibold">{selectedRoom.name}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{selectedRoom.description || "Private institutional discussion"}</p>
              </div>
              <button type="button" onClick={() => void messages.refetch()} aria-label="Refresh messages"
                className="grid size-11 place-items-center rounded-lg hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <RefreshCcw className="size-4" />
              </button>
            </div>
            <div className="max-h-[60vh] min-h-[300px] space-y-4 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
              {messages.isPending || !messages.isFetchedAfterMount ? <p role="status" className="text-sm text-muted-foreground">Checking your message access…</p> :
                !canShowMessages ? <AccessNotice message="Messages cannot be verified. Private cached results are hidden." retry={() => void messages.refetch()} /> :
                allMessages.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">No messages in this room yet.</p> :
                <>
                  {messages.hasNextPage ? <button type="button" disabled={messages.isFetchingNextPage}
                    onClick={() => void messages.fetchNextPage()}
                    className="min-h-11 w-full rounded-lg border border-border text-sm">Load earlier messages</button> : null}
                  {allMessages.map((message) => <article key={message.id} className="group border-b border-border/50 pb-4 last:border-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <strong className="text-sm">{message.senderId === identity.data ? "You" : message.senderName}</strong>
                      <time dateTime={message.createdAt} className="text-xs text-muted-foreground">
                        {new Date(message.createdAt).toLocaleString()}
                      </time>
                      {message.editedAt ? <span className="text-xs text-muted-foreground">edited</span> : null}
                      {message.pinned ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Pin className="size-3" /> Pinned</span> : null}
                    </div>
                    {message.replyToId ? <p className="mt-1 text-xs text-muted-foreground">↳ In reply to an earlier message</p> : null}
                    {editingId === message.id ?
                      <form className="mt-2 space-y-2" onSubmit={(event) => { event.preventDefault();
                        void act(async () => {
                          await editWorldRoomMessage(message.id, message.revision, editBody);
                          setEditingId(null); setEditBody("");
                        });
                      }}>
                        <textarea value={editBody} maxLength={4000} onChange={(event) => setEditBody(event.target.value)}
                          className="min-h-20 w-full rounded-lg border border-border bg-background p-3" aria-label="Edit message" />
                        <div className="flex gap-2">
                          <button type="submit" className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Save edit</button>
                          <button type="button" className="min-h-11 rounded-lg border border-border px-4 text-sm" onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      </form> :
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>}
                    {!message.redacted ? <div className="mt-2 flex flex-wrap items-center gap-1">
                      <button type="button" onClick={() => setReplyToId(message.id)} aria-label="Reply to message"
                        className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-xs text-muted-foreground hover:bg-muted"><Reply className="size-3.5" /> Reply</button>
                      {message.senderId === identity.data ? <button type="button"
                        onClick={() => { setEditingId(message.id); setEditBody(message.body); }}
                        className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-xs text-muted-foreground hover:bg-muted">
                        <Pencil className="size-3.5" /> Edit
                      </button> : null}
                      {["👍", "❤️", "👀"].map((emoji) => {
                        const mine = message.reactions.some((reaction) => reaction.userId === identity.data && reaction.emoji === emoji);
                        const count = message.reactions.filter((reaction) => reaction.emoji === emoji).length;
                        return <button type="button" key={emoji} aria-label={emoji + (mine ? " remove reaction" : " react")}
                          aria-pressed={mine} className={"min-h-10 rounded-lg px-2 text-xs " + (mine ? "bg-primary/20" : "hover:bg-muted")}
                          onClick={() => void act(() => reactToWorldRoomMessage(message.id, emoji, !mine))}>
                          {emoji}{count ? " " + count : ""}
                        </button>;
                      })}
                      {selectedRoom.canModerate ? <>
                        <button type="button" className="min-h-10 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted"
                          onClick={() => void act(() => moderateWorldRoomMessage(message.id, message.revision, message.pinned ? "unpin" : "pin"))}>
                          {message.pinned ? "Unpin" : "Pin"}
                        </button>
                        <button type="button" className="min-h-10 rounded-lg px-2 text-xs text-destructive hover:bg-muted"
                          onClick={() => {
                            if (window.confirm("Redact this message? Its prior text will remain in restricted audit records.")) {
                              void act(() => moderateWorldRoomMessage(message.id, message.revision, "redact"));
                            }
                          }}>Redact</button>
                      </> : null}
                    </div> : null}
                  </article>)}
                </>}
            </div>
            <form className="border-t border-border p-4" onSubmit={(event) => { event.preventDefault(); void send.mutateAsync(); }}>
              {replyTo ? <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Replying to {replyTo.senderId === identity.data ? "your message" : replyTo.senderName}</span>
                <button type="button" onClick={() => setReplyToId(null)} className="min-h-10 px-2 text-primary">Cancel reply</button>
              </div> : null}
              {actionError ? <p role="alert" className="mb-2 text-sm text-destructive">{actionError}</p> : null}
              <label className="sr-only" htmlFor="world-chat-compose">Write a confidential message</label>
              <div className="flex items-end gap-2">
                <textarea id="world-chat-compose" rows={2} maxLength={4000}
                  placeholder="Message this room" value={draft}
                  onChange={(event) => { setDraft(event.target.value); pendingRequest.current = null; }}
                  className="min-h-12 min-w-0 flex-1 resize-y rounded-xl border border-border bg-background px-3 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" />
                <button type="submit" disabled={send.isPending || !draft.trim() || !canShowMessages}
                  aria-label="Send message" className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50">
                  <Send className="size-5" />
                </button>
              </div>
              <p className="mt-2 text-right text-xs text-muted-foreground">{draft.length}/4000 · Sent messages are retained under the institution's private policy</p>
            </form>
          </> : <div className="grid min-h-96 place-items-center p-6 text-center text-sm text-muted-foreground">
            <p>Select a room to begin a private conversation.</p>
          </div>}
        </section>
      </div>}
  </PrivateLayout>;
}
