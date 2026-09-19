import { describe, expect, it } from "vitest";

import {
  buildPublicUserContext,
  publicGlobalAreasForContext,
} from "./public-user-context";

describe("public user context", () => {
  it("gives visitors a Sign in destination instead of pretending they have MySolaris", () => {
    const context = buildPublicUserContext({
      userId: null,
      access: { isOrganizer: false, countryId: null },
    });
    const me = publicGlobalAreasForContext(context).find((item) => item.id === "me");

    expect(context).toMatchObject({ signedIn: false, organizer: false, hod: false });
    expect(me).toMatchObject({ label: "Sign in", to: "/auth" });
  });

  it("keeps members on Me and identifies HOD/organizer capabilities", () => {
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
    expect(me).toMatchObject({ label: "Me", to: "/my-solaris" });
  });
});
