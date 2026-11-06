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

  it("shows a paused connection instead of a false empty state when initial reads are offline", () => {
    const source = screen();
    for (const query of ["follows", "entityDetails"]) {
      expect(source).toContain(`${query}.isPending && ${query}.isPaused`);
    }
    expect(source).toContain('data-v3-following-saved-state="paused"');
    expect(source).toContain("const paused = !failed && (");
    expect(source).toContain("Solaris will not mistake an unverified list for an empty one.");
    expect(source.indexOf("{failed ? (")).toBeLessThan(source.indexOf(") : paused ? ("));
    expect(source.indexOf(") : paused ? (")).toBeLessThan(source.indexOf(") : loading ? ("));
    expect(source.indexOf("{paused ? (")).toBeLessThan(source.indexOf("data-v3-following-saved-state=\"empty\""));
  });

  it("keeps a failed query recoverable even while another query is still loading", () => {
    const source = screen();
    // A failed query must win over another query's loading/paused state.
    expect(source.indexOf("{failed ? (")).toBeLessThan(source.indexOf(") : paused ? ("));
    expect(source.indexOf(") : paused ? (")).toBeLessThan(source.indexOf(") : loading ? ("));
    // Unrelated successful/ongoing public reads must not disable failed-read retry.
    for (const query of ["follows", "entityDetails"]) {
      expect(source).toContain(`(${query}.isError && ${query}.isFetching)`);
    }
    expect(source).not.toContain("const retrying = follows.isFetching ||");
  });

  it("filters only a verified saved projection without extra Supabase requests", () => {
    const source = screen();
    expect(source).toContain('searchV3FollowingSavedItems(projection?.items ?? [], search)');
    expect(source).toContain('Search saved items');
    expect(source).toContain('type="search"');
    expect(source).toContain('value={search}');
    expect(source).toContain('visibleItems.filter((item) => item.entityType === entityType)');
    expect(source).toContain('setSearch("");');
  });

  it("distinguishes no search matches from a genuinely empty saved account", () => {
    const source = screen();
    expect(source).toContain('data-v3-following-saved-state="no-search-results"');
    expect(source).toContain('No saved items match your search');
    expect(source).toContain('Clear search');
    expect(source.indexOf('data-v3-following-saved-state="no-search-results"')).toBeLessThan(
      source.indexOf('data-v3-following-saved-state="empty"'),
    );
    expect(source).toContain(') : projection?.items.length ? (');
  });

  it("only retries queries that actually failed, avoiding redundant public reads", () => {
    const source = screen();
    expect(source).toContain("if (follows.isError) void follows.refetch()");
    expect(source).toContain("if (entityDetails.isError) void entityDetails.refetch()");
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

  it("never shows an old account's delayed mutation message to a different viewer", () => {
    const source = screen();
    expect(source).toContain('useEffect(() => {\n    setMessage(null);\n    setSearch("");\n  }, [viewerId]);');
    expect(source).toContain("setMessage({ viewerId, text: confirmed");
    expect(source).toContain("setMessage({ viewerId, text: \"Update not confirmed.");
    expect(source).toContain("message?.viewerId === viewerId");
    expect(source).toContain("{message.text}");
  });

  it("does not claim failure means the server definitely rejected a write", () => {
    const source = screen();
    expect(source).toContain("Update not confirmed. Check your saved items before trying again.");
    expect(source).not.toContain("Nothing else was changed.");
    expect(source).toContain("} finally {");
  });
  it("does not confirm old cached preferences when the reconciliation refetch fails or pauses", () => {
    const source = screen();
    expect(source).toContain("const reconciled = await follows.refetch()");
    expect(source).toContain("reconciled.isSuccess && !reconciled.isPaused");
    expect(source).toContain("matchesIntent(reconciled.data.follows)");
    expect(source).toContain("has not confirmed it yet");
    expect(source).toContain("could not confirm whether that preference was saved");
  });

});
