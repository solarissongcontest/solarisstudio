import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const inbox = readFileSync("src/routes/_authenticated/admin/inbox.tsx", "utf8");
const adminOps = readFileSync("src/lib/admin-ops.ts", "utf8");

describe("Organizer Inbox verified private notification state", () => {
  it("uses the authenticated recipient's query and private row scope", () => {
    expect(inbox).toContain("useAdminNotifications()");
    expect(adminOps).toContain('queryKey: ["admin-notifications", user.id]');
    expect(adminOps).toContain('.eq("recipient_id", user.id)');
  });

  it("hides old private results and actions while refetching or after a read failure", () => {
    expect(inbox).toContain("const inboxVerified = !isLoading && !isFetching && !isError;");
    expect(inbox).toContain("const notifications = inboxVerified ? (data ?? []) : [];");
    expect(inbox).toContain('{isLoading || isFetching ? (');
    expect(inbox).toContain("Verifying current Organizer Inbox work…");
    expect(inbox).toContain('!inboxVerified');
    expect(inbox).toContain('isError && !isFetching ? "Inbox unavailable" : "Verifying Inbox"');
    expect(inbox).not.toContain('data: notifications = []');
  });

  it("never claims a zero-work Inbox on an unverified read", () => {
    expect(inbox).toContain('title="Inbox could not be loaded"');
    expect(inbox).toContain('title={filter === "needs-attention" ? "Nothing needs attention" : "No items here"}');
    expect(inbox.indexOf("isLoading || isFetching")).toBeLessThan(
      inbox.indexOf("isError ? ("),
    );
    expect(inbox).toContain("onClick={() => void refetch()}");
  });
});
