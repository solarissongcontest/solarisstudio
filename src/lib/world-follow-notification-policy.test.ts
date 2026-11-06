import { describe, expect, it } from "vitest";
import {
  eligibleWorldFollowCategory,
  shouldQueueOptionalWorldFollowNotification,
  publicWorldFollowPushPreview,
  type WorldPublicFollowEvent,
} from "./world-follow-notification-policy";
import type { WorldOrganizationFollowState } from "./world-organization-follows";

const org = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const state: WorldOrganizationFollowState = {
  followId: "33333333-3333-4333-8333-333333333333",
  organizationId: org,
  notificationLevel: "important",
  categories: {
    statements: true, resolutions: true, leadership: true,
    sessions: true, documents: true, proposals: true, membership: true,
  },
};
const publishedEvent: WorldPublicFollowEvent = {
  organizationId: org,
  category: "statements",
  importance: "normal",
  verifiedPublic: true,
  sourceEventType: "world.statement.published",
};

describe("TG10 optional World follow notification policy", () => {
  it("defaults Important to official statements, leadership and only major resolutions", () => {
    expect(eligibleWorldFollowCategory("statements", "normal", "important")).toBe(true);
    expect(eligibleWorldFollowCategory("leadership", "normal", "important")).toBe(true);
    expect(eligibleWorldFollowCategory("resolutions", "normal", "important")).toBe(false);
    expect(eligibleWorldFollowCategory("resolutions", "important", "important")).toBe(true);
    for (const category of ["sessions", "documents", "proposals", "membership"] as const) {
      expect(eligibleWorldFollowCategory(category, "normal", "important")).toBe(false);
    }
  });

  it("respects none/all independently of required-role Task Engine responsibilities", () => {
    expect(eligibleWorldFollowCategory("statements", "important", "none")).toBe(false);
    expect(eligibleWorldFollowCategory("membership", "normal", "all")).toBe(true);
    expect(shouldQueueOptionalWorldFollowNotification(publishedEvent,
      { ...state, notificationLevel: "none" })).toBe(false);
  });

  it("requires actual published source, exact organization, owner preference and category", () => {
    expect(shouldQueueOptionalWorldFollowNotification(publishedEvent, state)).toBe(true);
    expect(shouldQueueOptionalWorldFollowNotification(publishedEvent, null)).toBe(false);
    expect(shouldQueueOptionalWorldFollowNotification({ ...publishedEvent, verifiedPublic: false }, state))
      .toBe(false);
    expect(shouldQueueOptionalWorldFollowNotification({ ...publishedEvent, organizationId: other }, state))
      .toBe(false);
    expect(shouldQueueOptionalWorldFollowNotification(publishedEvent,
      { ...state, categories: { ...state.categories, statements: false } })).toBe(false);
    expect(shouldQueueOptionalWorldFollowNotification({ ...publishedEvent, sourceEventType: "" }, state))
      .toBe(false);
  });

  it("does not treat ordinary resolutions as major or proposals as follower emergencies", () => {
    expect(shouldQueueOptionalWorldFollowNotification({
      ...publishedEvent, category: "resolutions", sourceEventType: "world.resolution.adopted",
      importance: "normal",
    }, state)).toBe(false);
    expect(shouldQueueOptionalWorldFollowNotification({
      ...publishedEvent, category: "proposals", sourceEventType: "world.measure.registered",
    }, state)).toBe(false);
    expect(shouldQueueOptionalWorldFollowNotification({
      ...publishedEvent, category: "resolutions", sourceEventType: "world.resolution.adopted",
      importance: "important",
    }, state)).toBe(true);
  });

  it("keeps sensitive event bodies out of push previews", () => {
    const result = publicWorldFollowPushPreview("GUARD", publishedEvent);
    expect(result.title).toBe("GUARD");
    expect(result.body).toBe("A new official statement is available.");
    const unverified = publicWorldFollowPushPreview("Secret private organization", {
      ...publishedEvent, verifiedPublic: false,
    });
    expect(unverified).toEqual({
      title: "Terra Solaris", body: "An update is available in Solaris.",
    });
    expect(JSON.stringify(unverified)).not.toContain("Secret");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("private");
  });
});
