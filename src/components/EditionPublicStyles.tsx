import publicDesign from "@/edition-public-design.css?inline";
import publicHotfix from "@/edition-public-hotfix.css?inline";
import publicStylesV2 from "@/edition-public-styles-v2.css?inline";
import publicStylesV3 from "@/edition-public-styles-v3.css?inline";
import publicStylesV4 from "@/edition-public-styles-v4.css?inline";
import showParity from "@/edition-show-parity.css?inline";

/**
 * Edition and show personalities are sizeable and highly specific. Render
 * them only with public edition/show pages instead of making every route parse
 * their selectors.
 */
export function EditionPublicStyles() {
  return (
    <style data-edition-public-styles>
      {publicDesign}
      {publicHotfix}
      {publicStylesV2}
      {publicStylesV3}
      {publicStylesV4}
      {showParity}
    </style>
  );
}
