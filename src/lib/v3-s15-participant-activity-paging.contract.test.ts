import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const runtime = read("src/lib/v3-participant-activity-runtime.ts");
const source = read("src/integrations/v3/participant-activity.server.ts");
const boundary = read("src/lib/v3-participant-activity.functions.ts");
const screen = read("src/components/v3/V3ParticipantActivityScreen.tsx");
const system = read("supabase/migrations/20261104143000_v3_s15_participant_activity_projection.sql");

describe("S15 recipient-only Activity keyset pagination", () => {
  it("requests exact keyset pages through authenticated System authority", () => {
    expect(boundary).toContain("validateV3ParticipantActivityCursor");
    expect(boundary).not.toContain("userId");
    expect(boundary).not.toContain("countryId");
    expect(boundary).not.toContain("editionId");
    expect(source).toContain('rpc("v3_my_participant_activity"');
    expect(source).toContain("p_before: cursor.before");
    expect(source).toContain("p_before_operation_id: cursor.operationId");
    expect(source).toContain("p_limit: 30");
    expect(system).toContain("receipt.actor_id = v_actor");
    expect(system).toContain("jury_op.user_id = v_actor");
  });

  it("keeps all pages partitioned by the authenticated viewer, never a global cache", () => {
    expect(runtime).toContain("useInfiniteQuery");
    expect(runtime).toContain("v3ParticipantActivityQueryKey(scopedViewerId)");
    expect(runtime).toContain("enabled: enabled && Boolean(scopedViewerId)");
    expect(runtime).toContain("lastPage.nextBefore && lastPage.nextOperationId");
    expect(runtime).toContain("query.data.pages.flatMap");
    expect(screen).toContain("const ownsIdentity = viewerId === authenticatedUser.id");
    expect(screen).toContain("if (!ownsIdentity)");
    expect(screen).toContain("activity.fetchNextPage()");
    expect(screen).toContain("activity.isFetchNextPageError");
  });

  it("does not substitute notifications, browser histories or private ballot data", () => {
    expect(source).not.toContain("content_events");
    expect(source).not.toContain("notification");
    expect(source).not.toContain("localStorage");
    expect(system).not.toContain("from public.jury_votes");
    expect(screen).toContain("will not reconstruct private activity");
  });
});
