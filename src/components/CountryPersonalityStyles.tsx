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
import waterDropStyles from "@/country-water-drop-v61.css?inline";
import glassFinalStyles from "@/country-glass-final.css?inline";

const countryPersonalityStyles = [
  baseStyles,
  repairStyles,
  betaStyles,
  glassParityStyles,
  buttonStyles,
  wikiStyles,
  wikiRestorationStyles,
  wikiMobileStyles,
  feedbackStyles,
  artDirectionStyles,
  silhouetteStyles,
  silhouetteLayoutStyles,
  waterDropStyles,
  glassFinalStyles,
].join("\n");

/**
 * Country personalities are intentionally route-scoped. V6 owns the final
 * silhouettes for the personalities that still looked too much like the same
 * base card. Water Drop V6.1 keeps its own replacement silhouette, while the
 * final Glass Card layer restores the full-width liquid surface after the
 * legacy personality layers have been composed.
 *
 * Keep the style contents as one text node. React's SSR hydration can disagree
 * with the browser about multiple adjacent text children inside raw-text
 * elements such as <style>.
 */
export function CountryPersonalityStyles() {
  return <style data-country-personality-styles>{countryPersonalityStyles}</style>;
}
