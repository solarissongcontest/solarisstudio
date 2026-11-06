import { supabase } from "@/integrations/supabase/client";

type CueCommand = "v3_save_show_rundown" | "v3_set_show_rundown_lock" | "v3_transition_show_cue";
type Intent = { args: Record<string, unknown>; operationId: string };
// Keep unresolved identities across explicit retries, including two lost responses.
// Actor scoping here prevents browser identity reuse; authorization remains server-owned.
const pending = new Map<string, Intent>();
const client = supabase as unknown as {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

export async function executeShowCueCommand<T>(
  command: CueCommand,
  args: Record<string, unknown>,
  validate: (data: unknown, intent: Readonly<Record<string, unknown>>) => T,
): Promise<T> {
  const frozen = structuredClone(args);
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const actorId = data.session?.user.id;
  if (!actorId) throw new Error("Sign in before changing the broadcast rundown.");
  const key = JSON.stringify([actorId, command, frozen]);
  let intent = pending.get(key);
  if (!intent) {
    if (pending.size >= 32)
      throw new Error("Resolve pending broadcast operations before submitting more changes.");
    const operationId = crypto.randomUUID();
    intent = {
      operationId,
      args: {
        ...frozen,
        p_operation_id: operationId,
        p_idempotency_key: `show-cue:${operationId}`,
      },
    };
    pending.set(key, intent);
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let result: { data: unknown; error: unknown };
    try {
      result = await client.rpc(command, structuredClone(intent.args));
    } catch (failure) {
      result = { data: null, error: failure };
    }
    if (result.error) {
      const code =
        typeof result.error === "object" && result.error !== null && "code" in result.error
          ? result.error.code
          : undefined;
      if (typeof code === "string" && code.length > 0) {
        if (pending.get(key) === intent) pending.delete(key);
        throw result.error;
      }
      if (attempt === 0) continue;
      throw result.error;
    }
    const receipt = result.data as Record<string, unknown> | null;
    if (
      !receipt ||
      receipt.operationId !== intent.operationId ||
      receipt.receiptId !== intent.operationId ||
      receipt.showId !== intent.args.p_show_id ||
      typeof receipt.replayed !== "boolean"
    ) {
      throw new Error(
        "Broadcast operation receipt is inconsistent; retry the same operation to recover its outcome.",
      );
    }
    const value = validate(result.data, intent.args);
    if (pending.get(key) === intent) pending.delete(key);
    return value;
  }
  throw new Error("Broadcast operation outcome is unknown.");
}
