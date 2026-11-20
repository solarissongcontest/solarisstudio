import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicShareStoryButton } from "./PublicShareStoryButton";

const detail = readFileSync("src/routes/stories/$editionSlug.tsx", "utf8");
const share = readFileSync("src/components/public/PublicShareStoryButton.tsx", "utf8");

describe("Explore ordinary-web published Story sharing", () => {
  it("offers a keyboard-accessible Share action without sharing unverified media or metadata", () => {
    const html = renderToStaticMarkup(<PublicShareStoryButton title="Published edition timeline" />);
    expect(html).toContain("Share story");
    expect(html).toContain('type="button"');
    expect(share).toContain("navigator.share({ title, url })");
    expect(share).toContain("navigator.clipboard.writeText(url)");
    expect(share).toContain('name === "AbortError"');
    expect(share).toContain("new URL(window.location.pathname, window.location.origin)");
    expect(share).not.toContain("supabase");
  });

  it("places the Share action inside the Story spoiler disclosure, not outside it", () => {
    const disclosureStart = detail.indexOf("<PublicStorySpoilerDisclosure");
    const shareAction = detail.indexOf("<PublicShareStoryButton");
    const disclosureEnd = detail.indexOf("</PublicStorySpoilerDisclosure>");
    expect(disclosureStart).toBeGreaterThan(-1);
    expect(shareAction).toBeGreaterThan(disclosureStart);
    expect(shareAction).toBeLessThan(disclosureEnd);
    expect(detail).toContain("<PublicShareStoryButton title={story.title} />");
  });
});
