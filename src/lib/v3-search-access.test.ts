import { describe, expect, it } from "vitest";

import { evaluateV3SearchAccess, filterV3SearchDocuments } from "./v3-search-access";

const anonymous = {
  authenticated: false,
  delegationIds: [],
  organizer: false,
  superadmin: false,
};

const fan = {
  authenticated: true,
  delegationIds: [],
  organizer: false,
  superadmin: false,
};

const oland = {
  authenticated: true,
  delegationIds: ["oland"],
  organizer: false,
  superadmin: false,
};

const organizer = {
  authenticated: true,
  delegationIds: [],
  organizer: true,
  superadmin: false,
};

describe("V3 search authorization", () => {
  it("allows public published content to anonymous users", () => {
    expect(
      evaluateV3SearchAccess(
        { id: "edition:22", kind: "edition", visibility: "public", published: true },
        anonymous,
      ),
    ).toEqual({ allowed: true, reason: "public" });
  });

  it("does not leak unpublished public-shaped content to normal users", () => {
    expect(
      evaluateV3SearchAccess(
        { id: "result:22", kind: "result", visibility: "public", published: false },
        fan,
      ),
    ).toEqual({ allowed: false, reason: "unpublished" });
  });

  it("allows organizers to inspect unpublished material", () => {
    expect(
      evaluateV3SearchAccess(
        { id: "result:22", kind: "result", visibility: "public", published: false },
        organizer,
      ).allowed,
    ).toBe(true);
  });

  it("scopes delegation documents to the matching delegation", () => {
    expect(
      evaluateV3SearchAccess(
        {
          id: "entry:oland",
          kind: "entry",
          visibility: "delegation",
          delegationId: "oland",
          published: false,
        },
        oland,
      ).allowed,
    ).toBe(false);

    expect(
      evaluateV3SearchAccess(
        {
          id: "entry:oland",
          kind: "entry",
          visibility: "delegation",
          delegationId: "oland",
          published: true,
        },
        oland,
      ),
    ).toEqual({ allowed: true, reason: "delegation" });
  });

  it("never exposes sensitive records to ordinary authenticated users", () => {
    expect(
      evaluateV3SearchAccess(
        {
          id: "integrity:1",
          kind: "integrity-case",
          visibility: "authenticated",
          published: true,
          sensitive: true,
        },
        fan,
      ),
    ).toEqual({ allowed: false, reason: "sensitive" });
  });

  it("filters result sets before snippets can be rendered", () => {
    const documents = [
      { id: "public", kind: "edition", visibility: "public" as const, published: true },
      { id: "admin", kind: "admin", visibility: "organizer" as const, published: true },
      { id: "draft", kind: "result", visibility: "public" as const, published: false },
    ];

    expect(filterV3SearchDocuments(documents, anonymous).map((item) => item.id)).toEqual(["public"]);
  });
});
