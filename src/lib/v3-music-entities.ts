export type V3MusicAppearance = {
  entryId: string;
  editionId: string;
  countryId: string;
  artistLabel: string;
  songLabel: string;
};

export type V3ArtistSummary = {
  id: string;
  displayName: string;
};

export type V3SongArtistSummary = {
  id: string;
  displayName: string;
  position: number;
  creditLabel?: string | null;
};

export type V3SongSummary = {
  id: string;
  title: string;
  artists: readonly V3SongArtistSummary[];
};

export type V3ArtistDetail = {
  kind: "artist";
  schemaVersion: 1;
  id: string;
  displayName: string;
  bio: string | null;
  aliases: readonly { name: string; editionId: string | null }[];
  songs: readonly { id: string; title: string }[];
  appearances: readonly V3MusicAppearance[];
  serverTime: string;
};

export type V3SongDetail = {
  kind: "song";
  schemaVersion: 1;
  id: string;
  title: string;
  artists: readonly V3SongArtistSummary[];
  appearances: readonly V3MusicAppearance[];
  serverTime: string;
};

export type V3MusicRedirect = {
  kind: "artist_redirect" | "song_redirect";
  schemaVersion: 1;
  requestedId: string;
  redirectTo: string;
  serverTime: string;
};

export type V3ArtistProjection = V3ArtistDetail | V3MusicRedirect | null;
export type V3SongProjection = V3SongDetail | V3MusicRedirect | null;

export type V3ArtistIndexProjection = {
  schemaVersion: 1;
  items: readonly V3ArtistSummary[];
  serverTime: string;
};

export type V3SongIndexProjection = {
  schemaVersion: 1;
  items: readonly V3SongSummary[];
  serverTime: string;
};

type JsonObject = Record<string, unknown>;

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as JsonObject;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function nullableString(value: unknown, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error(`${label} must be a string or null.`);
  const normalized = value.trim();
  return normalized || null;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function schemaVersion(value: unknown): 1 {
  if (value !== 1) throw new Error("Unsupported Artist/Song projection schema version.");
  return 1;
}

function appearance(value: unknown): V3MusicAppearance {
  const row = object(value, "music appearance");
  return {
    entryId: string(row.entry_id, "appearance entry id"),
    editionId: string(row.edition_id, "appearance edition id"),
    countryId: string(row.country_id, "appearance country id"),
    artistLabel: string(row.artist_label, "appearance artist label"),
    songLabel: string(row.song_label, "appearance song label"),
  };
}

function songArtist(value: unknown): V3SongArtistSummary {
  const row = object(value, "song artist");
  const position = number(row.position, "song artist position");
  if (!Number.isInteger(position) || position < 1) {
    throw new Error("Song artist position must be a positive integer.");
  }
  return {
    id: string(row.id, "song artist id"),
    displayName: string(row.display_name, "song artist display name"),
    position,
    ...(Object.prototype.hasOwnProperty.call(row, "credit_label")
      ? { creditLabel: nullableString(row.credit_label, "song artist credit label") }
      : {}),
  };
}

export function parseV3ArtistProjection(value: unknown): V3ArtistProjection {
  if (value == null) return null;
  const payload = object(value, "Artist projection");
  const version = schemaVersion(payload.schema_version);
  const type = string(payload.type, "Artist projection type");
  const serverTime = string(payload.server_time, "Artist server time");

  if (type === "artist_redirect") {
    return {
      kind: "artist_redirect",
      schemaVersion: version,
      requestedId: string(payload.requested_id, "requested Artist id"),
      redirectTo: string(payload.redirect_to, "redirect Artist id"),
      serverTime,
    };
  }
  if (type !== "artist") throw new Error(`Unexpected Artist projection type: ${type}`);

  return {
    kind: "artist",
    schemaVersion: version,
    id: string(payload.id, "Artist id"),
    displayName: string(payload.display_name, "Artist display name"),
    bio: nullableString(payload.bio, "Artist bio"),
    aliases: array(payload.aliases, "Artist aliases").map((value) => {
      const alias = object(value, "Artist alias");
      return {
        name: string(alias.name, "Artist alias name"),
        editionId: nullableString(alias.edition_id, "Artist alias edition id"),
      };
    }),
    songs: array(payload.songs, "Artist songs").map((value) => {
      const song = object(value, "Artist song");
      return {
        id: string(song.id, "Artist song id"),
        title: string(song.title, "Artist song title"),
      };
    }),
    appearances: array(payload.appearances, "Artist appearances").map(appearance),
    serverTime,
  };
}

export function parseV3SongProjection(value: unknown): V3SongProjection {
  if (value == null) return null;
  const payload = object(value, "Song projection");
  const version = schemaVersion(payload.schema_version);
  const type = string(payload.type, "Song projection type");
  const serverTime = string(payload.server_time, "Song server time");

  if (type === "song_redirect") {
    return {
      kind: "song_redirect",
      schemaVersion: version,
      requestedId: string(payload.requested_id, "requested Song id"),
      redirectTo: string(payload.redirect_to, "redirect Song id"),
      serverTime,
    };
  }
  if (type !== "song") throw new Error(`Unexpected Song projection type: ${type}`);

  return {
    kind: "song",
    schemaVersion: version,
    id: string(payload.id, "Song id"),
    title: string(payload.title, "Song title"),
    artists: array(payload.artists, "Song artists").map(songArtist),
    appearances: array(payload.appearances, "Song appearances").map(appearance),
    serverTime,
  };
}

export function parseV3ArtistIndexProjection(value: unknown): V3ArtistIndexProjection {
  const payload = object(value, "Artist index projection");
  return {
    schemaVersion: schemaVersion(payload.schema_version),
    items: array(payload.items, "Artist index items").map((value) => {
      const item = object(value, "Artist index item");
      return {
        id: string(item.id, "Artist id"),
        displayName: string(item.display_name, "Artist display name"),
      };
    }),
    serverTime: string(payload.server_time, "Artist index server time"),
  };
}

export function parseV3SongIndexProjection(value: unknown): V3SongIndexProjection {
  const payload = object(value, "Song index projection");
  return {
    schemaVersion: schemaVersion(payload.schema_version),
    items: array(payload.items, "Song index items").map((value) => {
      const item = object(value, "Song index item");
      return {
        id: string(item.id, "Song id"),
        title: string(item.title, "Song title"),
        artists: array(item.artists, "Song artists").map(songArtist),
      };
    }),
    serverTime: string(payload.server_time, "Song index server time"),
  };
}

export function v3ArtistHref(id: string) {
  return `/artists/${encodeURIComponent(id)}`;
}

export function v3SongHref(id: string) {
  return `/songs/${encodeURIComponent(id)}`;
}
