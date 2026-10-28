import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
} from "npm:@imagemagick/magick-wasm@0.0.30";
import woff2 from "npm:wawoff2@2.0.1";
import {
  sha256Hex,
  validSha256,
  verifyPublishedBlob,
} from "../_shared/media-byte-identity.ts";

const magickWasm = await Deno.readFile(
  new URL(
    "magick.wasm",
    import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.30"),
  ),
);
await initializeImageMagick(magickWasm);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type UploadAuthorization = {
  id: string;
  actor_id: string | null;
  domain:
    | "country_media"
    | "edition_artwork"
    | "country_font"
    | "beta_feedback"
    | "integrity_evidence";
  final_bucket: string;
  quarantine_path: string;
  final_path: string;
  declared_mime: string;
  expected_size: number;
  authorization_secret: string;
  status: "prepared" | "verified" | "rejected" | "expired";
  expires_at: string;
  detected_mime: string | null;
  verified_metadata: Record<string, unknown> | null;
  rejection_reason: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return new TextDecoder("ascii").decode(bytes.slice(start, start + length));
}

function be16(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function be32(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function le16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function le24(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function jpegDimensions(bytes: Uint8Array) {
  let offset = 2;
  const sof = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);

  while (offset + 9 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 2 > bytes.length) break;

    const length = be16(bytes, offset);
    if (length < 2 || offset + length > bytes.length) break;

    if (sof.has(marker) && length >= 7) {
      return {
        height: be16(bytes, offset + 3),
        width: be16(bytes, offset + 5),
      };
    }

    offset += length;
  }

  return {};
}

function detectFile(bytes: Uint8Array) {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return {
      kind: "image",
      format: "png",
      mime: "image/png",
      width: be32(bytes, 16),
      height: be32(bytes, 20),
    };
  }

  if (
    bytes.length >= 10 &&
    (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")
  ) {
    return {
      kind: "image",
      format: "gif",
      mime: "image/gif",
      width: le16(bytes, 6),
      height: le16(bytes, 8),
    };
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return {
      kind: "image",
      format: "jpeg",
      mime: "image/jpeg",
      ...jpegDimensions(bytes),
    };
  }

  if (
    bytes.length >= 30 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  ) {
    const chunk = ascii(bytes, 12, 4);
    if (chunk === "VP8X" && bytes.length >= 30) {
      return {
        kind: "image",
        format: "webp",
        mime: "image/webp",
        width: le24(bytes, 24) + 1,
        height: le24(bytes, 27) + 1,
      };
    }
    return {
      kind: "image",
      format: "webp",
      mime: "image/webp",
    };
  }

  if (bytes.length >= 4) {
    const signature = ascii(bytes, 0, 4);
    if (signature === "wOF2") {
      return { kind: "font", format: "woff2", mime: "font/woff2" };
    }
    if (signature === "wOFF") {
      return { kind: "font", format: "woff", mime: "font/woff" };
    }
    if (signature === "OTTO") {
      return { kind: "font", format: "otf", mime: "font/otf" };
    }
    if (
      (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) ||
      signature === "true" ||
      signature === "typ1"
    ) {
      return { kind: "font", format: "ttf", mime: "font/ttf" };
    }
  }

  if (
    bytes.length >= 8 &&
    ascii(bytes, 0, 5) === "%PDF-" &&
    new TextDecoder("latin1").decode(bytes.slice(Math.max(0, bytes.length - 2048))).includes("%%EOF")
  ) {
    const text = new TextDecoder("latin1").decode(bytes);
    const activeMarkers = [
      "/JavaScript",
      "/JS ",
      "/JS/",
      "/Launch",
      "/EmbeddedFile",
      "/RichMedia",
      "/OpenAction",
      "/AA ",
      "/AA/",
    ];
    const dangerous = activeMarkers.filter((marker) => text.includes(marker));
    return {
      kind: "document",
      format: "pdf",
      mime: "application/pdf",
      dangerousMarkers: dangerous,
    };
  }

  if (bytes.length > 0 && !bytes.includes(0)) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return {
        kind: "text",
        format: "utf8",
        mime: "text/plain",
      };
    } catch {
      // Non-UTF-8 arbitrary bytes are not evidence text.
    }
  }

  return null;
}

function imageDomain(domain: UploadAuthorization["domain"]) {
  return domain === "country_media" || domain === "edition_artwork" || domain === "beta_feedback";
}

const MAX_PUBLIC_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PUBLIC_IMAGE_DIMENSION = 8192;
const MAX_PUBLIC_IMAGE_PIXELS = 40_000_000;
const THUMBNAIL_MAX_EDGE = 512;

function publicImageDimensionsSafe(detected: NonNullable<ReturnType<typeof detectFile>>) {
  if (detected.kind !== "image") return false;
  const width = "width" in detected && typeof detected.width === "number" ? detected.width : null;
  const height = "height" in detected && typeof detected.height === "number" ? detected.height : null;
  if (!width || !height) return true;
  return (
    width > 0 &&
    height > 0 &&
    width <= MAX_PUBLIC_IMAGE_DIMENSION &&
    height <= MAX_PUBLIC_IMAGE_DIMENSION &&
    width * height <= MAX_PUBLIC_IMAGE_PIXELS
  );
}

function thumbnailSize(width: number, height: number) {
  if (width <= THUMBNAIL_MAX_EDGE && height <= THUMBNAIL_MAX_EDGE) {
    return { width, height };
  }
  const scale = Math.min(THUMBNAIL_MAX_EDGE / width, THUMBNAIL_MAX_EDGE / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function processedThumbnailPath(path: string) {
  const match = path.match(/^(.*?)(\.[a-z0-9]+)$/i);
  return match ? `${match[1]}.thumb${match[2]}` : `${path}.thumb`;
}

function concatBytes(parts: Uint8Array[]) {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function stripJpegMetadata(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const parts: Uint8Array[] = [bytes.slice(0, 2)];
  let offset = 2;

  while (offset + 1 < bytes.length) {
    const markerStart = offset;
    if (bytes[offset] !== 0xff) return bytes;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return bytes;

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xda) {
      parts.push(bytes.slice(markerStart));
      break;
    }
    if (marker === 0xd9) {
      parts.push(bytes.slice(markerStart, offset));
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(bytes.slice(markerStart, offset));
      continue;
    }
    if (offset + 2 > bytes.length) return bytes;

    const length = be16(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return bytes;
    const end = offset + length;

    // APP1 = EXIF/XMP, APP13 = IPTC/Photoshop metadata, COM = comment.
    if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) {
      parts.push(bytes.slice(markerStart, end));
    }
    offset = end;
  }

  return concatBytes(parts);
}

function stripPngMetadata(bytes: Uint8Array) {
  if (
    bytes.length < 12 ||
    bytes[0] !== 0x89 ||
    ascii(bytes, 1, 3) !== "PNG"
  ) {
    return bytes;
  }

  const parts: Uint8Array[] = [bytes.slice(0, 8)];
  const dropped = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = be32(bytes, offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return bytes;
    const type = ascii(bytes, offset + 4, 4);
    if (!dropped.has(type)) parts.push(bytes.slice(offset, end));
    offset = end;
    if (type === "IEND") break;
  }

  return concatBytes(parts);
}

function le32(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    ((bytes[offset + 3] << 24) >>> 0)
  ) >>> 0;
}

function writeLe32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function stripWebpMetadata(bytes: Uint8Array) {
  if (
    bytes.length < 12 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 4) !== "WEBP"
  ) {
    return bytes;
  }

  const chunks: Uint8Array[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const length = le32(bytes, offset + 4);
    const paddedLength = length + (length % 2);
    const end = offset + 8 + paddedLength;
    if (end > bytes.length) return bytes;

    if (type !== "EXIF" && type !== "XMP ") {
      const chunk = bytes.slice(offset, end);
      if (type === "VP8X" && length >= 1) {
        // VP8X feature flags: clear EXIF (0x08) and XMP (0x04) after dropping
        // those chunks so the container accurately describes its contents.
        chunk[8] &= ~0x0c;
      }
      chunks.push(chunk);
    }
    offset = end;
  }

  const body = concatBytes(chunks);
  const output = new Uint8Array(12 + body.length);
  output.set(bytes.slice(0, 12), 0);
  output.set(body, 12);
  writeLe32(output, 4, output.length - 8);
  return output;
}

function stripPublicImageMetadata(
  bytes: Uint8Array,
  format: "jpeg" | "png" | "webp",
) {
  if (format === "jpeg") return stripJpegMetadata(bytes);
  if (format === "png") return stripPngMetadata(bytes);
  return stripWebpMetadata(bytes);
}

function publicImageMagickFormat(format: "jpeg" | "png" | "webp") {
  if (format === "jpeg") return MagickFormat.Jpeg;
  if (format === "png") return MagickFormat.Png;
  return MagickFormat.WebP;
}

function processPublicImage(
  bytes: Uint8Array,
  format: "jpeg" | "png" | "webp",
) {
  const outputFormat = publicImageMagickFormat(format);

  return ImageMagick.read(bytes, (image) => {
    image.autoOrient();
    image.comment = null;
    image.label = null;

    const width = image.width;
    const height = image.height;
    if (
      width <= 0 ||
      height <= 0 ||
      width > MAX_PUBLIC_IMAGE_DIMENSION ||
      height > MAX_PUBLIC_IMAGE_DIMENSION ||
      width * height > MAX_PUBLIC_IMAGE_PIXELS
    ) {
      throw new Error("Decoded image dimensions exceed Solaris safety limits.");
    }

    image.quality = 88;
    const processed = stripPublicImageMetadata(
      image.write(outputFormat, (data: Uint8Array) => Uint8Array.from(data)),
      format,
    );

    const thumbSize = thumbnailSize(width, height);
    const thumbnail = image.clone((thumb) => {
      if (thumb.width !== thumbSize.width || thumb.height !== thumbSize.height) {
        thumb.resize(thumbSize.width, thumbSize.height);
      }
      thumb.comment = null;
      thumb.label = null;
      thumb.quality = 82;
      return stripPublicImageMetadata(
        thumb.write(outputFormat, (data: Uint8Array) => Uint8Array.from(data)),
        format,
      );
    });

    return {
      bytes: processed,
      thumbnail,
      width,
      height,
      thumbnailWidth: thumbSize.width,
      thumbnailHeight: thumbSize.height,
    };
  });
}

function sfntTag(bytes: Uint8Array, offset: number) {
  return ascii(bytes, offset, 4);
}

function validateSfnt(bytes: Uint8Array) {
  if (bytes.length < 12) throw new Error("WOFF2 decompressed into a truncated font.");

  const version = be32(bytes, 0);
  const versionTag = ascii(bytes, 0, 4);
  if (
    version !== 0x00010000 &&
    versionTag !== "OTTO" &&
    versionTag !== "true" &&
    versionTag !== "typ1"
  ) {
    throw new Error("WOFF2 decompressed into an unsupported SFNT flavor.");
  }

  const numTables = be16(bytes, 4);
  if (numTables <= 0 || numTables > 128 || 12 + numTables * 16 > bytes.length) {
    throw new Error("WOFF2 SFNT table directory is malformed.");
  }

  const tables = new Map<string, { offset: number; length: number }>();
  for (let index = 0; index < numTables; index += 1) {
    const entry = 12 + index * 16;
    const tag = sfntTag(bytes, entry);
    const offset = be32(bytes, entry + 8);
    const length = be32(bytes, entry + 12);
    if (!/^[\x20-\x7e]{4}$/.test(tag) || tables.has(tag)) {
      throw new Error("WOFF2 SFNT contains an invalid or duplicate table tag.");
    }
    if (length <= 0 || offset > bytes.length || length > bytes.length - offset) {
      throw new Error(`WOFF2 SFNT table ${tag} is outside the decompressed font.`);
    }
    tables.set(tag, { offset, length });
  }

  for (const required of ["head", "maxp", "name", "cmap"]) {
    if (!tables.has(required)) {
      throw new Error(`WOFF2 font is missing required ${required} table.`);
    }
  }
  if (!tables.has("glyf") && !tables.has("CFF ") && !tables.has("CFF2")) {
    throw new Error("WOFF2 font has no supported glyph-outline table.");
  }

  const head = tables.get("head")!;
  const maxp = tables.get("maxp")!;
  const name = tables.get("name")!;
  const cmap = tables.get("cmap")!;
  if (head.length < 54 || maxp.length < 6 || name.length < 6 || cmap.length < 4) {
    throw new Error("WOFF2 required font tables are truncated.");
  }
  if (be32(bytes, head.offset + 12) !== 0x5f0f3cf5) {
    throw new Error("WOFF2 head table magic number is invalid.");
  }
  const unitsPerEm = be16(bytes, head.offset + 18);
  if (unitsPerEm < 16 || unitsPerEm > 16384) {
    throw new Error("WOFF2 units-per-em value is outside the OpenType safety range.");
  }
  const numGlyphs = be16(bytes, maxp.offset + 4);
  if (numGlyphs <= 0) throw new Error("WOFF2 font contains no glyphs.");
  if (be16(bytes, cmap.offset) !== 0) {
    throw new Error("WOFF2 cmap table version is invalid.");
  }
  const nameCount = be16(bytes, name.offset + 2);
  if (nameCount <= 0) throw new Error("WOFF2 font contains no naming records.");

  return {
    sfntFlavor: versionTag === "\u0000\u0001\u0000\u0000" ? "truetype" : versionTag,
    numTables,
    numGlyphs,
    unitsPerEm,
    tableTags: [...tables.keys()].sort(),
  };
}

async function processWoff2Font(bytes: Uint8Array) {
  if (bytes.length < 48 || ascii(bytes, 0, 4) !== "wOF2") {
    throw new Error("Custom font is not a valid WOFF2 file.");
  }
  const declaredLength = be32(bytes, 8);
  const numTables = be16(bytes, 12);
  const reserved = be16(bytes, 14);
  const totalSfntSize = be32(bytes, 16);
  const totalCompressedSize = be32(bytes, 20);
  if (
    declaredLength !== bytes.length ||
    numTables <= 0 ||
    reserved !== 0 ||
    totalSfntSize <= 0 ||
    totalSfntSize > 16 * 1024 * 1024 ||
    totalCompressedSize <= 0 ||
    totalCompressedSize > bytes.length
  ) {
    throw new Error("Custom WOFF2 font header is malformed.");
  }

  const decompressed = Uint8Array.from(await woff2.decompress(bytes));
  if (decompressed.length !== totalSfntSize) {
    throw new Error("WOFF2 decompressed size does not match its authenticated header.");
  }
  const sfnt = validateSfnt(decompressed);

  const normalized = Uint8Array.from(await woff2.compress(decompressed));
  if (normalized.length < 48 || ascii(normalized, 0, 4) !== "wOF2") {
    throw new Error("Solaris could not normalize the verified font back to WOFF2.");
  }

  return {
    bytes: normalized,
    metadata: {
      format: "woff2",
      sourceBytes: bytes.length,
      normalizedBytes: normalized.length,
      decompressedBytes: decompressed.length,
      ...sfnt,
    },
  };
}

function declaredTypeMatches(
  row: UploadAuthorization,
  detected: NonNullable<ReturnType<typeof detectFile>>,
) {
  if (imageDomain(row.domain)) {
    return detected.kind === "image" && detected.mime === row.declared_mime;
  }
  if (row.domain === "country_font") {
    return (
      detected.kind === "font" &&
      detected.format === "woff2" &&
      detected.mime === "font/woff2" &&
      row.declared_mime === "font/woff2"
    );
  }
  if (row.domain === "integrity_evidence") {
    return detected.mime === row.declared_mime;
  }
  return false;
}

function callerSessionId(authorization: string | null): string | null {
  try {
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const body = token?.split(".")[1];
    if (!body) return null;
    const claims = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof claims.session_id === "string" ? claims.session_id : null;
  } catch {
    return null;
  }
}

async function callerIdentity(
  supabaseUrl: string,
  anonKey: string,
  authorization: string | null,
) {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { userId: null as string | null, sessionId: null as string | null, revoked: false };

  const authenticated = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authenticated.auth.getUser(token);
  if (error || !data.user) {
    // Anonymous SDK calls may carry a non-user bearer. Preserve the existing
    // capability flow; an actor-bound authorization still fails the actor check.
    return { userId: null as string | null, sessionId: null as string | null, revoked: false };
  }

  const sessionId = callerSessionId(authorization);
  const { data: active, error: activeError } = await authenticated.rpc("v3_assert_active_session");
  if (activeError || active !== true) {
    return { userId: data.user.id, sessionId, revoked: true };
  }

  return { userId: data.user.id, sessionId, revoked: false };
}

async function persistFinalization(
  service: ReturnType<typeof createClient>,
  row: UploadAuthorization,
  secret: string,
  actorId: string | null,
  sessionId: string | null,
  outcome: {
    status: string;
    detected_mime?: string;
    verified_metadata?: Record<string, unknown>;
    rejection_reason: string | null;
  },
) {
  return service.rpc("v3_finalize_media_upload", {
    p_token_id: row.id,
    p_upload_secret: secret,
    p_actor_id: actorId,
    p_actor_session_id: sessionId,
    p_status: outcome.status,
    p_detected_mime: outcome.detected_mime ?? null,
    p_metadata: outcome.verified_metadata ?? {},
    p_rejection_reason: outcome.rejection_reason,
  });
}

async function readFinalizationReceipt(
  service: ReturnType<typeof createClient>,
  row: UploadAuthorization,
  secret: string,
  actorId: string | null,
  sessionId: string | null,
) {
  return service.rpc("v3_read_media_finalization_receipt", {
    p_token_id: row.id,
    p_upload_secret: secret,
    p_actor_id: actorId,
    p_actor_session_id: sessionId,
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Upload finalizer is not configured." }, 503);
  }

  let input: { token_id?: string; upload_secret?: string };
  try {
    input = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  if (!input.token_id || !input.upload_secret) {
    return json({ error: "Upload token and secret are required." }, 400);
  }

  const authorization = request.headers.get("authorization");
  const caller = await callerIdentity(supabaseUrl, anonKey, authorization);
  if (caller.revoked) {
    return json({ error: "Your Solaris session is no longer active. Sign in again." }, 401);
  }
  const callerId = caller.userId;
  const sessionId = caller.sessionId;

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authorizationRow, error: authorizationError } = await service
    .from("studio2_upload_authorizations")
    .select(
      "id,actor_id,domain,final_bucket,quarantine_path,final_path,declared_mime,expected_size,authorization_secret,status,expires_at,detected_mime,verified_metadata,rejection_reason",
    )
    .eq("id", input.token_id)
    .maybeSingle();

  if (authorizationError) {
    console.error("[solaris-upload-finalize] authorization lookup failed", authorizationError);
    return json({ error: "Upload authorization lookup failed." }, 500);
  }
  if (!authorizationRow) return json({ error: "Upload authorization not found." }, 404);

  const row = authorizationRow as UploadAuthorization;

  if (row.actor_id && row.actor_id !== callerId) {
    return json({ error: "This upload authorization belongs to another account." }, 403);
  }
  if (!row.actor_id && callerId) {
    return json({ error: "Anonymous upload authorization cannot be consumed by another identity." }, 403);
  }
  if (row.authorization_secret !== input.upload_secret) {
    return json({ error: "Upload authorization secret is invalid." }, 403);
  }

  if (row.status === "verified") {
    const metadata = row.verified_metadata ?? {};
    const publishedSha256 = metadata.publishedSha256;
    const publishedSize = Number(metadata.publishedSize);
    if (!validSha256(publishedSha256) || !Number.isSafeInteger(publishedSize) || publishedSize < 0) {
      return json(
        {
          error: "Verified media receipt is not bound to an exact published byte identity.",
          code: "verified_receipt_unbound",
        },
        503,
      );
    }

    const { data: published, error: publishedError } = await service.storage
      .from(row.final_bucket)
      .download(row.final_path);
    if (publishedError || !published) {
      return json(
        {
          error: "Verified media publication could not be read back. Retry finalization.",
          code: "verified_publication_unconfirmed",
        },
        503,
      );
    }
    if (!(await verifyPublishedBlob(published, { size: publishedSize, sha256: publishedSha256 }))) {
      return json(
        {
          error: "Verified media publication no longer matches its canonical receipt.",
          code: "verified_publication_conflict",
        },
        409,
      );
    }

    const { data: receipt, error: receiptError } = await readFinalizationReceipt(
      service,
      row,
      input.upload_secret,
      callerId,
      sessionId,
    );
    if (receiptError || !receipt) {
      return json(
        {
          error: "Verified media receipt could not be reconciled. Retry finalization.",
          code: "verified_receipt_unconfirmed",
        },
        503,
      );
    }

    const receiptRow = receipt as Record<string, unknown>;
    const receiptMetadata =
      receiptRow.metadata && typeof receiptRow.metadata === "object" && !Array.isArray(receiptRow.metadata)
        ? (receiptRow.metadata as Record<string, unknown>)
        : metadata;
    return json({
      ok: true,
      token_id: row.id,
      bucket: row.final_bucket,
      object_path: row.final_path,
      detected_mime: row.detected_mime,
      metadata: receiptMetadata,
      operation_id: receiptRow.operationId ?? null,
      replayed: true,
    });
  }
  if (row.status === "rejected" || row.status === "expired") {
    return json({
      error: row.rejection_reason || "Upload authorization is no longer usable.",
      code: row.status === "expired" ? "authorization_expired" : "authorization_rejected",
    }, 409);
  }

  const { data: platformState, error: platformStateError } = await service
    .from("studio2_platform_operational_state")
    .select("mode")
    .eq("singleton", true)
    .maybeSingle();

  if (platformStateError || !platformState) {
    console.error("[solaris-upload-finalize] platform state lookup failed", platformStateError);
    return json({ error: "Solaris platform state could not be verified." }, 503);
  }

  if (platformState.mode === "read_only" || platformState.mode === "maintenance") {
    return json(
      { error: "Upload publication is unavailable while Solaris is Read-only or in Maintenance." },
      409,
    );
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    const { data: expired, error: expiryError } = await persistFinalization(
      service,
      row,
      input.upload_secret,
      callerId,
      sessionId,
      {
        status: "expired",
        rejection_reason: "Upload authorization expired before finalization.",
      },
    );
    if (expiryError || !expired) {
      return json({ error: "Upload expiration could not be confirmed. Retry finalization." }, 503);
    }
    await service.storage.from("solaris-upload-quarantine").remove([row.quarantine_path]);
    return json({ error: "Upload authorization expired.", code: "authorization_expired" }, 409);
  }

  const { data: blob, error: downloadError } = await service.storage
    .from("solaris-upload-quarantine")
    .download(row.quarantine_path);

  if (downloadError || !blob) {
    // An unavailable Storage service cannot establish that no object exists.
    // Only an explicit not-found response permits re-uploading the same path.
    if (downloadError && (downloadError.status === 404 || downloadError.statusCode === "404")) {
      return json({ error: "Quarantined upload is missing.", code: "quarantine_missing" }, 409);
    }
    return json({ error: "Quarantined upload could not be checked. Retry finalization." }, 503);
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const detected = detectFile(bytes);
  let rejection: string | null = null;

  if (bytes.byteLength !== Number(row.expected_size)) {
    rejection = "Uploaded byte size does not match the authorized size.";
  } else if (!detected) {
    rejection = "Uploaded file signature is not an allowed Solaris file type.";
  } else if (!declaredTypeMatches(row, detected)) {
    rejection = "Uploaded file signature does not match the authorized file type.";
  } else if (
    imageDomain(row.domain) &&
    bytes.byteLength > MAX_PUBLIC_IMAGE_BYTES
  ) {
    rejection = "Public images must be no larger than 5 MB for server-side processing.";
  } else if (
    imageDomain(row.domain) &&
    !publicImageDimensionsSafe(detected)
  ) {
    rejection = "Image dimensions exceed Solaris safety limits.";
  } else if (
    row.domain === "country_font" &&
    detected.format !== "woff2"
  ) {
    rejection = "Custom font delivery is restricted to validated WOFF2 files.";
  } else if (
    row.domain === "integrity_evidence" &&
    detected.kind === "document" &&
    Array.isArray(detected.dangerousMarkers) &&
    detected.dangerousMarkers.length > 0
  ) {
    rejection =
      "PDF evidence contains active or embedded-content markers that Solaris does not permit.";
  }

  if (rejection) {
    await service.storage.from("solaris-upload-quarantine").remove([row.quarantine_path]);
    const { data: rejected, error: rejectionError } = await persistFinalization(
      service,
      row,
      input.upload_secret,
      callerId,
      sessionId,
      {
        status: "rejected",
        rejection_reason: rejection,
        verified_metadata: {
          size: bytes.byteLength,
          detected: detected ?? null,
          signatureVerified: false,
          malwareScan: "not_available_in_current_runtime",
        },
      },
    );
    if (rejectionError || !rejected) {
      return json({ error: "Upload rejection could not be confirmed. Retry finalization." }, 503);
    }
    return json({ error: rejection, code: "authorization_rejected" }, 422);
  }

  let publishBytes = bytes;
  let thumbnailBytes: Uint8Array | null = null;
  let thumbnailPath: string | null = null;
  let processedWidth =
    "width" in detected! && typeof detected!.width === "number" ? detected!.width : null;
  let processedHeight =
    "height" in detected! && typeof detected!.height === "number" ? detected!.height : null;
  let thumbnailWidth: number | null = null;
  let thumbnailHeight: number | null = null;
  let fontProcessingMetadata: Record<string, unknown> | null = null;
  let processingDecision = "verified_original";

  try {
    if (imageDomain(row.domain)) {
      if (
        detected!.format !== "jpeg" &&
        detected!.format !== "png" &&
        detected!.format !== "webp"
      ) {
        throw new Error("Solaris cannot process this public image format.");
      }
      const processed = processPublicImage(bytes, detected!.format);
      publishBytes = processed.bytes;
      thumbnailBytes = processed.thumbnail;
      thumbnailPath = processedThumbnailPath(row.final_path);
      processedWidth = processed.width;
      processedHeight = processed.height;
      thumbnailWidth = processed.thumbnailWidth;
      thumbnailHeight = processed.thumbnailHeight;
      processingDecision = "decoded_oriented_stripped_reencoded";
    } else if (row.domain === "country_font") {
      const processedFont = await processWoff2Font(bytes);
      publishBytes = processedFont.bytes;
      processingDecision = "decompressed_validated_recompressed_woff2";
      fontProcessingMetadata = processedFont.metadata;
    }
  } catch (processingError) {
    const message =
      processingError instanceof Error
        ? processingError.message
        : "Server-side file processing failed.";
    await service.storage.from("solaris-upload-quarantine").remove([row.quarantine_path]);
    const { data: rejected, error: rejectionError } = await persistFinalization(
      service,
      row,
      input.upload_secret,
      callerId,
      sessionId,
      {
        status: "rejected",
        rejection_reason: message,
        verified_metadata: {
          size: bytes.byteLength,
          detected,
          signatureVerified: true,
          processing: "failed",
          malwareScan: "not_available_in_current_runtime",
          moderationDecision: "rejected",
        },
      },
    );
    if (rejectionError || !rejected) {
      return json({ error: "Upload rejection could not be confirmed. Retry finalization." }, 503);
    }
    return json({ error: message, code: "authorization_rejected" }, 422);
  }

  const publishedSha256 = await sha256Hex(publishBytes);
  const metadata = {
    originalSize: bytes.byteLength,
    publishedSize: publishBytes.byteLength,
    publishedSha256,
    hashAlgorithm: "sha256",
    kind: detected!.kind,
    format: detected!.format,
    width: processedWidth,
    height: processedHeight,
    dangerousMarkers:
      "dangerousMarkers" in detected! ? detected!.dangerousMarkers ?? [] : [],
    signatureVerified: true,
    quarantineVerified: true,
    processing: processingDecision,
    orientationNormalized: imageDomain(row.domain),
    metadataStripped: imageDomain(row.domain),
    reencoded: imageDomain(row.domain),
    thumbnailPath,
    thumbnailWidth,
    thumbnailHeight,
    fontDeliveryFormat: row.domain === "country_font" ? "woff2" : null,
    fontProcessing: fontProcessingMetadata,
    malwareScan: "not_available_in_current_runtime",
    malwareScanSupported: false,
    moderationDecision: "auto_approved",
    publicationDecision: "published_after_verification",
    pipelineStages: [
      "authorized",
      "size_checked",
      "extension_allowlisted",
      "mime_signature_verified",
      "generated_storage_id",
      "quarantined",
      "type_processed",
      "metadata_extracted",
      "safe_transform_applied",
      "moderation_decided",
      "published",
      "published_bytes_read_back",
      "published_sha256_bound",
    ],
  };

  const finalBlob = new Blob([publishBytes], { type: detected!.mime });
  const { error: publishError } = await service.storage
    .from(row.final_bucket)
    .upload(row.final_path, finalBlob, {
      upsert: false,
      contentType: detected!.mime,
      cacheControl: row.domain === "integrity_evidence" ? "0" : "31536000",
    });

  if (publishError && !/already exists|duplicate/i.test(publishError.message || "")) {
    console.error("[solaris-upload-finalize] final publish failed", publishError);
    return json({ error: "Verified file could not be published." }, 500);
  }

  // Storage and Postgres cannot commit atomically. A successful upload response
  // or a duplicate-path response is therefore not sufficient evidence. Read the
  // exact destination bytes back and bind their SHA-256 before committing the
  // canonical verified receipt. This also reconciles same-byte retries safely.
  const { data: published, error: readbackError } = await service.storage
    .from(row.final_bucket)
    .download(row.final_path);
  if (readbackError || !published) {
    return json({ error: "Published upload could not be reconciled. Retry finalization." }, 503);
  }
  if (!(await verifyPublishedBlob(published, {
    size: publishBytes.byteLength,
    sha256: publishedSha256,
  }))) {
    return json({ error: "Published upload does not match the verified bytes." }, 409);
  }

  if (thumbnailBytes && thumbnailPath) {
    const { error: thumbnailError } = await service.storage
      .from(row.final_bucket)
      .upload(thumbnailPath, new Blob([thumbnailBytes], { type: detected!.mime }), {
        upsert: false,
        contentType: detected!.mime,
        cacheControl: "31536000",
      });
    if (thumbnailError && !/already exists|duplicate/i.test(thumbnailError.message || "")) {
      await service.storage.from(row.final_bucket).remove([row.final_path]);
      console.error("[solaris-upload-finalize] thumbnail publish failed", thumbnailError);
      return json({ error: "Verified image thumbnail could not be published." }, 500);
    }
  }

  // A Storage write does not establish a verified authorization. Require the
  // conditional canonical receipt write to return its row before acknowledging
  // success, and retain quarantine bytes if that write fails or loses a race.
  const { data: verified, error: updateError } = await persistFinalization(
    service,
    row,
    input.upload_secret,
    callerId,
    sessionId,
    {
      status: "verified",
      detected_mime: detected!.mime,
      verified_metadata: metadata,
      rejection_reason: null,
    },
  );

  if (updateError || !verified) {
    console.error("[solaris-upload-finalize] authorization finalization unconfirmed", updateError);
    return json(
      {
        error:
          "Verified upload was published but receipt finalization could not be confirmed. Retry finalization.",
      },
      503,
    );
  }

  // Read the durable receipt back through the governed command before returning
  // success. If the response is lost after commit, the next request performs
  // the same byte readback and arrives here through the verified replay branch.
  const { data: canonicalReceipt, error: receiptError } = await readFinalizationReceipt(
    service,
    row,
    input.upload_secret,
    callerId,
    sessionId,
  );
  if (receiptError || !canonicalReceipt) {
    return json(
      {
        error:
          "Verified upload committed but canonical receipt readback is uncertain. Retry finalization.",
      },
      503,
    );
  }

  const receiptRow = canonicalReceipt as Record<string, unknown>;
  const receiptMetadata =
    receiptRow.metadata && typeof receiptRow.metadata === "object" && !Array.isArray(receiptRow.metadata)
      ? (receiptRow.metadata as Record<string, unknown>)
      : metadata;

  const { error: cleanupError } = await service.storage
    .from("solaris-upload-quarantine")
    .remove([row.quarantine_path]);
  if (cleanupError) {
    console.error("[solaris-upload-finalize] quarantine cleanup failed", cleanupError);
  }

  return json({
    ok: true,
    token_id: row.id,
    bucket: row.final_bucket,
    object_path: row.final_path,
    detected_mime: detected!.mime,
    metadata: receiptMetadata,
    operation_id: receiptRow.operationId ?? null,
    replayed: false,
  });
});
