import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  hasStructuredGovernment, parseGovernmentArticles, parseGovernmentCountry,
  parseGovernmentProfile, safeGovernmentImage, validGovernmentCountryCode,
} from "./world-country-government";

const ID = "00000000-0000-4000-8000-000000000001";
const ARTICLE = "00000000-0000-4000-8000-000000000002";
const country = { id: ID, name: "Oland", native_name: "Ålanti", short_code: "OL", region: "Atlas", flag_image: "https://media.test/oland.png", auth_user_id: "should-not-leak" };
const profile = { country_id: ID, government_type: "Republic", leader_name: "Recorded name", leader_title: "President", capital: "Tetlehamn", summary: null, updated_at: "2026-10-31T12:00:00Z", password: "never" };

describe("TG3 country government publication-safe read", () => {
  it("accepts a strict case-insensitive country identity without leaking account fields", () => {
    const parsed = parseGovernmentCountry(country, "ol");
    expect(parsed).toEqual({ id: ID, name: "Oland", nativeName: "Ålanti", code: "OL", region: "Atlas", flagImage: "https://media.test/oland.png" });
    expect(JSON.stringify(parsed)).not.toContain("auth_user_id");
  });

  it("rejects foreign country identity and invalid route filters", () => {
    expect(() => parseGovernmentCountry(country, "AA")).toThrow(/does not match/);
    expect(parseGovernmentCountry(null, "OL")).toBeNull();
    expect(validGovernmentCountryCode("OL")).toBe(true);
    for (const value of ["../../roles", "a%", "", "a", "a".repeat(13), "foo_bar"]) {
      expect(validGovernmentCountryCode(value)).toBe(false);
    }
  });

  it("keeps a missing profile empty instead of inventing the head of state", () => {
    expect(parseGovernmentProfile(null, ID)).toBeNull();
    expect(hasStructuredGovernment(null)).toBe(false);
    expect(hasStructuredGovernment({ ...parseGovernmentProfile(profile, ID)!, governmentType: null, leaderName: null, leaderTitle: null, capital: null })).toBe(false);
  });

  it("parses only public, structured existing fields and rejects cross-country leakage", () => {
    const parsed = parseGovernmentProfile(profile, ID);
    expect(parsed?.leaderName).toBe("Recorded name");
    expect(parsed?.governmentType).toBe("Republic");
    expect(hasStructuredGovernment(parsed)).toBe(true);
    expect(JSON.stringify(parsed)).not.toContain("password");
    expect(() => parseGovernmentProfile({ ...profile, country_id: "00000000-0000-4000-8000-000000000009" }, ID)).toThrow(/Cross-country/);
    expect(() => parseGovernmentProfile({ ...profile, updated_at: "not a date" }, ID)).toThrow(/date/);
  });

  it("keeps political country-authored articles separate from structured government facts", () => {
    const rows = [
      { id: ARTICLE, country_id: ID, heading: "Government", body: "Country-authored text", sort_order: 0, visible_on_country: true, visible_on_wiki: true },
      { id: "00000000-0000-4000-8000-000000000003", country_id: ID, heading: "Weather", body: "Sunny", sort_order: 1 },
      { id: "00000000-0000-4000-8000-000000000004", country_id: ID, heading: "Cabinet", body: "   ", sort_order: 2 },
    ];
    expect(parseGovernmentArticles(rows, ID)).toEqual([{ id: ARTICLE, title: "Government", body: "Country-authored text" }]);
  });

  it("excludes political sections hidden from both established public surfaces", () => {
    const shared = { id: ARTICLE, country_id: ID, heading: "Government", body: "Public political lore" };
    const hidden = { ...shared, visible_on_country: false, visible_on_wiki: false };
    const visibleOnCountry = { ...shared, visible_on_country: true, visible_on_wiki: false };
    const visibleOnWiki = { ...shared, visible_on_country: false, visible_on_wiki: true };
    expect(parseGovernmentArticles([hidden], ID)).toEqual([]);
    expect(parseGovernmentArticles([shared], ID)).toEqual([]);
    expect(parseGovernmentArticles([visibleOnCountry], ID)).toHaveLength(1);
    expect(parseGovernmentArticles([visibleOnWiki], ID)).toHaveLength(1);
  });

  it("filters hidden sections at the source as well as the projection boundary", () => {
    const dataSource = readFileSync(resolve(process.cwd(), "src/lib/world-country-government-data.ts"), "utf8");
    expect(dataSource).toContain("visible_on_country,visible_on_wiki");
    expect(dataSource).toContain('.or("visible_on_country.eq.true,visible_on_wiki.eq.true")');
  });

  it("rejects cross-country, duplicate and malformed articles rather than mixing political history", () => {
    const item = { id: ARTICLE, country_id: ID, heading: "Parliament", body: "Public section", visible_on_country: true, visible_on_wiki: true };
    expect(() => parseGovernmentArticles([item, item], ID)).toThrow(/Duplicate/);
    expect(() => parseGovernmentArticles([{ ...item, country_id: "00000000-0000-4000-8000-000000000009" }], ID)).toThrow(/Cross-country/);
    expect(() => parseGovernmentArticles([{ ...item, body: null }], ID)).toThrow(/body/);
    expect(() => parseGovernmentArticles(null, ID)).toThrow(/articles/);
  });

  it("restricts flags to safe URLs without inline active content", () => {
    expect(safeGovernmentImage("javascript:alert(1)")).toBeNull();
    expect(safeGovernmentImage("data:image/svg+xml,<svg/>")).toBeNull();
    expect(safeGovernmentImage("http://invalid.test/flag.svg")).toBeNull();
    expect(safeGovernmentImage("https://media.test/flag.png")).toBe("https://media.test/flag.png");
    expect(safeGovernmentImage("/storage/v1/object/public/flag.png")).toBe("/storage/v1/object/public/flag.png");
  });
});