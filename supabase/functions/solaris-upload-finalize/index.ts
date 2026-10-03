import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

function declaredTypeMatches(
  row: UploadAuthorization,
  detected: NonNullable<ReturnType<typeof detectFile>>,
) {
  if (imageDomain(row.domain)) {
    return detected.kind === "image" && detected.mime === row.declared_mime;
  }
  if (row.domain === "country_font") {
    return detected.kind === "font";
  }
  if (row.domain === "integrity_evidence") {
    return detected.mime === row.declared_mime;
  }
  return false;
}

async function callerUserId(
  supabaseUrl: string,
  serviceRoleKey: string,
  authorization: string | null,
) {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await service.auth.getUser(token);
  return error ? null : data.user?.id ?? null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
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
  const callerId = await callerUserId(
    supabaseUrl,
    serviceRoleKey,
    request.headers.get("authorization"),
  );

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
    return json({
      ok: true,
      token_id: row.id,
      bucket: row.final_bucket,
      object_path: row.final_path,
      detected_mime: row.detected_mime,
      metadata: row.verified_metadata ?? {},
      replayed: true,
    });
  }
  if (row.status === "rejected" || row.status === "expired") {
    return json({ error: row.rejection_reason || "Upload authorization is no longer usable." }, 409);
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
    await service
      .from("studio2_upload_authorizations")
      .update({
        status: "expired",
        rejection_reason: "Upload authorization expired before finalization.",
        finalized_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "prepared");
    await service.storage.from("solaris-upload-quarantine").remove([row.quarantine_path]);
    return json({ error: "Upload authorization expired." }, 409);
  }

  const { data: blob, error: downloadError } = await service.storage
    .from("solaris-upload-quarantine")
    .download(row.quarantine_path);

  if (downloadError || !blob) {
    return json({ error: "Quarantined upload is missing." }, 409);
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
    await service
      .from("studio2_upload_authorizations")
      .update({
        status: "rejected",
        rejection_reason: rejection,
        finalized_at: new Date().toISOString(),
        verified_metadata: {
          size: bytes.byteLength,
          detected: detected ?? null,
          signatureVerified: false,
          malwareScan: "not_available_in_current_runtime",
        },
      })
      .eq("id", row.id)
      .eq("status", "prepared");
    return json({ error: rejection }, 422);
  }

  const metadata = {
    size: bytes.byteLength,
    kind: detected!.kind,
    format: detected!.format,
    width: "width" in detected! ? detected!.width ?? null : null,
    height: "height" in detected! ? detected!.height ?? null : null,
    dangerousMarkers:
      "dangerousMarkers" in detected! ? detected!.dangerousMarkers ?? [] : [],
    signatureVerified: true,
    malwareScan: "not_available_in_current_runtime",
    quarantined: true,
  };

  const finalBlob = new Blob([bytes], { type: detected!.mime });
  const { error: publishError } = await service.storage
    .from(row.final_bucket)
    .upload(row.final_path, finalBlob, {
      upsert: false,
      contentType: detected!.mime,
      cacheControl: "3600",
    });

  if (publishError) {
    const duplicate = /already exists|duplicate/i.test(publishError.message || "");
    if (!duplicate) {
      console.error("[solaris-upload-finalize] final publish failed", publishError);
      return json({ error: "Verified file could not be published." }, 500);
    }
  }

  const { error: cleanupError } = await service.storage
    .from("solaris-upload-quarantine")
    .remove([row.quarantine_path]);
  if (cleanupError) {
    console.error("[solaris-upload-finalize] quarantine cleanup failed", cleanupError);
  }

  const { error: updateError } = await service
    .from("studio2_upload_authorizations")
    .update({
      status: "verified",
      detected_mime: detected!.mime,
      verified_metadata: metadata,
      rejection_reason: null,
      finalized_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "prepared");

  if (updateError) {
    console.error("[solaris-upload-finalize] authorization finalization failed", updateError);
    return json({ error: "Verified upload was published but receipt finalization failed." }, 500);
  }

  return json({
    ok: true,
    token_id: row.id,
    bucket: row.final_bucket,
    object_path: row.final_path,
    detected_mime: detected!.mime,
    metadata,
    replayed: false,
  });
});
