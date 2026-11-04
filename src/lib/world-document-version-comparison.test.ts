import { describe, expect, it } from "vitest";
import { comparePublishedWorldVersions, resolvePublishedVersionOptions } from "./world-document-version-comparison";
import type { WorldDocumentDetail, WorldDocumentProvision } from "./world-public-documents";

const provision = (provisionId: string, text: string, heading = "Membership", displayLabel = "Article 4"): WorldDocumentProvision => ({
  provisionId, bodyPlainText: text, heading, displayLabel, anchor: "membership-admission", parentSemanticKey: null,
});

function version(versionNumber: number, provisions: WorldDocumentProvision[], publicationState: "published" | "superseded" | "historical_source" = "superseded"): WorldDocumentDetail {
  return {
    documentId: "work-1", organization: { slug: "guard", officialName: "GUARD", shortName: "GUARD" },
    slug: "charter", title: "Charter", documentType: "charter",
    version: { versionNumber, title: "Charter", publicationState, plainText: "Published text",
      effectiveFrom: null, effectiveTo: null, publishedAt: null, provisions },
    history: [],
  };
}

describe("TG4 published legal version comparison", () => {
  it("aligns persistent provision IDs even when article numbering changes", () => {
    const before = version(1, [provision("provision-1", "Original", "Admission", "Article 4")]);
    const after = version(2, [provision("provision-1", "Original", "Admission", "Article 5")], "published");
    const compared = comparePublishedWorldVersions(after, before);
    expect(compared.oldVersion).toBe(1);
    expect(compared.newVersion).toBe(2);
    expect(compared.totals).toEqual({ added: 0, removed: 0, modified: 1, unchanged: 0 });
    expect(compared.rows[0]?.key).toBe("provision-1");
  });
  it("shows added, removed and preserved provisions, without claiming a text-diff algorithm", () => {
    const old = version(1, [provision("a", "stays"), provision("b", "removed")]);
    const next = version(2, [provision("a", "stays"), provision("c", "added")], "published");
    const result = comparePublishedWorldVersions(old, next);
    expect(result.rows.map(x=>x.change)).toEqual(["unchanged", "removed", "added"]);
    expect(result.totals).toEqual({ added: 1, removed: 1, modified: 0, unchanged: 1 });
  });
  it("refuses to conflate two different canonical work identities", () => {
    expect(() => comparePublishedWorldVersions(version(1, []), {...version(2, []),documentId:"foreign"})).toThrow(/different/);
    expect(() => comparePublishedWorldVersions(version(1, []), {...version(2, []),organization:{slug:"unity",shortName:"UNITY",officialName:"UNITY"}})).toThrow(/different/);
  });
  it("fails closed on unpublished historical source and duplicate provision identity", () => {
    expect(() => comparePublishedWorldVersions(version(1, [],"historical_source"),version(2, [],"published"))).toThrow(/Only publicly/);
    expect(() => comparePublishedWorldVersions(version(1, [provision("a","1"),provision("a","2")]),version(2, [],"published"))).toThrow(/duplicate/);
    expect(() => comparePublishedWorldVersions(version(1, []),version(1, [],"published"))).toThrow(/different historical/);
  });
  it("offers only published/superseded versions and detects duplicate official version numbers", () => {
    const versions = [
      {versionNumber:3,title:"Private draft",publicationState:"historical_source" as const,effectiveFrom:null,effectiveTo:null,publishedAt:null},
      {versionNumber:2,title:"Current",publicationState:"published" as const,effectiveFrom:null,effectiveTo:null,publishedAt:null},
      {versionNumber:1,title:"Before",publicationState:"superseded" as const,effectiveFrom:null,effectiveTo:null,publishedAt:null},
    ];
    expect(resolvePublishedVersionOptions(versions).map(x=>x.versionNumber)).toEqual([1,2]);
    expect(()=>resolvePublishedVersionOptions([...versions,versions[1]])).toThrow(/duplicate/);
  });
  it("retains full published plain text when no provision structure is available", () => {
    const a=version(1,[], "superseded");a.version.plainText="Full original text";
    const b=version(2,[], "published");b.version.plainText="Full revised text";
    const result=comparePublishedWorldVersions(a,b);
    expect(result.structural).toBe(false);
    expect(result.plainTextChanged).toBe(true);
    expect(result.beforePlainText).toBe("Full original text");
    expect(result.afterPlainText).toBe("Full revised text");
  });
});
