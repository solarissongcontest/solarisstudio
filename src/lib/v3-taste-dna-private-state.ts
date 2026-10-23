export type V3TasteDnaPrivateState =
  | "resolving_session"
  | "anonymous"
  | "loading_history"
  | "ready"
  | "error";

export function resolveV3TasteDnaPrivateState(input: {
  sessionLoading: boolean;
  sessionError: boolean;
  viewerId: string | null;
  historyLoading: boolean;
  historyError: boolean;
}): V3TasteDnaPrivateState {
  if (input.sessionError) return "error";
  if (input.sessionLoading) return "resolving_session";
  if (!input.viewerId) return "anonymous";
  if (input.historyError) return "error";
  if (input.historyLoading) return "loading_history";
  return "ready";
}
