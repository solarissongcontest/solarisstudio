import baseStyles from "@/country-personalities.css?inline";
import repairStyles from "@/country-personalities-v4.css?inline";
import betaStyles from "@/country-personalities-beta2.css?inline";
import glassParityStyles from "@/country-glass-parity.css?inline";
import buttonStyles from "@/country-button-theme.css?inline";

/**
 * Country personalities are intentionally route-scoped. Keeping the CSS as an
 * inline route asset prevents the bundler from promoting 100 KB of specialist
 * selectors into the stylesheet downloaded by every Solaris page.
 */
export function CountryPersonalityStyles() {
  return (
    <style data-country-personality-styles>
      {baseStyles}
      {repairStyles}
      {betaStyles}
      {glassParityStyles}
      {buttonStyles}
    </style>
  );
}
