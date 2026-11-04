import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canonicalHistorySlug,
  historicalTermEditionLabel,
  loadPublicOfficeHistory,
  loadWorldHistoryRolloutEnabled,
  OFFICE_HISTORY_PAGE_SIZE,
  parsePublicOfficeHistoryPage,
  type PublicOfficeTerm,
} from "./v3-world-office-history";

const api = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: api }));

const completedTerm = {
  id: "00000000-0000-4000-8000-000000000001",
  officeId: "00000000-0000-4000-8000-000000000002",
  officeTitle: "Chairperson",
  holderDisplayName: "Historical holder",
  representedCountryName: "Oland",
  termKind: "full",
  status: "ended",
  startedAt: "2024-01-01T00:00:00+00:00",
  scheduledEndAt: "2025-01-01T00:00:00+00:00",
  actualEndAt: "2024-12-01T00:00:00+00:00",
  startEditionNumber: 20,
  endEditionNumber: 21,
} as const;

const offices = [
  { slug: "chairperson", title: "Chairperson" },
  { slug: "deputy-chairperson", title: "Deputy Chairperson" },
];
const historyResponse = {
  organization: {
    slug: "guard",
    shortName: "GUARD",
    officialName: "Global Union for Allied Resilience and Defence",
  },
  offices,
  officesTruncated: false,
  terms: [completedTerm],
  hasMore: false,
  nextCursor: null,
};

beforeEach(() => api.rpc.mockReset());

describe("TG3 public office-history projection contract", () => {
  it("accepts only canonical, bounded world organization and office slugs", () => {
    expect(canonicalHistorySlug(" GUARD ")).toBe("guard");
    expect(canonicalHistorySlug("deputy-chairperson")).toBe("deputy-chairperson");
    expect(canonicalHistorySlug("guard/status.eq.private")).toBeNull();
    expect(canonicalHistorySlug("guard--test")).toBeNull();
    expect(canonicalHistorySlug("x".repeat(81))).toBeNull();
  });

  it("parses only completed immutable-term states with valid dates", () => {
    const parsed = parsePublicOfficeHistoryPage(historyResponse, "GUARD");
    expect(parsed.terms[0].holderDisplayName).toBe("Historical holder");
    expect(parsed.terms[0].representedCountryName).toBe("Oland");
    expect(parsed.offices).toEqual(offices);
    expect(parsed.officesTruncated).toBe(false);
    expect(parsed.terms[0].status).toBe("ended");
    expect(parsePublicOfficeHistoryPage({
      ...historyResponse, terms: [{ ...completedTerm, status: "resigned" }],
    }, "guard").terms[0].status).toBe("resigned");
    expect(() => parsePublicOfficeHistoryPage({
      ...historyResponse, terms: [{ ...completedTerm, status: "active" }],
    }, "guard")).toThrow("Invalid public office history term");
    expect(() => parsePublicOfficeHistoryPage({
      ...historyResponse, terms: [{ ...completedTerm, actualEndAt: null }],
    }, "guard")).toThrow("Invalid public office history term");
    expect(() => parsePublicOfficeHistoryPage({
      ...historyResponse, terms: [{ ...completedTerm, actualEndAt: "2023-01-01T00:00:00+00:00" }],
    }, "guard")).toThrow("Invalid public office history term");
  });

  it("fails closed on mismatched organization identity and malformed office filters", () => {
    expect(() => parsePublicOfficeHistoryPage(historyResponse, "unity"))
      .toThrow("Invalid public office history response");
    expect(() => parsePublicOfficeHistoryPage({
      ...historyResponse, offices: [{ slug: "chairperson,private", title: "Chairperson" }],
    }, "guard")).toThrow("Invalid public office history office option");
    expect(() => parsePublicOfficeHistoryPage({
      ...historyResponse, offices: null,
    }, "guard")).toThrow("Invalid public office history response");
    expect(() => parsePublicOfficeHistoryPage({
      ...historyResponse, officesTruncated: "no",
    }, "guard")).toThrow("Invalid public office history response");
  });

  it("rejects inconsistent, oversized and unbounded page claims", () => {
    expect(() => parsePublicOfficeHistoryPage({
      ...historyResponse, terms: Array.from({ length: OFFICE_HISTORY_PAGE_SIZE + 1 }, () => completedTerm),
    }, "guard")).toThrow("Invalid public office history response");
    expect(() => parsePublicOfficeHistoryPage({
      ...historyResponse, hasMore: "yes",
    }, "guard")).toThrow("Invalid public office history response");
    expect(() => parsePublicOfficeHistoryPage({
      ...historyResponse, hasMore: true,
    }, "guard")).toThrow("Invalid public office history response");
    expect(() => parsePublicOfficeHistoryPage({
      ...historyResponse, nextCursor: { startedAt: completedTerm.startedAt, termId: completedTerm.id },
    }, "guard")).toThrow("Invalid public office history response");
  });

  it("accepts a continuation token only with a full matching public page", () => {
    const fullPage = Array.from({ length: OFFICE_HISTORY_PAGE_SIZE }, (_, i) => ({
      ...completedTerm,
      id: "00000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
    }));
    const nextCursor = {
      startedAt: completedTerm.startedAt,
      termId: fullPage.at(-1)!.id,
    };
    const parsed = parsePublicOfficeHistoryPage({
      ...historyResponse, terms: fullPage, hasMore: true, nextCursor,
    }, "guard");
    expect(parsed.nextCursor).toEqual(nextCursor);
    expect(parsed.terms).toHaveLength(OFFICE_HISTORY_PAGE_SIZE);
    expect(() => parsePublicOfficeHistoryPage({
      ...historyResponse, terms: fullPage, hasMore: true,
      nextCursor: { ...nextCursor, termId: "bad-id" },
    }, "guard")).toThrow("Invalid public office history response");
    expect(() => parsePublicOfficeHistoryPage({
      ...historyResponse, terms: fullPage, hasMore: true,
      nextCursor: { ...nextCursor, termId: fullPage[0].id },
    }, "guard")).toThrow("Invalid public office history continuation");
    expect(() => parsePublicOfficeHistoryPage({
      ...historyResponse, terms: [completedTerm, completedTerm],
    }, "guard")).toThrow("Invalid public office history continuation");
  });

  it("preserves genuinely unrepresented historical terms without inventing a country", () => {
    const parsed = parsePublicOfficeHistoryPage({
      ...historyResponse,
      terms: [{ ...completedTerm, representedCountryName: null }],
    }, "guard");
    expect(parsed.terms[0].representedCountryName).toBeNull();
  });

  it("rejects noncanonical term kinds, ambiguous timestamps and invalid edition numbers", () => {
    for (const corrupted of [
      { termKind: "self-appointed" },
      { scheduledEndAt: "tomorrow" },
      { startedAt: "2024-01-01" },
      { representedCountryName: 42 },
    ]) {
      expect(() => parsePublicOfficeHistoryPage({
        ...historyResponse, terms: [{ ...completedTerm, ...corrupted }],
      }, "guard")).toThrow("Invalid public office history term");
    }
    expect(() => parsePublicOfficeHistoryPage({
      ...historyResponse, terms: [{ ...completedTerm, startEditionNumber: -5 }],
    }, "guard")).toThrow("Invalid published SSC edition");
  });

  it("uses SSC editions for political term labels, never calendar years as substitutes", () => {
    const term = completedTerm as PublicOfficeTerm;
    expect(historicalTermEditionLabel(term)).toBe("SSC 20–21");
    expect(historicalTermEditionLabel({ ...term, endEditionNumber: null })).toBe("From SSC 20");
    expect(historicalTermEditionLabel({ ...term, startEditionNumber: null })).toBe("Through SSC 21");
    expect(historicalTermEditionLabel({
      ...term, startEditionNumber: null, endEditionNumber: null,
    })).toBeNull();
  });
});

describe("TG3 World rollout parity", () => {
  it("uses the shared canonical feature flag and accepts only true", async () => {
    api.rpc.mockResolvedValueOnce({ data: true, error: null });
    expect(await loadWorldHistoryRolloutEnabled()).toBe(true);
    expect(api.rpc).toHaveBeenCalledWith("studio2_feature_enabled", {
      p_key: "terra_world_public", p_edition_id: null,
    });
    api.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await loadWorldHistoryRolloutEnabled()).toBe(false);
    api.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await loadWorldHistoryRolloutEnabled()).toBe(false);
  });

  it("fails closed when canonical rollout cannot be verified", async () => {
    api.rpc.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    await expect(loadWorldHistoryRolloutEnabled())
      .rejects.toThrow("World history availability cannot be verified");
  });
});

describe("TG3 history API isolation", () => {
  it("does not call Supabase for invalid slugs, office filters or cursors", async () => {
    expect(await loadPublicOfficeHistory("../private")).toBeNull();
    expect(api.rpc).not.toHaveBeenCalled();
    await expect(loadPublicOfficeHistory("guard", null, "chairperson,private"))
      .rejects.toThrow("Invalid history office filter");
    await expect(loadPublicOfficeHistory("guard", {
      startedAt: completedTerm.startedAt, termId: "invalid-id",
    })).rejects.toThrow("Invalid history page cursor");
    expect(api.rpc).not.toHaveBeenCalled();
  });

  it("uses a stable server-owned continuation cursor and exact office filter", async () => {
    api.rpc.mockResolvedValueOnce({ data: historyResponse, error: null });
    const cursor = { startedAt: completedTerm.startedAt, termId: completedTerm.id };
    const page = await loadPublicOfficeHistory("GUARD", cursor, "CHAIRPERSON");
    expect(page?.terms).toHaveLength(1);
    expect(api.rpc).toHaveBeenCalledTimes(1);
    expect(api.rpc).toHaveBeenCalledWith("world_public_office_history_v1", {
      p_slug: "guard",
      p_cursor_started_at: cursor.startedAt,
      p_cursor_term_id: cursor.termId,
      p_office_slug: "chairperson",
      p_limit: OFFICE_HISTORY_PAGE_SIZE,
    });
  });

  it("starts without an offset or cursor and never broadens a scoped read", async () => {
    api.rpc.mockResolvedValueOnce({ data: historyResponse, error: null });
    await loadPublicOfficeHistory("guard");
    expect(api.rpc).toHaveBeenCalledWith("world_public_office_history_v1", {
      p_slug: "guard",
      p_cursor_started_at: null,
      p_cursor_term_id: null,
      p_office_slug: null,
      p_limit: OFFICE_HISTORY_PAGE_SIZE,
    });
  });

  it("treats non-public or missing organizations identically", async () => {
    api.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await loadPublicOfficeHistory("private-org")).toBeNull();
  });

  it("rejects API errors and unverified shapes instead of fabricated history", async () => {
    api.rpc.mockResolvedValueOnce({ data: undefined, error: { message: "unavailable" } });
    await expect(loadPublicOfficeHistory("guard")).rejects.toThrow("Institutional history unavailable");
    api.rpc.mockResolvedValueOnce({ data: {}, error: null });
    await expect(loadPublicOfficeHistory("guard")).rejects.toThrow("Invalid public office history response");
  });
});
