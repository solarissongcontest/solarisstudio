import { describe, expect, it } from "vitest";

import {
  buildV3MeProjection,
  V3_ME_SECTION_ORDER,
  type V3MeProjectionInput,
} from "./v3-me";

function input(overrides: Partial<V3MeProjectionInput> = {}): V3MeProjectionInput {
  return {
    identity: {
      userId: "arthur",
      displayName: "Arthur",
      delegationName: "Oland",
      delegationFlagUrl: "/flags/oland.webp",
      displayRole: "Head of Delegation",
    },
    currentMembership: {
      editionId: "ssc22",
      editionName: "Solaris Song Contest 22",
      roleLabel: "Head of Delegation",
      href: "/editions/ssc-22",
    },
    history: [
      {
        editionId: "ssc21",
        editionName: "Solaris Song Contest 21",
        roleLabel: "Participant",
        href: "/editions/ssc-21",
        completed: true,
      },
      {
        editionId: "ssc20",
        editionName: "Solaris Song Contest 20",
        roleLabel: "Jury",
        href: "/editions/ssc-20",
        completed: true,
      },
    ],
    activity: {
      verifiedReceiptCount: 4,
      awaitingAuthoritativeReceiptCount: 1,
      href: "/me/activity",
    },
    following: {
      followedCountryCount: 3,
      followedContentCount: 5,
      href: "/me/following",
    },
    preferenceLinks: [
      { key: "notifications", label: "Notifications", href: "/settings/notifications" },
      { key: "appearance", label: "Appearance", href: "/settings/appearance" },
      { key: "accessibility", label: "Accessibility", href: "/settings/accessibility" },
    ],
    accountLinks: [
      { key: "devices", label: "Devices", href: "/account/devices" },
      { key: "privacy", label: "Privacy", href: "/account/privacy" },
    ],
    canEnterOrganizer: true,
    organizerHref: "/admin",
    ...overrides,
  };
}

describe("V3 Me projection", () => {
  it("keeps the canonical identity-first section order", () => {
    expect(V3_ME_SECTION_ORDER).toEqual([
      "identity",
      "current",
      "history",
      "activity",
      "following",
      "preferences",
      "account",
    ]);
  });

  it("projects identity, current membership, history and receipt summary without creating another task workspace", () => {
    const projection = buildV3MeProjection(input());

    expect(projection.identity).toMatchObject({
      displayName: "Arthur",
      delegationName: "Oland",
    });
    expect(projection.current?.editionId).toBe("ssc22");
    expect(projection.history.map((item) => item.editionId)).toEqual(["ssc21", "ssc20"]);
    expect(projection.activity).toEqual({
      verifiedReceiptCount: 4,
      awaitingAuthoritativeReceiptCount: 1,
      href: "/me/activity",
    });
    expect(projection).not.toHaveProperty("tasks");
    expect(projection).not.toHaveProperty("actions");
    expect(projection).not.toHaveProperty("responsibilities");
  });

  it("uses explicit capability output for Organizer entry rather than display-role text", () => {
    const noCapability = buildV3MeProjection(
      input({
        canEnterOrganizer: false,
        identity: {
          ...input().identity,
          displayRole: "Organizer",
        },
      }),
    );

    expect(noCapability.organizerAction).toBeNull();

    const capabilityWithoutRoleLabel = buildV3MeProjection(
      input({
        canEnterOrganizer: true,
        identity: {
          ...input().identity,
          displayRole: null,
        },
      }),
    );

    expect(capabilityWithoutRoleLabel.organizerAction).toEqual({
      label: "Switch to Organizer",
      href: "/admin",
    });
  });

  it("supports signed-in users without a current edition membership", () => {
    const projection = buildV3MeProjection(
      input({
        currentMembership: null,
      }),
    );

    expect(projection.current).toBeNull();
    expect(projection.identity.displayName).toBe("Arthur");
    expect(projection.preferences.length).toBeGreaterThan(0);
    expect(projection.account.length).toBeGreaterThan(0);
  });
});
