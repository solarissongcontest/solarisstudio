import { describe, expect, it } from "vitest";
import { createAppShellAccountAccessCoordinator } from "./app-shell-account-access";

type Access = { actor: string | null };
const EMPTY: Access = { actor: null };
const identity = (id: string | null) => ({ id, email: id ? `${id}@example.test` : null });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((good, bad) => { resolve = good; reject = bad; });
  return { promise, resolve, reject };
}

function harness() {
  const reads: { id: string; request: ReturnType<typeof deferred<Access>> }[] = [];
  const access: Access[] = [];
  const emails: (string | null)[] = [];
  const pending: (() => void)[] = [];
  const coordinator = createAppShellAccountAccessCoordinator<Access>({
    load: (id) => {
      const request = deferred<Access>();
      reads.push({ id, request });
      return request.promise;
    },
    setEmail: (email) => emails.push(email),
    setAccess: (value) => access.push(value),
    emptyAccess: EMPTY,
    defer: (callback) => pending.push(callback),
  });
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  const deliver = async () => { for (const task of pending.splice(0)) task(); await flush(); };
  return { coordinator, reads, access, emails, pending, flush, deliver };
}

describe("AppShell account access isolation", () => {
  it("discards the previous actor's slow response after a new login and clears access immediately", async () => {
    const h = harness();
    h.coordinator.initial(identity("alice"));
    await h.flush();
    h.coordinator.authChanged(identity("bob"));
    expect(h.access.at(-1)).toBe(EMPTY);
    expect(h.emails.at(-1)).toBe(null);
    await h.deliver();
    expect(h.reads.map((request) => request.id)).toEqual(["alice", "bob"]);
    h.reads[0].request.resolve({ actor: "alice" });
    await h.flush();
    expect(h.access).not.toContainEqual({ actor: "alice" });
    h.reads[1].request.resolve({ actor: "bob" });
    await h.flush();
    expect(h.access.at(-1)).toEqual({ actor: "bob" });
  });

  it("ignores a late initial getUser result once any auth event has arrived", async () => {
    const h = harness();
    h.coordinator.authChanged(identity("new"));
    h.coordinator.initial(identity("old"));
    await h.deliver();
    expect(h.reads.map((request) => request.id)).toEqual(["new"]);
    h.reads[0].request.resolve({ actor: "new" });
    await h.flush();
    expect(h.access.at(-1)).toEqual({ actor: "new" });
  });

  it("ignores deferred older auth notifications when two account changes race", async () => {
    const h = harness();
    h.coordinator.authChanged(identity("first"));
    h.coordinator.authChanged(identity("second"));
    await h.deliver();
    expect(h.reads.map((request) => request.id)).toEqual(["second"]);
    h.reads[0].request.resolve({ actor: "second" });
    await h.flush();
    expect(h.access.at(-1)).toEqual({ actor: "second" });
  });

  it("retains a verified same-actor access state during a token refresh", async () => {
    const h = harness();
    h.coordinator.initial(identity("same"));
    await h.flush();
    h.reads[0].request.resolve({ actor: "same" });
    await h.flush();
    const writesBefore = h.access.length;
    h.coordinator.authChanged(identity("same"));
    expect(h.access.length).toBe(writesBefore);
    await h.deliver();
    expect(h.access.length).toBe(writesBefore);
    h.reads[1].request.resolve({ actor: "same" });
    await h.flush();
    expect(h.access.at(-1)).toEqual({ actor: "same" });
  });

  it("clears verified access when the latest account verification fails", async () => {
    const h = harness();
    h.coordinator.initial(identity("same"));
    await h.flush();
    h.reads[0].request.resolve({ actor: "same" });
    await h.flush();
    h.coordinator.authChanged(identity("same"));
    await h.deliver();
    h.reads[1].request.reject(new Error("network / permissions"));
    await h.flush();
    expect(h.access.at(-1)).toBe(EMPTY);
  });

  it("clears access immediately on logout and cannot resurrect a pending result", async () => {
    const h = harness();
    h.coordinator.initial(identity("alice"));
    await h.flush();
    h.coordinator.authChanged(identity(null));
    expect(h.access.at(-1)).toBe(EMPTY);
    await h.deliver();
    h.reads[0].request.resolve({ actor: "alice" });
    await h.flush();
    expect(h.access.at(-1)).toBe(EMPTY);
    expect(h.emails.at(-1)).toBe(null);
  });

  it("suppresses pending async results and deferred callbacks after disposal", async () => {
    const h = harness();
    h.coordinator.initial(identity("alice"));
    await h.flush();
    const writesBefore = h.access.length;
    h.coordinator.authChanged(identity("bob"));
    const writesAfterSwitch = h.access.length;
    h.coordinator.dispose();
    await h.deliver();
    h.reads[0].request.resolve({ actor: "alice" });
    await h.flush();
    expect(h.reads).toHaveLength(1);
    expect(h.access.length).toBe(writesAfterSwitch);
    expect(writesBefore).toBeLessThanOrEqual(writesAfterSwitch);
  });
});
