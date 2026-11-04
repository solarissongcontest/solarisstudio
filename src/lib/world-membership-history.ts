/**
 * Read-only public membership history between one Terra Solaris organization
 * and one country. The TG2 RPC, not these helpers, decides visibility.
 */
export type WorldMembershipPeriod = {
  id: string;
  membershipType: "member" | "observer" | "associate";
  status: "member" | "observer" | "associate" | "suspended" | "withdrawn" | "expelled" | "former";
  joinedAt: string;
  endedAt: string | null;
};

export type WorldRepresentationPeriod = {
  id: string;
  displayName: string;
  role: string;
  votingAuthority: boolean;
  startsAt: string;
  endsAt: string | null;
};

export type WorldCountryOffice = {
  id: string;
  title: string;
  holderName: string;
};

export type WorldMembershipHistory = {
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  organizationFullName: string;
  membership: WorldMembershipPeriod[];
  representations: WorldRepresentationPeriod[];
  currentOffices: WorldCountryOffice[];
};

const membershipStatuses = new Set(["member", "observer", "associate", "suspended", "withdrawn", "expelled", "former"]);
const membershipTypes = new Set(["member", "observer", "associate"]);
const openStatuses = new Set(["member", "observer", "associate", "suspended"]);

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid public membership history: " + label);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid public membership history: " + label);
  }
  return value.trim();
}

function date(value: unknown, label: string): string {
  const input = text(value, label);
  // The TG2 RPC returns PostgreSQL timestamptz values in ISO-8601.
  // Do not let Date.parse silently normalize invalid calendar dates or accept
  // locale-dependent strings when they are presented as official history.
  const match = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.exec(input);
  const parsed = Date.parse(input);
  if (!match || !Number.isFinite(parsed)) {
    throw new Error("Invalid public membership history: " + label);
  }
  const [year, month, day] = match.slice(1, 4).map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() + 1 !== month ||
    calendar.getUTCDate() !== day
  ) {
    throw new Error("Invalid public membership history: " + label);
  }
  return input;
}

function optionalDate(value: unknown, label: string): string | null {
  return value === null || value === undefined ? null : date(value, label);
}

function list(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error("Invalid public membership history: " + label);
  return value.map((item) => object(item, label));
}

export function isWorldMembershipRoute(slug: string, code: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && /^[A-Za-z0-9-]{1,12}$/.test(code);
}

export function readWorldCountryMembership(
  raw: unknown,
  requestedSlug: string,
  countryId: string,
): WorldMembershipHistory | null {
  if (raw === null) return null;
  const projection = object(raw, "projection");
  const organization = object(projection.organization, "organization");
  const slug = text(organization.slug, "organization slug");
  if (slug !== requestedSlug) {
    throw new Error("Organization identity changed during public membership read");
  }
  const organizationId = text(organization.id, "organization id");
  const members: WorldMembershipPeriod[] = list(projection.memberships, "memberships")
    .filter((row) => row.countryId === countryId)
    .map((row) => {
      const status = text(row.status, "membership status");
      const membershipType = text(row.membershipType, "membership type");
      if (!membershipStatuses.has(status) || !membershipTypes.has(membershipType)) {
        throw new Error("Invalid public membership history: membership state");
      }
      const joinedAt = date(row.joinedAt, "joinedAt");
      const endedAt = optionalDate(row.endedAt, "endedAt");
      if (openStatuses.has(status) !== (endedAt === null) || (endedAt !== null && Date.parse(endedAt) < Date.parse(joinedAt))) {
        throw new Error("Contradictory public membership history");
      }
      return {
        id: text(row.id, "membership id"),
        membershipType: membershipType as WorldMembershipPeriod["membershipType"],
        status: status as WorldMembershipPeriod["status"],
        joinedAt,
        endedAt,
      };
    }).sort((a, b) => Date.parse(b.joinedAt) - Date.parse(a.joinedAt) || a.id.localeCompare(b.id));

  // The SQL model permits only one unconcluded membership per country and
  // organization. Fail closed rather than displaying a guessed current term
  // if a projection is duplicated, stale or internally contradictory.
  if (new Set(members.map((row) => row.id)).size !== members.length ||
      members.filter((row) => row.endedAt === null).length > 1) {
    throw new Error("Contradictory public membership history: duplicate or multiple current terms");
  }
  for (let index = 1; index < members.length; index += 1) {
    const newer = members[index - 1];
    const older = members[index];
    if (!older.endedAt || Date.parse(older.endedAt) > Date.parse(newer.joinedAt)) {
      throw new Error("Contradictory public membership history: overlapping terms");
    }
  }

  const representatives: WorldRepresentationPeriod[] = list(projection.representatives, "representatives")
    .filter((row) => row.countryId === countryId)
    .map((row) => {
      if (typeof row.votingAuthority !== "boolean") {
        throw new Error("Invalid public membership history: votingAuthority");
      }
      const startsAt = date(row.startsAt, "representation startsAt");
      const endsAt = optionalDate(row.endsAt, "representation endsAt");
      if (endsAt && Date.parse(endsAt) < Date.parse(startsAt)) {
        throw new Error("Invalid public membership history: representation range");
      }
      return {
        id: text(row.id, "representation id"),
        displayName: text(row.displayName, "public representative name"),
        role: text(row.role, "role"),
        votingAuthority: row.votingAuthority,
        startsAt,
        endsAt,
      };
    }).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt) || a.id.localeCompare(b.id));

  if (new Set(representatives.map((row) => row.id)).size !== representatives.length) {
    throw new Error("Contradictory public membership history: repeated representative");
  }

  const currentOffices: WorldCountryOffice[] = list(projection.offices, "offices")
    .flatMap((row): WorldCountryOffice[] => {
      if (!row.currentTerm) return [];
      const term = object(row.currentTerm, "current office term");
      if (term.representedCountryId !== countryId) return [];
      return [{
        id: text(row.id, "office id"),
        title: text(row.title, "office title"),
        holderName: text(term.holderDisplayName, "public officeholder name"),
      }];
    });

  return {
    organizationId,
    organizationSlug: slug,
    organizationName: text(organization.shortName, "organization name"),
    organizationFullName: text(organization.officialName, "official organization name"),
    membership: members,
    representations: representatives,
    currentOffices,
  };
}

export function currentMembershipPeriod(periods: WorldMembershipPeriod[]): WorldMembershipPeriod | null {
  return periods.find((period) => period.endedAt === null) ?? null;
}

export function currentRepresentativePeriods(periods: WorldRepresentationPeriod[]): WorldRepresentationPeriod[] {
  return periods.filter((period) => period.endsAt === null);
}

export function membershipLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase());
}
