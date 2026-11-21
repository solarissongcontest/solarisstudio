/** Ephemeral crop edits for one local image. Never a published revision ledger. */
export type HeroCrop = readonly [number, number];
export type HeroCropHistory = {
  past: readonly HeroCrop[];
  present: HeroCrop;
  future: readonly HeroCrop[];
};
export const initialHeroCropHistory: HeroCropHistory = { past: [], present: [50, 50], future: [] };
export type HeroCropAction = { type: "edit"; point: HeroCrop } | { type: "undo" | "redo" | "reset" };
const MAX_EDITS = 50;

export function heroCropHistory(state: HeroCropHistory, action: HeroCropAction): HeroCropHistory {
  if (action.type === "reset") return initialHeroCropHistory;
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future] };
  }
  if (action.type === "redo") {
    if (!state.future.length) return state;
    return { past: [...state.past, state.present].slice(-MAX_EDITS), present: state.future[0], future: state.future.slice(1) };
  }
  if (action.type !== "edit" || !action.point.every(Number.isFinite)) return state;
  const point: HeroCrop = [Math.max(0, Math.min(100, action.point[0])), Math.max(0, Math.min(100, action.point[1]))];
  if (point[0] === state.present[0] && point[1] === state.present[1]) return state;
  return { past: [...state.past, state.present].slice(-MAX_EDITS), present: point, future: [] };
}
