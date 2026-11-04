import { describe, expect, it } from "vitest";

import {
  anonymousWorldRpcRequest,
  assertWorldSlug,
  publicWorldRpcHeaders,
  normalizeWorldSearch,
  parseWorldDocumentDetail,
  parseWorldDocumentIndex,
  publicWorldDocumentOutline,
  resolveWorldDocumentFragment,
  worldProvisionTargetId,
} from "./world-public-documents";

const indexRow = {
  documentId: "document-1",
  organizationSlug: "guard",
  organizationName: "Global Union for Allied Resilience and Defence",
  slug: "charter",
  documentType: "charter",
  title: "GUARD Charter",
  status: "active",
  visibility: "public",
  currentVersion: {
    versionId: "version-2",
    versionNumber: 2,
    title: "Charter revision",
    publishedAt: "2026-11-02T00:00:00Z",
    effectiveFrom: "2026-11-04T00:00:00Z",
  },
};

const document = {
  documentId: "document-1",
  organization: {
    slug: "guard",
    officialName: "Global Union for Allied Resilience and Defence",
    shortName: "GUARD",
  },
  slug: "charter",
  documentType: "charter",
  title: "GUARD Charter",
  visibility: "public",
  version: {
    versionId: "version-2",
    versionNumber: 2,
    title: "Revised Charter",
    publicationState: "published",
    plainText: "Preamble",
    publishedAt: "2026-11-02T00:00:00Z",
    effectiveFrom: "2026-11-04T00:00:00Z",
    effectiveTo: null,
    provisions: [{
      provisionId: "provision-1",
      semanticKey: "article-one",
      parentSemanticKey: null,
      displayLabel: "Article I",
      heading: "Scope",
      bodyPlainText: "Public rules apply.",
      anchor: "article-one",
    }],
  },
  history: [
    {
      versionNumber: 2,
      title: "Revised Charter",
      publicationState: "published",
      publishedAt: "2026-11-02T00:00:00Z",
    },
    {
      versionNumber: 1,
      title: "Original Charter",
      publicationState: "superseded",
      publishedAt: "2026-10-01T00:00:00Z",
    },
  ],
  allowedActions: { manage: true, publish: true },
};

describe("TG4 public institutional document library", () => {
  it("makes public RPC requests as anon even in an authenticated organizer session", () => {
    const publishable = "sb_publishable_world_documents_test";
    expect(publicWorldRpcHeaders(publishable)).toEqual({
      "Content-Type": "application/json",
      apikey: publishable,
    });
    const request = anonymousWorldRpcRequest(publishable, {
      p_organization_slug: null,
      p_query: "charter",
      p_limit: 100,
    });
    expect(request.method).toBe("POST");
    expect(request.credentials).toBe("omit");
    expect(request.cache).toBe("no-store");
    expect(request.headers).not.toHaveProperty("Authorization");
    expect(request.headers).not.toHaveProperty("Cookie");
    expect(JSON.parse(String(request.body))).toEqual({
      p_organization_slug: null,
      p_query: "charter",
      p_limit: 100,
    });

    // The legacy anon JWT uses a bearer token, but the currently signed-in
    // user's JWT must never be forwarded into this transport.
    expect(publicWorldRpcHeaders("legacy-anon-key")).toHaveProperty(
      "Authorization", "Bearer legacy-anon-key",
    );
    expect(() => publicWorldRpcHeaders("sb_secret_dont-use")).toThrow();
    expect(() => publicWorldRpcHeaders("sb_service_role_dont-use")).toThrow();
    expect(() => publicWorldRpcHeaders("")).toThrow();
  });


  it("keeps only public rows backed by an actual published current Version", () => {
    const parsed = parseWorldDocumentIndex({
      documents: [
        indexRow,
        { ...indexRow, documentId: "draft-only", slug: "draft", currentVersion: null },
        { ...indexRow, documentId: "members", slug: "members", visibility: "members" },
        { ...indexRow, documentId: "private", slug: "private", visibility: "private" },
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].slug).toBe("charter");
    expect(parsed[0].currentVersion.versionNumber).toBe(2);
    expect(Object.keys(parsed[0])).not.toContain("visibility");
  });

  it("rejects malformed identifiers and duplicate canonical rows", () => {
    expect(() => assertWorldSlug("../private")).toThrow();
    expect(() => assertWorldSlug("GUARD")).toThrow();
    expect(() => parseWorldDocumentIndex({ documents: [indexRow, indexRow] })).toThrow();
    expect(() => parseWorldDocumentIndex({ documents: [{}] })).not.toThrow();
    expect(() => parseWorldDocumentIndex({ documents: "not an array" })).toThrow();
    expect(() => parseWorldDocumentIndex({ documents: Array(101).fill(indexRow) })).toThrow();
  });

  it("rejects partial or invalid published Version metadata", () => {
    expect(() => parseWorldDocumentIndex({
      documents: [{ ...indexRow, currentVersion: { versionNumber: 0 } }],
    })).toThrow();
    expect(() => parseWorldDocumentIndex({
      documents: [{ ...indexRow, slug: "unsafe/path" }],
    })).toThrow();
  });

  it("removes capability and provenance metadata from the public reader model", () => {
    const result = parseWorldDocumentDetail({
      ...document,
      sourceProvenance: "private provenance",
      version: { ...document.version, revision: 123, sourceDescription: "private notes" },
    });
    expect(result?.version.title).toBe("Revised Charter");
    expect(result).not.toHaveProperty("allowedActions");
    expect(result).not.toHaveProperty("sourceProvenance");
    expect(result?.version).not.toHaveProperty("revision");
    expect(result?.version).not.toHaveProperty("sourceDescription");
  });

  it("never exposes member/private documents or manager draft versions on Public", () => {
    expect(parseWorldDocumentDetail({ ...document, visibility: "private" })).toBeNull();
    expect(parseWorldDocumentDetail({ ...document, visibility: "members" })).toBeNull();
    expect(() => parseWorldDocumentDetail({
      ...document,
      version: { ...document.version, publicationState: "draft" },
    })).toThrow("not public");
  });

  it("preserves historical published/superseded versions but excludes draft history", () => {
    const result = parseWorldDocumentDetail({
      ...document,
      history: [...document.history, {
        versionNumber: 3,
        title: "Confidential draft",
        publicationState: "draft",
      }],
    });
    expect(result?.history.map((item) => item.versionNumber)).toEqual([2, 1]);
    expect(result?.history.map((item) => item.publicationState)).toEqual(["published", "superseded"]);
  });

  it("preserves exact legal-text whitespace rather than rewriting historical wording", () => {
    const result = parseWorldDocumentDetail({
      ...document,
      version: {
        ...document.version,
        plainText: "  Preamble\n  line two  \n",
        provisions: [{ ...document.version.provisions[0], bodyPlainText: "\n  Article body  \n" }],
      },
    });
    expect(result?.version.plainText).toBe("  Preamble\n  line two  \n");
    expect(result?.version.provisions[0].bodyPlainText).toBe("\n  Article body  \n");
  });

  it("never interprets stored text as markup and discards unsafe/duplicate TOC anchors", () => {
    const result = parseWorldDocumentDetail({
      ...document,
      version: {
        ...document.version,
        provisions: [
          { ...document.version.provisions[0], bodyPlainText: "<script>alert('x')</script>" },
          { ...document.version.provisions[0], provisionId: "two", semanticKey: "article-two", anchor: "article-one" },
          { ...document.version.provisions[0], provisionId: "three", semanticKey: "article-three", anchor: "../unsafe" },
        ],
      },
    });
    expect(result?.version.provisions[0].bodyPlainText).toBe("<script>alert('x')</script>");
    expect(result?.version.provisions.map((item) => item.anchor)).toEqual([
      "article-one", null, null,
    ]);
  });

  it("cannot let a legacy alias shadow a different provision's stable link", () => {
    const result = parseWorldDocumentDetail({
      ...document,
      version: {
        ...document.version,
        provisions: [
          { ...document.version.provisions[0], semanticKey: "alpha", anchor: "section-one" },
          {
            ...document.version.provisions[0],
            provisionId: "second",
            semanticKey: "beta",
            anchor: "world-provision-alpha",
          },
        ],
      },
    });
    expect(result?.version.provisions[0].targetId).toBe("world-provision-alpha");
    expect(result?.version.provisions[1].anchor).toBeNull();
  });

  it("uses durable semantic identity, not mutable visible article numbers, for deep links", () => {
    const first = parseWorldDocumentDetail({
      ...document,
      version: {
        ...document.version,
        provisions: [{
          ...document.version.provisions[0],
          semanticKey: "guard-charter:membership-admission",
          displayLabel: "Article 4",
          anchor: "article-4",
        }],
      },
    });
    const renumbered = parseWorldDocumentDetail({
      ...document,
      version: {
        ...document.version,
        versionNumber: 3,
        provisions: [{
          ...document.version.provisions[0],
          semanticKey: "guard-charter:membership-admission",
          displayLabel: "Article 5",
          anchor: "article-5",
        }],
      },
    });
    expect(first?.version.provisions[0].targetId).toBe(
      renumbered?.version.provisions[0].targetId,
    );
    expect(first?.version.provisions[0].targetId).toBe(
      worldProvisionTargetId("guard-charter:membership-admission"),
    );
    expect(first?.version.provisions[0].anchor).toBe("article-4");
    expect(renumbered?.version.provisions[0].anchor).toBe("article-5");
  });

  it("rejects duplicate or unsafe semantic keys instead of rendering ambiguous links", () => {
    expect(() => parseWorldDocumentDetail({
      ...document,
      version: {
        ...document.version,
        provisions: [document.version.provisions[0], {
          ...document.version.provisions[0],
          provisionId: "second-provision",
          displayLabel: "Article II",
        }],
      },
    })).toThrow("Duplicate semantic provision identity");
    expect(() => worldProvisionTargetId("bad\nkey")).toThrow("Invalid semantic provision identity");
    expect(worldProvisionTargetId("x".repeat(201))).toBe("world-provision-" + "x".repeat(201));
    expect(() => worldProvisionTargetId("")).toThrow();
  });

  it("retains contents past section 40 in their canonical order", () => {
    const original = parseWorldDocumentDetail(document);
    const prototype = original!.version.provisions[0];
    const provisions = Array.from({ length: 85 }, (_, index) => ({
      ...prototype,
      provisionId: "p-" + index,
      semanticKey: "section-" + index,
      targetId: worldProvisionTargetId("section-" + index),
      heading: "Section " + index,
    }));
    expect(publicWorldDocumentOutline(provisions)).toHaveLength(85);
    expect(publicWorldDocumentOutline(provisions).at(-1)?.heading).toBe("Section 84");
  });

  it("restores links to the requested published Version after async hydration", () => {
    const detail = parseWorldDocumentDetail({
      ...document,
      version: {
        ...document.version,
        provisions: [{
          ...document.version.provisions[0],
          semanticKey: "guard-charter:membership-admission",
          anchor: "article-4",
        }],
      },
    });
    const provisions = detail!.version.provisions;
    const stable = "world-provision-guard-charter:membership-admission";
    expect(provisions[0].targetId).toBe(stable);
    expect(resolveWorldDocumentFragment("#" + stable, provisions)).toBe(stable);
    expect(resolveWorldDocumentFragment("#world-provision-guard-charter%3Amembership-admission", provisions))
      .toBe(stable);
    expect(resolveWorldDocumentFragment("#article-4", provisions)).toBe("article-4");
    expect(resolveWorldDocumentFragment("#article-5", provisions)).toBeNull();
    expect(resolveWorldDocumentFragment("#not-this-document", provisions)).toBeNull();
    expect(resolveWorldDocumentFragment("#%E0%A4%A", provisions)).toBeNull();
    expect(resolveWorldDocumentFragment("", provisions)).toBeNull();
  });

  it("bounds search input without making additional requests or inventing results", () => {
    expect(normalizeWorldSearch("  official charter  ")).toBe("official charter");
    expect(normalizeWorldSearch("x".repeat(200))).toHaveLength(100);
  });
});
