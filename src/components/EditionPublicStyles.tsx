import publicDesign from "@/edition-public-design.css?inline";
import publicHotfix from "@/edition-public-hotfix.css?inline";
import publicStylesV2 from "@/edition-public-styles-v2.css?inline";
import publicStylesV3 from "@/edition-public-styles-v3.css?inline";
import publicStylesV4 from "@/edition-public-styles-v4.css?inline";
import showParity from "@/edition-show-parity.css?inline";

const editionPublicStyles = [
  publicDesign,
  publicHotfix,
  publicStylesV2,
  publicStylesV3,
  publicStylesV4,
  showParity,
].join("\n");

/**
 * Edition and show personalities are sizeable and highly specific. Render
 * them only with public edition/show pages instead of making every route parse
 * their selectors.
 *
 * Keep the style contents as one text node so React's SSR and browser
 * hydration agree on the raw-text <style> contents.
 */
export function EditionPublicStyles() {
  return <style data-edition-public-styles>{editionPublicStyles}</style>;
}
