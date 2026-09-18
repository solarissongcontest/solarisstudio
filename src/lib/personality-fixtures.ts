import type { CountryGeography } from "@/lib/country-semantic-model";

export type PersonalityFixture = {
  id: "oland" | "neutral" | "hostile" | "sparse";
  label: string;
  code: string;
  name: string;
  nativeName?: string | null;
  region?: string | null;
  description?: string | null;
  flagImage?: string | null;
  accentColor: string;
  geography?: CountryGeography | null;
  facts: Array<{ label: string; value: string }>;
};

export const ordinaryFlag =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2"><rect width="3" height="2" fill="#e9edf2"/><rect width="1" height="2" x="1" fill="#6f7782"/></svg>',
  );

export const portraitFlag =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 3"><rect width="2" height="3" fill="#f1f1f1"/><path d="M0 0h2v1H0z" fill="#353535"/><path d="M0 2h2v1H0z" fill="#9a9a9a"/></svg>',
  );

export const PERSONALITY_QA_FIXTURES: PersonalityFixture[] = [
  {
    id: "oland",
    label: "A · Oland",
    code: "OLA",
    name: "Oland",
    nativeName: "Åland",
    region: "Averia",
    description:
      "A strong black-and-gold identity fixture used to catch hierarchy, flag scale and personality drift.",
    flagImage: ordinaryFlag,
    accentColor: "#d3aa32",
    facts: [
      { label: "Capital", value: "Tetlehamn" },
      { label: "Region", value: "Averia" },
      { label: "Language", value: "Olandish" },
      { label: "Population", value: "13,000,000" },
    ],
  },
  {
    id: "neutral",
    label: "B · Neutral",
    code: "NTR",
    name: "North Aurelian Republic",
    region: "Central Solaris",
    description:
      "A deliberately ordinary fixture with muted colours, average copy length and unremarkable proportions.",
    flagImage: ordinaryFlag,
    accentColor: "#727b86",
    facts: [
      { label: "Capital", value: "Aurel" },
      { label: "Region", value: "Central Solaris" },
      { label: "Language", value: "Aurelian" },
      { label: "Population", value: "8,420,000" },
    ],
  },
  {
    id: "hostile",
    label: "C · Hostile",
    code: "NAR",
    name: "The United Confederated Republics of Northern Aurelian Islands",
    nativeName: "Æþrǿlånđská",
    region: "Northern Oceanic Territories and Outer Islands",
    description:
      "This intentionally long fixture stresses wrapping, semantic flow, action placement, portrait flags and dense metadata without allowing ellipsis or overlap.",
    flagImage: portraitFlag,
    accentColor: "#655f72",
    facts: [
      { label: "Capital", value: "Port Aurelian Metropolitan Administrative District" },
      { label: "Region", value: "Northern Oceanic Territories and Outer Islands" },
      { label: "Official languages", value: "Aurelian, Solaris Common, Northern Island Sign Language" },
      { label: "Population", value: "127,842,331" },
      { label: "Established", value: "14 September 1842" },
      { label: "Currency", value: "Northern Aurelian Crown" },
      { label: "Demonym", value: "Northern Aurelian Islander" },
      { label: "Government", value: "Federal parliamentary confederation" },
    ],
  },
  {
    id: "sparse",
    label: "D · Sparse",
    code: "A",
    name: "A",
    region: null,
    description: null,
    flagImage: null,
    accentColor: "#8a8a8a",
    facts: [],
  },
];

export const HOSTILE_COUNTRY_NAMES = [
  "A",
  "OLAND",
  "THE UNITED CONFEDERATED REPUBLICS OF NORTHERN AURELIAN ISLANDS",
  "Æþrǿlånđská",
  "国際太陽連邦共和国",
  "جمهورية سولاريس الشمالية",
] as const;

export const FLAG_QA_CASES = [
  "1:1",
  "3:2",
  "2:1",
  "2:3",
  "transparent SVG",
  "white-dominant",
  "black-dominant",
  "detailed",
  "missing",
  "network failure",
  "slow load",
] as const;

export const PERSONALITY_FLAG_QA_OPTIONS = [
  { id: "fixture", label: "Fixture flag" },
  { id: "missing", label: "Missing flag" },
  { id: "portrait", label: "Portrait flag" },
  { id: "network-failure", label: "Network failure" },
  { id: "slow-load", label: "Slow load" },
] as const;

export type PersonalityFlagQaMode = (typeof PERSONALITY_FLAG_QA_OPTIONS)[number]["id"];

export function personalityFlagQaImage(mode: PersonalityFlagQaMode, fixture: PersonalityFixture) {
  if (mode === "fixture") return fixture.flagImage;
  if (mode === "missing") return null;
  if (mode === "portrait") return portraitFlag;
  if (mode === "network-failure") return "/personality-qa-flag-missing.svg";
  return "/personality-qa-flag.svg?slow=1";
}
