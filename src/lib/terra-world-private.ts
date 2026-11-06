import { supabase } from "@/integrations/supabase/client";

/**
 * TG11/TG12 browser adapter. Every result comes from a SECURITY DEFINER RPC
 * that checks current world membership. Never read the private tables directly.
 * Do not persist these projections or use a cross-account query cache key.
 */
export type WorldPrivateOrganization = {
  slug: string;
  name: string;
  rooms: number;
};
export type WorldPrivateRoom = {
  id: string;
  name: string;
  description: string;
  visibility: "members" | "leadership" | "organ" | "custom";
  history: "from_join" | "all_member_history" | "custom";
  status: "active" | "archived";
  revision: number;
};
export type WorldChatReaction = { emoji: string; userId: string };
export type WorldChatMessage = {
  id: string;
  spaceId: string;
  senderId: string;
  senderName: string;
  body: string;
  revision: number;
  replyToId: string | null;
  createdAt: string;
  editedAt: string | null;
  redacted: boolean;
  pinned: boolean;
  reactions: WorldChatReaction[];
};

export const WORLD_ROOM_PAGE_SIZE = 35;
export const PRIVATE_WORLD_QUERY_ROOT = ["world", "private"] as const;
export const isValidRoomId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const safeWorldRoomSlug = (value: string): string =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80 ? value : "";

function asList<T>(raw: unknown, valid: (entry: unknown) => entry is T): T[] {
  return Array.isArray(raw) ? raw.filter(valid) : [];
}
function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}
const isOrganization = (x: unknown): x is WorldPrivateOrganization =>
  isRecord(x) && typeof x.slug === "string" &&
  typeof x.name === "string" && typeof x.rooms === "number";
const isRoom = (x: unknown): x is WorldPrivateRoom =>
  isRecord(x) && isValidRoomId(x.id) &&
  typeof x.name === "string" && typeof x.description === "string" &&
  typeof x.history === "string" && typeof x.visibility === "string" &&
  x.status === "active" && typeof x.revision === "number";
const isMessage = (x: unknown): x is WorldChatMessage =>
  isRecord(x) && isValidRoomId(x.id) && isValidRoomId(x.spaceId) &&
  isValidRoomId(x.senderId) && typeof x.senderName === "string" &&
  typeof x.body === "string" && typeof x.createdAt === "string" &&
  typeof x.revision === "number" && Array.isArray(x.reactions);

async function callWorldPrivateRpc(name: string, args: Record<string, unknown> = {}, signal?: AbortSignal) {
  // Generated database types are updated after the additive migration is
  // deployed. Runtime RPC validation is server-owned, never cast to success.
  const builder = (supabase as any).rpc(name, args);
  const { data, error } = await (signal ? builder.abortSignal(signal) : builder);
  if (error) throw error;
  return data as unknown;
}

export async function getMyWorldWorkspaces(signal?: AbortSignal): Promise<WorldPrivateOrganization[]> {
  return asList(await callWorldPrivateRpc("world_my_workspaces_v1", {}, signal), isOrganization);
}
export async function getWorldRooms(slug: string, signal?: AbortSignal): Promise<WorldPrivateRoom[]> {
  if (!safeWorldRoomSlug(slug)) throw new Error("Invalid organization.");
  return asList(await callWorldPrivateRpc("world_spaces_list_v1", { p_slug: slug }, signal), isRoom);
}
export async function getWorldRoomMessages(roomId: string, before: string | null = null, signal?: AbortSignal):
  Promise<WorldChatMessage[]> {
  if (!isValidRoomId(roomId) || (before !== null && !isValidRoomId(before))) throw new Error("Invalid room or cursor.");
  return asList(await callWorldPrivateRpc("world_space_messages_v1", {
    p_space_id: roomId, p_before: before, p_limit: WORLD_ROOM_PAGE_SIZE,
  }, signal), isMessage);
}

export async function sendWorldRoomMessage(roomId: string, body: string, requestId: string, replyToId: string | null) {
  if (!isValidRoomId(roomId) || !isValidRoomId(requestId) ||
      (replyToId !== null && !isValidRoomId(replyToId)) ||
      body.trim().length < 1 || body.trim().length > 4000)
    throw new Error("Messages must be between 1 and 4,000 characters.");
  return callWorldPrivateRpc("world_space_send_v1", {
    p_space_id: roomId, p_body: body, p_reply_to_id: replyToId, p_request_id: requestId,
  });
}
export async function editWorldRoomMessage(messageId: string, revision: number, body: string) {
  if (!isValidRoomId(messageId) || body.trim().length < 1 || body.trim().length > 4000)
    throw new Error("Invalid message or edited content.");
  return callWorldPrivateRpc("world_space_edit_v1", {
    p_message_id: messageId, p_expected_revision: revision, p_body: body,
  });
}
export async function reactToWorldRoomMessage(messageId: string, emoji: string, present: boolean) {
  if (!isValidRoomId(messageId) || emoji.length < 1 || emoji.length > 12)
    throw new Error("Invalid reaction.");
  return callWorldPrivateRpc("world_space_set_reaction_v1", {
    p_message_id: messageId, p_emoji: emoji, p_present: present,
  });
}
export async function moderateWorldRoomMessage(messageId: string, revision: number, action: "pin" | "unpin" | "redact") {
  if (!isValidRoomId(messageId)) throw new Error("Invalid message.");
  return callWorldPrivateRpc("world_space_moderate_v1", {
    p_message_id: messageId, p_expected_revision: revision, p_action: action,
  });
}

export function isVisiblePrivateWorldQuery(state: {
  isSuccess: boolean; isError: boolean; isRefetchError?: boolean;
  isFetchedAfterMount: boolean; isPending: boolean;
}, online: boolean): boolean {
  // Never show stale private data from another mount, after failed permission
  // revalidation, or offline. Auth changes also remove the query root.
  return online && state.isSuccess && !state.isError &&
    !state.isRefetchError && !state.isPending && state.isFetchedAfterMount;
}
