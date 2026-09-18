import buttonStyles from "@/country-button-theme.css?inline";
import personalityV8 from "@/country-personality-system-v8.css?inline";
import wikiV8 from "@/country-wiki-v8.css?inline";
import wikiComponentsV8 from "@/country-wiki-components-v8.css?inline";
import sourceFoundation from "@/country-personality-source-foundation.css?inline";
import minimalSource from "@/styles/personalities/minimal-source.adapter.css?inline";
import retroSource from "@/styles/personalities/retro-source.adapter.css?inline";
import editorialSource from "@/styles/personalities/editorial-source.adapter.css?inline";
import posterSource from "@/styles/personalities/poster-source.adapter.css?inline";
import diplomaticSource from "@/styles/personalities/diplomatic-source.adapter.css?inline";
import broadcastSource from "@/styles/personalities/broadcast-source.adapter.css?inline";
import heritageSource from "@/styles/personalities/heritage-source.adapter.css?inline";

const countryPersonalityStyles = [
  buttonStyles,
  personalityV8,
  wikiV8,
  wikiComponentsV8,
  sourceFoundation,
  minimalSource,
  retroSource,
  editorialSource,
  posterSource,
  diplomaticSource,
  broadcastSource,
  heritageSource,
].join("\n");

/**
 * One route-scoped style payload.
 *
 * V8 remains the compatibility foundation while the source-driven system is
 * introduced personality by personality. Source adapters load last so the
 * human-designed source grammar wins without restoring the old repair cascade.
 */
export function CountryPersonalityStyles() {
  return <style data-country-personality-styles>{countryPersonalityStyles}</style>;
}
