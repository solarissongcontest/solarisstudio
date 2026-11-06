import { describe, expect, it } from "vitest";
import {
  parseWorldAttendanceManage,
  parseWorldAttendanceReceipt,
} from "./world-attendance-commands";

const sessionId = "00000000-0000-4000-8000-000000000011";
const orgId = "00000000-0000-4000-8000-000000000012";
const organId = "00000000-0000-4000-8000-000000000013";
const countryId = "00000000-0000-4000-8000-000000000014";
const repId = "00000000-0000-4000-8000-000000000015";
const proxyId = "00000000-0000-4000-8000-000000000016";
const personId = "00000000-0000-4000-8000-000000000017";
const operationId = "00000000-0000-4000-8000-000000000018";

const proxy = {
  id: proxyId, proxyPersonId: personId, proxyPersonName: "Recorded Acting Proxy",
  validFrom: "2026-11-10T10:00:00Z", validUntil: "2026-11-10T14:00:00Z",
};
const country = {
  countryId, countryName: "Test Country",
  membershipStatus: "member", representationId: repId,
  representativeName: "Recorded Representative",
  attendance: null, proxies: [proxy],
};
const base = {
  sessionId, organizationId: orgId, organId,
  title: "Institutional Session", status: "open", revision: 3,
  countries: [country],
};

describe("TG6 attendance transport", () => {
  it("accepts a bounded institution-scoped manager projection", () => {
    expect(parseWorldAttendanceManage(base, sessionId)).toEqual(base);
    expect(parseWorldAttendanceManage({
      ...base, countries: [{ ...country, attendance: {
        status: "present", proxyId: null, revision: 2,
        recordedAt: "2026-11-10T12:00:00Z",
      } }],
    }, sessionId).countries[0].attendance?.revision).toBe(2);
  });

  it("fails closed on absent/foreign identity, stale shape and unbounded arrays", () => {
    expect(() => parseWorldAttendanceManage(null, sessionId)).toThrow();
    expect(() => parseWorldAttendanceManage(base, countryId)).toThrow();
    expect(() => parseWorldAttendanceManage({
      ...base, countries: [{ ...country, representationId: "invented" }],
    }, sessionId)).toThrow();
    expect(() => parseWorldAttendanceManage({
      ...base, countries: Array(101).fill(country),
    }, sessionId)).toThrow();
    expect(() => parseWorldAttendanceManage({
      ...base, countries: [country,country],
    }, sessionId)).toThrow();
    expect(() => parseWorldAttendanceManage({
      ...base, countries: [{ ...country, proxies: Array(6).fill(proxy) }],
    }, sessionId)).toThrow();
    expect(() => parseWorldAttendanceManage({
      ...base, countries: [{ ...country, proxies: [proxy,proxy] }],
    }, sessionId)).toThrow();
  });

  it("requires proxy evidence exactly when proxy attendance is recorded", () => {
    expect(() => parseWorldAttendanceManage({
      ...base, countries: [{ ...country, attendance: {
        status: "proxy", proxyId: null, revision: 1,
        recordedAt: "2026-11-10T12:00:00Z",
      } }],
    }, sessionId)).toThrow();
    expect(() => parseWorldAttendanceManage({
      ...base, countries: [{ ...country, attendance: {
        status: "absent", proxyId, revision: 1,
        recordedAt: "2026-11-10T12:00:00Z",
      } }],
    }, sessionId)).toThrow();
    expect(() => parseWorldAttendanceManage({
      ...base, countries: [{ ...country, attendance: {
        status: "proxy", proxyId, revision: 1,
        recordedAt: "2026-11-10T12:00:00Z",
      } }],
    }, sessionId).countries[0].attendance?.proxyId).toBe(proxyId);
  });

  it("rejects corrupted server-time proxy windows and unknown attendance states", () => {
    expect(() => parseWorldAttendanceManage({
      ...base, countries: [{ ...country, proxies: [{
        ...proxy, validFrom: proxy.validUntil, validUntil: proxy.validFrom,
      }] }],
    }, sessionId)).toThrow();
    expect(() => parseWorldAttendanceManage({
      ...base, countries: [{ ...country, attendance: {
        status: "excused", proxyId: null, revision: 1,
        recordedAt: "2026-11-10T12:00:00Z",
      } }],
    }, sessionId)).toThrow();
    expect(() => parseWorldAttendanceManage({
      ...base, countries: [{ ...country, membershipStatus: "suspended" }],
    }, sessionId)).toThrow();
  });

  it("requires a canonical matching R2 receipt, not just an HTTP success", () => {
    const expected = {
      sessionId,countryId,status: "proxy" as const,proxyId,operationId,
    };
    const valid = {
      status: "succeeded", operationId,
      result: {
        ok: true, sessionId,countryId,status: "proxy",proxyId,
        operationId,revision: 2,
      },
    };
    expect(parseWorldAttendanceReceipt(valid,expected)).toEqual({
      ...expected,revision: 2,
    });
    for (const corrupt of [
      { ...valid, status: "processing" },
      { ...valid, operationId: countryId },
      { ...valid, result: { ...valid.result, sessionId: organId } },
      { ...valid, result: { ...valid.result, countryId: organId } },
      { ...valid, result: { ...valid.result, proxyId: personId } },
      { ...valid, result: { ...valid.result, status: "present" } },
      { ...valid, result: { ...valid.result, revision: 0 } },
      { ...valid, result: { ...valid.result, operationId: personId } },
    ]) {
      expect(() => parseWorldAttendanceReceipt(corrupt,expected)).toThrow();
    }
  });
});
