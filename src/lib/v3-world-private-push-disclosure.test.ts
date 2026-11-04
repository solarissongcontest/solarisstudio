import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  isPrivateWorldPush,
  publicPushEnvelope,
} from "../../supabase/functions/_shared/world-private-push";

const sender = readFileSync("supabase/functions/solaris-push-dispatch/index.ts", "utf8");
const worker = readFileSync("public/sw.js", "utf8");

function serviceWorkerDisplay(candidate: unknown) {
  const start = worker.indexOf("function resolvePushDisplayContent(");
  const end = worker.indexOf('\n\nself.addEventListener("push", (event) => {', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const resolver = new Function(
    `${worker.slice(start, end)}; return resolvePushDisplayContent;`,
  )() as (data: unknown) => { title: string; body: string; tag?: string };
  return resolver(candidate);
}

const deliveryId = "a1234567-89ab-4cde-8f01-a123456789ab";
const detailedCase = {
  id: deliveryId,
  category: "world",
  event_type: "world.court.case.filed",
  route: "/world/court/private-case-id",
  title: "Private allegation against Example Country",
  body: "Confidential Court evidence and respondent name",
  dedupe_key: "court/private-case-id/secret-allegation",
};

describe("Terra Solaris sensitive push disclosure boundary", () => {
  it("redacts private case titles, bodies and dedupe keys before provider handoff", () => {
    expect(publicPushEnvelope(detailedCase)).toEqual({
      title: "Terra Solaris",
      body: "You have a new institutional update.",
      tag: `world-private:${deliveryId}`,
      sensitivity: "private",
    });
  });

  it("treats all world-owned event names as sensitive until visibility is authoritative", () => {
    for (const event_type of [
      "world.court.case.filed",
      "world.ethics.case.assigned",
      "world.session.resolution.created",
    ]) {
      expect(isPrivateWorldPush({ event_type })).toBe(true);
    }
    expect(isPrivateWorldPush({ category: "world" })).toBe(true);
    expect(isPrivateWorldPush({ route: "/world/court/123" })).toBe(true);
    expect(isPrivateWorldPush({ route: "/world" })).toBe(true);
  });

  it("protects private role tasks even under an ordinary notification category", () => {
    for (const task of [
      "court_response",
      "ethics_response",
      "investigation.response",
      "leadership_transition",
    ]) {
      expect(isPrivateWorldPush({ category: "organizer_tasks", event_type: task })).toBe(true);
    }
  });

  it("honors privacy and visibility independently without public flags overriding private flags", () => {
    expect(isPrivateWorldPush({ visibility: "public", privacy: "confidential" })).toBe(true);
    expect(isPrivateWorldPush({ visibility: "sealed", privacy: "public" })).toBe(true);
    expect(isPrivateWorldPush({ sensitive: true })).toBe(true);
  });

  it("does not redact unrelated public notifications", () => {
    const publicEvent = {
      id: deliveryId,
      category: "public_results",
      event_type: "show.results.published",
      route: "/results/22",
      title: "SSC 22 Results",
      body: "Results have been published.",
      dedupe_key: "results:22",
    };
    expect(isPrivateWorldPush(publicEvent)).toBe(false);
    expect(publicPushEnvelope(publicEvent)).toEqual({
      title: publicEvent.title,
      body: publicEvent.body,
      tag: publicEvent.dedupe_key,
      sensitivity: "public",
    });
  });

  it("does not send user-generated identifiers as sensitive notification tags", () => {
    const raw = publicPushEnvelope({
      ...detailedCase,
      id: "Respondent state and sealed case",
    });
    expect(raw.tag).toBe("world-private:unidentified");
    expect(JSON.stringify(raw)).not.toContain("Respondent state");
    expect(JSON.stringify(raw)).not.toContain("sealed case");
  });

  it("uses the same generic lock-screen display for private notifications", () => {
    expect(serviceWorkerDisplay({
      sensitivity: "private",
      title: detailedCase.title,
      body: detailedCase.body,
      tag: detailedCase.dedupe_key,
      deliveryId,
    })).toEqual({
      title: "Terra Solaris",
      body: "You have a new institutional update.",
      tag: `world-private:${deliveryId}`,
    });
  });

  it("fails closed for World routes and Court/Ethics task events even without a sensitivity flag", () => {
    const candidates = [
      { route: "/world/court/case-id", title: detailedCase.title, body: detailedCase.body },
      { category: "world", title: detailedCase.title, body: detailedCase.body },
      { eventType: "court_response", title: detailedCase.title, body: detailedCase.body },
      { eventType: "world.ethics.case.new", title: detailedCase.title, body: detailedCase.body },
      { visibility: "public", privacy: "confidential", title: detailedCase.title, body: detailedCase.body },
    ];
    for (const candidate of candidates) {
      const safe = serviceWorkerDisplay(candidate);
      expect(safe.title).toBe("Terra Solaris");
      expect(safe.body).toBe("You have a new institutional update.");
    }
  });

  it("keeps unrelated public push display and malformed payloads safe", () => {
    const publicEvent = { title: "Published show", body: "Ready now", tag: "public-1" };
    expect(serviceWorkerDisplay(publicEvent)).toEqual(publicEvent);
    expect(serviceWorkerDisplay(null)).toEqual({
      title: "Solaris Studio",
      body: "",
      tag: undefined,
    });
    expect(serviceWorkerDisplay("malformed")).toEqual({
      title: "Solaris Studio",
      body: "",
      tag: undefined,
    });
  });

  it("wires the production dispatcher to redaction before provider delivery", () => {
    expect(sender).toContain('import { publicPushEnvelope } from "../_shared/world-private-push.ts"');
    const first = sender.indexOf("const displayEnvelope = publicPushEnvelope(delivery)");
    const transmitted = sender.indexOf("await webpush.sendNotification(");
    expect(first).toBeGreaterThan(0);
    expect(transmitted).toBeGreaterThan(first);
    expect(sender).toContain("title: displayEnvelope.title");
    expect(sender).toContain("body: displayEnvelope.body");
    expect(sender).toContain("tag: displayEnvelope.tag");
    expect(sender).toContain("sensitivity: displayEnvelope.sensitivity");
    expect(sender).not.toContain("title: delivery.title");
    expect(sender).not.toContain("body: delivery.body");
    expect(sender).not.toContain("tag: delivery.dedupe_key");
  });

  it("wires the actual service worker display and keeps safe deep-link and receipt handling", () => {
    expect(worker).toContain("const safeContent = resolvePushDisplayContent(payload)");
    expect(worker).toContain("const title = safeContent.title");
    expect(worker).toContain("body: safeContent.body");
    expect(worker).toContain("tag: safeContent.tag");
    expect(worker).toContain("const route = normalizePushRoute(payload.route)");
    expect(worker).toContain("reportPushReceipt(options.data, \"displayed\")");
    expect(worker).toContain("const route = normalizePushRoute(event.notification.data?.route)");
    expect(worker).toContain('if (!payload || typeof payload !== "object" || Array.isArray(payload))');
    expect(worker).toContain('payload = { sensitivity: "private" }');
    expect(worker).not.toContain("event.data?.text?.()");
  });
});
