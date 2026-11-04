import { describe, expect, it } from "vitest";
import { buildWorldPublicPrintModel } from "./world-public-document-print";
import type { WorldDocumentDetail } from "./world-public-documents";

const item: WorldDocumentDetail = {
  documentId: "doc", title: "Charter", documentType:"charter",
  organization: { slug:"guard", officialName:"Global Union",shortName:"GUARD" },
  slug:"charter",
  version: {
    versionNumber:2, title:"Revised Charter", publicationState:"published",
    plainText:"  PREAMBLE\nText  ", publishedAt:"2026-11-01T00:00:00Z",
    effectiveFrom:"2026-11-03T00:00:00Z",effectiveTo:null,
    provisions: [{provisionId:"p-1",displayLabel:"Article 5",heading:"Membership",
      bodyPlainText:"  Original words\nsecond line  ",anchor:"membership",parentSemanticKey:null}],
  },
  history: [],
};

describe("TG4 public legal-document archival printing", () => {
  it("preserves official wording, line breaks, and version-specific article numbering", () => {
    const result=buildWorldPublicPrintModel(item,{organization:"guard",document:"charter"})!;
    expect(result.versionNumber).toBe(2);
    expect(result.plainText).toBe("  PREAMBLE\nText  ");
    expect(result.articles[0]).toEqual({id:"p-1",label:"Article 5",heading:"Membership",text:"  Original words\nsecond line  "});
    expect(result.citation).toContain("/world/documents/guard/charter?version=2");
  });
  it("renders the authoritative UTC effective date without inventing one", () => {
    const result=buildWorldPublicPrintModel(item,{organization:"guard",document:"charter"})!;
    expect(result.effectiveFrom).toBe("2026-11-03");
    expect(result.citation).toContain("2026-11-03");
    const none=buildWorldPublicPrintModel({...item,version:{...item.version,publishedAt:null,effectiveFrom:null}}, {organization:"guard",document:"charter"})!;
    expect(none.citation).not.toContain("effective/published");
  });
  it("does not print a draft or unapproved historical source as an official public record", () => {
    expect(buildWorldPublicPrintModel({...item,version:{...item.version,publicationState:"historical_source"}},{organization:"guard",document:"charter"})).toBeNull();
    expect(buildWorldPublicPrintModel(null,{organization:"guard",document:"charter"})).toBeNull();
  });
  it("supports superseded immutable versions and rejects foreign or stale version responses", () => {
    const old={...item,version:{...item.version,versionNumber:1,publicationState:"superseded" as const}};
    expect(buildWorldPublicPrintModel(old,{organization:"guard",document:"charter",version:1})?.publicationState).toBe("superseded");
    expect(()=>buildWorldPublicPrintModel(old,{organization:"guard",document:"charter",version:2})).toThrow(/version/);
    expect(()=>buildWorldPublicPrintModel(item,{organization:"unity",document:"charter"})).toThrow(/institution/);
  });
  it("rejects path traversal, missing provision identities and invalid version identifiers", () => {
    expect(()=>buildWorldPublicPrintModel(item,{organization:"../guard",document:"charter"})).toThrow();
    expect(()=>buildWorldPublicPrintModel(item,{organization:"guard",document:"charter",version:-1})).toThrow();
    expect(()=>buildWorldPublicPrintModel({...item,version:{...item.version,provisions:[item.version.provisions[0],item.version.provisions[0]]}},{organization:"guard",document:"charter"})).toThrow(/Duplicate/);
  });
});
