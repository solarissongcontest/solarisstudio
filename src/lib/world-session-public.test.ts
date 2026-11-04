import { describe, expect, it } from "vitest";

import {
  WorldSessionProjectionError,
  parseWorldManageAgenda,
  parseWorldReceipt,
  parseWorldSession,
  parseWorldSessionDetail,
  validateWorldSessionInput,
} from "./world-session-public";

const sessionId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const orgId = "33333333-3333-4333-8333-333333333333";
const organId = "44444444-4444-4444-8444-444444444444";
const operationId = "55555555-5555-4555-8555-555555555555";

const session = {
  id: sessionId,
  organizationSlug: "guard",
  organizationName: "GUARD",
  organName: "General Assembly of GUARD",
  title: "Regular Assembly",
  sequenceNumber: 2,
  startsAt: "2099-06-15T18:00:00Z",
  endsAt: "2099-06-15T19:30:00Z",
  status: "scheduled",
  venueType: "external",
  venueLabel: "Official meeting room",
  revision: 3,
};

describe("TG6 public session projection boundary", () => {
  it("accepts the public-safe schedule shape without trusting undeclared fields", () => {
    expect(parseWorldSession({ ...session, privateNotes: "do not reveal" }))
      .toEqual(session);
    expect(() => parseWorldSession({ ...session, revision: null }))
      .toThrow(WorldSessionProjectionError);
    expect(() => parseWorldSession({ ...session, status: "private_draft" }))
      .toThrow(WorldSessionProjectionError);
  });

  it("keeps private or missing detail unavailable without inventing a session", () => {
    expect(parseWorldSessionDetail(null)).toBeNull();
    expect(parseWorldSession({ ...session, status: "cancelled" }).status).toBe("cancelled");
    expect(() => parseWorldSessionDetail({
      ...session,
      externalUrl: null,
      agenda: [{ id: itemId, position: 1, title: "Unpublished",
        itemType: "discussion", description: null, state: "draft" }],
    })).toThrow(/Invalid world session agenda projection/);
  });

  it("accepts a strictly published agenda and a valid bounded meeting link", () => {
    const item = {
      id: itemId, position: 1, itemType: "discussion",
      title: "Budget", description: null, state: "scheduled",
    };
    expect(parseWorldSessionDetail({
      ...session, externalUrl: "https://example.org/meeting", agenda: [item],
    })?.agenda).toEqual([item]);
    expect(() => parseWorldSessionDetail({
      ...session, externalUrl: "javascript:alert(1)", agenda: [],
    })).toThrow();
  });

  it("does not accept unchecked private management content or synthetic receipts", () => {
    expect(parseWorldManageAgenda({
      id: sessionId, organizationId: orgId, organId, revision: 4, status: "scheduled",
      items: [{ id: itemId, title: "Private draft", position: 1, state: "draft", revision: 1 }],
    }).items[0].state).toBe("draft");
    expect(() => parseWorldManageAgenda({ id: sessionId, revision: 1, items: null }))
      .toThrow(WorldSessionProjectionError);
    expect(parseWorldReceipt({
      ok: true, operationId, sessionId, revision: 1, replayed: true,
    }).replayed).toBe(true);
    expect(() => parseWorldReceipt({ ok: true, sessionId, revision: 1 }))
      .toThrow(WorldSessionProjectionError);
  });
});

describe("TG6 session review validation", () => {
  const input = {
    organizationId: orgId, organId, title: "Regular Session",
    startsAt: "2099-06-15T18:00:00Z", endsAt: "2099-06-15T19:00:00Z",
    venueType: "external" as const,
    venueLabel: "Official group", externalUrl: "",
    operationId, idempotencyKey: "tg6:" + operationId,
  };

  it("accepts valid future UTC instants but rejects backwards or past windows", () => {
    expect(validateWorldSessionInput(input)).toBeNull();
    expect(validateWorldSessionInput({ ...input, endsAt: input.startsAt })).toMatch(/end/);
    expect(validateWorldSessionInput({ ...input,
      startsAt: "2000-01-01T00:00:00Z" })).toMatch(/future/);
  });

  it("requires real UUID scope and HTTPS venue links", () => {
    expect(validateWorldSessionInput({ ...input, organizationId: "guard" }))
      .toMatch(/organization/);
    expect(validateWorldSessionInput({ ...input, externalUrl: "javascript:alert(1)" }))
      .toMatch(/HTTPS/);
  });
});
