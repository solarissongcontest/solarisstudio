/** A published result may be visible without a navigable Show Results route.
 * A missing destination must never create a self-link disguised as Results.
 * This is presentation state only; the server owns publication truth.
 */
export function canOpenV3EditionResults(input: {
  state: "locked" | "empty" | "available";
  showHref: string | null;
  spoilerSafe: boolean;
}): boolean {
  return (
    !input.spoilerSafe &&
    input.state === "available" &&
    typeof input.showHref === "string" &&
    input.showHref.trim().length > 0
  );
}
