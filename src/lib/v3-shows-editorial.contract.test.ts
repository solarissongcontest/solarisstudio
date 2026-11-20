import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const view=readFileSync("src/components/v3/V3ShowsDiscoveryScreen.tsx","utf8");
const css=readFileSync("src/styles/v3-shows-directory.css","utf8");
describe("Explore Shows editorial and live-state priority",()=>{
  it("preserves state-led curated collections and scoped, bounded public browsing",()=>{
    for(const key of ['eyebrow: "Live now"','eyebrow: "Up next"','eyebrow: "Recent"','eyebrow: "Current edition"']){
      expect(view).toContain(key);
    }
    expect(view).toContain("getV3ShowBrowsePage(");
    expect(view).toContain("V3_SHOW_BROWSE_PAGE_SIZE");
    expect(view).toContain("showPublishesResults(item.show)");
    expect(view).toContain("item.broadcastUrl");
  });
  it("reserves deliberate emphasis for live shows instead of identical boxes everywhere",()=>{
    expect(view).toContain("v3-shows-live-list");
    expect(view).toContain("v3-shows-editorial-list");
    expect(view).toContain("v3-shows-editorial-card--live");
    expect(view).toContain("v3-show-app-editorial-row");
    expect(css).toContain(".v3-shows-editorial-card--live");
    expect(css).toContain("border-bottom:1px solid var(--border)");
  });
  it("keeps discovery presentation only and public show routes as the authority",()=>{
    expect(view).not.toContain("useAllResults");
    expect(view).not.toContain("useCountries");
    expect(view).not.toContain(".from(");
    expect(view).toContain('to="/shows/$showId"');
  });
});
