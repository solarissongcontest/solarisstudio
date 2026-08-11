import type { CountryProfile, CountryProfileSection } from "@/lib/country-account";
import type { Country } from "@/lib/data";

export type CountryContestSnapshot = {
  participations?: number | null;
  wins?: number | null;
  podiums?: number | null;
  top10?: number | null;
  qualificationPct?: number | null;
  avgCombinedPlacement?: number | null;
  highestScore?: number | null;
};

export type CountryFormSnapshot = {
  formBand?: string | null;
  juryTelevoteLean?: number | null;
  momentum?: number | null;
  peakEra?: string | null;
};

export type CountryCharacter = {
  title: string;
  summary: string;
  tags: string[];
};

function hasMultipleLanguages(value?: string | null) {
  if (!value) return false;
  return /,|;|\band\b|\&/i.test(value);
}

function governmentTag(value?: string | null) {
  const government = value?.toLowerCase() ?? "";
  if (/kingdom|monarch|queen|king|principality|empire/.test(government)) return "Monarchical";
  if (/republic|presiden/.test(government)) return "Republican";
  if (/federation|federal/.test(government)) return "Federal";
  if (/union|confeder/.test(government)) return "Union state";
  return null;
}

function contestTag(form?: CountryFormSnapshot) {
  const lean = form?.juryTelevoteLean;
  if (lean == null) return null;
  if (lean >= 8) return "Jury-friendly";
  if (lean <= -8) return "Televote-friendly";
  return "Balanced appeal";
}

function mottoTheme(motto?: string | null) {
  const text = motto?.toLowerCase() ?? "";
  if (!text) return null;
  if (/unity|united|together|one|common/.test(text)) return "unity";
  if (/free|freedom|liberty/.test(text)) return "freedom";
  if (/peace|peaceful/.test(text)) return "peace";
  if (/future|tomorrow|progress|forward/.test(text)) return "the future";
  if (/strength|strong|power|brave|courage/.test(text)) return "strength";
  if (/faith|divine|god|spirit/.test(text)) return "faith";
  return null;
}

export function buildCountryCharacter(input: {
  country: Country;
  profile?: CountryProfile | null;
  stats?: CountryContestSnapshot | null;
  form?: CountryFormSnapshot | null;
  sections?: CountryProfileSection[];
}): CountryCharacter {
  const { country, profile, stats, form, sections = [] } = input;
  const tags = [
    governmentTag(profile?.government_type),
    contestTag(form ?? undefined),
    hasMultipleLanguages(profile?.official_languages) ? "Multilingual" : null,
    (stats?.participations ?? 0) >= 5 ? "SSC veteran" : null,
    (stats?.wins ?? 0) > 0 ? "Champion" : null,
    sections.length >= 4 ? "Deep lore" : null,
  ].filter((value): value is string => Boolean(value));

  const government = profile?.government_type
    ? `${country.name} presents itself as ${articleFor(profile.government_type)} ${profile.government_type.toLowerCase()}`
    : `${country.name} has an expanding Terra Solaris profile`;

  const place = profile?.capital ? ` centred on ${profile.capital}` : "";
  const contest =
    (stats?.participations ?? 0) > 0
      ? `. In Solaris Song Contest, it has ${stats?.participations} recorded participation${stats?.participations === 1 ? "" : "s"}${(stats?.wins ?? 0) > 0 ? ` and ${stats?.wins} win${stats?.wins === 1 ? "" : "s"}` : ""}`
      : "";

  const lean = form?.juryTelevoteLean;
  const votingIdentity =
    lean == null
      ? ""
      : lean >= 8
        ? ", with a noticeably jury-friendly voting profile"
        : lean <= -8
          ? ", with a noticeably televote-friendly voting profile"
          : ", with relatively balanced jury and televote appeal";

  return {
    title: tags[0] ? `${tags[0]} with ${tags[1]?.toLowerCase() ?? "a distinct identity"}` : "A country still defining its character",
    summary: `${government}${place}${contest}${votingIdentity}.`,
    tags: tags.slice(0, 6),
  };
}

function articleFor(value: string) {
  return /^[aeiou]/i.test(value.trim()) ? "an" : "a";
}

export function buildCountryFunFacts(input: {
  country: Country;
  profile?: CountryProfile | null;
  stats?: CountryContestSnapshot | null;
  form?: CountryFormSnapshot | null;
  sections?: CountryProfileSection[];
  mediaCount?: number;
}) {
  const { country, profile, stats, form, sections = [], mediaCount = 0 } = input;
  const facts: string[] = [];

  if (profile?.capital) {
    facts.push(`${profile.capital} is the submitted capital of ${country.name}.`);
  }

  if (profile?.demonym) {
    facts.push(`People from ${country.name} are described as ${profile.demonym}.`);
  }

  if (profile?.government_type && (profile.leader_name || profile.leader_title)) {
    const leader = [profile.leader_title, profile.leader_name].filter(Boolean).join(" ");
    facts.push(`${country.name} is listed as ${articleFor(profile.government_type)} ${profile.government_type.toLowerCase()}, with ${leader} named as its leader.`);
  }

  if (hasMultipleLanguages(profile?.official_languages)) {
    facts.push(`${country.name} lists multiple official languages: ${profile?.official_languages}.`);
  } else if (profile?.official_languages) {
    facts.push(`${profile.official_languages} is listed as the official language of ${country.name}.`);
  }

  if (profile?.currency) {
    facts.push(`${country.name}'s submitted currency is ${profile.currency}.`);
  }

  const theme = mottoTheme(profile?.motto);
  if (profile?.motto && theme) {
    facts.push(`Its national motto, “${profile.motto}”, gives the country's profile a clear theme of ${theme}.`);
  } else if (profile?.motto) {
    facts.push(`The country has its own submitted national motto: “${profile.motto}”.`);
  }

  if (profile?.established) {
    facts.push(`${country.name} lists ${profile.established} as its establishment date or era.`);
  }

  if ((stats?.wins ?? 0) > 0) {
    facts.push(`${country.name} is an SSC-winning country, with ${stats?.wins} recorded win${stats?.wins === 1 ? "" : "s"}.`);
  } else if ((stats?.podiums ?? 0) > 0) {
    facts.push(`${country.name} has reached the SSC podium ${stats?.podiums} time${stats?.podiums === 1 ? "" : "s"}, even without a recorded win.`);
  }

  if ((stats?.participations ?? 0) >= 5) {
    facts.push(`With ${stats?.participations} recorded SSC participations, ${country.name} qualifies as one of the archive's more established competitors.`);
  }

  if (stats?.qualificationPct != null && stats.qualificationPct >= 80) {
    facts.push(`${country.name} has qualified from ${stats.qualificationPct.toFixed(0)}% of its recorded qualification opportunities.`);
  }

  if (form?.juryTelevoteLean != null) {
    if (form.juryTelevoteLean >= 8) {
      facts.push(`Historically, ${country.name}'s results lean more toward jury support than televote support.`);
    } else if (form.juryTelevoteLean <= -8) {
      facts.push(`Historically, ${country.name}'s results lean more toward televote support than jury support.`);
    }
  }

  if (sections.length >= 3) {
    facts.push(`Its owner-maintained Terra Solaris article currently contains ${sections.length} custom lore sections.`);
  }

  if (mediaCount >= 3) {
    facts.push(`${country.name}'s public country archive currently includes ${mediaCount} owner-submitted images.`);
  }

  return facts.slice(0, 8);
}
