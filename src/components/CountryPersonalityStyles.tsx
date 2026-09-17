import wikiBaseStyles from "@/country-wiki.css?inline";
import buttonStyles from "@/country-button-theme.css?inline";
import personalityV8 from "@/country-personality-system-v8.css?inline";
import wikiV8 from "@/country-wiki-v8.css?inline";

const countryPersonalityStyles = [
  wikiBaseStyles,
  buttonStyles,
  personalityV8,
  wikiV8,
].join("\n");

/** One route-scoped style payload. No unlayering and no legacy repair stack. */
export function CountryPersonalityStyles() {
  return <style data-country-personality-styles>{countryPersonalityStyles}</style>;
}
