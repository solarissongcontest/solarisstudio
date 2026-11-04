import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canonicalHistorySlug,
  historicalTermEditionLabel,
  loadPublicOfficeHistory,
  OFFICE_HISTORY_PAGE_SIZE,
  parsePublicOfficeHistoryPage,
  type PublicOfficeTerm,
} from "./v3-world-office-history";

const api = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: api }));

const completedTerm = {
  id: "term-1",
  officeId: "office-1",
  officeTitle: "Chairperson",
  holderDisplayName: "Historical holder",
  termKind: "full",
  status: "ended",
  startedAt: "2024-01-01T00:00:00+00:00",
  scheduledEndAt: "2025-01-01T00:00:00+00:00",
  actualEndAt: "2024-12-01T00:00:00+00:00",
  startEditionNumber: 20,
  endEditionNumber: 21,
} as const;

const historyResponse = {
  organization: {
    slug: "guard",
    shortName: "GUARD",
    officialName: "Global Union for Allied Resilience and Defence",
  },
  terms: [completedTerm],
  hasMore: false,
};

beforeEach(() => api.rpc.mockReset());

describe("TG3 public office-history projection contract", () => {
  it("accepts only canonical, bounded world organization slugs", () => {
    expect(canonicalHistorySlug(" GUARD ")).toBe("guard");
    expect(canonicalHistorySlug("united-nations")).toBe("united-nations");
    expect(canonicalHistorySlug("guard/status.eq.private")).toBeNull();
    expect(canonicalHistorySlug("guard--test")).toBeNull();
    expect(canonicalHistorySlug("x".repeat(81))).toBeNull();
  });

  it("parses only completed immutable-term states with valid dates", () => {
    const parsed = parsePublicOfficeHistoryPage(historyResponse, "GUARD");
    expect(parsed.terms[0].holderDisplayName).toBe("Historical holder");
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

  it("fails closed on mismatched identity and oversized/ambiguous pages", () => {
    expect(() => parsePublicOfficeHistoryPage(historyResponse, "unity")).toThrow("Invalid public office history response");
    expect(() => parsePublicOfficeHistoryPage({
      ...historyResponse, terms: Array.from({ length: OFFICE_HISTORY_PAGE_SIZE + 1 }, () => completedTerm),
    }, "guard")).toThrow("Invalid public office history response");
    expect(() => parsePublicOfficeHistoryPage({
      ...historyResponse, hasMore: "yes",
    }, "guard")).toThrow("Invalid public office history response");
  });

  it("uses SSC editions for political term labels, never years as substitutes", () => {
    const term = completedTerm as PublicOfficeTerm;
    expect(historicalTermEditionLabel(term)).toBe("SSC 20–21");
    expect(historicalTermEditionLabel({ ...term, endEditionNumber: null })).toBe("From SSC 20");
    expect(historicalTermEditionLabel({ ...term, startEditionNumber: null })).toBe("Through SSC 21");
    expect(historicalTermEditionLabel({
      ...term, startEditionNumber: null, endEditionNumber: null,
    })).toBeNull();
  });
});

describe("TG3 history API isolation", () => {
  it("does not call Supabase for invalid slugs or offsets", async () => {
    expect(await loadPublicOfficeHistory("../private")).toBeNull();
    expect(api.rpc).not.toHaveBeenCalled();
    await expect(loadPublicOfficeHistory("guard", -12)).rejects.toThrow("Invalid history page offset");
    await expect(loadPublicOfficeHistory("guard", 3)).rejects.toThrow("Invalid history page offset");
    expect(api.rpc).not.toHaveBeenCalled();
  });

  it("queries only the bounded server-owned public projection", async () => {
    api.rpc.mockResolvedValueOnce({ data: historyResponse, error: null });
    const page = await loadPublicOfficeHistory("GUARD", OFFICE_HISTORY_PAGE_SIZE);
    expect(page?.terms).toHaveLength(1);
    expect(api.rpc).toHaveBeenCalledTimes(1);
    expect(api.rpc).toHaveBeenCalledWith("world_public_office_history_v1", {
      p_slug: "guard", p_offset: 12, p_limit: OFFICE_HISTORY_PAGE_SIZE,
    });
  });

  it("treats non-public or missing organizations identically", async () => {
    api.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await loadPublicOfficeHistory("private-org")).toBeNull();
  });

  it("rejects API errors and unverified shapes instead of showing fabricated history", async () => {
    api.rpc.mockResolvedValueOnce({ data: undefined, error: { message: "unavailable" } });
    await expect(loadPublicOfficeHistory("guard")).rejects.toThrow("Institutional history unavailable");
    api.rpc.mockResolvedValueOnce({ data: {}, error: null });
    await expect(loadPublicOfficeHistory("guard")).rejects.toThrow("Invalid public office history response");
  });
});
