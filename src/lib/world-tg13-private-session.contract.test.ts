import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  isTg13PrivateQuery, resolveTg13PrivateActor,
} from "./world-tg13-private-session";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("TG13 actor-transition privacy", () => {
  const alice = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const bob = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("allows private reads only when the canonical actor and live auth event agree", () => {
    expect(resolveTg13PrivateActor(null, alice, false)).toEqual({
      ready: false, userId: null, epoch: -1,
    });
    expect(resolveTg13PrivateActor({ userId: alice, epoch: 1 }, alice, false)).toEqual({
      ready: true, userId: alice, epoch: 1,
    });
    // The sign-in event for B can precede the root fan-session cache update.
    expect(resolveTg13PrivateActor({ userId: bob, epoch: 2 }, alice, false)).toEqual({
      ready: false, userId: null, epoch: 2,
    });
    expect(resolveTg13PrivateActor({ userId: bob, epoch: 2 }, bob, true).ready).toBe(false);
    expect(resolveTg13PrivateActor({ userId: bob, epoch: 2 }, bob, false).ready).toBe(true);
    // A stale cached B identity must not survive sign-out.
    expect(resolveTg13PrivateActor({ userId: null, epoch: 3 }, bob, false).ready).toBe(false);
    expect(resolveTg13PrivateActor({ userId: null, epoch: 3 }, null, false)).toEqual({
      ready: true, userId: null, epoch: 3,
    });
    // Even the same user with a new authenticated session gets a new namespace.
    expect(resolveTg13PrivateActor({ userId: bob, epoch: 4 }, bob, false).epoch).toBe(4);
  });

  it("removes exactly the private TG13 query family, not public World data", () => {
    for (const name of ["mediation", "ethics"]) {
      expect(isTg13PrivateQuery(["world", name, "workspace", alice])).toBe(true);
      expect(isTg13PrivateQuery(["world", name, "history", alice])).toBe(true);
    }
    expect(isTg13PrivateQuery(["world", "organization", "public", "unity"])).toBe(false);
    expect(isTg13PrivateQuery(["fan-session"])).toBe(false);
    expect(isTg13PrivateQuery(["world", "court", "public-docket"])).toBe(false);
    expect(isTg13PrivateQuery(["world", "mediation-report"])).toBe(false);
  });

  it("subscribes to auth transitions and cancels stale private network reads first", () => {
    const source = read("src/lib/world-tg13-private-session.ts");
    const cancel = source.indexOf("void client.cancelQueries(filter)");
    const evict = source.indexOf("client.removeQueries(filter)");
    const publish = source.indexOf("setObserved({ userId:");
    expect(cancel).toBeGreaterThan(0);
    expect(evict).toBeGreaterThan(cancel);
    expect(publish).toBeGreaterThan(evict);
    expect(source).toContain("data.subscription.unsubscribe()");
    expect(source).toContain("useFanSession()");
    expect(source).toContain('"INITIAL_SESSION", "SIGNED_IN", "SIGNED_OUT"');
    expect(source).toContain('"TOKEN_REFRESHED", "USER_UPDATED"');
    expect(source).toContain("observed.userId === canonicalUserId");
    expect(source).toContain("assertTg13CurrentActor");
    expect(source).toContain("data.user?.id !== expectedUserId");
  });

  it("keys private workspace, child history and evidence by validated actor and generation", () => {
    for (const name of ["Mediation", "Ethics"]) {
      const file = read(`src/components/world/World${name}Workspace.tsx`);
      const adapter = read(`src/lib/world-${name.toLowerCase()}.ts`);
      const privateKind = name === "Mediation" ? "history" : "evidence";
      const workspace = name.toLowerCase();
      expect(file).toContain("useTg13PrivateActor()");
      expect(file).toContain(`["world", "${workspace}", "workspace", actor.userId, actor.epoch]`);
      expect(file).toContain('enabled: actor.ready && !!actor.userId');
      expect(file).toContain(`["world", "${workspace}", "${privateKind}", actorId, actorEpoch, caseId]`);
      expect(file).toContain("const showPrivate = actorScope !== null && actorScope === draftScope");
      expect(file).toContain("key={`${actorScope}:${record.id}`}");
      expect(file).toContain("actor.ready && actor.userId && showPrivate &&");
      expect(file).toContain("setDraftScope(actorScope)");
      expect(file).toContain("operationScope.current !== activeScope.current");
      expect(adapter).toContain("auth.user.id !== expectedUserId");
      const matches = adapter.match(/await assertTg13CurrentActor\(expectedUserId\)/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("does not use client actor keys as server authority or leak session tokens", () => {
    for (const path of ["src/lib/world-mediation.ts", "src/lib/world-ethics.ts"]) {
      const source = read(path);
      expect(source).toContain("supabase.auth.getUser()");
      expect(source).not.toContain("service_role");
      expect(source).not.toContain("access_token");
      expect(source).not.toMatch(/\.from\("world_(?:mediation|ethics)[^"]+"\)\s*\.\s*(?:insert|update|upsert|delete)\(/);
    }
  });
});
