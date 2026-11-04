import { describe, expect, it } from "vitest";

import {
  buildPublicUserContext,
  publicGlobalAreasForContext,
} from "./public-user-context";

describe("public user context", () => {
  it("gives visitors a Sign in destination without teaching legacy MySolaris as a product area", () => {
    const context = buildPublicUserContext({
      userId: null,
      access: { isOrganizer: false, countryId: null },
    });
    const me = publicGlobalAreasForContext(context).find((item) => item.id === "me");

    expect(context).toMatchObject({ signedIn: false, organizer: false, hod: false });
    expect(me).toMatchObject({
      label: "Sign in",
      to: "/auth",
      description:
        "Sign in to access your Solaris identity, history, saved content, preferences and account.",
    });
    expect(me?.description).not.toContain("MySolaris");
    expect(me?.description).not.toContain("tasks");
  });

  it("routes signed-in members through canonical Me and keeps responsibilities out of its copy", () => {
    const context = buildPublicUserContext({
      userId: "user-1",
      access: { isOrganizer: true, countryId: "country-1" },
    });
    const me = publicGlobalAreasForContext(context).find((item) => item.id === "me");

    expect(context).toMatchObject({
      signedIn: true,
      organizer: true,
      hod: true,
      countryId: "country-1",
    });
    expect(me).toMatchObject({
      label: "Me",
      to: "/me",
      description: "Your identity, history, saved content, preferences and account.",
    });
    expect(me?.description).not.toContain("tasks");
    expect(me?.description).not.toContain("country");
    expect(me?.description).not.toContain("messages");
  });

  it("leaves the Participate global area unchanged for responsibility ownership", () => {
    const context = buildPublicUserContext({
      userId: "user-1",
      access: { isOrganizer: false, countryId: "country-1" },
    });
    const participate = publicGlobalAreasForContext(context).find(
      (item) => item.id === "participate",
    );

    expect(participate).toMatchObject({
      label: "Participate",
      to: "/participate",
    });
    expect(participate?.description.toLowerCase()).toContain("participation task");
  });
});
