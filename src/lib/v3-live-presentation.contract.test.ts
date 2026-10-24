import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(
    resolve(process.cwd(), "src/components/v3/V3LiveScreen.tsx"),
    "utf8",
  );

const gate = () =>
  readFileSync(
    resolve(process.cwd(), "src/components/v3/V3LiveRouteGate.tsx"),
    "utf8",
  );

describe("Public V3 Live presentation", () => {
  it("surfaces uncertainty instead of fabricating the current performer", () => {
    const screen = source();

    expect(screen).toContain('data-v3-live-truthful-uncertainty=""');
    expect(screen).toContain("authoritative performer cursor");
    expect(screen).toContain("will not guess who is on stage from elapsed time");
    expect(screen).not.toContain("Date.now()");
    expect(screen).not.toContain("setInterval(");
  });

  it("exposes public voting and results only from projection state", () => {
    const screen = source();

    expect(screen).toContain('experience.voting.state === "open"');
    expect(screen).toContain('to="/televoting"');
    expect(screen).toContain("experience.resultsPublished");
    expect(screen).toContain("Open official result");
  });

  it("keeps running order publication separate from current-performance authority", () => {
    const screen = source();

    expect(screen).toContain("experience.runningOrder.map");
    expect(screen).toContain("Running order not public");
    expect(screen).toContain("experience.currentPerformance");
    expect(screen).not.toContain("runningOrder[0]");
  });

  it("shows server-owned timing deterministically without promoting timestamps into browser authority", () => {
    const screen = source();

    expect(screen).toContain('title="Show timing"');
    expect(screen).toContain("experience.timing.scheduledStart");
    expect(screen).toContain("experience.timing.liveStartedAt");
    expect(screen).toContain("experience.voting.openedAt");
    expect(screen).toContain("experience.voting.closedAt");
    expect(screen).toContain("experience.timing.resultsStartedAt");
    expect(screen).toContain("experience.timing.endedAt");
    expect(screen).toContain('new Intl.DateTimeFormat("en-GB"');
    expect(screen).toContain("timeZone: SOLARIS_TIME_ZONE");
    expect(screen).not.toContain(".toLocaleTimeString(");
    expect(screen).not.toContain(".toLocaleString(");
    expect(screen).toContain("do not independently advance");
    expect(screen).not.toContain("setTimeout(");
    expect(screen).not.toContain("setInterval(");
  });

  it("keeps Edition context connected to canonical Public discovery", () => {
    const screen = source();
    const routeGate = gate();

    expect(routeGate).toContain("edition={bundle.data.edition}");
    expect(screen).toContain("Edition context");
    expect(screen).toContain('href={`/editions/${edition.slug}`}');
    expect(screen).toContain("Open edition");
  });

  it("keeps refresh accessible and reduced-motion safe", () => {
    const screen = source();

    expect(screen).toContain('type="button"');
    expect(screen).toContain("disabled={refreshing}");
    expect(screen).toContain("motion-safe:animate-spin");
    expect(screen).toContain('aria-live="polite"');
  });

  it("fails closed instead of mounting legacy Show Mode after V3 rollout is known enabled", () => {
    const routeGate = gate();

    expect(routeGate).toContain('data-v3-live-initial-unavailable=""');
    expect(routeGate).toContain("Live state unavailable");
    expect(routeGate).toContain("rather than switching to a different legacy data path");
    expect(routeGate).toContain("retrying={bundle.isFetching}");
    expect(routeGate).toContain("void bundle.refetch()");
    expect(routeGate).toContain("<LiveUnavailableSurface");
  });

  it("surfaces stale authoritative snapshots instead of pretending they are current", () => {
    const screen = source();

    expect(screen).toContain("degraded = false");
    expect(screen).toContain('data-v3-live-degraded-snapshot=""');
    expect(screen).toContain("Live connection interrupted");
    expect(screen).toContain("last authoritative Solaris snapshot");
    expect(screen).toContain("Refresh to reconcile with the current show state");
    expect(screen).toContain('degraded ? "Retry refresh" : "Refresh"');
  });

  it("also marks a cached empty snapshot stale when reconnect fails", () => {
    const screen = source();

    expect(screen).toContain("if (!experience)");
    expect(screen).toContain("The last authoritative snapshot had no public show");
    expect(screen).toContain("That state may now be stale");
    expect(screen).toContain('refreshing ? "Refreshing…" : "Retry refresh"');
  });
});
