import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const screen = () =>
  readFileSync(resolve(process.cwd(), "src/components/v3/V3FollowingSavedScreen.tsx"), "utf8");

describe("V3 Following & Saved read and mutation recovery", () => {
  it("keeps the private preferences hidden during a failed read and provides retry", () => {
    const source = screen();
    expect(source).toContain('data-v3-following-saved-state="error"');
    expect(source).toContain("Solaris did not substitute public or browser-local data");
    expect(source).toContain("onClick={retryFailedReads}");
    expect(source).toContain("disabled={retrying}");
    expect(source).toContain("Retry saved items");
  });

  it("only retries queries that actually failed, avoiding redundant public reads", () => {
    const source = screen();
    expect(source).toContain("if (follows.isError) void follows.refetch()");
    expect(source).toContain("if (countries.isError) void countries.refetch()");
    expect(source).toContain("if (editions.isError) void editions.refetch()");
    expect(source).toContain("if (shows.isError) void shows.refetch()");
    expect(source).not.toContain("Promise.all([follows.refetch()");
  });

  it("disables every preference control during a single pending mutation", () => {
    const source = screen();
    expect(source).toContain("if (mutationInFlight.current) return;");
    expect(source).toContain("mutationInFlight.current = true;");
    expect(source).toContain("mutationInFlight.current = false;");
    expect(source).toContain("pending={Boolean(pendingKey)}");
    expect(source).toContain("disabled={pending}");
    expect(source).toContain("Saving your preference…");
    expect(source).toContain("await setFollow.mutateAsync({");
    expect(source).toContain("setPendingKey(null)");
  });

  it("does not claim failure means the server definitely rejected a write", () => {
    const source = screen();
    expect(source).toContain("Update not confirmed. Check your saved items before trying again.");
    expect(source).not.toContain("Nothing else was changed.");
    expect(source).toContain("} finally {");
  });
});
