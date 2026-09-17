import wikiStyles from "@/country-wiki.css?inline";
import v7Styles from "@/country-personality-system-v7.css?inline";
import v7Refinements from "@/country-personality-system-v7-refinements.css?inline";

const countryPersonalityStyles = [wikiStyles, v7Styles, v7Refinements].join("\n");

/**
 * Country and Wiki presentation is route-scoped and intentionally composed as
 * one style text node. V7 replaces the former repair-on-repair cascade with a
 * canonical article foundation plus one constrained personality system.
 *
 * Keep the style contents as one text node. React SSR hydration can disagree
 * with the browser about multiple adjacent text children inside raw-text
 * elements such as <style>.
 */
export function CountryPersonalityStyles() {
  return <style data-country-personality-styles>{countryPersonalityStyles}</style>;
}
