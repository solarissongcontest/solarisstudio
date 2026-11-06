/**
 * All public directories inherit the Countries directory's runtime decision:
 * installed PWA remains installed regardless of width; viewport only affects
 * the ordinary website's mobile/desktop composition.
 */
import type { CountryDirectoryPresentation } from "@/lib/country-directory-presentation";
import { useCountryDirectoryPresentation } from "@/lib/use-country-directory-presentation";

export type V3DirectoryPresentation = CountryDirectoryPresentation;

export function useV3DirectoryPresentation(): V3DirectoryPresentation {
  return useCountryDirectoryPresentation();
}
