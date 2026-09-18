import buttonStyles from "@/country-button-theme.css?inline";
import sharedFoundation from "@/country-personality-shared-foundation.css?inline";
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
import brutalistSource from "@/styles/personalities/brutalist-source.adapter.css?inline";
import luxurySource from "@/styles/personalities/luxury-source.adapter.css?inline";
import scientificSource from "@/styles/personalities/scientific-source.adapter.css?inline";
import civicSource from "@/styles/personalities/civic-source.adapter.css?inline";
import festivalSource from "@/styles/personalities/festival-source.adapter.css?inline";
import newspaperSource from "@/styles/personalities/newspaper-source.adapter.css?inline";
import avantGardeSource from "@/styles/personalities/avant-garde-source.adapter.css?inline";
import passportSource from "@/styles/personalities/passport-source.adapter.css?inline";
import atlasSource from "@/styles/personalities/atlas-source.adapter.css?inline";
import glassSource from "@/styles/personalities/glass-source.adapter.css?inline";

const countryPersonalityStyles = [
  buttonStyles,
  sharedFoundation,
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
  brutalistSource,
  luxurySource,
  scientificSource,
  civicSource,
  festivalSource,
  newspaperSource,
  avantGardeSource,
  passportSource,
  atlasSource,
  glassSource,
].join("\n");

/**
 * One route-scoped style payload.
 *
 * The shared foundation owns semantic geometry only. Source adapters load
 * afterwards and are the sole personality-specific visual authority. No legacy
 * all-personality stylesheet participates in production rendering.
 */
export function CountryPersonalityStyles() {
  return <style data-country-personality-styles>{countryPersonalityStyles}</style>;
}
