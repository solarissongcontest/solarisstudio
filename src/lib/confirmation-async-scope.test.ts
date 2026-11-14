import { describe, expect, it } from "vitest";
import { ConfirmationAsyncScope } from "./confirmation-async-scope";
describe("Confirmation presentation scope tickets", () => {
  it("keeps valid current work and rejects an old callback's nominated key", () => {
    const s = new ConfirmationAsyncScope("A");
    expect(s.isCurrent(s.capture("A"))).toBe(true);
    expect(s.isCurrent(s.capture("B"))).toBe(false);
  });
  it("invalidates navigation synchronously before effect cleanup", () => {
    const s = new ConfirmationAsyncScope("A"),
      t = s.capture("A");
    s.setKey("B");
    expect(s.isCurrent(t)).toBe(false);
    expect(s.isCurrent(s.capture("A"))).toBe(false);
    expect(s.isCurrent(s.capture("B"))).toBe(true);
  });
  it("never revives an old request on unmount/remount or return navigation", () => {
    const s = new ConfirmationAsyncScope("A"),
      t = s.capture("A");
    s.close();
    s.open();
    s.setKey("B");
    s.setKey("A");
    expect(s.isCurrent(t)).toBe(false);
  });
  it("invalidates actor switch immediately, without waiting for a React effect", () => {
    const s = new ConfirmationAsyncScope("A");
    s.observeAuth("INITIAL_SESSION", "alice");
    const t = s.capture("A");
    expect(s.observeAuth("SIGNED_IN", "bob")).toBe(true);
    expect(s.isCurrent(t)).toBe(false);
  });
  it("preserves same-actor fresh R3 authentication and ordinary token refresh", () => {
    const s = new ConfirmationAsyncScope("A");
    s.observeAuth("INITIAL_SESSION", "alice");
    const t = s.capture("A");
    expect(s.observeAuth("SIGNED_IN", "alice")).toBe(false);
    expect(s.observeAuth("TOKEN_REFRESHED", "alice")).toBe(false);
    expect(s.isCurrent(t)).toBe(true);
  });
  it.each(["SIGNED_OUT", "USER_UPDATED"])("invalidates %s even for the previous actor", (event) => {
    const s = new ConfirmationAsyncScope("A");
    s.observeAuth("INITIAL_SESSION", "alice");
    const t = s.capture("A");
    s.observeAuth(event, event === "SIGNED_OUT" ? null : "alice");
    expect(s.isCurrent(t)).toBe(false);
  });
});
