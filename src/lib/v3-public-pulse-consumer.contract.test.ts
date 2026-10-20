import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const engagementSource = readFileSync(
  resolve(process.cwd(), "src/lib/engagement-data.ts"),
  "utf8",
);
const appTypesSource = readFileSync(
  resolve(process.cwd(), "src/integrations/supabase/app-types.ts"),
  "utf8",
);

function contentEventsHookSource() {
  const start = engagementSource.indexOf("export function useContentEvents");
  const end = engagementSource.indexOf("export function useEventReads", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return engagementSource.slice(start, end);
}

describe("Public V3 Pulse consumer authority", () => {
  it("reads the caller-invariant System projection instead of content_events directly", () => {
    const source = contentEventsHookSource();
    expect(source).toContain('.rpc("v3_public_pulse_events"');
    expect(source).not.toContain('.from("content_events")');
    expect(source).not.toContain("new Date().toISOString()");
  });

  it("keeps requests inside the projection's bounded page contract", () => {
    const source = contentEventsHookSource();
    expect(source).toContain("Math.min(50");
    expect(source).toContain("Math.max(1");
    expect(source).toContain("p_limit: pageSize");
  });

  it("fails closed while the System projection is unavailable instead of falling back to broader table RLS", () => {
    const source = contentEventsHookSource();
    expect(engagementSource).toContain('error?.code === "PGRST202"');
    expect(source).toContain("schemaReady: false");
    expect(source).not.toContain("content_events");
  });

  it("preserves canonical event identity and server metadata for existing Pulse consumers", () => {
    expect(engagementSource).toContain("id: item.id");
    expect(engagementSource).toContain("published_at: item.publishedAt");
    expect(engagementSource).toContain("serverTime: projection.serverTime");
    expect(engagementSource).toContain("nextCursor: projection.nextCursor");
  });

  it("types the stacked System RPC without weakening the rest of the Supabase client", () => {
    expect(appTypesSource).toContain("v3_public_pulse_events: {");
    expect(appTypesSource).toContain("p_before_published_at?: string | null");
    expect(appTypesSource).toContain("p_before_id?: string | null");
    expect(appTypesSource).toContain("p_category?: string | null");
    expect(appTypesSource).toContain("Returns: Json");
  });
});
