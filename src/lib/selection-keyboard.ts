/** Horizontal tab navigation; disabled choices never receive keyboard focus. */
export function selectionKeyboardTarget(
  options: readonly { disabled?: boolean }[],
  currentIndex: number,
  key: string,
  rtl = false,
): number | null {
  const enabled = options.flatMap((option, index) => option.disabled ? [] : [index]);
  if (!enabled.length) return null;
  if (key === "Home") return enabled[0];
  if (key === "End") return enabled[enabled.length - 1];
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
  const delta = (key === "ArrowRight" ? 1 : -1) * (rtl ? -1 : 1);
  const position = enabled.indexOf(currentIndex);
  if (position < 0) return delta > 0 ? enabled[0] : enabled[enabled.length - 1];
  return enabled[(position + delta + enabled.length) % enabled.length];
}
