import "@/styles/country-personality-bundle.css";

/**
 * Route-owned Country personality stylesheet.
 *
 * Importing the component keeps its complete CSS source-adapter bundle behind
 * the existing Country/Wiki/personality-lab route chunks. Vite emits a real
 * minified stylesheet rather than embedding 23 adapter files as JavaScript
 * strings. The single named personality cascade layer and original adapter
 * order are maintained by country-personality-bundle.css.
 *
 * Preserve the marker for existing route-level stylesheet diagnostics.
 */
export function CountryPersonalityStyles() {
  return <style data-country-personality-styles />;
}
