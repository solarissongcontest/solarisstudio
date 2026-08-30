import baseStyles from "@/country-personalities.css?inline";
import repairStyles from "@/country-personalities-v4.css?inline";
import betaStyles from "@/country-personalities-beta2.css?inline";
import glassParityStyles from "@/country-glass-parity.css?inline";
import buttonStyles from "@/country-button-theme.css?inline";
import wikiStyles from "@/country-wiki.css?inline";
import wikiRestorationStyles from "@/wiki-card-restoration.css?inline";
import wikiMobileStyles from "@/wiki-mobile-encyclopedia.css?inline";
import feedbackStyles from "@/country-personality-feedback.css?inline";
import artDirectionStyles from "@/country-personalities-v5.css?inline";
import silhouetteStyles from "@/country-personalities-v6.css?inline";
import silhouetteLayoutStyles from "@/country-personalities-v6-layout.css?inline";

/**
 * Country personalities are intentionally route-scoped. V6 is loaded after
 * the broad V5 art-direction layer and owns the final silhouettes for the
 * personalities that still looked too much like the same base card. The last
 * compact layer also keeps editor thumbnails and responsive inner structure in
 * parity with those silhouettes.
 */
export function CountryPersonalityStyles() {
  return (
    <style data-country-personality-styles>
      {baseStyles}
      {repairStyles}
      {betaStyles}
      {glassParityStyles}
      {buttonStyles}
      {wikiStyles}
      {wikiRestorationStyles}
      {wikiMobileStyles}
      {feedbackStyles}
      {artDirectionStyles}
      {silhouetteStyles}
      {silhouetteLayoutStyles}
    </style>
  );
}
