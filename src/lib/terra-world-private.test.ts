import { describe, expect, it } from "vitest";
import {
  isValidRoomId, isVisiblePrivateWorldQuery, safeWorldRoomSlug,
  WORLD_ROOM_PAGE_SIZE,
} from "./terra-world-private";

describe("TG11/TG12 client privacy contract", () => {
  it("does not trust stale, failed, offline or never-reverified private responses", () => {
    const good = {
      isSuccess: true, isError: false, isRefetchError: false,
      isFetchedAfterMount: true, isPending: false,
    };
    expect(isVisiblePrivateWorldQuery(good, true)).toBe(true);
    expect(isVisiblePrivateWorldQuery(good, false)).toBe(false);
    expect(isVisiblePrivateWorldQuery({ ...good, isFetchedAfterMount: false }, true)).toBe(false);
    expect(isVisiblePrivateWorldQuery({ ...good, isRefetchError: true }, true)).toBe(false);
    expect(isVisiblePrivateWorldQuery({ ...good, isError: true }, true)).toBe(false);
    expect(isVisiblePrivateWorldQuery({ ...good, isPending: true }, true)).toBe(false);
  });

  it("accepts only canonical UUID room identities and bounded slugs", () => {
    expect(isValidRoomId("6e76798e-7a83-4a74-a8cd-cd9ae28851d2")).toBe(true);
    expect(isValidRoomId("javascript:alert(1)")).toBe(false);
    expect(isValidRoomId("../admin")).toBe(false);
    expect(safeWorldRoomSlug("guard")).toBe("guard");
    expect(safeWorldRoomSlug("unity-union")).toBe("unity-union");
    expect(safeWorldRoomSlug("../guard")).toBe("");
    expect(WORLD_ROOM_PAGE_SIZE).toBeLessThanOrEqual(50);
  });
});
