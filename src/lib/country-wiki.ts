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
  return /,|;|\band\b|&/i.test(value);
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
    ? `${country.name} is ${articleFor(profile.government_type)} ${profile.government_type.toLowerCase()}`
    : `${country.name} is part of ${country.region || "Terra Solaris"}`;

  const place = profile?.capital ? ` centred on ${profile.capital}` : "";
  const contest =
    (stats?.participations ?? 0) > 0
      ? `. In Solaris Song Contest, it has ${stats?.participations} participation${stats?.participations === 1 ? "" : "s"}${(stats?.wins ?? 0) > 0 ? ` and ${stats?.wins} win${stats?.wins === 1 ? "" : "s"}` : ""}`
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
    title: tags[0]
      ? `${tags[0]} with ${tags[1]?.toLowerCase() ?? "a distinct identity"}`
      : "A country with a distinct identity",
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
  const distinctive: string[] = [];
  const supporting: string[] = [];

  if (profile?.government_type && (profile.leader_name || profile.leader_title)) {
    const leader = [profile.leader_title, profile.leader_name].filter(Boolean).join(" ");
    distinctive.push(
      `${country.name} is ${articleFor(profile.government_type)} ${profile.government_type.toLowerCase()} led by ${leader}.`,
    );
  }

  const theme = mottoTheme(profile?.motto);
  if (profile?.motto && theme) {
    distinctive.push(
      `Its national motto, “${profile.motto}”, gives the country a clear theme of ${theme}.`,
    );
  } else if (profile?.motto) {
    distinctive.push(`${country.name}'s national motto is “${profile.motto}”.`);
  }

  if ((stats?.wins ?? 0) > 0) {
    distinctive.push(
      `${country.name} is an SSC-winning country, with ${stats?.wins} win${stats?.wins === 1 ? "" : "s"}.`,
    );
  } else if ((stats?.podiums ?? 0) > 0) {
    distinctive.push(
      `${country.name} has reached the SSC podium ${stats?.podiums} time${stats?.podiums === 1 ? "" : "s"}, even without an overall win.`,
    );
  }

  if (form?.juryTelevoteLean != null) {
    if (form.juryTelevoteLean >= 8) {
      distinctive.push(
        `Historically, ${country.name}'s results lean more toward jury support than televote support.`,
      );
    } else if (form.juryTelevoteLean <= -8) {
      distinctive.push(
        `Historically, ${country.name}'s results lean more toward televote support than jury support.`,
      );
    }
  }

  if (stats?.qualificationPct != null && stats.qualificationPct >= 80) {
    distinctive.push(
      `${country.name} has qualified from ${stats.qualificationPct.toFixed(0)}% of its qualification opportunities.`,
    );
  }

  if ((stats?.participations ?? 0) >= 5) {
    distinctive.push(
      `With ${stats?.participations} SSC participations, ${country.name} is one of the archive's more established competitors.`,
    );
  }

  if (profile?.capital) {
    supporting.push(`${profile.capital} is the capital of ${country.name}.`);
  }

  if (profile?.demonym) {
    supporting.push(`People from ${country.name} are known as ${profile.demonym}.`);
  }

  if (hasMultipleLanguages(profile?.official_languages)) {
    supporting.push(
      `${country.name}'s official languages are ${profile?.official_languages}.`,
    );
  } else if (profile?.official_languages) {
    supporting.push(
      `${profile.official_languages} is the official language of ${country.name}.`,
    );
  }

  if (profile?.currency) {
    supporting.push(`${country.name}'s currency is ${profile.currency}.`);
  }

  if (profile?.established) {
    supporting.push(`${country.name} was established in ${profile.established}.`);
  }

  if (sections.length >= 3) {
    supporting.push(
      `${country.name}'s Terra Solaris article contains ${sections.length} sections exploring its history, society and identity.`,
    );
  }

  if (mediaCount >= 3) {
    supporting.push(
      `${country.name}'s public archive includes ${mediaCount} images.`,
    );
  }

  return [...distinctive, ...supporting].slice(0, 8);
}
