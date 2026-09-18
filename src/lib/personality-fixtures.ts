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
  currentEntry?: { artist: string; song: string; edition: string; status: string } | null;
  history?: Array<{ edition: string; result: string }>;
  emptyWiki?: boolean;
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

const qaFlag = (viewBox: string, body: string) =>
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`);

export const squareFlag = qaFlag(
  "0 0 1 1",
  '<rect width="1" height="1" fill="#e6e9ed"/><path d="M0 .42h1v.16H0z" fill="#59636f"/>',
);
export const wideFlag = qaFlag(
  "0 0 2 1",
  '<rect width="2" height="1" fill="#dde3e8"/><rect width=".45" height="1" x=".78" fill="#56606b"/>',
);
export const transparentFlag = qaFlag(
  "0 0 3 2",
  '<circle cx="1.5" cy="1" r=".78" fill="#66717d" fill-opacity=".78"/><path d="M.2 1h2.6" stroke="#20262c" stroke-width=".16"/>',
);
export const whiteDominantFlag = qaFlag(
  "0 0 3 2",
  '<rect width="3" height="2" fill="#fff"/><path d="M0 .9h3v.2H0z" fill="#c7ccd2"/>',
);
export const blackDominantFlag = qaFlag(
  "0 0 3 2",
  '<rect width="3" height="2" fill="#050505"/><path d="M1.38 0h.24v2h-.24z" fill="#f1f1f1"/>',
);
export const detailedFlag = qaFlag(
  "0 0 3 2",
  '<rect width="3" height="2" fill="#e8ecef"/><path d="M0 0h3v.28H0zM0 1.72h3V2H0z" fill="#4b5560"/><circle cx="1.5" cy="1" r=".55" fill="none" stroke="#4b5560" stroke-width=".12"/><path d="m1.5 .52.12.34.36.01-.29.21.1.35-.29-.2-.29.2.1-.35-.29-.21.36-.01z" fill="#4b5560"/>',
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
    currentEntry: { artist: "Aurora Vale", song: "Northern Lights", edition: "SSC 22", status: "Published canonical entry" },
    history: [
      { edition: "SSC 21", result: "4th" },
      { edition: "SSC 20", result: "12th" },
    ],
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
    currentEntry: { artist: "Mira Sol", song: "Still Water", edition: "SSC 22", status: "Qualified" },
    history: [
      { edition: "SSC 21", result: "18th" },
      { edition: "SSC 20", result: "9th" },
    ],
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
    currentEntry: { artist: "The Northern Metropolitan Collective", song: "A Very Long Song Title for Layout Stress Testing", edition: "SSC 22", status: "Finalist" },
    history: [
      { edition: "SSC 21", result: "2nd" },
      { edition: "SSC 20", result: "Semi-final 11th" },
      { edition: "SSC 19", result: "Winner" },
      { edition: "SSC 18", result: "23rd" },
    ],
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
    currentEntry: null,
    history: [],
    emptyWiki: true,
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
  { id: "1-1", label: "1:1 square" },
  { id: "3-2", label: "3:2 landscape" },
  { id: "2-1", label: "2:1 wide" },
  { id: "2-3", label: "2:3 portrait" },
  { id: "transparent", label: "Transparent SVG" },
  { id: "white-dominant", label: "White-dominant" },
  { id: "black-dominant", label: "Black-dominant" },
  { id: "detailed", label: "Detailed" },
  { id: "missing", label: "Missing flag" },
  { id: "network-failure", label: "Network failure" },
  { id: "slow-load", label: "Slow load" },
] as const;

export type PersonalityFlagQaMode = (typeof PERSONALITY_FLAG_QA_OPTIONS)[number]["id"];

export function personalityFlagQaImage(mode: PersonalityFlagQaMode, fixture: PersonalityFixture) {
  if (mode === "fixture") return fixture.flagImage;
  if (mode === "1-1") return squareFlag;
  if (mode === "3-2") return ordinaryFlag;
  if (mode === "2-1") return wideFlag;
  if (mode === "2-3") return portraitFlag;
  if (mode === "transparent") return transparentFlag;
  if (mode === "white-dominant") return whiteDominantFlag;
  if (mode === "black-dominant") return blackDominantFlag;
  if (mode === "detailed") return detailedFlag;
  if (mode === "missing") return null;
  if (mode === "network-failure") return "/personality-qa-flag-missing.svg";
  return "/personality-qa-flag.svg?slow=1";
}
