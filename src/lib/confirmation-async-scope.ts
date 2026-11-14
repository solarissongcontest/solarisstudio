/** Presentation cancellation only: the server remains the mutation authority.
 * Invalidating a ticket never claims that an in-flight command was rolled back. */
export type ConfirmationAsyncTicket = Readonly<{ key: string; generation: number }>;
export class ConfirmationAsyncScope {
  private generation = 0;
  private active = true;
  private actor: string | null | undefined;
  constructor(private key: string) {}
  setKey(key: string) {
    if (key !== this.key) {
      this.key = key;
      this.invalidate();
    }
  }
  invalidate() {
    this.generation++;
  }
  open() {
    this.active = true;
  }
  close() {
    this.active = false;
    this.invalidate();
  }
  capture(expectedKey: string): ConfirmationAsyncTicket {
    return { key: expectedKey, generation: this.generation };
  }
  isCurrent(ticket: ConfirmationAsyncTicket | null | undefined) {
    return Boolean(
      ticket && this.active && ticket.key === this.key && ticket.generation === this.generation,
    );
  }
  assertCurrent(ticket: ConfirmationAsyncTicket) {
    if (!this.isCurrent(ticket))
      throw new Error("Confirmation account or page context changed; refresh current state.");
  }
  observeAuth(event: string, actor: string | null) {
    if (event === "INITIAL_SESSION" && this.actor === undefined) {
      this.actor = actor;
      return false;
    }
    const changed = this.actor !== actor || event === "SIGNED_OUT" || event === "USER_UPDATED";
    this.actor = actor;
    if (changed) this.invalidate();
    return changed;
  }
}
